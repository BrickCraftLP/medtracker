// Full offline mirror of the user's data, kept in IndexedDB.
//
// This is the offline source of truth: the delta sync engine writes every
// changed row here, and reads (when offline, or for all-time history the
// localStorage shell doesn't hold) come from here. The small synchronous
// localStorage "shell" handles only the first paint; this fills in the rest.

const DB_NAME = 'MedTrackerOffline'
// v2 — multi-workspace: every entity store gains a compound [user_id,
// workspace_id] index so a workspace switch is a single indexed local read.
// v3 — calendar: adds the scheduled_sessions store (additive, see openDB).
// v4 — calendar v2: adds calendars / semesters / calendar_events / exams and
//      the local search_docs index (additive as well — scheduled_sessions
//      stays for the rollback path).
const DB_VERSION = 4

// Entity stores are all keyed by row `id`. `meta` is a tiny key/value store
// for sync bookkeeping (lastSyncAt, userId).
export const STORES = {
  workspaces: 'workspaces',
  topics: 'topics',
  todos: 'todos',
  widget_configs: 'widget_configs',
  sessions: 'sessions',
  exercises: 'exercises',
  scheduled_sessions: 'scheduled_sessions',
  calendars: 'calendars',
  semesters: 'semesters',
  calendar_events: 'calendar_events',
  exams: 'exams',
  search_docs: 'search_docs',
  meta: 'meta',
}

// Stores that carry workspace_id and therefore need the compound index.
const WS_STORES = [
  [STORES.topics, []],
  [STORES.todos, []],
  [STORES.widget_configs, []],
  [STORES.sessions, [['started_at', 'started_at']]],
  [STORES.exercises, [['session_id', 'session_id']]],
  [STORES.scheduled_sessions, [['scheduled_date', 'scheduled_date']]],
  [STORES.calendars, []],
  [STORES.semesters, []],
  [STORES.calendar_events, [['start_date', 'start_date'], ['calendar_id', 'calendar_id']]],
  [STORES.exams, [['exam_date', 'exam_date']]],
  // Local search index. Workspace-scoped like the rest, so it inherits the
  // compound index and — more importantly — gets wiped by clearWorkspaceLocal
  // and clearAll along with the rows it describes.
  [STORES.search_docs, [['type', 'type']]],
]

let dbPromise = null

function openDB() {
  if (dbPromise) return dbPromise
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)
    req.onupgradeneeded = e => {
      const db = e.target.result

      // v1 → v2: a compound index cannot be added to an existing store outside
      // an upgrade, and existing v1 rows have no workspace_id anyway — so drop
      // and recreate the entity stores. The mirror is a cache: the next
      // syncAll re-pulls everything from the cloud, where the SQL migration
      // has already backfilled workspace_id. Queued offline mutations live in
      // localStorage, are untouched by this, and are pushed before that pull.
      //
      // v2 → v3 only adds the scheduled_sessions store, and v3 → v4 only adds
      // the calendar v2 stores, so the rows already mirrored stay put and only
      // the missing stores are created.
      const rebuildAll = e.oldVersion < 2
      for (const [name, extraIndexes] of WS_STORES) {
        const exists = db.objectStoreNames.contains(name)
        if (exists && !rebuildAll) continue
        if (exists) db.deleteObjectStore(name)
        const os = db.createObjectStore(name, { keyPath: 'id' })
        os.createIndex('user_id', 'user_id')
        os.createIndex('ws', ['user_id', 'workspace_id'])
        for (const [idxName, path] of extraIndexes) os.createIndex(idxName, path)
      }

      if (!db.objectStoreNames.contains(STORES.workspaces)) {
        db.createObjectStore(STORES.workspaces, { keyPath: 'id' }).createIndex('user_id', 'user_id')
      }
      if (!db.objectStoreNames.contains(STORES.meta)) {
        db.createObjectStore(STORES.meta)
      } else {
        // The stores we just wiped were the watermark's basis — clear it so
        // the next pull is a full pull instead of a delta from a vanished set.
        const meta = e.target.transaction.objectStore(STORES.meta)
        const keysReq = meta.getAllKeys()
        keysReq.onsuccess = () => {
          for (const k of keysReq.result ?? []) {
            if (typeof k === 'string' && k.startsWith('lastSyncAt:')) meta.delete(k)
          }
        }
      }
    }
    // Another tab still holding the v1 connection blocks the v2 upgrade.
    // Without this handler neither onsuccess nor onerror ever fires and every
    // await on the mirror hangs forever — which takes the whole app down.
    req.onblocked = () => {
      dbPromise = null
      reject(new Error('IndexedDB upgrade blocked by another open tab'))
    }
    req.onsuccess = e => {
      const db = e.target.result
      // Let a future version upgrade in another tab proceed instead of
      // blocking on us.
      db.onversionchange = () => { try { db.close() } catch {} ; dbPromise = null }
      resolve(db)
    }
    req.onerror = e => {
      dbPromise = null
      reject(e.target.error)
    }
  })
  return dbPromise
}

// Kick the connection open early (called from main.jsx). Errors are ignored
// here — every real read/write awaits openDB() again and handles its own
// failure; this is purely a head start.
export function warmOfflineDB() {
  openDB().catch(() => {})
}

function tx(db, store, mode) {
  return db.transaction(store, mode).objectStore(store)
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = e => resolve(e.target.result)
    req.onerror = e => reject(e.target.error)
  })
}

// ── Mirror listener ─────────────────────────────────────────────────────────

// Every write that reaches the mirror funnels through bulkPut/removeRows —
// online writes, offline writes, the delta pull and tombstones alike — which
// makes this the one place a derived local artefact (the search index) can
// hook to stay current. Registration rather than a direct import keeps the
// dependency one-way: offlineDB must not know what is listening.
let mirrorListener = null

export function registerMirrorListener(fn) {
  mirrorListener = fn
}

function notifyMirror(op, store, payload) {
  if (!mirrorListener) return
  // A listener must never be able to fail or slow down a mirror write.
  try { mirrorListener(op, store, payload) } catch {}
}

// ── Writes ──────────────────────────────────────────────────────────────────

export async function bulkPut(store, rows) {
  if (!rows?.length) return
  const db = await openDB()
  await new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite')
    const os = t.objectStore(store)
    for (const row of rows) os.put(row)
    t.oncomplete = () => resolve()
    t.onerror = e => reject(e.target.error)
  })
  notifyMirror('put', store, rows)
}

export async function putOne(store, row) {
  return bulkPut(store, [row])
}

export async function removeRows(store, ids) {
  if (!ids?.length) return
  const db = await openDB()
  await new Promise((resolve, reject) => {
    const t = db.transaction(store, 'readwrite')
    const os = t.objectStore(store)
    for (const id of ids) os.delete(id)
    t.oncomplete = () => resolve()
    t.onerror = e => reject(e.target.error)
  })
  notifyMirror('delete', store, ids)
}

// ── Reads ─────────────────────────────────────────────────────────────────

export async function getOne(store, id) {
  if (!id) return null
  const db = await openDB()
  return reqToPromise(tx(db, store, 'readonly').get(id))
}

export async function getAllByUser(store, userId) {
  const db = await openDB()
  const idx = tx(db, store, 'readonly').index('user_id')
  return reqToPromise(idx.getAll(IDBKeyRange.only(userId)))
}

// Workspace-scoped read via the compound [user_id, workspace_id] index. This
// is the whole switching mechanism: changing workspace re-reads locally, with
// no network round trip.
export async function getAllByWorkspace(store, userId, workspaceId) {
  const db = await openDB()
  const idx = tx(db, store, 'readonly').index('ws')
  return reqToPromise(idx.getAll(IDBKeyRange.only([userId, workspaceId])))
}

export async function getSessionsInWindow(userId, fromISO, workspaceId) {
  const all = workspaceId
    ? await getAllByWorkspace(STORES.sessions, userId, workspaceId)
    : await getAllByUser(STORES.sessions, userId)
  return all
    .filter(s => s.started_at >= fromISO)
    .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
}

export async function getExercisesForSession(sessionId) {
  const db = await openDB()
  const idx = tx(db, STORES.exercises, 'readonly').index('session_id')
  const rows = await reqToPromise(idx.getAll(IDBKeyRange.only(sessionId)))
  return rows.sort((a, b) => (a.created_at < b.created_at ? -1 : 1))
}

// ── Meta (sync bookkeeping) ──────────────────────────────────────────────────

export async function getMeta(key) {
  const db = await openDB()
  return reqToPromise(tx(db, STORES.meta, 'readonly').get(key))
}

export async function setMeta(key, value) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORES.meta, 'readwrite')
    t.objectStore(STORES.meta).put(value, key)
    t.oncomplete = () => resolve()
    t.onerror = e => reject(e.target.error)
  })
}

export async function deleteMeta(key) {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORES.meta, 'readwrite')
    t.objectStore(STORES.meta).delete(key)
    t.oncomplete = () => resolve()
    t.onerror = e => reject(e.target.error)
  })
}

// Drop every mirrored row belonging to one workspace (local half of a
// workspace deletion; the cloud half is handled by `on delete cascade`).
export async function clearWorkspaceLocal(userId, workspaceId) {
  for (const [name] of WS_STORES) {
    try {
      const rows = await getAllByWorkspace(name, userId, workspaceId)
      await removeRows(name, rows.map(r => r.id).filter(Boolean))
    } catch {}
  }
}

// Wipe every entity store (used when a different user signs in on this device).
export async function clearAll() {
  const db = await openDB()
  const stores = Object.values(STORES)
  return new Promise((resolve, reject) => {
    const t = db.transaction(stores, 'readwrite')
    for (const s of stores) t.objectStore(s).clear()
    t.oncomplete = () => resolve()
    t.onerror = e => reject(e.target.error)
  })
}
