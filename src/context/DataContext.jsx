import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { useAuth } from './AuthContext.jsx'
import { useWorkspace } from './WorkspaceContext.jsx'
import {
  saveTopic, deleteTopic,
  saveTodo, deleteTodo, repairUnscopedTodos,
  saveCalendar, deleteCalendar,
  saveSemester, deleteSemester,
  saveCalendarEvent, deleteCalendarEvent,
  saveExam, deleteExam,
  saveWidgetConfigs, deleteWidgetConfig,
  deleteSession,
} from '../services/dbInterface.js'
import {
  registerFlushCallback,
  getLocalChanges, getCloudSnapshot, setShell,
} from '../services/localStorageEngine.js'
import {
  STORES, getAllByWorkspace, getAllByUser, getSessionsInWindow,
} from '../services/offlineDB.js'
import { visibleInWorkspace, scopeOf } from '../utils/calendar/calendarScope.js'
import { syncAll } from '../services/syncEngine.js'
// Importing this also registers the mirror listener that keeps the local
// search index in step with every write.
import { ensureIndexed } from '../services/localIndex.js'
import { noteRemoteDelete } from '../services/sync/index.js'
import { supabase } from '../services/supabaseConfig.js'

const DataContext = createContext(null)

// How far back to load sessions. Must cover the longest timeframe the UI can
// select (Statistics + widgets offer up to 90 days / 12 weeks), otherwise those
// views compute averages from an incomplete window and report wrong numbers.
const SESSION_WINDOW_DAYS = 90
const SESSION_WINDOW_MS = SESSION_WINDOW_DAYS * 24 * 60 * 60 * 1000

// Run after the current frame has painted: rIC where supported, rAF fallback.
// Returns a cancel function.
function deferToIdle(fn) {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(fn, { timeout: 1000 })
    return () => cancelIdleCallback(id)
  }
  const id = requestAnimationFrame(() => requestAnimationFrame(fn))
  return () => cancelAnimationFrame(id)
}

export function DataProvider({ children }) {
  const { user } = useAuth()
  const { activeWorkspaceId } = useWorkspace()

  // Stale-while-revalidate seed: synchronously hydrate from the last synced
  // snapshot saved on this device so the UI paints real data on the first
  // frame instead of a skeleton. Guarded by user id *and* workspace id so we
  // never flash another account's — or another workspace's — data. The
  // background fetch below then revalidates with the sync spinner visible.
  const seed = useMemo(() => {
    const snap = getCloudSnapshot()
    if (!user || snap.userId !== user.id) return null
    // `workspaceId == null` is a snapshot written before the multi-workspace
    // update — it belongs to what is now the default workspace, so accept it
    // rather than cold-starting on data we already hold.
    const sameWorkspace = snap.workspaceId == null || snap.workspaceId === activeWorkspaceId
    return sameWorkspace ? snap : null
  }, []) // mount-only: snapshot of the device's last sync for this workspace
  const hasSeed = !!(seed && Array.isArray(seed.topics))

  const [topics, setTopics] = useState(seed?.topics ?? [])
  const [todos, setTodos] = useState(seed?.todos ?? [])
  const [widgets, setWidgets] = useState(seed?.widgets ?? [])
  // Calendar v2. `scheduled` is gone as state — study events are projected back
  // into the old scheduled_sessions row shape further down, so TopicStatsScreen
  // and anything else reading `scheduled` keeps working unchanged.
  const [calendars, setCalendars] = useState(seed?.calendars ?? [])
  const [semesters, setSemesters] = useState(seed?.semesters ?? [])
  const [events, setEvents] = useState(seed?.events ?? [])
  const [exams, setExams] = useState(seed?.exams ?? [])
  const [recentSessions, setRecentSessions] = useState(seed?.recentSessions ?? [])
  const [dataLoading, setDataLoading] = useState(!hasSeed)
  const [widgetModalOpen, setWidgetModalOpen] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [syncError, setSyncError] = useState(false)
  const syncCount = useRef(0)
  const [lastSyncTime, setLastSyncTime] = useState(() => {
    const stored = localStorage.getItem('medtracker_last_sync')
    return stored ? new Date(stored) : null
  })
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [pendingChanges, setPendingChanges] = useState(() => getLocalChanges().length)

  function refreshPending() { setPendingChanges(getLocalChanges().length) }

  function beginSync() {
    syncCount.current += 1
    setSyncing(true)
  }
  function endSync() {
    syncCount.current = Math.max(0, syncCount.current - 1)
    if (syncCount.current === 0) setSyncing(false)
  }

  // Broadcast channel used to tell this user's other devices "something changed,
  // pull now". Works even where postgres_changes is not configured for a table
  // (publication / replica identity), and fires only after the write committed.
  const pingChannelRef = useRef(null)
  function notifyPeers() {
    pingChannelRef.current?.send({ type: 'broadcast', event: 'changed', payload: {} }).catch(() => {})
  }

  const windowStart = () => new Date(Date.now() - SESSION_WINDOW_MS).toISOString()

  // Latest active workspace, readable from inside in-flight async reads.
  const activeWorkspaceIdRef = useRef(activeWorkspaceId)
  activeWorkspaceIdRef.current = activeWorkspaceId

  // Load state from the IndexedDB mirror (no network). `force` controls what
  // happens when a store is empty: on the first mount-time hydrate we keep the
  // synchronous seed rather than blank it (force=false); after a pull the
  // mirror is authoritative, so empties are applied (force=true).
  const hydrateFromOffline = useCallback(async ({ force = false } = {}) => {
    if (!user || !activeWorkspaceId) return false
    const wsId = activeWorkspaceId
    // A read started for workspace A must never land after a switch to B — on a
    // fast A→B→A switch the slow first read would otherwise paint A's rows over
    // B's. Every setter below is gated on the scope still being the one we read.
    const stale = () => wsId !== activeWorkspaceIdRef.current

    // One slice failing must not leave the other three showing the previous
    // workspace, so each read is isolated instead of sharing a single try.
    const read = async (label, fn) => {
      try { return await fn() } catch (e) { console.error(`hydrateFromOffline: ${label} failed`, e); return null }
    }

    // Two stages: the 90-day session window is by far the largest read, and
    // nothing above the fold needs it. Paint topics/todos/widgets as soon as
    // they land, then fill sessions in behind them.
    const sessionsPromise = read('sessions', () => getSessionsInWindow(user.id, windowStart(), wsId))
    const [t, td, w, cal, sem, ev, ex] = await Promise.all([
      read('topics',  () => getAllByWorkspace(STORES.topics, user.id, wsId)),
      read('todos',   () => getAllByWorkspace(STORES.todos, user.id, wsId)),
      read('widgets', () => getAllByWorkspace(STORES.widget_configs, user.id, wsId)),
      // User-wide, not workspace-wide: a calendar can be shared into other
      // workspaces, so which rows are *shown* is decided by the visibility
      // filter below, not by the read.
      read('calendars', () => getAllByUser(STORES.calendars, user.id)),
      read('semesters', () => getAllByUser(STORES.semesters, user.id)),
      read('events',    () => getAllByUser(STORES.calendar_events, user.id)),
      read('exams',     () => getAllByUser(STORES.exams, user.id)),
    ])
    if (stale()) return false
    if (t  && (force || t.length))  setTopics([...t].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)))
    if (td && (force || td.length)) setTodos(td)
    if (w  && (force || w.length))  setWidgets([...w].sort((a, b) => (a.position ?? 0) - (b.position ?? 0)))
    if (cal && (force || cal.length)) setCalendars([...cal].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0)))
    if (sem && (force || sem.length)) setSemesters(sem)
    if (ev  && (force || ev.length))  setEvents(ev)
    if (ex  && (force || ex.length))  setExams(ex)

    const sessions = await sessionsPromise
    if (stale()) return false
    if (sessions && (force || sessions.length)) setRecentSessions(sessions)
    return !!(t?.length || td?.length || w?.length || ev?.length || sessions?.length)
  }, [user, activeWorkspaceId])

  // Push queued local changes, pull only what changed since the last sync into
  // IndexedDB, then refresh state from the mirror. The sync spinner stays
  // visible for the whole cycle; the on-screen data is never blanked.
  const revalidate = useCallback(async () => {
    if (!user || !navigator.onLine) return
    beginSync()
    try {
      const queuedBefore = getLocalChanges().length
      await syncAll(user.id)
      await hydrateFromOffline({ force: true })
      const now = new Date()
      setLastSyncTime(now)
      localStorage.setItem('medtracker_last_sync', now.toISOString())
      // Offline writes just reached the cloud — let other devices pull them.
      if (queuedBefore > getLocalChanges().length) notifyPeers()
      refreshPending()
      setSyncError(false)
    } catch (e) {
      console.error('DataContext sync error:', e)
      setSyncError(true)
    } finally {
      endSync()
    }
  }, [user, hydrateFromOffline])

  // One-off per device: claim any todo left without a workspace_id for the
  // default workspace, then refresh. Guarded by a localStorage flag so it costs
  // nothing on every later launch, and skipped entirely while offline.
  const repairTodos = useCallback(async () => {
    if (!user || !navigator.onLine) return
    const flag = `mt_todos_repaired_${user.id}`
    if (localStorage.getItem(flag)) return
    try {
      const fixed = await repairUnscopedTodos(user.id)
      localStorage.setItem(flag, '1')
      if (fixed) await hydrateFromOffline({ force: true })
    } catch (e) {
      console.error('repairUnscopedTodos failed:', e)
    }
  }, [user, hydrateFromOffline])

  // Keep the latest revalidate in a ref so the realtime subscription can call
  // it without resubscribing on every render.
  const revalidateRef = useRef(revalidate)
  revalidateRef.current = revalidate

  // Mirror the first-paint shell to localStorage whenever the visible data
  // changes (after hydrate, writes, or a pull) — read on the next launch's
  // first frame. Deferred to idle and skipped when nothing actually changed:
  // the write serialises the whole dataset, so doing it inline on every change
  // put a long JSON.stringify task straight on the interaction path.
  const lastShellRef = useRef(null)
  const writeShellRef = useRef(() => {})
  useEffect(() => {
    if (!user || !activeWorkspaceId) return
    const write = () => {
      // Reference compare: these arrays are replaced wholesale on every change,
      // so identity is an exact — and free — "nothing to rewrite" check.
      const prev = lastShellRef.current
      if (prev &&
          prev.workspaceId === activeWorkspaceId &&
          prev.topics === topics && prev.todos === todos &&
          prev.widgets === widgets && prev.recentSessions === recentSessions &&
          prev.calendars === calendars && prev.semesters === semesters &&
          prev.events === events && prev.exams === exams) return
      const payload = { topics, todos, widgets, recentSessions, calendars, semesters, events, exams }
      lastShellRef.current = { workspaceId: activeWorkspaceId, ...payload }
      setShell({ userId: user.id, workspaceId: activeWorkspaceId, ...payload })
    }
    writeShellRef.current = write
    return deferToIdle(write)
  }, [user, activeWorkspaceId, topics, todos, widgets, recentSessions, calendars, semesters, events, exams])

  // The idle write above is cancelled if the app is backgrounded before it
  // runs — flush it here so the next launch still seeds from the latest state.
  useEffect(() => {
    const flush = () => writeShellRef.current?.()
    const onVisibility = () => { if (document.visibilityState === 'hidden') flush() }
    window.addEventListener('pagehide', flush)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.removeEventListener('pagehide', flush)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  // ── Workspace switching ────────────────────────────────────────────────
  // The sync engine mirrors every workspace into IndexedDB, so a switch is a
  // single indexed local read — no network, works offline, no perceptible lag.
  const firstWorkspace = useRef(true)
  useEffect(() => {
    if (!user || !activeWorkspaceId) return
    if (firstWorkspace.current) { firstWorkspace.current = false; return }
    // Clear first: the new workspace's data is one indexed local read away, and
    // a blank frame is correct where the previous workspace's rows are not — if
    // the read is slow or fails, nothing from the old workspace stays on screen.
    setTopics([]); setTodos([]); setWidgets([]); setRecentSessions([])
    // The calendar state is held user-wide and narrowed by the visibility
    // memos, so it must NOT be blanked here — clearing it would drop shared
    // calendars for the frame it takes to re-read them, and re-reading them is
    // pure waste since the rows are already the right ones.
    hydrateFromOffline({ force: true })
  }, [activeWorkspaceId]) // eslint-disable-line react-hooks/exhaustive-deps

  // online / offline tracking
  useEffect(() => {
    function onOnline()  { setIsOnline(true) }
    function onOffline() { setIsOnline(false) }
    window.addEventListener('online',  onOnline)
    window.addEventListener('offline', onOffline)
    return () => {
      window.removeEventListener('online',  onOnline)
      window.removeEventListener('offline', onOffline)
    }
  }, [])

  // Launch flow: seed (sync, already painted) → hydrate from IndexedDB →
  // revalidate. The cloud sync is deferred to an idle callback so it never
  // competes with the first paint of the seeded data — the app shows the last
  // saved state instantly and only starts syncing once that frame is on screen.
  useEffect(() => {
    if (!user) {
      setTopics([]); setTodos([]); setWidgets([]); setRecentSessions([])
      setCalendars([]); setSemesters([]); setEvents([]); setExams([])
      setDataLoading(false)
      return
    }
    let cancelled = false
    let cancelIdle = () => {}
    ;(async () => {
      // Local mirror only — no network. Fast, paints the freshest local data.
      const idbHadData = await hydrateFromOffline({ force: false })
      if (cancelled) return
      // Show the skeleton only on a genuine cold start (no seed, empty mirror).
      if (hasSeed || idbHadData) setDataLoading(false)
      // Now that local data is on screen, kick off the cloud sync at idle.
      cancelIdle = deferToIdle(async () => {
        if (cancelled) return
        await revalidate()
        if (!cancelled) setDataLoading(false)
        if (!cancelled) await repairTodos()
        // Last, and only if it has never been built (or the analyzer changed):
        // the incremental mirror hook keeps it current from then on.
        if (!cancelled) {
          ensureIndexed(user.id, activeWorkspaceIdRef.current)
            .catch(e => console.error('ensureIndexed failed:', e))
        }
      })
    })()
    // On reconnect, push + pull (spinner shows, data stays put).
    registerFlushCallback(() => revalidateRef.current?.())
    return () => { cancelled = true; cancelIdle() }
    // Launch flow only. Deliberately not re-run on a workspace switch — that
    // path is a purely local re-hydrate (see the effect above) and must not
    // trigger a network sync.
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Realtime cross-device sync ─────────────────────────────────────────
  // A change on another device triggers a single debounced incremental pull
  // instead of per-table full re-fetches. Three signals, any one is enough:
  //   1. broadcast ping sent by the writing device after its write committed
  //   2. postgres_changes (needs supabase_migration_realtime_publication.sql)
  //   3. catch-up pull when the channel (re)joins or the app becomes visible —
  //      a backgrounded tab/PWA drops the socket and misses events meanwhile.
  useEffect(() => {
    if (!user) return
    const uid = user.id
    let timer = null
    const debouncedPull = () => {
      clearTimeout(timer)
      timer = setTimeout(() => { revalidateRef.current?.() }, 250)
    }
    // Every join after the first is a reconnect: pull what was missed.
    const catchUpOnRejoin = () => {
      let joined = false
      return status => {
        if (status !== 'SUBSCRIBED') return
        if (joined) debouncedPull()
        joined = true
      }
    }

    // Separate channel: a postgres_changes setup error rejects the whole join,
    // and must not take the ping path down with it.
    const pingChannel = supabase
      .channel(`sync-ping-${uid}`, { config: { broadcast: { self: false } } })
      .on('broadcast', { event: 'changed' }, debouncedPull)
      .subscribe(catchUpOnRejoin())
    pingChannelRef.current = pingChannel

    const own = { schema: 'public', filter: `user_id=eq.${uid}` }
    const dbChannel = supabase
      .channel(`realtime-${uid}`)
      .on('postgres_changes', { event: '*', table: 'topics',             ...own }, debouncedPull)
      .on('postgres_changes', { event: '*', table: 'todos',              ...own }, debouncedPull)
      .on('postgres_changes', { event: '*', table: 'sessions',           ...own }, debouncedPull)
      .on('postgres_changes', { event: '*', table: 'scheduled_sessions', ...own }, debouncedPull)
      .on('postgres_changes', { event: '*', table: 'calendars',          ...own }, debouncedPull)
      .on('postgres_changes', { event: '*', table: 'semesters',          ...own }, debouncedPull)
      .on('postgres_changes', { event: '*', table: 'calendar_events',    ...own }, debouncedPull)
      .on('postgres_changes', { event: '*', table: 'exams',              ...own }, debouncedPull)
      .on('postgres_changes', { event: '*', table: 'workspaces',         ...own }, debouncedPull)
      // Widget saves are delete-all + re-insert; reacting to the DELETEs would
      // pull between the two requests and flash an empty layout. INSERT/UPDATE
      // plus the broadcast ping cover every widget change.
      .on('postgres_changes', { event: 'INSERT', table: 'widget_configs', ...own }, debouncedPull)
      .on('postgres_changes', { event: 'UPDATE', table: 'widget_configs', ...own }, debouncedPull)
      // Tombstones are INSERTs, so they filter by user_id reliably (DELETE
      // events on RLS tables carry only the primary key).
      .on('postgres_changes', { event: 'INSERT', table: 'deletions',      ...own }, debouncedPull)
      .subscribe(catchUpOnRejoin())

    const onVisible = () => { if (document.visibilityState === 'visible') debouncedPull() }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      pingChannelRef.current = null
      supabase.removeChannel(pingChannel)
      supabase.removeChannel(dbChannel)
    }
  }, [user?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync ───────────────────────────────────────────────────────────────

  async function syncNow() {
    await revalidate()
  }

  // ── Topics ─────────────────────────────────────────────────────────────

  async function upsertTopic(topic) {
    beginSync()
    try {
      const saved = await saveTopic(user.id, topic)
      setTopics(prev => {
        const idx = prev.findIndex(t => t.id === saved.id)
        if (idx >= 0) { const next = [...prev]; next[idx] = saved; return next }
        return [...prev, saved]
      })
      notifyPeers()
      return saved
    } finally { endSync() }
  }

  async function removeTopic(topicId) {
    beginSync()
    try {
      await deleteTopic(user.id, topicId)
      setTopics(prev => prev.filter(t => t.id !== topicId))
      notifyPeers()
    } finally { endSync() }
  }

  // ── Todos ──────────────────────────────────────────────────────────────

  // Optimistic: the change is on screen immediately (and lands in the shell
  // snapshot on the next idle write); the save reconciles or rolls it back.
  const putTodo = (list, row) => {
    const idx = list.findIndex(t => t.id === row.id)
    if (idx < 0) return [...list, row]
    const next = [...list]; next[idx] = row; return next
  }

  async function upsertTodo(todo) {
    const before = todos.find(t => t.id === todo.id)
    const optimistic = {
      ...todo,
      id: todo.id ?? crypto.randomUUID(),
      workspace_id: todo.workspace_id ?? activeWorkspaceId,
      created_at: todo.created_at ?? new Date().toISOString(),
    }
    setTodos(prev => putTodo(prev, optimistic))
    beginSync()
    try {
      const saved = await saveTodo(user.id, optimistic)
      setTodos(prev => putTodo(prev, saved))
      refreshPending()
      notifyPeers()
      return saved
    } catch (e) {
      setTodos(prev => (before ? putTodo(prev, before) : prev.filter(t => t.id !== optimistic.id)))
      throw e
    } finally { endSync() }
  }

  async function removeTodo(todoId) {
    const before = todos.find(t => t.id === todoId)
    setTodos(prev => prev.filter(t => t.id !== todoId))
    beginSync()
    try {
      await deleteTodo(user.id, todoId)
      refreshPending()
      notifyPeers()
    } catch (e) {
      if (before) setTodos(prev => putTodo(prev, before))
      throw e
    } finally { endSync() }
  }

  // ── Calendar v2 ────────────────────────────────────────────────────────

  // One optimistic writer shared by all four calendar entities. Same contract
  // as upsertTodo above: patch state on the spot, reconcile with the saved row,
  // roll back on failure. Dragging an event must repaint on the frame the
  // pointer is released, and must visibly snap back if the write fails.
  // `scopeFor` decides which workspace stamps a new row. Rows that hang off a
  // calendar take the calendar's, not the active one, so a shared calendar's
  // contents stay under one scope however many workspaces it is shown in.
  function makeOptimisticWriter(list, setList, save, remove, scopeFor = null) {
    const put = (arr, row) => {
      const idx = arr.findIndex(r => r.id === row.id)
      if (idx < 0) return [...arr, row]
      const next = [...arr]; next[idx] = row; return next
    }

    async function upsert(row) {
      const before = list.find(r => r.id === row.id)
      const optimistic = {
        ...row,
        id: row.id ?? crypto.randomUUID(),
        workspace_id: row.workspace_id ?? scopeFor?.(row) ?? activeWorkspaceId,
        created_at: row.created_at ?? new Date().toISOString(),
      }
      setList(prev => put(prev, optimistic))
      beginSync()
      try {
        const saved = await save(user.id, optimistic)
        setList(prev => put(prev, saved))
        refreshPending()
        notifyPeers()
        return saved
      } catch (e) {
        setList(prev => (before ? put(prev, before) : prev.filter(r => r.id !== optimistic.id)))
        throw e
      } finally { endSync() }
    }

    async function removeOne(id) {
      const before = list.find(r => r.id === id)
      setList(prev => prev.filter(r => r.id !== id))
      beginSync()
      try {
        await remove(user.id, id)
        refreshPending()
        notifyPeers()
      } catch (e) {
        if (before) setList(prev => put(prev, before))
        throw e
      } finally { endSync() }
    }

    return [upsert, removeOne]
  }

  const calendarScope = row => scopeOf(calendars.find(c => c.id === row.calendar_id))

  const [upsertCalendar, removeCalendar] = makeOptimisticWriter(calendars, setCalendars, saveCalendar, deleteCalendar)
  const [upsertSemester, removeSemester] = makeOptimisticWriter(semesters, setSemesters, saveSemester, deleteSemester, calendarScope)
  const [upsertEvent, removeEventRow] = makeOptimisticWriter(events, setEvents, saveCalendarEvent, deleteCalendarEvent, calendarScope)

  // Deleting a synced event has to reach Google too, and the row — with its
  // google_event_id — is gone the moment the delete lands. Note it first.
  // `skipGoogle` is set when the deletion *came* from Google.
  async function removeEvent(eventId, { skipGoogle = false } = {}) {
    const row = events.find(e => e.id === eventId)
    if (!skipGoogle && row?.google_event_id) {
      const calendar = calendars.find(c => c.id === row.calendar_id)
      noteRemoteDelete(calendar, row.google_event_id).catch(() => {})
    }
    return removeEventRow(eventId)
  }
  const [upsertExam, removeExam] = makeOptimisticWriter(exams, setExams, saveExam, deleteExam, calendarScope)

  // Checking a parent task ticks its whole subtree, and a drag-reorder can
  // touch several siblings — both want one repaint and one sync cycle, not one
  // per row.
  async function upsertTodos(rows) {
    if (!rows?.length) return []
    const before = todos
    const stamped = rows.map(td => ({
      ...td,
      id: td.id ?? crypto.randomUUID(),
      workspace_id: td.workspace_id ?? activeWorkspaceId,
      created_at: td.created_at ?? new Date().toISOString(),
    }))
    setTodos(prev => stamped.reduce(putTodo, prev))
    beginSync()
    try {
      const saved = []
      for (const row of stamped) saved.push(await saveTodo(user.id, row))
      setTodos(prev => saved.reduce(putTodo, prev))
      refreshPending()
      notifyPeers()
      return saved
    } catch (e) {
      setTodos(before)
      throw e
    } finally { endSync() }
  }

  // ── Widgets ────────────────────────────────────────────────────────────

  async function updateWidgets(newWidgets) {
    beginSync()
    try {
      setWidgets(newWidgets)
      await saveWidgetConfigs(user.id, newWidgets)
      notifyPeers()
    } finally { endSync() }
  }

  async function removeWidget(position) {
    beginSync()
    try {
      await deleteWidgetConfig(user.id, position)
      setWidgets(prev => prev.filter(w => w.position !== position))
      notifyPeers()
    } finally { endSync() }
  }

  // ── Sessions ───────────────────────────────────────────────────────────

  function addRecentSession(session) {
    setRecentSessions(prev => [session, ...prev])
  }

  async function removeSession(sessionId) {
    beginSync()
    try {
      await deleteSession(user.id, sessionId)
      setRecentSessions(prev => prev.filter(s => s.id !== sessionId))
      notifyPeers()
    } finally { endSync() }
  }

  // Last line of defence against a todo rendering outside its workspace: every
  // row is stamped on write (saveTodo refuses an unscoped one), so a strict
  // match is safe and makes a bleed structurally impossible in the UI even if a
  // stale row ever reaches state.
  const scopedTodos = useMemo(
    () => todos.filter(t => t.workspace_id === activeWorkspaceId),
    [todos, activeWorkspaceId],
  )

  // Calendars answer the visibility question for everything hanging off them:
  // a calendar shared into this workspace brings its events, semesters and
  // exams with it, even though those rows are stamped with the *owning*
  // workspace. Filtering them on their own workspace_id would hide exactly the
  // rows sharing exists to show.
  const scopedCalendars = useMemo(
    () => calendars.filter(c => visibleInWorkspace(c, activeWorkspaceId)),
    [calendars, activeWorkspaceId],
  )
  const visibleCalendarIds = useMemo(
    () => new Set(scopedCalendars.map(c => c.id)),
    [scopedCalendars],
  )
  const scopedSemesters = useMemo(
    () => semesters.filter(s => visibleCalendarIds.has(s.calendar_id)),
    [semesters, visibleCalendarIds],
  )
  const scopedEvents = useMemo(
    () => events.filter(e => visibleCalendarIds.has(e.calendar_id)),
    [events, visibleCalendarIds],
  )
  const scopedExams = useMemo(
    () => exams.filter(x => visibleCalendarIds.has(x.calendar_id)),
    [exams, visibleCalendarIds],
  )

  // calendar_events is the source of truth now, but TopicStatsScreen (and its
  // two deep links into the calendar) still read `scheduled` in the old
  // scheduled_sessions row shape. Project study events back into that shape
  // instead of rewriting those call sites around a model they don't care about.
  const scopedScheduled = useMemo(
    () => scopedEvents
      .filter(e => e.kind === 'study' && e.topic_id)
      .map(e => ({
        id: e.id,
        topic_id: e.topic_id,
        workspace_id: e.workspace_id,
        scheduled_date: e.start_date,
        start_time: e.start_time,
        planned_minutes: e.planned_minutes,
        note: e.notes,
        completed: e.completed,
        session_id: e.session_id,
      })),
    [scopedEvents],
  )

  return (
    <DataContext.Provider value={{
      topics, todos: scopedTodos, widgets, recentSessions,
      calendars: scopedCalendars,
      // Unfiltered, for the settings screen that assigns calendars to
      // workspaces: it has to show a calendar you are about to grant access
      // to, and one you just revoked, neither of which is "visible here".
      allCalendars: calendars,
      semesters: scopedSemesters,
      events: scopedEvents,
      exams: scopedExams,
      scheduled: scopedScheduled,
      dataLoading, syncing, syncError, lastSyncTime,
      isOnline, pendingChanges,
      widgetModalOpen, setWidgetModalOpen,
      upsertTopic, removeTopic,
      upsertTodo, removeTodo, upsertTodos,
      upsertCalendar, removeCalendar,
      upsertSemester, removeSemester,
      upsertEvent, removeEvent,
      upsertExam, removeExam,
      updateWidgets, removeWidget,
      addRecentSession, removeSession,
      reloadAll: revalidate,
      syncNow,
    }}>
      {children}
    </DataContext.Provider>
  )
}

export function useData() {
  const ctx = useContext(DataContext)
  if (!ctx) throw new Error('useData must be used within DataProvider')
  return ctx
}
