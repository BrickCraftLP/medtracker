// Wires the sync providers to React state.
//
// Sync runs when the app opens and when it returns to the foreground, plus on
// demand. There is no background job by design: the browser token model has no
// refresh token, so nothing can run while the app is closed (see
// services/googleCalendar.js for why that trade was taken).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { availableProviders, providerFor, providerOfCalendar } from '../services/sync/index.js'
import { getCalendarConnections, setCalendarConnection } from '../services/dbInterface.js'

// Long enough that flipping between apps doesn't hammer the API, short enough
// that coming back after a lecture shows the change.
const FOREGROUND_COOLDOWN_MS = 60_000

export function useCalendarSync() {
  const { calendars, events, upsertEvent, removeEvent, upsertCalendar, dataLoading } = useData()
  const { user } = useAuth()
  // Two different facts, kept apart on purpose:
  //   remote     — the user connected this provider (Supabase, every device);
  //   authorized — THIS device holds a usable token right now.
  // A second device starts remote-true / authorized-false until Google hands
  // it a token silently, or the user reconnects.
  const [remote, setRemote] = useState(null) // providerId → bool, null until loaded
  const [authorized, setAuthorized] = useState({}) // providerId → bool
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const lastRunRef = useRef(0)
  // A synchronous re-entrancy guard, separate from the `syncing` state: two
  // triggers firing back to back (launch + an immediate foreground event) can
  // both read `syncing` as false before either commit lands, and would then
  // pull the same not-yet-locally-known Google event twice — each inserting
  // it as "new" and colliding on the row the other just created.
  const runningRef = useRef(false)

  // Read inside the async loop so a sync that started before a local edit
  // still pushes the newest rows.
  const ctxRef = useRef({ events, upsertEvent, removeEvent })
  ctxRef.current = { events, upsertEvent, removeEvent }

  const providers = useMemo(() => availableProviders(), [])

  const linkedCalendars = useMemo(
    () => calendars.filter(c => c.google_sync && c.google_calendar_id),
    [calendars],
  )

  useEffect(() => {
    let cancelled = false
    Promise.all(providers.map(async p => [p.id, await p.hasAccess().catch(() => false)]))
      .then(pairs => { if (!cancelled) setAuthorized(Object.fromEntries(pairs)) })
    return () => { cancelled = true }
  }, [providers])

  // Connection status from Supabase, refreshed when the app returns to the
  // foreground so a connect on another device shows up without a reload.
  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    const load = () => getCalendarConnections(user.id)
      .then(map => {
        if (cancelled) return
        setRemote(Object.fromEntries(providers.map(p => [p.id, !!map?.[p.id]])))
      })
      .catch(e => console.error('calendar connections: load failed', e))
    load()
    const onVisible = () => { if (document.visibilityState === 'visible') load() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible) }
  }, [user?.id, providers])

  // A device that already holds a grant from before the status was stored
  // backfills it, so other devices learn about the connection too.
  useEffect(() => {
    if (!remote || !user?.id) return
    for (const p of providers) {
      if (authorized[p.id] && !remote[p.id]) {
        setRemote(prev => ({ ...prev, [p.id]: true }))
        setCalendarConnection(p.id, true).catch(e => console.error('calendar connections: backfill failed', e))
      }
    }
  }, [remote, authorized, user?.id, providers])

  const connected = useMemo(() => Object.fromEntries(providers.map(p => [
    p.id, !!(remote?.[p.id] || authorized[p.id]),
  ])), [providers, remote, authorized])

  const anyConnected = Object.values(connected).some(Boolean)
  const anyAuthorized = Object.values(authorized).some(Boolean)
  const needsReconnect = useMemo(() => Object.fromEntries(providers.map(p => [
    p.id, !!remote?.[p.id] && !authorized[p.id],
  ])), [providers, remote, authorized])

  const run = useCallback(async ({ force = false } = {}) => {
    // Never sync against a calendar-events list that hasn't loaded yet — with
    // no local rows to match against, every already-linked Google event looks
    // "new" and the insert collides with the row already sitting in Postgres.
    if (dataLoading || runningRef.current) return null
    if (!force && Date.now() - lastRunRef.current < FOREGROUND_COOLDOWN_MS) return null
    const targets = calendars.filter(c => c.google_sync && c.google_calendar_id)
    if (!targets.length) return null

    runningRef.current = true
    setSyncing(true)
    setError(null)
    const totals = { pulled: 0, pushed: 0, deleted: 0, failed: 0 }
    try {
      // One calendar failing must not stop the others — a revoked share or a
      // calendar deleted on the remote side is ordinary, not fatal.
      for (const calendar of targets) {
        const provider = providerOfCalendar(calendar)
        if (!provider) continue
        try {
          const one = await provider.sync(calendar, ctxRef.current)
          totals.pulled += one.pulled
          totals.pushed += one.pushed
          totals.deleted += one.deleted
        } catch (e) {
          console.error(`calendar sync: ${calendar.name} failed`, e)
          totals.failed += 1
          setError(e.message ?? String(e))
        }
      }
      lastRunRef.current = Date.now()
      setLastResult({ ...totals, at: new Date().toISOString() })
      return totals
    } finally {
      runningRef.current = false
      setSyncing(false)
    }
  }, [calendars, dataLoading])

  // Launch + foreground. Gated on a token on THIS device, not the shared
  // status: without one every calendar would just fail with NotSignedIn.
  useEffect(() => {
    if (!anyAuthorized || !linkedCalendars.length || dataLoading) return
    run()
    const onVisible = () => { if (document.visibilityState === 'visible') run() }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [anyAuthorized, linkedCalendars.length, dataLoading, run])

  // Must be called straight from a click: the first grant opens a popup, and a
  // popup outside a user gesture is blocked.
  const connect = useCallback(async (providerId) => {
    const provider = providerFor(providerId)
    if (!provider) return false
    setError(null)
    try {
      await provider.connect()
    } catch (e) {
      setError(e.message ?? String(e))
      return false
    }
    setAuthorized(prev => ({ ...prev, [provider.id]: true }))
    setRemote(prev => ({ ...prev, [provider.id]: true }))
    // The grant already succeeded on this device; a failed status write (e.g.
    // offline) must not turn that into a failed connect.
    setCalendarConnection(provider.id, true)
      .catch(e => console.error('calendar connections: save failed', e))
    return true
  }, [])

  const disconnect = useCallback(async (providerId) => {
    const provider = providerFor(providerId)
    if (!provider) return
    await provider.disconnect()
    setAuthorized(prev => ({ ...prev, [provider.id]: false }))
    setRemote(prev => ({ ...prev, [provider.id]: false }))
    await setCalendarConnection(provider.id, false)
      .catch(e => console.error('calendar connections: save failed', e))
  }, [])

  const listRemoteCalendars = useCallback(async (providerId) => {
    const provider = providerFor(providerId)
    if (!provider) return []
    try {
      return await provider.listRemoteCalendars()
    } catch (e) {
      setError(e.message ?? String(e))
      return []
    }
  }, [])

  const linkCalendar = useCallback(async (calendar, remoteId, providerId) => {
    const provider = providerFor(providerId)
    // A fresh link starts from a clean slate: a leftover sync token from an
    // earlier link would make the first pull skip everything already there.
    await provider?.clearState(calendar.id)
    await upsertCalendar({
      ...calendar,
      sync_provider: provider?.id ?? null,
      google_calendar_id: remoteId,
      google_sync: true,
    })
    lastRunRef.current = 0
  }, [upsertCalendar])

  // Unlinking leaves the events in place on both sides — deleting either copy
  // on the user's behalf would be the wrong kind of surprise.
  const unlinkCalendar = useCallback(async (calendar) => {
    await providerOfCalendar(calendar)?.clearState(calendar.id)
    await upsertCalendar({ ...calendar, google_sync: false })
  }, [upsertCalendar])

  return {
    providers,
    available: providers.length > 0,
    connected,
    authorized,
    needsReconnect,
    anyConnected,
    syncing,
    error,
    lastResult,
    linkedCalendars,
    connect,
    disconnect,
    listRemoteCalendars,
    linkCalendar,
    unlinkCalendar,
    syncNow: () => run({ force: true }),
  }
}
