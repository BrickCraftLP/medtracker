// A local, self-maintaining search index — and the file it can write itself to.
//
// Why this shape:
//   • It hooks offlineDB's mirror listener, which is the single choke point
//     every write passes through (online, offline, delta pull, tombstone), so
//     the index can never drift from the data without anyone noticing.
//   • BM25 over tokens, not embeddings. The smallest usable on-device embedder
//     is ~25 MB of model to download on a PWA that ships a few hundred KB, and
//     the corpus here is short German/English titles where lexical scoring
//     wins anyway. Each doc keeps a verbatim `text` field, so vectors can be
//     added later without redesigning the record.
//   • The export is JSONL so a local LLM harness can stream it line by line,
//     and — where the File System Access API exists — the same file on disk is
//     rewritten on every change, which is the "index that maintains itself".
//
// Nothing here talks to the network.

import {
  STORES, bulkPut, removeRows, getAllByUser, getAllByWorkspace,
  getMeta, setMeta, registerMirrorListener,
} from './offlineDB.js'

// Bump to force a full rebuild after changing the record shape or the analyzer.
export const INDEX_REV = 1

const FLUSH_DELAY = 400
const REBUILD_CHUNK = 300

// store → doc type
const INDEXED = {
  [STORES.calendar_events]: 'event',
  [STORES.todos]: 'todo',
  [STORES.exams]: 'exam',
  [STORES.topics]: 'topic',
  [STORES.semesters]: 'semester',
  [STORES.calendars]: 'calendar',
}

// ── Analyzer ───────────────────────────────────────────────────────────────

// German-aware on purpose: a student types "Uebung", "Übung" and "Ubung"
// interchangeably, and all three have to hit the same row.
const UMLAUT = { ä: 'ae', ö: 'oe', ü: 'ue', ß: 'ss' }

const STOP = new Set([
  'der', 'die', 'das', 'den', 'dem', 'des', 'ein', 'eine', 'einen', 'einem', 'und', 'oder',
  'fuer', 'mit', 'von', 'vom', 'zum', 'zur', 'auf', 'aus', 'bei', 'ist', 'sind', 'im', 'am',
  'the', 'and', 'for', 'with', 'from', 'this', 'that', 'are', 'was', 'were', 'has', 'have',
])

export function normalise(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[äöüß]/g, c => UMLAUT[c])
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
}

// Deliberately dumb suffix trimming: a real stemmer is ~40 KB and this corpus
// is titles, not prose.
function stem(word) {
  return word.replace(/(ungen|ungs|ung|enen|erin|nen|en|er|es|em|ing|ed|s)$/, '') || word
}

export function tokenize(text) {
  const out = []
  for (const raw of normalise(text).split(/[^\p{L}\p{N}]+/u)) {
    if (raw.length < 2 || STOP.has(raw)) continue
    out.push(raw.length > 5 ? stem(raw) : raw)
  }
  return out
}

export function trigrams(text) {
  const padded = ` ${normalise(text)} `
  const out = new Set()
  for (let i = 0; i < padded.length - 2; i += 1) out.add(padded.slice(i, i + 3))
  return [...out]
}

// ── Record construction ────────────────────────────────────────────────────

// The `text` field is the sentence a language model reads. Keep it flat and
// self-describing: nothing else in the file explains what a row is.
function describe(type, row) {
  const parts = []
  switch (type) {
    case 'event':
      parts.push(row.kind ?? 'event', row.title, row.start_date,
        row.all_day ? 'all-day' : (row.start_time ?? '').slice(0, 5),
        row.location, row.notes,
        ...(row.links ?? []).map(l => l.label ?? l.url),
        row.completed ? 'done' : null)
      break
    case 'todo':
      parts.push('task', row.text, row.due_date, (row.due_time ?? '').slice(0, 5),
        row.notes, row.completed ? 'done' : 'open')
      break
    case 'exam':
      parts.push('exam', row.title, row.exam_date, row.status,
        row.score != null ? `score ${row.score}${row.max_score ? `/${row.max_score}` : ''}` : null,
        row.grade ? `grade ${row.grade}` : null, row.notes)
      break
    case 'topic':
      parts.push('topic', row.name, row.description)
      break
    case 'semester':
      parts.push('semester', row.name, row.start_date, row.end_date)
      break
    case 'calendar':
      parts.push('calendar', row.name)
      break
    default:
      break
  }
  return parts.filter(Boolean).join(' · ')
}

function titleOf(type, row) {
  if (type === 'todo') return row.text ?? ''
  if (type === 'topic' || type === 'semester' || type === 'calendar') return row.name ?? ''
  return row.title ?? ''
}

function dateOf(type, row) {
  if (type === 'event') return row.start_date ?? null
  if (type === 'todo') return row.due_date ?? null
  if (type === 'exam') return row.exam_date ?? null
  if (type === 'semester') return row.start_date ?? null
  return null
}

export function buildDoc(type, row) {
  const text = describe(type, row)
  const title = titleOf(type, row)
  const tokens = tokenize(`${title} ${text}`)
  const tf = {}
  for (const token of tokens) tf[token] = (tf[token] ?? 0) + 1

  return {
    id: `${type}:${row.id}`,
    type,
    ref_id: row.id,
    user_id: row.user_id,
    workspace_id: row.workspace_id,
    title,
    text,
    tf,
    len: tokens.length,
    tri: trigrams(title),
    date: dateOf(type, row),
    meta: {
      kind: row.kind ?? null,
      calendar_id: row.calendar_id ?? null,
      event_id: row.event_id ?? null,
      parent_id: row.parent_id ?? null,
      completed: !!row.completed,
      score: row.score ?? null,
    },
    updated_at: row.updated_at ?? new Date().toISOString(),
    rev: INDEX_REV,
  }
}

// ── Incremental maintenance ────────────────────────────────────────────────

const pendingPuts = new Map()
const pendingDeletes = new Set()
let flushTimer = null
let cachedIndex = null // invalidated on every flush

function scheduleFlush() {
  if (flushTimer) return
  const run = () => { flushTimer = null; flush() }
  flushTimer = typeof requestIdleCallback === 'function'
    ? requestIdleCallback(run, { timeout: 2000 })
    : setTimeout(run, FLUSH_DELAY)
}

async function flush() {
  const puts = [...pendingPuts.values()]
  const deletes = [...pendingDeletes]
  pendingPuts.clear()
  pendingDeletes.clear()
  if (!puts.length && !deletes.length) return
  try {
    if (deletes.length) await removeRows(STORES.search_docs, deletes)
    if (puts.length) await bulkPut(STORES.search_docs, puts)
    cachedIndex = null
    await writeIndexFileIfLinked()
  } catch (e) {
    console.error('localIndex flush failed:', e)
  }
}

function handleMirror(op, store, payload) {
  // Our own writes come back through the same listener; ignore them or the
  // index would index itself forever.
  if (store === STORES.search_docs) return
  const type = INDEXED[store]
  if (!type) return

  if (op === 'put') {
    for (const row of payload) {
      if (!row?.id) continue
      const doc = buildDoc(type, row)
      pendingPuts.set(doc.id, doc)
      pendingDeletes.delete(doc.id)
    }
  } else {
    for (const id of payload) {
      pendingDeletes.add(`${type}:${id}`)
      pendingPuts.delete(`${type}:${id}`)
    }
  }
  scheduleFlush()
}

registerMirrorListener(handleMirror)

// ── Full (re)build ─────────────────────────────────────────────────────────

const metaKey = (userId, workspaceId) => `searchIndex:${userId}:${workspaceId}`

// Called once per launch. Rebuilds only when the analyzer changed or the index
// has never been built for this workspace; otherwise the incremental hook has
// already kept it current.
export async function ensureIndexed(userId, workspaceId, { force = false } = {}) {
  if (!userId || !workspaceId) return null
  const key = metaKey(userId, workspaceId)
  const stamp = await getMeta(key)
  if (!force && stamp?.rev === INDEX_REV) return stamp

  const docs = []
  for (const [store, type] of Object.entries(INDEXED)) {
    let rows = []
    try {
      // Calendar rows are read user-wide: a calendar shared into this
      // workspace has to be searchable from it, and its rows carry the
      // *owning* workspace. searchLocal narrows them by calendar instead.
      rows = CALENDAR_TYPES.has(type)
        ? await getAllByUser(store, userId)
        : await getAllByWorkspace(store, userId, workspaceId)
    } catch { rows = [] }
    for (const row of rows) docs.push(buildDoc(type, row))
  }

  // Written in slices so a first build on a big workspace can't hold the main
  // thread through one long transaction.
  for (let i = 0; i < docs.length; i += REBUILD_CHUNK) {
    await bulkPut(STORES.search_docs, docs.slice(i, i + REBUILD_CHUNK))
  }
  cachedIndex = null

  const next = { rev: INDEX_REV, count: docs.length, builtAt: new Date().toISOString() }
  await setMeta(key, next)
  await writeIndexFileIfLinked()
  return next
}

export async function indexStats(userId, workspaceId) {
  const stamp = await getMeta(metaKey(userId, workspaceId))
  const docs = await loadDocs(userId)
  return { ...(stamp ?? { rev: INDEX_REV }), count: docs.length }
}

// All of the user's docs. Narrowing happens at query time (see searchLocal),
// because calendar docs are scoped by calendar and everything else by
// workspace — two different questions that one indexed read cannot answer.
async function loadDocs(userId) {
  try {
    return await getAllByUser(STORES.search_docs, userId)
  } catch {
    return []
  }
}

// Which doc types follow their calendar rather than their workspace.
const CALENDAR_TYPES = new Set(['event', 'exam', 'semester', 'calendar'])

function inScope(doc, { workspaceId, calendarIds }) {
  if (!CALENDAR_TYPES.has(doc.type)) return !workspaceId || doc.workspace_id === workspaceId
  if (!calendarIds) return true
  const id = doc.type === 'calendar' ? doc.ref_id : doc.meta?.calendar_id
  return !id || calendarIds.has(id)
}

// ── Search ─────────────────────────────────────────────────────────────────

const K1 = 1.5
const B = 0.75

async function getIndex(userId) {
  if (cachedIndex && cachedIndex.userId === userId) return cachedIndex
  const docs = await loadDocs(userId)
  const df = new Map()
  let totalLen = 0
  for (const doc of docs) {
    totalLen += doc.len ?? 0
    for (const term of Object.keys(doc.tf ?? {})) df.set(term, (df.get(term) ?? 0) + 1)
  }
  cachedIndex = {
    userId, docs, df,
    avgdl: docs.length ? totalLen / docs.length : 1,
  }
  return cachedIndex
}

function dice(a, b) {
  if (!a.length || !b.length) return 0
  const set = new Set(a)
  let hits = 0
  for (const g of b) if (set.has(g)) hits += 1
  return (2 * hits) / (a.length + b.length)
}

// `calendarIds` is the set of calendars visible in the current workspace; the
// caller knows the sharing rules, this file only applies them.
export async function searchLocal(query, {
  userId, workspaceId, calendarIds = null, types = null, from = null, to = null, limit = 20,
} = {}) {
  const terms = tokenize(query)
  const raw = normalise(query).trim()
  if (!raw) return []

  const { docs, df, avgdl } = await getIndex(userId)
  const n = docs.length || 1
  const today = new Date()

  const scope = { workspaceId, calendarIds }
  const candidates = docs.filter(doc => {
    if (types && !types.includes(doc.type)) return false
    if (!inScope(doc, scope)) return false
    if (from && doc.date && doc.date < from) return false
    if (to && doc.date && doc.date > to) return false
    return true
  })

  const scored = []
  for (const doc of candidates) {
    let score = 0
    for (const term of terms) {
      const f = doc.tf?.[term]
      if (!f) continue
      const idf = Math.log(1 + (n - (df.get(term) ?? 0) + 0.5) / ((df.get(term) ?? 0) + 0.5))
      score += idf * ((f * (K1 + 1)) / (f + K1 * (1 - B + B * ((doc.len ?? 1) / avgdl))))
    }
    if (score === 0) continue

    // A literal match in the title is what the user usually meant.
    if (normalise(doc.title).includes(raw)) score *= 1.4
    // Near-term items beat year-old ones for the same words.
    if (doc.date) {
      const days = Math.abs((new Date(doc.date) - today) / 86400000)
      score += 0.15 * Math.exp(-days / 180)
    }
    if (doc.meta?.completed) score *= 0.75

    scored.push({ doc, score })
  }

  // Nothing matched: fall back to trigram similarity, which absorbs typos
  // ("bichemie") without shipping a spellchecker.
  if (!scored.length) {
    const queryGrams = trigrams(raw)
    for (const doc of candidates) {
      const similarity = dice(queryGrams, doc.tri ?? [])
      if (similarity >= 0.35) scored.push({ doc, score: similarity })
    }
  }

  scored.sort((a, b) => b.score - a.score)
  return scored.slice(0, limit).map(({ doc, score }) => ({
    id: doc.id,
    type: doc.type,
    ref_id: doc.ref_id,
    title: doc.title,
    date: doc.date,
    meta: doc.meta,
    snippet: snippetOf(doc.text, raw),
    score,
  }))
}

function snippetOf(text, query) {
  const haystack = normalise(text)
  const at = haystack.indexOf(query)
  if (at < 0) return text.slice(0, 120)
  const start = Math.max(0, at - 40)
  return `${start > 0 ? '…' : ''}${text.slice(start, start + 120)}`
}

// ── The file ───────────────────────────────────────────────────────────────

const HANDLE_KEY = 'searchIndexFileHandle'

// The exported file covers every workspace on purpose: it exists so a local
// model can answer questions about the user's whole life, not one workspace.
export async function buildIndexFile(userId, workspaceId, { workspaceName } = {}) {
  const docs = await loadDocs(userId)
  const counts = {}
  for (const doc of docs) counts[doc.type] = (counts[doc.type] ?? 0) + 1
  const header = {
    __meta__: {
      schema: 'medtracker-index/1',
      rev: INDEX_REV,
      generated_at: new Date().toISOString(),
      workspace: workspaceName ?? workspaceId,
      counts,
    },
  }
  // One JSON object per line: a local model's harness can stream it instead of
  // parsing a multi-megabyte array, and appending a row is one line.
  return [header, ...docs].map(d => JSON.stringify(d)).join('\n')
}

export function canLinkIndexFile() {
  return typeof window !== 'undefined' && typeof window.showSaveFilePicker === 'function'
}

// Ask once for a file on disk; from then on every flush rewrites it, so the
// file stays current with no user action. Must be called from a user gesture.
export async function linkIndexFile(userId, workspaceId, suggestedName) {
  if (!canLinkIndexFile()) return false
  const handle = await window.showSaveFilePicker({
    suggestedName,
    types: [{ description: 'JSON Lines', accept: { 'application/x-ndjson': ['.jsonl'] } }],
  })
  await setMeta(HANDLE_KEY, { handle, userId, workspaceId })
  await writeIndexFileIfLinked()
  return true
}

export async function unlinkIndexFile() {
  await setMeta(HANDLE_KEY, null)
}

export async function isIndexFileLinked() {
  const stored = await getMeta(HANDLE_KEY)
  return !!stored?.handle
}

async function writeIndexFileIfLinked() {
  if (!canLinkIndexFile()) return
  let stored = null
  try { stored = await getMeta(HANDLE_KEY) } catch { return }
  if (!stored?.handle) return
  try {
    // The permission can lapse between sessions; asking again outside a user
    // gesture throws, which is fine — the next manual export re-establishes it.
    const permission = await stored.handle.queryPermission?.({ mode: 'readwrite' })
    if (permission !== 'granted') return
    const content = await buildIndexFile(stored.userId, stored.workspaceId)
    const writable = await stored.handle.createWritable()
    await writable.write(content)
    await writable.close()
  } catch (e) {
    console.error('localIndex file write failed:', e)
  }
}

// Everywhere the File System Access API doesn't exist (iOS, Safari, Android),
// the same content is offered as a download — identical bytes, manual refresh.
export async function downloadIndexFile(userId, workspaceId, filename) {
  const content = await buildIndexFile(userId, workspaceId)
  const blob = new Blob([content], { type: 'application/x-ndjson' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
