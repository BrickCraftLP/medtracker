// Google sync, run once for the whole app.
//
// This used to be a hook that only the calendar settings and connect screens
// mounted, so nothing synced unless one of them happened to be open. One
// provider now owns the run loop and every trigger; screens read it through
// useGoogleSync() (or its old name, useCalendarSync).
//
// Sync runs when the app opens, when it returns to the foreground or comes
// back online, a few seconds after a local edit, every couple of minutes while
// the app is visible, and on demand. Every linked calendar and task list
// syncs, whichever workspace is active.
//
// There is still no background job: the refresh token lives server-side (see
// services/googleAuth.js), but the reconciliation runs in this tab.

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { useData } from './DataContext.jsx'
import { useAuth } from './AuthContext.jsx'
import { useWorkspace } from './WorkspaceContext.jsx'
import { useCalendarSettings } from './CalendarSettingsContext.jsx'
import { availableProviders, providerFor, providerOfCalendar } from '../services/sync/index.js'
import { getCalendarConnections, setCalendarConnection } from '../services/dbInterface.js'
import {
  isConfigured as googleConfigured, preloadGis, refreshStatus, NotSignedIn, RetryConsent,
} from '../services/googleAuth.js'
import { connectTasks as grantTasks, hasTasksAccess, listTaskLists, createTaskList } from '../services/googleTasks.js'
import { syncTaskList, clearTasksState } from '../services/googleTasksSync.js'
import { buildChecklists } from '../services/googleSync.js'
import { STORES, getAllByUser } from '../services/offlineDB.js'

// Long enough that flipping between apps doesn't hammer the API, short enough
// that coming back after a lecture shows the change.
const FOREGROUND_COOLDOWN_MS = 60_000
// Long enough that typing a title and ticking a box become one push, short
// enough that the change is on Google by the time the user goes to look.
const EDIT_DEBOUNCE_MS = 4_000
// Picks up edits made in Google while the app stays open. Cheap: an unchanged
// calendar is one list call that returns nothing.
const POLL_MS = 2 * 60_000

export const NEW_TASK_LIST = '__new__'

// Module scope, not useRef: GoogleSyncProvider is mounted inside AppShell,
// which unmounts it whenever dataLoading flips. A remount would hand the new
// instance fresh guards while the previous run's promise is still in flight —
// two runs over the same list, each inserting the copy the other has not
// written yet.
const runningRef = { current: false }
const againRef = { current: false }

// Linked workspaces grouped by the list they share. A list shared by several
// workspaces is "merged"; its primary workspace receives tasks created in
// Google.
export function taskListGroups(workspaces) {
  const groups = new Map()
  for (const w of workspaces) {
    if (!w.google_tasks_sync || !w.google_tasklist_id) continue
    const group = groups.get(w.google_tasklist_id) ?? { listId: w.google_tasklist_id, workspaces: [] }
    group.workspaces.push(w)
    groups.set(group.listId, group)
  }
  for (const group of groups.values()) {
    group.primaryId = (group.workspaces.find(w => w.google_tasks_primary) ?? group.workspaces[0]).id
  }
  return [...groups.values()]
}

// A consent that has to be repeated once is expected, and screens word it
// themselves.
const messageOf = e => (e instanceof RetryConsent ? 'retry_consent' : e?.message ?? String(e))

// Every todo of the user, not just the active workspace's: an event shared
// into this workspace can carry todos created in another.
async function allTodos(ctx) {
  const rows = new Map()
  try {
    for (const td of await getAllByUser(STORES.todos, ctx.userId)) rows.set(td.id, td)
  } catch (e) {
    console.warn('google sync: offline mirror unavailable', e)
  }
  for (const td of ctx.todos) rows.set(td.id, td)
  return [...rows.values()]
}

const GoogleSyncContext = createContext(null)

export function GoogleSyncProvider({ children }) {
  const {
    allCalendars, allEvents, todos,
    upsertEvent, removeEvent, upsertTodo, removeTodo, upsertCalendar,
    dataLoading,
  } = useData()
  const { user } = useAuth()
  const { workspaces, updateWorkspace } = useWorkspace()
  const { syncEnabled, eventTodosInGoogle } = useCalendarSettings()

  // Two different facts, kept apart on purpose:
  //   remote     — the user connected this provider (Supabase profile);
  //   authorized — the server holds a working grant for it right now.
  // `authorized` is true / false, or null when the check itself failed
  // (offline): "couldn't ask" must not read as "needs reconnecting".
  const [remote, setRemote] = useState(null) // providerId → bool, null until loaded
  const [authorized, setAuthorized] = useState({}) // providerId → bool | null
  const [tasksAuthorized, setTasksAuthorized] = useState(null)
  const [syncing, setSyncing] = useState(false)
  const [error, setError] = useState(null)
  const [lastResult, setLastResult] = useState(null)
  const lastRunRef = useRef(0)

  // Read inside the async loop so a sync that started before a local edit
  // still pushes the newest rows.
  const ctxRef = useRef(null)
  ctxRef.current = {
    allCalendars, events: allEvents, todos,
    upsertEvent, removeEvent, upsertTodo, removeTodo,
    workspaces, dataLoading, syncEnabled, eventTodosInGoogle,
    authorized, tasksAuthorized, userId: user?.id,
  }

  const providers = useMemo(() => availableProviders(), [])

  const linkedCalendars = useMemo(
    () => allCalendars.filter(c => c.google_sync && c.google_calendar_id),
    [allCalendars],
  )
  const taskGroups = useMemo(() => taskListGroups(workspaces), [workspaces])

  // Asks the server, never Google, so it's safe on launch and on every return
  // to the foreground — no popup can come of it.
  const checkAccess = useCallback(async ({ fresh = false } = {}) => {
    if (!user?.id) return
    if (fresh) refreshStatus()
    const ask = fn => fn().then(ok => !!ok, () => null)
    const pairs = await Promise.all(providers.map(async p => [p.id, await ask(() => p.hasAccess())]))
    setAuthorized(Object.fromEntries(pairs))
    if (googleConfigured()) setTasksAuthorized(await ask(hasTasksAccess))
  }, [user?.id, providers])

  useEffect(() => {
    checkAccess()
    preloadGis()
  }, [checkAccess])

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
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      load()
      checkAccess({ fresh: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => { cancelled = true; document.removeEventListener('visibilitychange', onVisible) }
  }, [user?.id, providers, checkAccess])

  // A grant made before the status was stored backfills it, so every device
  // shows the connection.
  useEffect(() => {
    if (!remote || !user?.id) return
    for (const p of providers) {
      if (authorized[p.id] === true && !remote[p.id]) {
        setRemote(prev => ({ ...prev, [p.id]: true }))
        setCalendarConnection(p.id, true).catch(e => console.error('calendar connections: backfill failed', e))
      }
    }
  }, [remote, authorized, user?.id, providers])

  const connected = useMemo(() => Object.fromEntries(providers.map(p => [
    p.id, !!(remote?.[p.id] || authorized[p.id] === true),
  ])), [providers, remote, authorized])

  const anyConnected = Object.values(connected).some(Boolean)
  const anyAuthorized = Object.values(authorized).some(v => v === true)
  const needsReconnect = useMemo(() => Object.fromEntries(providers.map(p => [
    p.id, !!remote?.[p.id] && authorized[p.id] === false,
  ])), [providers, remote, authorized])

  // `auto` marks a run no one explicitly asked for: it respects the master
  // switch and skips providers without a grant. "Sync now" does neither, so it
  // can surface the real error.
  const runRef = useRef(null)
  const run = useCallback(async ({ force = false, auto = false } = {}) => {
    const ctx = ctxRef.current
    // Never sync against lists that haven't loaded yet — with no local rows to
    // match against, every already-linked Google item looks "new" and the
    // insert collides with the row already sitting in Postgres.
    if (ctx.dataLoading) return null
    if (auto && !ctx.syncEnabled) return null
    if (runningRef.current) {
      if (force) againRef.current = true
      return null
    }
    if (!force && Date.now() - lastRunRef.current < FOREGROUND_COOLDOWN_MS) return null

    const targets = ctx.allCalendars.filter(c => c.google_sync && c.google_calendar_id)
      .filter(c => !auto || ctx.authorized[providerOfCalendar(c)?.id] === true)
    const groups = !auto || ctx.tasksAuthorized === true ? taskListGroups(ctx.workspaces) : []
    if (!targets.length && !groups.length) return null

    runningRef.current = true
    setSyncing(true)
    setError(null)
    const totals = { pulled: 0, pushed: 0, deleted: 0, failed: 0, tasksFailed: 0 }
    const add = one => {
      totals.pulled += one.pulled
      totals.pushed += one.pushed
      totals.deleted += one.deleted
      // A single row that failed doesn't fail the calendar, but must be visible.
      if (one.errors) setError(one.lastError)
    }
    try {
      const checklists = targets.length && ctx.eventTodosInGoogle
        ? buildChecklists(await allTodos(ctx))
        : null

      // One calendar failing must not stop the others — a revoked share or a
      // calendar deleted on the remote side is ordinary, not fatal.
      for (const calendar of targets) {
        const provider = providerOfCalendar(calendar)
        if (!provider) continue
        try {
          add(await provider.sync(calendar, { ...ctxRef.current, checklists }))
        } catch (e) {
          console.error(`calendar sync: ${calendar.name} failed`, e)
          totals.failed += 1
          // A lost grant is the one thing the user can fix: show Reconnect.
          if (e instanceof NotSignedIn) setAuthorized(prev => ({ ...prev, [provider.id]: false }))
          setError(messageOf(e))
        }
      }

      // Counted apart from `failed`: the calendar connect flow reads that one,
      // and a task list problem must not fail a calendar setup.
      const eventsById = new Map(ctxRef.current.events.map(e => [e.id, e]))
      for (const group of groups) {
        try {
          add(await syncTaskList(group, { ...ctxRef.current, eventsById }))
        } catch (e) {
          console.error(`tasks sync: ${group.listId} failed`, e)
          totals.tasksFailed += 1
          if (e instanceof NotSignedIn) setTasksAuthorized(false)
          setError(messageOf(e))
        }
      }
      lastRunRef.current = Date.now()
      setLastResult({ ...totals, at: new Date().toISOString() })
      return totals
    } finally {
      runningRef.current = false
      setSyncing(false)
      if (againRef.current) {
        againRef.current = false
        setTimeout(() => runRef.current?.({ force: true, auto: true }), 0)
      }
    }
  }, [])
  runRef.current = run

  const canAuto = syncEnabled && !dataLoading && (
    (anyAuthorized && linkedCalendars.length > 0) || (tasksAuthorized === true && taskGroups.length > 0)
  )
  const linkKey = [
    linkedCalendars.map(c => `${c.id}:${c.google_calendar_id}`).join('|'),
    taskGroups.map(g => `${g.listId}:${g.workspaces.map(w => w.id).join(',')}:${g.primaryId}`).join('|'),
    anyAuthorized, tasksAuthorized, eventTodosInGoogle,
  ].join('#')

  // Launch, a newly linked calendar or list, a new grant.
  useEffect(() => {
    if (!canAuto) return
    run({ force: true, auto: true })
  }, [canAuto, linkKey, run])

  // Foreground and reconnect.
  useEffect(() => {
    if (!canAuto) return
    const onVisible = () => { if (document.visibilityState === 'visible') run({ auto: true }) }
    const onOnline = () => run({ force: true, auto: true })
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [canAuto, run])

  // Edits made in Google, while the app stays open.
  useEffect(() => {
    if (!canAuto) return
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') run({ force: true, auto: true })
    }, POLL_MS)
    return () => clearInterval(id)
  }, [canAuto, run])

  // A local edit (or anything else that changed the rows) goes out shortly
  // after, instead of waiting for the next launch or foreground.
  useEffect(() => {
    if (!canAuto) return
    if (runningRef.current) { againRef.current = true; return }
    if (navigator.onLine === false) return
    const id = setTimeout(() => run({ force: true, auto: true }), EDIT_DEBOUNCE_MS)
    return () => clearTimeout(id)
  }, [allEvents, todos]) // eslint-disable-line react-hooks/exhaustive-deps

  // Must be called straight from a click: it opens Google's popup. Also the
  // reconnect — in place, never through the setup flow.
  const connect = useCallback(async (providerId) => {
    const provider = providerFor(providerId)
    if (!provider) return false
    setError(null)
    try {
      await provider.connect()
    } catch (e) {
      setError(messageOf(e))
      return false
    }
    setAuthorized(prev => ({ ...prev, [provider.id]: true }))
    setRemote(prev => ({ ...prev, [provider.id]: true }))
    lastRunRef.current = 0
    // The grant may carry Tasks too (include_granted_scopes).
    checkAccess()
    // The grant already succeeded; a failed status write (e.g. offline) must
    // not turn that into a failed connect.
    setCalendarConnection(provider.id, true)
      .catch(e => console.error('calendar connections: save failed', e))
    return true
  }, [checkAccess])

  // Revoking ends the whole Google grant, Tasks included.
  const disconnect = useCallback(async (providerId) => {
    const provider = providerFor(providerId)
    if (!provider) return
    try {
      await provider.disconnect()
    } catch (e) {
      setError(messageOf(e))
      return
    }
    setAuthorized(prev => ({ ...prev, [provider.id]: false }))
    setRemote(prev => ({ ...prev, [provider.id]: false }))
    if (provider.id === 'google') setTasksAuthorized(false)
    await setCalendarConnection(provider.id, false)
      .catch(e => console.error('calendar connections: save failed', e))
  }, [])

  const listRemoteCalendars = useCallback(async (providerId) => {
    const provider = providerFor(providerId)
    if (!provider) return []
    try {
      return await provider.listRemoteCalendars()
    } catch (e) {
      if (e instanceof NotSignedIn) setAuthorized(prev => ({ ...prev, [provider.id]: false }))
      setError(messageOf(e))
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

  // ── Google Tasks ───────────────────────────────────────────────────────

  // Must be called straight from a click, same as connect().
  const connectTasks = useCallback(async () => {
    setError(null)
    try {
      await grantTasks()
      setTasksAuthorized(true)
      lastRunRef.current = 0
      return true
    } catch (e) {
      setError(messageOf(e))
      return false
    }
  }, [])

  const listLists = useCallback(async () => {
    try {
      return await listTaskLists()
    } catch (e) {
      if (e instanceof NotSignedIn) setTasksAuthorized(false)
      setError(messageOf(e))
      return []
    }
  }, [])

  // Linking a workspace to a list another workspace already syncs with merges
  // the two. The workspace already there keeps receiving new Google tasks.
  // Todos still holding ids from a previously linked list are recreated in the
  // new one by the sync (a 404 drops the stale id).
  const linkTaskList = useCallback(async (workspace, listId) => {
    if (!workspace || !listId) return null
    setError(null)
    try {
      const id = listId === NEW_TASK_LIST ? (await createTaskList(workspace.name)).id : listId
      const others = (taskListGroups(workspaces).find(g => g.listId === id)?.workspaces ?? [])
        .filter(w => w.id !== workspace.id)
      const primary = others.length === 0
        || (workspace.google_tasklist_id === id && !!workspace.google_tasks_primary)
      if (workspace.google_tasklist_id !== id) await clearTasksState(id)
      await updateWorkspace(workspace.id, {
        google_tasklist_id: id, google_tasks_sync: true, google_tasks_primary: primary,
      })
      lastRunRef.current = 0
      return id
    } catch (e) {
      setError(messageOf(e))
      return null
    }
  }, [workspaces, updateWorkspace])

  // Leaves the todos and the tasks where they are. The list id is kept, so
  // relinking the same list carries on without duplicating anything.
  const unlinkTaskList = useCallback(async (workspace) => {
    if (!workspace) return
    const group = taskListGroups(workspaces).find(g => g.workspaces.some(w => w.id === workspace.id))
    const others = group?.workspaces.filter(w => w.id !== workspace.id) ?? []
    await updateWorkspace(workspace.id, { google_tasks_sync: false, google_tasks_primary: false })
    if (!others.length) {
      await clearTasksState(workspace.google_tasklist_id)
    } else if (group.primaryId === workspace.id) {
      // The list still needs somewhere for new Google tasks to land.
      await updateWorkspace(others[0].id, { google_tasks_primary: true })
    }
  }, [workspaces, updateWorkspace])

  const setTaskPrimary = useCallback(async (workspace) => {
    const group = taskListGroups(workspaces).find(g => g.workspaces.some(w => w.id === workspace?.id))
    if (!group) return
    for (const w of group.workspaces) {
      const primary = w.id === workspace.id
      if (!!w.google_tasks_primary !== primary) await updateWorkspace(w.id, { google_tasks_primary: primary })
    }
  }, [workspaces, updateWorkspace])

  const value = {
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
    reconnect: connect,
    disconnect,
    listRemoteCalendars,
    linkCalendar,
    unlinkCalendar,
    syncNow: () => run({ force: true }),
    tasks: {
      authorized: tasksAuthorized === true,
      groups: taskGroups,
      needsReconnect: taskGroups.length > 0 && tasksAuthorized === false,
      connect: connectTasks,
      listLists,
      link: linkTaskList,
      unlink: unlinkTaskList,
      setPrimary: setTaskPrimary,
    },
  }

  return <GoogleSyncContext.Provider value={value}>{children}</GoogleSyncContext.Provider>
}

export function useGoogleSync() {
  const ctx = useContext(GoogleSyncContext)
  if (!ctx) throw new Error('useGoogleSync must be used within GoogleSyncProvider')
  return ctx
}
