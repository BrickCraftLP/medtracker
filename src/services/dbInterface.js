// DB abstraction layer — swap the provider here, never in components.
// All functions communicate via supabase. To migrate to another provider,
// replace the import and rewrite these functions only.

import { supabase } from './supabaseConfig.js'
import {
  getCloudSnapshot,
  updateCloudSnapshot,
  queueChange,
  getCacheEntry,
  setCacheEntry,
  invalidateCache,
  invalidateCacheByPrefix,
  isOnline,
  getLocalChanges,
  removeLocalChange,
} from './localStorageEngine.js'
import {
  STORES,
  bulkPut,
  removeRows,
  getAllByUser,
  getAllByWorkspace,
  clearWorkspaceLocal,
  getSessionsInWindow as idbSessionsInWindow,
  getExercisesForSession as idbExercisesForSession,
} from './offlineDB.js'
import { getActiveWorkspace, scopedKey } from './workspaceScope.js'

// Every data read/write below is scoped to the active workspace on top of the
// existing user scope. `ws()` is that scope; it is resolved by
// WorkspaceContext before the first read runs.
const ws = getActiveWorkspace

// Write-through to the IndexedDB offline mirror. Best-effort: a failed mirror
// must never break a cloud write, the next sync will reconcile it anyway.
async function mirror(store, rows) { try { await bulkPut(store, rows) } catch {} }
async function unmirror(store, ids) { try { await removeRows(store, ids) } catch {} }

const DEFAULT_TOPICS = [
  { name: 'Biologie', emoji: '🧬', color_from: '#22c55e', color_to: '#16a34a', description: 'Zellbiologie, Genetik, Ökologie', display_order: 0 },
  { name: 'Chemie', emoji: '⚗️', color_from: '#f59e0b', color_to: '#d97706', description: 'Organische & anorganische Chemie', display_order: 1 },
  { name: 'Physik', emoji: '⚡', color_from: '#3b82f6', color_to: '#1d4ed8', description: 'Mechanik, Optik, Elektrizität', display_order: 2 },
  { name: 'Mathematik', emoji: '📐', color_from: '#8b5cf6', color_to: '#6d28d9', description: 'Analysis, Geometrie, Statistik', display_order: 3 },
  { name: 'Textverständnis', emoji: '📖', color_from: '#ec4899', color_to: '#be185d', description: 'Leseverständnis & Textanalyse', display_order: 4 },
  { name: 'Figuren & Muster', emoji: '🔷', color_from: '#06b6d4', color_to: '#0284c7', description: 'Räumliches Denken & Mustererkennung', display_order: 5 },
]

// ── Auth ───────────────────────────────────────────────────────────────────

export async function signIn(email, password, captchaToken) {
  const { data, error } = await supabase.auth.signInWithPassword({
    email,
    password,
    options: captchaToken ? { captchaToken } : undefined,
  })
  if (error) throw error
  return data
}

export async function signUp(email, password, displayName) {
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName } },
  })
  if (error) throw error
  return data
}

export async function signOut() {
  const { error } = await supabase.auth.signOut()
  if (error) throw error
}

export async function getSession() {
  const { data } = await supabase.auth.getSession()
  return data.session
}

// ── Profile ────────────────────────────────────────────────────────────────

export async function getProfile(userId) {
  const cacheKey = `profile_${userId}`
  const cached = getCacheEntry(cacheKey)
  if (cached) return cached

  const { data, error } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .single()
  if (error && error.code !== 'PGRST116') throw error
  if (data) setCacheEntry(cacheKey, data)
  return data
}

// Synchronous, cache-only read — no network. Used to seed UI state on first
// paint (e.g. an avatar) before the async getProfile() round trip resolves.
export function getCachedProfile(userId) {
  return getCacheEntry(`profile_${userId}`)
}

export async function upsertProfile(userId, profile) {
  const { data, error } = await supabase
    .from('profiles')
    .upsert({ id: userId, ...profile })
    .select()
    .single()
  if (error) throw error
  // Cache the fresh row immediately (not just invalidate) so the next read
  // — including the synchronous getCachedProfile() seed — is instant and
  // already correct, without waiting on another round trip.
  setCacheEntry(`profile_${userId}`, data)
  return data
}

// ── Calendar provider connections ──────────────────────────────────────────
// Whether the user connected a sync provider, shared across devices. Only the
// status — tokens stay per device (see supabase_migration_calendar_connections.sql).
// Read uncached: a 5-minute-stale "not connected" would re-prompt a user who
// just connected on another device.

export async function getCalendarConnections(userId) {
  const { data, error } = await supabase
    .from('profiles')
    .select('calendar_connections')
    .eq('id', userId)
    .maybeSingle()
  if (error) throw error
  return data?.calendar_connections ?? {}
}

export async function setCalendarConnection(providerId, connected) {
  const { data, error } = await supabase.rpc('set_calendar_connection', {
    p_provider: providerId,
    p_connected: connected,
  })
  if (error) throw error
  return data ?? {}
}

// ── Push notifications ─────────────────────────────────────────────────────
// Online-only, never queued: the server scheduler needs current state, and a
// stale write replayed later would be wrong (see supabase_migration_push.sql).

export async function registerPushSubscription({ endpoint, p256dh, auth }) {
  const { error } = await supabase.rpc('register_push_subscription', {
    p_endpoint: endpoint,
    p_p256dh: p256dh,
    p_auth: auth,
    p_user_agent: navigator.userAgent,
  })
  if (error) throw error
}

export async function unregisterPushSubscription(endpoint) {
  const { error } = await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
  if (error) throw error
}

export async function upsertNotificationPrefs(userId, prefs) {
  const { error } = await supabase.from('notification_prefs').upsert({ user_id: userId, ...prefs })
  if (error) throw error
}

export async function upsertActiveSession(userId) {
  const now = new Date().toISOString()
  const { error } = await supabase.from('active_sessions').upsert({ user_id: userId, started_at: now, last_seen_at: now })
  if (error) throw error
}

export async function touchActiveSession(userId) {
  const { error } = await supabase.from('active_sessions').update({ last_seen_at: new Date().toISOString() }).eq('user_id', userId)
  if (error) throw error
}

export async function deleteActiveSession(userId) {
  const { error } = await supabase.from('active_sessions').delete().eq('user_id', userId)
  if (error) throw error
}

// ── Workspaces ─────────────────────────────────────────────────────────────
// Account-level, never workspace-scoped themselves. Tiny table (max 5 rows),
// but it carries updated_at and a deletion tombstone trigger, so the existing
// delta sync engine picks it up with no changes.

export const MAX_WORKSPACES = 5

// Widgets a brand-new workspace starts with. Both render correctly with zero
// topics, so the home screen is never an empty page.
const DEFAULT_WIDGETS = [
  { position: 0, size: 'medium', widget_type: 'todo_list', config: {}, sub_widgets: [] },
  { position: 1, size: 'medium', widget_type: 'heatmap_intensity', config: {}, sub_widgets: [] },
]

export async function getWorkspaces(userId) {
  if (!isOnline()) {
    const rows = await getAllByUser(STORES.workspaces, userId)
    if (rows.length) return rows.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
  }

  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .eq('user_id', userId)
    .order('display_order')
  if (error) throw error
  await mirror(STORES.workspaces, data ?? [])
  return data ?? []
}

export async function saveWorkspace(userId, workspace) {
  const row = { ...workspace, id: workspace.id ?? crypto.randomUUID(), user_id: userId }

  const saveOffline = () => {
    queueChange('workspaces', 'upsert', row)
    return mirror(STORES.workspaces, [row]).then(() => row)
  }

  if (!isOnline()) return saveOffline()

  try {
    const { data, error } = await supabase
      .from('workspaces')
      .upsert(row)
      .select()
      .single()
    if (error) throw error
    await mirror(STORES.workspaces, [data])
    return data
  } catch (e) {
    console.error('saveWorkspace cloud write failed, queued for later sync:', e)
    return saveOffline()
  }
}

// The cloud cascade (`on delete cascade` from workspaces) removes the
// workspace's topics/sessions/exercises/todos/widgets server-side; here we
// only have to mirror that locally.
export async function deleteWorkspace(userId, workspaceId) {
  if (!isOnline()) {
    queueChange('workspaces', 'delete', { id: workspaceId })
    await clearWorkspaceLocal(userId, workspaceId)
    await unmirror(STORES.workspaces, [workspaceId])
    return
  }

  const { error } = await supabase
    .from('workspaces')
    .delete()
    .eq('id', workspaceId)
    .eq('user_id', userId)
  if (error) throw error
  await clearWorkspaceLocal(userId, workspaceId)
  await unmirror(STORES.workspaces, [workspaceId])
  for (const name of ['topics', 'todos', 'widgets', 'sessions', 'scheduled_sessions']) {
    invalidateCacheByPrefix(`${name}_${userId}_${workspaceId}`)
  }
  // The calendar tables are cached user-wide (they can be shared across
  // workspaces), so their key carries no workspace to match on.
  for (const name of ['calendars', 'semesters', 'calendar_events', 'exams']) {
    invalidateCacheByPrefix(`${name}_${userId}`)
  }
}

// Guarantees the user has at least one workspace. Covers accounts created
// after the SQL migration ran and any account whose signup seed failed.
export async function ensureDefaultWorkspace(userId) {
  const existing = await getWorkspaces(userId)
  if (existing.length) return existing[0]
  return saveWorkspace(userId, { name: 'Standard', color: '#6366f1', icon: 'grid', display_order: 0 })
}

// Seeds a freshly created workspace. No topics — a new workspace starts empty
// by design — just a usable default widget layout and the one calendar every
// event needs to hang off (the SQL backfill only covers workspaces that
// existed when it ran).
export async function initializeWorkspaceData(userId, workspaceId, workspaceName = 'Studium') {
  const rows = DEFAULT_WIDGETS.map(w => ({ ...w, id: crypto.randomUUID() }))
  try {
    await saveWidgetConfigs(userId, rows, workspaceId)
  } catch (e) {
    console.error('initializeWorkspaceData failed:', e)
  }
  try {
    await saveCalendar(userId, {
      workspace_id: workspaceId,
      name: workspaceName,
      color: '#6366f1',
      icon: '🎓',
      kind: 'study',
      is_default: true,
      display_order: 0,
    })
  } catch (e) {
    console.error('initializeWorkspaceData calendar seed failed:', e)
  }
}

// ── First-login seed ───────────────────────────────────────────────────────

export async function initializeUserData(userId) {
  // A brand-new account needs its default workspace before anything can be
  // scoped to it. setActiveWorkspace is handled by WorkspaceContext on mount;
  // here we only need the id to stamp the seeded topics.
  const workspace = await ensureDefaultWorkspace(userId)

  const existing = await getTopics(userId)
  if (existing.length > 0) return

  const toInsert = DEFAULT_TOPICS.map(t => ({ ...t, user_id: userId, workspace_id: workspace.id }))
  const { error } = await supabase.from('topics').insert(toInsert)
  if (error) throw error
  invalidateCache(scopedKey('topics', userId))
}

// ── Topics ─────────────────────────────────────────────────────────────────

export async function getTopics(userId) {
  const cacheKey = scopedKey('topics', userId)
  const cached = getCacheEntry(cacheKey)
  if (cached) return cached

  if (!isOnline()) {
    const rows = await getAllByWorkspace(STORES.topics, userId, ws())
    if (rows.length) return rows.sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    const snap = getCloudSnapshot()
    if (snap.topics && snap.workspaceId === ws()) return snap.topics
  }

  const { data, error } = await supabase
    .from('topics')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', ws())
    .order('display_order')
  if (error) throw error
  setCacheEntry(cacheKey, data ?? [])
  updateCloudSnapshot('topics', data ?? [])
  await mirror(STORES.topics, data ?? [])
  return data ?? []
}

export async function saveTopic(userId, topic) {
  // Ensure a stable id up front so the offline mirror, the queued change and
  // the eventual cloud row all share one key (no duplicate on next pull).
  const row = { ...topic, id: topic.id ?? crypto.randomUUID(), user_id: userId, workspace_id: topic.workspace_id ?? ws() }

  // Always persist locally + queue so the topic is never lost, then try the
  // cloud. If the cloud write fails for any reason (expired token, RLS, flaky
  // network — seen on iOS PWA), the queued change stays and the next sync
  // flushes it. Save must never throw back to the UI.
  const saveOffline = () => {
    queueChange('topics', 'upsert', row)
    invalidateCache(scopedKey('topics', userId))
    const snap = getCloudSnapshot()
    const topics = snap.topics ?? []
    const idx = topics.findIndex(t => t.id === row.id)
    if (idx >= 0) topics[idx] = row
    else topics.push(row)
    updateCloudSnapshot('topics', topics)
    return mirror(STORES.topics, [row]).then(() => row)
  }

  if (!isOnline()) return saveOffline()

  try {
    const { data, error } = await supabase
      .from('topics')
      .upsert(row)
      .select()
      .single()
    if (error) throw error
    invalidateCache(scopedKey('topics', userId))
    const snap = getCloudSnapshot()
    const topics = snap.topics ?? []
    const idx = topics.findIndex(t => t.id === data.id)
    if (idx >= 0) topics[idx] = data
    else topics.push(data)
    updateCloudSnapshot('topics', topics)
    await mirror(STORES.topics, [data])
    return data
  } catch (e) {
    console.error('saveTopic cloud write failed, queued for later sync:', e)
    return saveOffline()
  }
}

// Remove a topic and everything under it from the IndexedDB mirror, matching
// the server-side cascade (sessions → exercises, and the topic's todos).
async function removeTopicCascadeLocal(userId, topicId) {
  try {
    const sessions = (await getAllByUser(STORES.sessions, userId)).filter(s => s.topic_id === topicId)
    const sessionIds = sessions.map(s => s.id)
    if (sessionIds.length) {
      const exercises = (await getAllByUser(STORES.exercises, userId)).filter(e => sessionIds.includes(e.session_id))
      await unmirror(STORES.exercises, exercises.map(e => e.id))
      await unmirror(STORES.sessions, sessionIds)
    }
    const todos = (await getAllByUser(STORES.todos, userId)).filter(td => td.topic_id === topicId)
    await unmirror(STORES.todos, todos.map(td => td.id))
    await unmirror(STORES.topics, [topicId])
  } catch {}
}

export async function deleteTopic(userId, topicId) {
  if (!isOnline()) {
    queueChange('topics', 'delete', { id: topicId })
    invalidateCache(scopedKey('topics', userId))
    await removeTopicCascadeLocal(userId, topicId)
    return
  }

  // Delete exercises belonging to sessions of this topic, then sessions, then todos
  const { data: sessions } = await supabase
    .from('sessions')
    .select('id')
    .eq('user_id', userId)
    .eq('topic_id', topicId)

  if (sessions?.length) {
    const ids = sessions.map(s => s.id)
    await supabase.from('exercises').delete().in('session_id', ids)
    await supabase.from('sessions').delete().in('id', ids)
  }

  await supabase.from('todos').delete().eq('topic_id', topicId).eq('user_id', userId)

  const { error } = await supabase
    .from('topics')
    .delete()
    .eq('id', topicId)
    .eq('user_id', userId)
  if (error) throw error

  invalidateCache(scopedKey('topics', userId))
  invalidateCacheByPrefix(scopedKey('sessions', userId))
  const snap = getCloudSnapshot()
  if (snap.topics) {
    updateCloudSnapshot('topics', snap.topics.filter(t => t.id !== topicId))
  }
  await removeTopicCascadeLocal(userId, topicId)
}

// ── Sessions ───────────────────────────────────────────────────────────────

export async function saveSession(userId, sessionData, exercises) {
  // Assign ids client-side so the offline mirror, the queued change and the
  // cloud rows share keys — the next delta pull overwrites by id instead of
  // duplicating. (Same pattern as topics/widgets/import elsewhere.)
  const sessionId = crypto.randomUUID()
  const workspaceId = ws()
  const sessionRow = {
    id: sessionId,
    user_id: userId,
    workspace_id: workspaceId,
    topic_id: sessionData.topic_id,
    started_at: sessionData.started_at,
    ended_at: sessionData.ended_at,
    total_exercises: exercises.length,
    correct: exercises.filter(e => e.is_correct).length,
    wrong: exercises.filter(e => !e.is_correct).length,
    duration_seconds: sessionData.duration_seconds,
  }
  const exerciseRows = exercises.map(e => ({
    id: crypto.randomUUID(),
    session_id: sessionId,
    user_id: userId,
    workspace_id: workspaceId,
    is_correct: e.is_correct,
    duration_ms: e.duration_ms,
    created_at: e.created_at,
  }))

  // Always mirror locally + queue so the session is never lost, then try the
  // cloud. If the cloud write fails for any reason (expired token, RLS, flaky
  // network — common on iOS PWA wake), the queued change stays and the next
  // sync flushes it. Save must never throw back to the UI.
  const saveOffline = async () => {
    queueChange('sessions', 'insert', { sessionRow, exerciseRows })
    await mirror(STORES.sessions, [sessionRow])
    await mirror(STORES.exercises, exerciseRows)
    invalidateCacheByPrefix(scopedKey('sessions', userId))
    // Marker is on the returned object only (not mirrored) so the UI can show
    // a "saved offline, will sync" hint.
    return { ...sessionRow, _pendingSync: true }
  }

  if (!isOnline()) return saveOffline()

  try {
    const { data: session, error: sErr } = await supabase
      .from('sessions')
      .insert(sessionRow)
      .select('*')
      .single()
    if (sErr) throw sErr

    if (exerciseRows.length > 0) {
      const { error: eErr } = await supabase.from('exercises').insert(exerciseRows)
      if (eErr) throw eErr
    }

    invalidateCacheByPrefix(scopedKey('sessions', userId))
    await mirror(STORES.sessions, [session])
    await mirror(STORES.exercises, exerciseRows)
    return session
  } catch (e) {
    console.error('saveSession cloud write failed, queued for later sync:', e)
    return saveOffline()
  }
}

export async function getSessions(userId, fromDate, toDate) {
  const cacheKey = `${scopedKey('sessions', userId)}_${fromDate}_${toDate}`
  const cached = getCacheEntry(cacheKey)
  if (cached) return cached

  if (!isOnline()) {
    const rows = await idbSessionsInWindow(userId, fromDate, ws())
    return rows.filter(s => s.started_at <= toDate)
  }

  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', ws())
    .gte('started_at', fromDate)
    .lte('started_at', toDate)
    .order('started_at', { ascending: false })
  if (error) throw error
  setCacheEntry(cacheKey, data ?? [], 2 * 60 * 1000)
  await mirror(STORES.sessions, data ?? [])
  return data ?? []
}

async function removeSessionLocal(userId, sessionId) {
  try {
    const exercises = await idbExercisesForSession(sessionId)
    await unmirror(STORES.exercises, exercises.map(e => e.id))
    await unmirror(STORES.sessions, [sessionId])
  } catch {}
}

export async function deleteSession(userId, sessionId) {
  if (!isOnline()) {
    queueChange('sessions', 'delete', { id: sessionId })
    invalidateCacheByPrefix(scopedKey('sessions', userId))
    await removeSessionLocal(userId, sessionId)
    return
  }

  await supabase.from('exercises').delete().eq('session_id', sessionId)
  const { error } = await supabase.from('sessions').delete().eq('id', sessionId).eq('user_id', userId)
  if (error) throw error
  invalidateCacheByPrefix(scopedKey('sessions', userId))
  await removeSessionLocal(userId, sessionId)
}

export async function getExercisesForSession(sessionId) {
  const cacheKey = `exercises_${sessionId}`
  const cached = getCacheEntry(cacheKey)
  if (cached) return cached

  if (!isOnline()) {
    return idbExercisesForSession(sessionId)
  }

  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at')
  if (error) throw error
  setCacheEntry(cacheKey, data ?? [])
  await mirror(STORES.exercises, data ?? [])
  return data ?? []
}

// ── Todos ──────────────────────────────────────────────────────────────────

export async function getTodos(userId) {
  const cacheKey = scopedKey('todos', userId)
  const cached = getCacheEntry(cacheKey)
  if (cached) return cached

  if (!isOnline()) {
    const rows = await getAllByWorkspace(STORES.todos, userId, ws())
    return rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
  }

  const { data, error } = await supabase
    .from('todos')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', ws())
    .order('created_at')
  if (error) throw error
  setCacheEntry(cacheKey, data ?? [])
  await mirror(STORES.todos, data ?? [])
  return data ?? []
}

export async function saveTodo(userId, todo) {
  // An unscoped todo is worse than a failed write: it is invisible to every
  // workspace-indexed read and shows up wherever an unscoped one is tolerated.
  const workspaceId = todo.workspace_id ?? ws()
  if (!workspaceId) throw new Error('saveTodo: no active workspace')
  const row = {
    ...todo,
    id: todo.id ?? crypto.randomUUID(),
    user_id: userId,
    workspace_id: workspaceId,
    // Stamped locally so offline-created todos sort correctly before the first sync.
    created_at: todo.created_at ?? new Date().toISOString(),
  }

  const saveOffline = async () => {
    queueChange('todos', 'upsert', row)
    invalidateCache(scopedKey('todos', userId))
    await mirror(STORES.todos, [row])
    return row
  }

  if (!isOnline()) return saveOffline()

  let result
  try {
    result = await supabase.from('todos').upsert(row).select().single()
  } catch (e) {
    if (isNetworkError(e)) return saveOffline()
    throw e
  }
  const { data, error } = result
  if (error) {
    // navigator.onLine can claim "online" on a dead connection — queue the
    // write for the next sync instead of losing it.
    if (isNetworkError(error)) return saveOffline()
    throw error
  }
  invalidateCache(scopedKey('todos', userId))
  await mirror(STORES.todos, [data])
  return data
}

// A request that never got an HTTP response (no error code): dead connection,
// captive portal, DNS failure. Distinct from a server rejecting the write.
function isNetworkError(e) {
  return !!e && !e.code && /fetch|network|load failed|timeout/i.test(e.message ?? String(e))
}

export async function deleteTodo(userId, todoId) {
  const deleteOffline = async () => {
    queueChange('todos', 'delete', { id: todoId })
    invalidateCache(scopedKey('todos', userId))
    await unmirror(STORES.todos, [todoId])
  }

  if (!isOnline()) return deleteOffline()

  let result
  try {
    result = await supabase.from('todos').delete().eq('id', todoId).eq('user_id', userId)
  } catch (e) {
    if (isNetworkError(e)) return deleteOffline()
    throw e
  }
  const { error } = result
  if (error) {
    if (isNetworkError(error)) return deleteOffline()
    throw error
  }
  invalidateCache(scopedKey('todos', userId))
  await unmirror(STORES.todos, [todoId])
}

// One-time repair for todos left without a workspace (rows written before the
// multi-workspace update landed, or while the scope was unresolved). They are
// claimed by the default workspace — the same rule the SQL backfill used.
// Returns the number of rows repaired.
export async function repairUnscopedTodos(userId) {
  const workspaces = await getWorkspaces(userId)
  if (!workspaces.length) return 0
  const fallback = [...workspaces].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))[0]

  const { data, error } = await supabase
    .from('todos')
    .update({ workspace_id: fallback.id })
    .eq('user_id', userId)
    .is('workspace_id', null)
    .select()
  if (error) throw error
  const rows = data ?? []
  if (rows.length) {
    invalidateCache(scopedKey('todos', userId))
    await mirror(STORES.todos, rows)
  }
  return rows.length
}

// ── Scheduled sessions (calendar) ──────────────────────────────────────────

export async function getScheduledSessions(userId) {
  const cacheKey = scopedKey('scheduled_sessions', userId)
  const cached = getCacheEntry(cacheKey)
  if (cached) return cached

  if (!isOnline()) {
    const rows = await getAllByWorkspace(STORES.scheduled_sessions, userId, ws())
    return rows.sort((a, b) => (a.scheduled_date < b.scheduled_date ? -1 : 1))
  }

  const { data, error } = await supabase
    .from('scheduled_sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', ws())
    .order('scheduled_date')
  if (error) throw error
  setCacheEntry(cacheKey, data ?? [])
  await mirror(STORES.scheduled_sessions, data ?? [])
  return data ?? []
}

export async function saveScheduledSession(userId, entry) {
  // Same rule as saveTodo: an unscoped row is invisible to every
  // workspace-indexed read, so refuse the write rather than orphan it.
  const workspaceId = entry.workspace_id ?? ws()
  if (!workspaceId) throw new Error('saveScheduledSession: no active workspace')
  const row = { ...entry, id: entry.id ?? crypto.randomUUID(), user_id: userId, workspace_id: workspaceId }

  if (!isOnline()) {
    queueChange('scheduled_sessions', 'upsert', row)
    invalidateCache(scopedKey('scheduled_sessions', userId))
    await mirror(STORES.scheduled_sessions, [row])
    return row
  }

  const { data, error } = await supabase
    .from('scheduled_sessions')
    .upsert(row)
    .select()
    .single()
  if (error) throw error
  invalidateCache(scopedKey('scheduled_sessions', userId))
  await mirror(STORES.scheduled_sessions, [data])
  return data
}

export async function deleteScheduledSession(userId, entryId) {
  if (!isOnline()) {
    queueChange('scheduled_sessions', 'delete', { id: entryId })
    invalidateCache(scopedKey('scheduled_sessions', userId))
    await unmirror(STORES.scheduled_sessions, [entryId])
    return
  }

  const { error } = await supabase
    .from('scheduled_sessions')
    .delete()
    .eq('id', entryId)
    .eq('user_id', userId)
  if (error) throw error
  invalidateCache(scopedKey('scheduled_sessions', userId))
  await unmirror(STORES.scheduled_sessions, [entryId])
}

// ── Calendar v2 · calendars, semesters, events, exams ──────────────────────

// Four tables with identical scoping, caching and offline behaviour — exactly
// the shape of getScheduledSessions/saveScheduledSession above, differing only
// in table name, mirror store and sort column. Spelling all twelve functions
// out would be ~250 lines of copy that then have to be kept in step, so the
// shape lives here once and each table is one line of configuration.
// These four read USER-wide, not workspace-wide, because a calendar can be
// shared into other workspaces: a row's own workspace_id says who owns it, not
// who may see it (see utils/calendar/calendarScope.js — the visibility filter
// lives in DataContext, one place, on the calendar). Rows are few, so the
// wider read costs nothing measurable.
//
// The cache key therefore drops the workspace too, and invalidation uses the
// prefix form so an edit made in one workspace cannot leave another workspace
// holding a stale five-minute cache entry of the same shared calendar.
function makeCalendarCrud({ table, store, orderBy }) {
  const cacheKey = userId => `${table}_${userId}`

  async function getAll(userId) {
    const key = cacheKey(userId)
    const cached = getCacheEntry(key)
    if (cached) return cached

    if (!isOnline()) {
      const rows = await getAllByUser(store, userId)
      return rows.sort((a, b) => ((a[orderBy] ?? '') < (b[orderBy] ?? '') ? -1 : 1))
    }

    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order(orderBy)
    if (error) throw error
    setCacheEntry(key, data ?? [])
    await mirror(store, data ?? [])
    return data ?? []
  }

  async function save(userId, entry) {
    // Same rule as saveTodo: an unscoped row is invisible to every
    // workspace-indexed read, so refuse the write rather than orphan it.
    // Callers that hang a row off a calendar pass that calendar's workspace,
    // not the active one, so a shared calendar's contents stay together.
    const workspaceId = entry.workspace_id ?? ws()
    if (!workspaceId) throw new Error(`save ${table}: no active workspace`)
    const row = { ...entry, id: entry.id ?? crypto.randomUUID(), user_id: userId, workspace_id: workspaceId }

    if (!isOnline()) {
      queueChange(table, 'upsert', row)
      invalidateCacheByPrefix(cacheKey(userId))
      await mirror(store, [row])
      return row
    }

    const { data, error } = await supabase.from(table).upsert(row).select().single()
    if (error) throw error
    invalidateCacheByPrefix(cacheKey(userId))
    await mirror(store, [data])
    return data
  }

  async function remove(userId, id) {
    if (!isOnline()) {
      queueChange(table, 'delete', { id })
      invalidateCacheByPrefix(cacheKey(userId))
      await unmirror(store, [id])
      return
    }

    const { error } = await supabase.from(table).delete().eq('id', id).eq('user_id', userId)
    if (error) throw error
    invalidateCacheByPrefix(cacheKey(userId))
    await unmirror(store, [id])
  }

  return { getAll, save, remove }
}

const calendarsCrud = makeCalendarCrud({ table: 'calendars',       store: STORES.calendars,       orderBy: 'display_order' })
const semestersCrud = makeCalendarCrud({ table: 'semesters',       store: STORES.semesters,       orderBy: 'start_date' })
const eventsCrud    = makeCalendarCrud({ table: 'calendar_events', store: STORES.calendar_events, orderBy: 'start_date' })
const examsCrud     = makeCalendarCrud({ table: 'exams',           store: STORES.exams,           orderBy: 'exam_date' })

export const getCalendars   = calendarsCrud.getAll
export const saveCalendar   = calendarsCrud.save
export const deleteCalendar = calendarsCrud.remove

export const getSemesters   = semestersCrud.getAll
export const saveSemester   = semestersCrud.save
export const deleteSemester = semestersCrud.remove

export const getCalendarEvents = eventsCrud.getAll
export const saveCalendarEvent = eventsCrud.save
export const deleteCalendarEvent = eventsCrud.remove

export const getExams   = examsCrud.getAll
export const saveExam   = examsCrud.save
export const deleteExam = examsCrud.remove

// Every workspace gets a default calendar by the SQL backfill, but a workspace
// created after that migration (or offline) has none — so the calendar screen
// asks for one on mount instead of rendering an empty picker.
export async function ensureDefaultCalendar(userId, workspaceName = 'Studium') {
  const workspaceId = ws()
  // getCalendars reads user-wide now, so filter to this workspace's own — a
  // calendar merely shared into it must not count as its default.
  const existing = (await getCalendars(userId)).filter(c => c.workspace_id === workspaceId)
  const found = existing.find(c => c.is_default) ?? existing[0]
  if (found) return found
  return saveCalendar(userId, {
    name: workspaceName,
    color: '#6366f1',
    icon: '🎓',
    kind: 'study',
    is_default: true,
    display_order: 0,
  })
}

// ── Widget configs ─────────────────────────────────────────────────────────

export async function getWidgetConfigs(userId) {
  const cacheKey = scopedKey('widgets', userId)
  const cached = getCacheEntry(cacheKey)
  if (cached) return cached

  if (!isOnline()) {
    const rows = await getAllByWorkspace(STORES.widget_configs, userId, ws())
    return rows.sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  }

  const { data, error } = await supabase
    .from('widget_configs')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', ws())
    .order('position')
  if (error) throw error
  setCacheEntry(cacheKey, data ?? [])
  await mirrorWidgets(userId, data ?? [])
  return data ?? []
}

// widget_configs is a full-replace table, so the mirror is replaced wholesale:
// drop this workspace's existing widget rows, then put the new set. Scoped to
// the workspace — a user-wide wipe here would erase every other workspace's
// layout on every save.
async function mirrorWidgets(userId, configs, workspaceId = ws()) {
  try {
    const existing = await getAllByWorkspace(STORES.widget_configs, userId, workspaceId)
    await removeRows(STORES.widget_configs, existing.map(w => w.id).filter(Boolean))
    const rows = configs
      .map(cfg => ({ ...cfg, user_id: userId, workspace_id: workspaceId, id: cfg.id ?? crypto.randomUUID() }))
    await bulkPut(STORES.widget_configs, rows)
  } catch {}
}

export async function saveWidgetConfigs(userId, configs, workspaceId = ws()) {
  if (!isOnline()) {
    queueChange('widget_configs', 'upsert', { configs, workspace_id: workspaceId })
    await mirrorWidgets(userId, configs, workspaceId)
    return configs
  }

  // Schema has unique(user_id, workspace_id, position). Row-by-row upserts
  // violate this when two widgets swap positions, so wipe and re-insert
  // atomically per save — within this workspace only.
  const { error: delErr } = await supabase
    .from('widget_configs')
    .delete()
    .eq('user_id', userId)
    .eq('workspace_id', workspaceId)
  if (delErr) throw delErr

  if (configs.length > 0) {
    const rows = configs.map(cfg => ({ ...cfg, user_id: userId, workspace_id: workspaceId }))
    const { error: insErr } = await supabase
      .from('widget_configs')
      .insert(rows)
    if (insErr) throw insErr
  }

  invalidateCache(scopedKey('widgets', userId))
  await mirrorWidgets(userId, configs, workspaceId)
  return configs
}

export async function deleteWidgetConfig(userId, position) {
  if (!isOnline()) {
    queueChange('widget_configs', 'delete', { position, workspace_id: ws() })
    invalidateCache(scopedKey('widgets', userId))
    await removeWidgetLocal(userId, position)
    return
  }

  const { error } = await supabase
    .from('widget_configs')
    .delete()
    .eq('user_id', userId)
    .eq('workspace_id', ws())
    .eq('position', position)
  if (error) throw error
  invalidateCache(scopedKey('widgets', userId))
  await removeWidgetLocal(userId, position)
}

async function removeWidgetLocal(userId, position, workspaceId = ws()) {
  try {
    const rows = (await getAllByWorkspace(STORES.widget_configs, userId, workspaceId)).filter(w => w.position === position)
    await removeRows(STORES.widget_configs, rows.map(w => w.id).filter(Boolean))
  } catch {}
}

// ── Export / Import ────────────────────────────────────────────────────────

// Export covers the active workspace only — the same data the UI is showing.
export async function getAllSessions(userId) {
  const { data, error } = await supabase
    .from('sessions')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', ws())
    .order('started_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function getAllExercises(userId) {
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('user_id', userId)
    .eq('workspace_id', ws())
    .order('created_at', { ascending: true })
  if (error) throw error
  return data ?? []
}

export async function importData(userId, payload) {
  // Always generate fresh UUIDs so imports never conflict with rows owned by
  // other users (which would trigger RLS on upsert's UPDATE path). Foreign
  // keys are remapped so topic→session→exercise relationships stay intact.
  const topicIdMap = {}
  const sessionIdMap = {}
  // Imported data lands in the workspace the user is currently in.
  const workspaceId = ws()

  const topics = (payload.topics ?? []).map(t => {
    const newId = crypto.randomUUID()
    topicIdMap[t.id] = newId
    return { ...t, id: newId, user_id: userId, workspace_id: workspaceId }
  })

  const sessions = (payload.sessions ?? []).map(s => {
    const newId = crypto.randomUUID()
    sessionIdMap[s.id] = newId
    return { ...s, id: newId, user_id: userId, workspace_id: workspaceId, topic_id: topicIdMap[s.topic_id] ?? s.topic_id }
  })

  const exercises = (payload.exercises ?? []).map(e => ({
    ...e,
    id: crypto.randomUUID(),
    user_id: userId,
    workspace_id: workspaceId,
    session_id: sessionIdMap[e.session_id] ?? e.session_id,
  }))

  // Calendar v2. Order matters: calendars → semesters → events → exams, and
  // todos last because they can point at an event.
  const calendarIdMap = {}
  const semesterIdMap = {}
  const eventIdMap = {}
  const todoIdMap = {}

  const calendars = (payload.calendars ?? []).map(c => {
    const newId = crypto.randomUUID()
    calendarIdMap[c.id] = newId
    // Only one calendar per workspace may be the default, and this workspace
    // already has one; an imported calendar joins as an ordinary one.
    return { ...c, id: newId, user_id: userId, workspace_id: workspaceId, is_default: false }
  })

  const semesters = (payload.semesters ?? []).map(s => {
    const newId = crypto.randomUUID()
    semesterIdMap[s.id] = newId
    return {
      ...s, id: newId, user_id: userId, workspace_id: workspaceId,
      calendar_id: calendarIdMap[s.calendar_id] ?? null,
    }
  })

  const events = (payload.events ?? []).map(e => {
    const newId = crypto.randomUUID()
    eventIdMap[e.id] = newId
    return {
      ...e, id: newId, user_id: userId, workspace_id: workspaceId,
      calendar_id: calendarIdMap[e.calendar_id] ?? null,
      semester_id: semesterIdMap[e.semester_id] ?? null,
      topic_id: topicIdMap[e.topic_id] ?? null,
      session_id: null,
      legacy_scheduled_id: null,
    }
  })
  // Second pass: a detached occurrence's parent may appear after it.
  for (const e of events) {
    e.recurrence_parent_id = e.recurrence_parent_id ? eventIdMap[e.recurrence_parent_id] ?? null : null
  }

  const exams = (payload.exams ?? []).map(x => ({
    ...x,
    id: crypto.randomUUID(),
    user_id: userId,
    workspace_id: workspaceId,
    calendar_id: calendarIdMap[x.calendar_id] ?? null,
    semester_id: semesterIdMap[x.semester_id] ?? null,
    event_id: eventIdMap[x.event_id] ?? null,
    topic_id: topicIdMap[x.topic_id] ?? null,
  }))

  const todos = (payload.todos ?? []).map(t => {
    const newId = crypto.randomUUID()
    todoIdMap[t.id] = newId
    return {
      ...t,
      id: newId,
      user_id: userId,
      workspace_id: workspaceId,
      topic_id: topicIdMap[t.topic_id] ?? t.topic_id,
      event_id: eventIdMap[t.event_id] ?? null,
    }
  })
  // Same second pass for subtasks: a child can be listed before its parent.
  for (const t of todos) {
    t.parent_id = t.parent_id ? todoIdMap[t.parent_id] ?? null : null
  }

  // Widget configs may embed topic IDs inside their config/sub_widgets JSON.
  // Replace old IDs with new ones via a string pass over the serialised JSON.
  const widgets = (payload.widgets ?? []).map(w => {
    let cfgStr = JSON.stringify(w.config ?? {})
    let subStr = JSON.stringify(w.sub_widgets ?? [])
    for (const [oldId, newId] of Object.entries(topicIdMap)) {
      cfgStr = cfgStr.replaceAll(oldId, newId)
      subStr = subStr.replaceAll(oldId, newId)
    }
    return {
      ...w,
      id: crypto.randomUUID(),
      user_id: userId,
      workspace_id: workspaceId,
      config: JSON.parse(cfgStr),
      sub_widgets: JSON.parse(subStr),
    }
  })

  if (topics.length) {
    const { error } = await supabase.from('topics').insert(topics)
    if (error) throw error
    invalidateCache(scopedKey('topics', userId))
  }
  if (sessions.length) {
    const { error } = await supabase.from('sessions').insert(sessions)
    if (error) throw error
    invalidateCacheByPrefix(scopedKey('sessions', userId))
  }
  if (exercises.length) {
    const { error } = await supabase.from('exercises').insert(exercises)
    if (error) throw error
  }
  // Calendars before the rows that reference them; todos last of all.
  for (const [table, rows, cacheName] of [
    ['calendars', calendars, 'calendars'],
    ['semesters', semesters, 'semesters'],
    ['calendar_events', events, 'calendar_events'],
    ['exams', exams, 'exams'],
  ]) {
    if (!rows.length) continue
    const { error } = await supabase.from(table).insert(rows)
    if (error) throw error
    invalidateCache(scopedKey(cacheName, userId))
  }
  if (todos.length) {
    const { error } = await supabase.from('todos').insert(todos)
    if (error) throw error
    invalidateCache(scopedKey('todos', userId))
  }
  if (widgets.length) {
    await supabase.from('widget_configs').delete().eq('user_id', userId).eq('workspace_id', workspaceId)
    const { error } = await supabase.from('widget_configs').insert(widgets)
    if (error) throw error
    invalidateCache(scopedKey('widgets', userId))
  }
}

// ── Flush pending local changes ────────────────────────────────────────────

export async function flushLocalChanges(userId) {
  const changes = getLocalChanges()
  for (const change of changes) {
    try {
      if (change.table === 'topics') {
        if (change.type === 'upsert') await saveTopic(userId, change.payload)
        if (change.type === 'delete') await deleteTopic(userId, change.payload.id)
      }
      if (change.table === 'workspaces') {
        if (change.type === 'upsert') await saveWorkspace(userId, change.payload)
        if (change.type === 'delete') await deleteWorkspace(userId, change.payload.id)
      }
      if (change.table === 'sessions') {
        if (change.type === 'insert') {
          // Rows already carry client-assigned ids — insert as-is so the cloud
          // matches the offline mirror (no id regeneration, no duplicates).
          const { sessionRow, exerciseRows } = change.payload
          // This path bypasses saveSession, so stamp the scope here. Queue
          // entries written before the multi-workspace update have no
          // workspace_id and belong to whatever workspace is active now.
          sessionRow.workspace_id ??= ws()
          for (const r of exerciseRows ?? []) r.workspace_id ??= ws()
          const { error: sErr } = await supabase.from('sessions').insert(sessionRow)
          if (sErr) throw sErr
          if (exerciseRows?.length) {
            const { error: eErr } = await supabase.from('exercises').insert(exerciseRows)
            if (eErr) throw eErr
          }
          invalidateCacheByPrefix(scopedKey('sessions', userId))
        }
        if (change.type === 'delete') await deleteSession(userId, change.payload.id)
      }
      if (change.table === 'todos') {
        if (change.type === 'upsert') await saveTodo(userId, change.payload)
        if (change.type === 'delete') await deleteTodo(userId, change.payload.id)
      }
      if (change.table === 'scheduled_sessions') {
        if (change.type === 'upsert') await saveScheduledSession(userId, change.payload)
        if (change.type === 'delete') await deleteScheduledSession(userId, change.payload.id)
      }
      if (change.table === 'calendars') {
        if (change.type === 'upsert') await saveCalendar(userId, change.payload)
        if (change.type === 'delete') await deleteCalendar(userId, change.payload.id)
      }
      if (change.table === 'semesters') {
        if (change.type === 'upsert') await saveSemester(userId, change.payload)
        if (change.type === 'delete') await deleteSemester(userId, change.payload.id)
      }
      if (change.table === 'calendar_events') {
        if (change.type === 'upsert') await saveCalendarEvent(userId, change.payload)
        if (change.type === 'delete') await deleteCalendarEvent(userId, change.payload.id)
      }
      if (change.table === 'exams') {
        if (change.type === 'upsert') await saveExam(userId, change.payload)
        if (change.type === 'delete') await deleteExam(userId, change.payload.id)
      }
      if (change.table === 'widget_configs') {
        // Payload gained a workspace wrapper; plain arrays are pre-update
        // entries that belong to the active workspace.
        if (change.type === 'upsert') {
          const p = change.payload
          const configs = Array.isArray(p) ? p : p.configs
          await saveWidgetConfigs(userId, configs, (Array.isArray(p) ? null : p.workspace_id) ?? ws())
        }
        if (change.type === 'delete') await deleteWidgetConfig(userId, change.payload.position)
      }
      removeLocalChange(change.timestamp)
    } catch {}
  }
}

// ── Delta sync fetchers ──────────────────────────────────────────────────────

const PAGE = 1000 // Supabase caps rows per request; paginate the first full pull.

// Fetch rows of `table` for this user changed strictly after `since` (ISO string
// or null for everything), newest-changed last. Paginated.
export async function fetchChangedSince(table, userId, since) {
  const all = []
  let from = 0
  for (;;) {
    let q = supabase
      .from(table)
      .select('*')
      .eq('user_id', userId)
      .order('updated_at', { ascending: true })
      .range(from, from + PAGE - 1)
    if (since) q = q.gt('updated_at', since)
    const { data, error } = await q
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < PAGE) break
    from += PAGE
  }
  return all
}

// Full pull of widget_configs (no updated_at column — see migration note),
// bypassing the read cache so a sync always refreshes the offline mirror.
// Pulls every workspace at once — the sync engine stays user-scoped so a
// workspace switch never needs the network — then mirrors per workspace,
// because mirrorWidgets replaces one workspace's rows wholesale.
export async function pullWidgets(userId) {
  const { data, error } = await supabase
    .from('widget_configs')
    .select('*')
    .eq('user_id', userId)
    .order('position')
  if (error) throw error
  const rows = data ?? []

  const byWorkspace = new Map()
  for (const row of rows) {
    const key = row.workspace_id ?? null
    if (!byWorkspace.has(key)) byWorkspace.set(key, [])
    byWorkspace.get(key).push(row)
  }
  // A workspace whose widgets were all deleted elsewhere returns no rows, so
  // also clear the mirror for the active one when it is absent from the pull.
  if (ws() && !byWorkspace.has(ws())) byWorkspace.set(ws(), [])
  for (const [workspaceId, group] of byWorkspace) {
    await mirrorWidgets(userId, group, workspaceId)
  }

  setCacheEntry(scopedKey('widgets', userId), byWorkspace.get(ws()) ?? [])
  return rows
}

// Tombstones recorded after `since`, so offline-period deletions can be applied.
export async function fetchDeletionsSince(userId, since) {
  let q = supabase
    .from('deletions')
    .select('table_name, row_id, deleted_at')
    .eq('user_id', userId)
    .order('deleted_at', { ascending: true })
  if (since) q = q.gt('deleted_at', since)
  const { data, error } = await q
  if (error) throw error
  return data ?? []
}

// ── PIN config (per device — each device can have its own PIN) ───────────────

export async function getPinConfig(userId, deviceId) {
  const { data, error } = await supabase
    .from('pin_config')
    .select('*')
    .eq('user_id', userId)
    .eq('device_id', deviceId)
    .single()
  if (error?.code === 'PGRST116') return null
  if (error) throw error
  return data
}

// Upserts the PIN hash+settings and resets all attempt counters.
export async function savePinConfig(userId, deviceId, config) {
  const { error } = await supabase
    .from('pin_config')
    .upsert({
      user_id:      userId,
      device_id:    deviceId,
      pin_hash:     config.pin_hash,
      pin_salt:     config.pin_salt,
      pin_length:   config.pin_length,
      pin_type:     config.pin_type,
      failed_consec: 0,
      failed_total:  0,
      locked_until:  null,
      batch_count:   0,
      updated_at:   new Date().toISOString(),
    }, { onConflict: 'user_id,device_id' })
  if (error) throw error
}

// Deletes only this device's PIN config.
export async function deletePinConfig(userId, deviceId) {
  const { error } = await supabase
    .from('pin_config')
    .delete()
    .eq('user_id', userId)
    .eq('device_id', deviceId)
  if (error) throw error
}

// Updates attempt counters server-side after each PIN attempt.
export async function updatePinAttempts(userId, deviceId, attempts) {
  const { error } = await supabase
    .from('pin_config')
    .update({
      failed_consec: attempts.failed_consec,
      failed_total:  attempts.failed_total,
      locked_until:  attempts.locked_until ?? null,
      batch_count:   attempts.batch_count,
      updated_at:    new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('device_id', deviceId)
  if (error) throw error
}
