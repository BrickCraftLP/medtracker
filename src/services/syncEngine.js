// Delta sync engine.
//
// pushChanges → drains the offline mutation queue to the cloud.
// pullChanges → fetches only rows changed (and deletions recorded) since the
//   last successful sync, writes them into the IndexedDB mirror, and advances
//   the watermark. The first run (no watermark) is a one-time full pull.
//
// Reads/writes the offline mirror via offlineDB; talks to the cloud only
// through the thin fetchers in dbInterface.

import {
  fetchChangedSince,
  fetchDeletionsSince,
  pullWidgets,
  flushLocalChanges,
} from './dbInterface.js'
import { STORES, bulkPut, removeRows, getMeta, setMeta } from './offlineDB.js'

// Tables that carry updated_at and participate in incremental pull.
const DELTA_TABLES = [
  ['workspaces', STORES.workspaces],
  ['topics', STORES.topics],
  ['sessions', STORES.sessions],
  ['exercises', STORES.exercises],
  ['todos', STORES.todos],
  ['scheduled_sessions', STORES.scheduled_sessions],
  ['calendars', STORES.calendars],
  ['semesters', STORES.semesters],
  ['calendar_events', STORES.calendar_events],
  ['exams', STORES.exams],
]

const TABLE_TO_STORE = {
  workspaces: STORES.workspaces,
  topics: STORES.topics,
  sessions: STORES.sessions,
  exercises: STORES.exercises,
  todos: STORES.todos,
  scheduled_sessions: STORES.scheduled_sessions,
  calendars: STORES.calendars,
  semesters: STORES.semesters,
  calendar_events: STORES.calendar_events,
  exams: STORES.exams,
}

function watermarkKey(userId) { return `lastSyncAt:${userId}` }

export async function getLastSyncAt(userId) {
  return (await getMeta(watermarkKey(userId))) ?? null
}

export async function pushChanges(userId) {
  await flushLocalChanges(userId)
}

// Pull everything changed since the watermark into IndexedDB. Returns true if
// any row was added/updated/removed (so the caller can refresh React state).
export async function pullChanges(userId) {
  const since = await getLastSyncAt(userId)
  let watermark = since
  let changed = false

  // Track the newest timestamp we observe so the next pull resumes from there
  // (derived from data, not the client clock — avoids skew gaps).
  const bump = ts => { if (ts && (!watermark || ts > watermark)) watermark = ts }

  // Changed rows per delta table. Failures are isolated: one table erroring
  // (a migration not yet applied, a transient 4xx) must not abort the pull for
  // every other table and leave the app looking empty.
  let anyFailed = false
  for (const [table, store] of DELTA_TABLES) {
    try {
      const rows = await fetchChangedSince(table, userId, since)
      if (rows.length) {
        await bulkPut(store, rows)
        for (const r of rows) bump(r.updated_at)
        changed = true
      }
    } catch (e) {
      anyFailed = true
      console.error(`pullChanges: ${table} failed`, e)
    }
  }

  // widget_configs has no updated_at → always full-pull (tiny table).
  try {
    await pullWidgets(userId)
  } catch (e) {
    anyFailed = true
    console.error('pullChanges: widget_configs failed', e)
  }

  // Deletions recorded since the watermark.
  const deletions = await fetchDeletionsSince(userId, since).catch(e => {
    anyFailed = true
    console.error('pullChanges: deletions failed', e)
    return []
  })
  if (deletions.length) {
    const byStore = {}
    for (const d of deletions) {
      const store = TABLE_TO_STORE[d.table_name]
      if (!store) continue
      ;(byStore[store] ||= []).push(d.row_id)
      bump(d.deleted_at)
    }
    for (const [store, ids] of Object.entries(byStore)) {
      await removeRows(store, ids)
    }
    changed = true
  }

  // Only advance the watermark on a clean pass. Advancing it after a partial
  // failure would permanently skip the rows the failed table never delivered.
  if (!anyFailed && watermark && watermark !== since) {
    await setMeta(watermarkKey(userId), watermark)
  }
  return changed
}

// Full push + pull cycle used on launch, manual sync, and reconnect.
export async function syncAll(userId) {
  await pushChanges(userId)
  return pullChanges(userId)
}
