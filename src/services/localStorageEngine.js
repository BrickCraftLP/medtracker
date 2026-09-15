// Dual-zone local storage:
// medat_cloud_snapshot — last known state from cloud
// medat_local_changes  — pending mutations not yet pushed

import { getActiveWorkspace } from './workspaceScope.js'

const CLOUD_KEY = 'medat_cloud_snapshot'
const LOCAL_KEY = 'medat_local_changes'
const CACHE_KEY = 'medat_data_cache'

// ── Snapshot (what cloud has) ──────────────────────────────────────────────

export function getCloudSnapshot() {
  try {
    const raw = localStorage.getItem(CLOUD_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}

export function setCloudSnapshot(data) {
  try {
    localStorage.setItem(CLOUD_KEY, JSON.stringify(data))
  } catch {}
}

export function updateCloudSnapshot(key, value) {
  const snap = getCloudSnapshot()
  snap[key] = value
  // Stamp the workspace the payload belongs to, so a snapshot written for one
  // workspace can never be replayed as another's on the next launch.
  snap.workspaceId = getActiveWorkspace()
  setCloudSnapshot(snap)
}

// ── First-paint shell ───────────────────────────────────────────────────────
// The bare minimum the UI needs to render the first frame (home widgets +
// default statistics) without lag. Read synchronously on mount; the full
// dataset is hydrated from IndexedDB a tick later. Stored under the snapshot
// key so dbInterface's per-key topic updates stay compatible. Deliberately
// excludes exercises and is capped to the recent session window by the caller.

// Only the most recent sessions are worth carrying in the shell — the full
// window is re-read from IndexedDB a tick later, and localStorage has a hard
// ~5 MB budget shared with the pending-mutation queue.
const SHELL_SESSION_CAP = 60

// Same reasoning for the calendar: a multi-year timetable is thousands of
// rows, and stringifying all of them on the idle path would both blow the
// quota and stall a frame. Only what the first calendar frame can show is
// carried — recurrence masters (they generate every future occurrence) plus a
// window around today. The rest arrives from IndexedDB a tick later.
const SHELL_EVENT_CAP = 400
const SHELL_EVENT_DAYS_BACK = 45
const SHELL_EVENT_DAYS_AHEAD = 120

function dayKeyOffset(days) {
  const d = new Date()
  d.setDate(d.getDate() + days)
  // Local, never toISOString() — see localDayKey in todoPriorityCalcs.
  const p = n => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

function windowEvents(events) {
  if (!Array.isArray(events)) return events
  const from = dayKeyOffset(-SHELL_EVENT_DAYS_BACK)
  const to = dayKeyOffset(SHELL_EVENT_DAYS_AHEAD)
  return events
    .filter(e => e.rrule || (e.start_date >= from && e.start_date <= to))
    .slice(0, SHELL_EVENT_CAP)
}

export function getShell() {
  return getCloudSnapshot()
}

export function setShell({
  userId, workspaceId, topics, todos, widgets, recentSessions,
  calendars, semesters, events, exams,
}) {
  const snap = getCloudSnapshot()
  const sessions = Array.isArray(recentSessions)
    ? recentSessions.slice(0, SHELL_SESSION_CAP)
    : recentSessions
  const shell = {
    ...snap,
    userId,
    workspaceId,
    topics,
    todos,
    widgets,
    calendars,
    semesters,
    events: windowEvents(events),
    exams,
    recentSessions: sessions,
    savedAt: new Date().toISOString(),
  }
  try {
    localStorage.setItem(CLOUD_KEY, JSON.stringify(shell))
  } catch {
    // Out of quota: the first frame needs widgets and topics, not history —
    // drop the sessions and the event window rather than lose the whole shell
    // and cold-start.
    try {
      localStorage.setItem(CLOUD_KEY, JSON.stringify({ ...shell, recentSessions: [], events: [] }))
    } catch {}
  }
}

// ── Local changes queue ────────────────────────────────────────────────────

export function getLocalChanges() {
  try {
    const raw = localStorage.getItem(LOCAL_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

function setLocalChanges(changes) {
  try {
    localStorage.setItem(LOCAL_KEY, JSON.stringify(changes))
  } catch {}
}

export function queueChange(table, type, payload) {
  const changes = getLocalChanges()
  changes.push({ table, type, payload, timestamp: Date.now() })
  setLocalChanges(changes)
}

export function clearLocalChanges() {
  localStorage.removeItem(LOCAL_KEY)
}

export function removeLocalChange(timestamp) {
  const changes = getLocalChanges().filter(c => c.timestamp !== timestamp)
  setLocalChanges(changes)
}

// ── Data cache (for fast reads) ────────────────────────────────────────────

export function getCacheEntry(key) {
  try {
    const raw = localStorage.getItem(`${CACHE_KEY}_${key}`)
    if (!raw) return null
    const { data, expiresAt } = JSON.parse(raw)
    if (Date.now() > expiresAt) {
      localStorage.removeItem(`${CACHE_KEY}_${key}`)
      return null
    }
    return data
  } catch {
    return null
  }
}

export function setCacheEntry(key, data, ttlMs = 5 * 60 * 1000) {
  try {
    localStorage.setItem(`${CACHE_KEY}_${key}`, JSON.stringify({
      data,
      expiresAt: Date.now() + ttlMs,
    }))
  } catch {}
}

export function invalidateCache(key) {
  localStorage.removeItem(`${CACHE_KEY}_${key}`)
}

export function invalidateAllCache() {
  Object.keys(localStorage)
    .filter(k => k.startsWith(CACHE_KEY))
    .forEach(k => localStorage.removeItem(k))
}

export function invalidateCacheByPrefix(prefix) {
  const fullPrefix = `${CACHE_KEY}_${prefix}`
  Object.keys(localStorage)
    .filter(k => k.startsWith(fullPrefix))
    .forEach(k => localStorage.removeItem(k))
}

export function clearSnapshotKey(key) {
  const snap = getCloudSnapshot()
  delete snap[key]
  setCloudSnapshot(snap)
}

// ── Merged view (local overrides cloud) ───────────────────────────────────

export function getMergedData(key) {
  const snap = getCloudSnapshot()
  return snap[key] ?? null
}

// ── Online flush support ───────────────────────────────────────────────────

let flushCallback = null

export function registerFlushCallback(fn) {
  flushCallback = fn
}

window.addEventListener('online', () => {
  if (flushCallback) flushCallback()
})

export function isOnline() {
  return navigator.onLine
}
