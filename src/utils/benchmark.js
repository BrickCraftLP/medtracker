// MedBench v2 — sustained, repeatable browser performance measurements.
//
// Each synthetic test warms up first, then records five samples that run for
// at least 220 ms. The median throughput is scored, so timer quantisation,
// garbage collection, JIT warm-up and a single background interruption have
// far less influence than they did in the original single-pass benchmark.
// Tests run sequentially; live sync and environment measurements never overlap
// the scored work.

import { STORES, getAllByUser, getMeta, setMeta, deleteMeta } from '../services/offlineDB.js'

export const MEDBENCH_VERSION = 2

const SCORE_BASE = 25_000
const SYNC_SAMPLE_COUNT = 5
const SYNC_SAMPLE_MS = 220
const WARMUP_MS = 90
const BETWEEN_SAMPLE_MS = 32
const FRAME_WINDOW_MS = 2400

// Reference rates keep every category on roughly the same scale. A device at
// the reference rate scores 25,000 in that category. Bumping these values is a
// benchmark-version change because it changes score comparability.
const REFERENCE = {
  hashSerialize: 1_800_000,
  arrayReconcile: 4_100_000,
  objectChurn: 42_000_000,
  stringSearch: 100_000_000,
  domLayout: 46_000,
  indexedDb: 5_500,
  frameRate: 60,
}

let benchmarkSink = 0

const round1 = value => Math.round(value * 10) / 10
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

function median(values) {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2
}

// Relative median absolute deviation. Unlike min/max spread it does not let a
// single notification or GC pause make an otherwise steady run look unstable.
function variabilityPct(values) {
  const centre = median(values)
  if (!centre) return 0
  return round1((median(values.map(value => Math.abs(value - centre))) / centre) * 100)
}

function throughputScore(rate, referenceRate) {
  return Math.max(1, Math.round(SCORE_BASE * (rate / referenceRate)))
}

async function yieldToBrowser() {
  await pause(BETWEEN_SAMPLE_MS)
}

async function measureSync(workload, referenceRate, {
  samples = SYNC_SAMPLE_COUNT,
  sampleMs = SYNC_SAMPLE_MS,
  warmupMs = WARMUP_MS,
} = {}) {
  const warmupStart = performance.now()
  while (performance.now() - warmupStart < warmupMs) workload()
  await yieldToBrowser()

  const readings = []
  for (let sample = 0; sample < samples; sample++) {
    const start = performance.now()
    let ops = 0
    do {
      ops += workload()
    } while (performance.now() - start < sampleMs)

    const elapsed = performance.now() - start
    readings.push({
      ms: round1(elapsed),
      ops,
      opsPerSecond: Math.round(ops / (elapsed / 1000)),
    })
    if (sample < samples - 1) await yieldToBrowser()
  }

  const rates = readings.map(reading => reading.opsPerSecond)
  const rate = median(rates)
  return {
    ms: round1(readings.reduce((sum, reading) => sum + reading.ms, 0)),
    ops: readings.reduce((sum, reading) => sum + reading.ops, 0),
    opsPerSecond: Math.round(rate),
    score: throughputScore(rate, referenceRate),
    samples: readings,
    variabilityPct: variabilityPct(rates),
  }
}

// ── Browser / OS / device ────────────────────────────────────────────────

function parseUserAgent(ua) {
  let browser = { name: 'Unknown', version: '' }
  const browserPatterns = [
    [/Edg\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/SamsungBrowser\/([\d.]+)/, 'Samsung Internet'],
    [/FxiOS\/([\d.]+)/, 'Firefox iOS'],
    [/CriOS\/([\d.]+)/, 'Chrome iOS'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/Version\/([\d.]+).*Safari/, 'Safari'],
  ]
  for (const [pattern, name] of browserPatterns) {
    const match = ua.match(pattern)
    if (match) { browser = { name, version: match[1] }; break }
  }

  let os = { name: 'Unknown', version: '' }
  let match
  if ((match = ua.match(/Windows NT ([\d.]+)/))) {
    const versions = { '10.0': '10', '6.3': '8.1', '6.2': '8', '6.1': '7' }
    os = { name: 'Windows', version: versions[match[1]] ?? match[1] }
  } else if (/CrOS/.test(ua)) {
    os = { name: 'ChromeOS', version: (ua.match(/CrOS \S+ ([\d.]+)/) ?? [])[1] ?? '' }
  } else if ((match = ua.match(/Android ([\d.]+)/))) {
    os = { name: 'Android', version: match[1] }
  } else if ((match = ua.match(/iPhone OS ([\d_]+)/)) || (match = ua.match(/OS ([\d_]+) like Mac OS X/))) {
    os = { name: /iPad/.test(ua) ? 'iPadOS' : 'iOS', version: match[1].replace(/_/g, '.') }
  } else if ((match = ua.match(/Mac OS X ([\d_]+)/))) {
    os = { name: 'macOS', version: match[1].replace(/_/g, '.') }
  } else if (/Linux/.test(ua)) {
    os = { name: 'Linux', version: '' }
  }

  let model = (ua.match(/Android [\d.]+;\s*([^;)]+?)\s*(?:Build|\))/) ?? [])[1]?.trim() || null
  if (!model && /iPad/.test(ua)) model = 'iPad'
  else if (!model && /iPhone/.test(ua)) model = 'iPhone'

  const formFactor = /Mobi|Android.*Mobile/.test(ua) ? 'phone'
    : /iPad|Android(?!.*Mobile)|Tablet/.test(ua) ? 'tablet'
    : 'desktop'

  return { browser, os, model, formFactor }
}

async function deviceInfo() {
  const parsed = parseUserAgent(navigator.userAgent)
  const uaData = navigator.userAgentData
  if (!uaData?.getHighEntropyValues) return parsed

  try {
    const hints = await uaData.getHighEntropyValues(['model', 'platformVersion', 'platform'])
    if (hints.model) parsed.model = hints.model
    if (hints.platform === 'Windows' && hints.platformVersion) {
      const major = parseInt(hints.platformVersion.split('.')[0], 10)
      parsed.os = { name: 'Windows', version: major >= 13 ? '11' : '10' }
    } else if (hints.platform === 'Android' && hints.platformVersion) {
      parsed.os = { name: 'Android', version: hints.platformVersion }
    }
  } catch { /* permission policy may block high-entropy hints */ }
  return parsed
}

async function timeIt(fn) {
  const start = performance.now()
  try {
    const value = await fn()
    return { ms: round1(performance.now() - start), value, error: null }
  } catch (error) {
    return { ms: round1(performance.now() - start), value: null, error: error?.message ?? String(error) }
  }
}

// ── Fixed fixtures ───────────────────────────────────────────────────────

function fixtureTodos(count) {
  const rows = []
  for (let i = 0; i < count; i++) {
    rows.push({
      id: `t${i}`,
      text: `Review chapter ${i % 40}`,
      notes: i % 3 === 0 ? `Notes for item ${i}, a bit of free text to size like a real row.` : '',
      completed: i % 5 === 0,
      due_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-15`,
      parent_id: i % 7 === 0 && i > 0 ? `t${i - 1}` : null,
      workspace_id: `w${i % 3}`,
      updated_at: new Date(2026, 0, 1 + (i % 300)).toISOString(),
    })
  }
  return rows
}

function fixtureEvents(count, calendarIds) {
  const rows = []
  for (let i = 0; i < count; i++) {
    rows.push({
      id: `e${i}`,
      calendar_id: calendarIds[i % calendarIds.length],
      workspace_id: `w${i % 3}`,
      kind: i % 4 === 0 ? 'study' : 'event',
      topic_id: i % 4 === 0 ? `topic${i % 10}` : null,
      title: `Event ${i}`,
      start_date: `2026-${String((i % 12) + 1).padStart(2, '0')}-${String((i % 27) + 1).padStart(2, '0')}`,
      start_time: '09:00',
      planned_minutes: 45,
      notes: '',
      completed: i % 6 === 0,
      session_id: null,
    })
  }
  return rows
}

function createHashWorkload() {
  const rows = fixtureTodos(1500)
  const outgoing = todo => [todo.text, todo.notes || null, !!todo.completed, todo.due_date, todo.parent_id]
  return () => {
    let changed = 0
    for (const row of rows) {
      const before = JSON.stringify(outgoing(row))
      const after = JSON.stringify(outgoing({ ...row, notes: `${row.notes} ` }))
      if (before !== after) changed++
    }
    benchmarkSink ^= changed
    return rows.length
  }
}

function createArrayWorkload() {
  const calendarIds = ['c0', 'c1', 'c2', 'c3']
  const visible = new Set(['c0', 'c2'])
  const events = fixtureEvents(3000, calendarIds)
  const todos = fixtureTodos(3000)
  return () => {
    const scopedEvents = events.filter(event => visible.has(event.calendar_id))
    const scopedScheduled = scopedEvents
      .filter(event => event.kind === 'study' && event.topic_id)
      .map(event => ({ id: event.id, topic_id: event.topic_id, scheduled_date: event.start_date, completed: event.completed }))
      .sort((a, b) => a.scheduled_date.localeCompare(b.scheduled_date))
    const scopedTodos = todos
      .filter(todo => !todo.completed)
      .sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''))
    benchmarkSink ^= scopedScheduled.length + scopedTodos.length
    return scopedEvents.length + scopedScheduled.length + scopedTodos.length
  }
}

function createObjectWorkload() {
  const providers = [{ id: 'google' }]
  const groups = fixtureTodos(20).map((todo, index) => ({ listId: `l${index}`, workspaces: [{ id: todo.workspace_id }] }))
  return () => {
    let ops = 0
    for (let i = 0; i < 1000; i++) {
      const authorized = { google: true }
      const connected = Object.fromEntries(providers.map(provider => [provider.id, true]))
      const tasks = {
        authorized: true, groups, needsReconnect: false,
        connect: () => {}, listLists: () => {},
      }
      const value = {
        providers, connected, authorized, syncing: false, error: null,
        lastResult: { pulled: i, pushed: 0, deleted: 0 }, tasks,
      }
      ops += Object.keys(value).length
      benchmarkSink ^= value.lastResult.pulled
    }
    return ops
  }
}

function createSearchWorkload() {
  const words = ['Chapter', 'Lecture', 'Exam', 'Review', 'Lab', 'Seminar', 'Workshop', 'Clinic']
  const titles = Array.from({ length: 5000 }, (_, i) => `${words[i % words.length]} ${i % 50} — study session ${i}`.toLowerCase())
  const queries = ['chapter', 'exam', 'lecture 12', 'review', 'zzz-no-match']
  return () => {
    let matched = 0
    for (const query of queries) {
      for (const title of titles) if (title.includes(query)) matched++
    }
    benchmarkSink ^= matched
    return titles.length * queries.length
  }
}

function createDomWorkload() {
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;visibility:hidden;contain:layout style;'
  document.body.appendChild(container)
  const run = () => {
    const nodes = []
    for (let i = 0; i < 400; i++) {
      const element = document.createElement('div')
      element.className = 'medbench-node'
      element.style.cssText = `padding:${i % 12}px;margin:1px;border-radius:${i % 8}px;`
      element.textContent = `row ${i}`
      container.appendChild(element)
      nodes.push(element)
    }
    let height = 0
    for (const element of nodes) height += element.getBoundingClientRect().height
    container.replaceChildren()
    benchmarkSink ^= Math.round(height)
    return nodes.length
  }
  return { run, dispose: () => container.remove() }
}

async function measureIndexedDb() {
  const samples = []
  const runId = `${Date.now()}:${Math.random().toString(36).slice(2)}`
  const keys = Array.from({ length: 40 }, (_, index) => `benchmark:scratch:${runId}:${index}`)
  const value = { hash: 'x'.repeat(64), pushedAt: Date.now(), parents: { a: 'b', c: 'd' } }

  const batch = async () => {
    for (const key of keys) await setMeta(key, value)
    for (const key of keys) await getMeta(key)
    return keys.length * 2
  }

  try {
    await batch()
    await yieldToBrowser()
    for (let sample = 0; sample < SYNC_SAMPLE_COUNT; sample++) {
      const start = performance.now()
      let ops = 0
      do {
        ops += await batch()
      } while (performance.now() - start < SYNC_SAMPLE_MS)
      const elapsed = performance.now() - start
      samples.push({ ms: round1(elapsed), ops, opsPerSecond: Math.round(ops / (elapsed / 1000)) })
      if (sample < SYNC_SAMPLE_COUNT - 1) await yieldToBrowser()
    }
  } finally {
    await Promise.all(keys.map(key => deleteMeta(key).catch(() => {})))
  }

  const rates = samples.map(sample => sample.opsPerSecond)
  const rate = median(rates)
  return {
    ms: round1(samples.reduce((sum, sample) => sum + sample.ms, 0)),
    ops: samples.reduce((sum, sample) => sum + sample.ops, 0),
    opsPerSecond: Math.round(rate),
    score: throughputScore(rate, REFERENCE.indexedDb),
    samples,
    variabilityPct: variabilityPct(rates),
  }
}

function measureFrameRate() {
  return new Promise((resolve, reject) => {
    if (document.visibilityState !== 'visible') {
      reject(new Error('Keep MedTracker visible while the benchmark runs'))
      return
    }

    const timestamps = []
    let first = null
    function tick(now) {
      if (first == null) first = now
      timestamps.push(now)
      if (now - first < FRAME_WINDOW_MS) {
        requestAnimationFrame(tick)
        return
      }

      const intervals = timestamps.slice(1).map((time, index) => time - timestamps[index])
      const elapsed = timestamps.at(-1) - timestamps[0]
      const fps = intervals.length / (elapsed / 1000)
      resolve({
        ms: round1(elapsed),
        fps: round1(fps),
        frames: intervals.length,
        longestGapMs: round1(Math.max(...intervals)),
        medianFrameMs: round1(median(intervals)),
        variabilityPct: variabilityPct(intervals),
        score: throughputScore(fps, REFERENCE.frameRate),
      })
    }
    requestAnimationFrame(tick)
  })
}

function composite(subtests) {
  const scores = Object.values(subtests)
    .map(result => result?.score)
    .filter(score => Number.isFinite(score) && score > 0)
  if (!scores.length) return 0
  return Math.round(Math.exp(scores.reduce((sum, score) => sum + Math.log(score), 0) / scores.length))
}

async function runTest(name, fn, subtests, onProgress, completed, total) {
  try {
    subtests[name] = await fn()
  } catch (error) {
    subtests[name] = { error: error?.message ?? String(error), score: null }
  }
  onProgress?.({ name, completed, total, percent: Math.round((completed / total) * 90) })
  await yieldToBrowser()
}

export async function runPerfSuite({ onProgress } = {}) {
  const subtests = {}
  const total = 7
  onProgress?.({ name: 'warmup', completed: 0, total, percent: 0 })

  await runTest('hashSerialize', () => measureSync(createHashWorkload(), REFERENCE.hashSerialize), subtests, onProgress, 1, total)
  await runTest('arrayReconcile', () => measureSync(createArrayWorkload(), REFERENCE.arrayReconcile), subtests, onProgress, 2, total)
  await runTest('objectChurn', () => measureSync(createObjectWorkload(), REFERENCE.objectChurn), subtests, onProgress, 3, total)
  await runTest('stringSearch', () => measureSync(createSearchWorkload(), REFERENCE.stringSearch), subtests, onProgress, 4, total)

  const dom = createDomWorkload()
  try {
    await runTest('domLayout', () => measureSync(dom.run, REFERENCE.domLayout, { samples: 5 }), subtests, onProgress, 5, total)
  } finally {
    dom.dispose()
  }

  await runTest('indexedDb', measureIndexedDb, subtests, onProgress, 6, total)
  await pause(160)
  await runTest('frameRate', measureFrameRate, subtests, onProgress, 7, total)

  const spreads = Object.values(subtests)
    .map(result => result?.variabilityPct)
    .filter(Number.isFinite)
  return {
    score: composite(subtests),
    variabilityPct: round1(median(spreads)),
    subtests,
  }
}

// `data` and `sync` are informational only and never affect the score.
async function captureLive({ data, sync, userId }) {
  const live = { counts: {}, timings: {} }
  if (data) {
    live.counts = {
      todos: data.todos?.length ?? 0,
      events: data.allEvents?.length ?? 0,
      calendars: data.allCalendars?.length ?? 0,
      topics: data.topics?.length ?? 0,
    }
  }
  if (userId) {
    const todosMirror = await timeIt(() => getAllByUser(STORES.todos, userId))
    live.timings.indexedDbTodosRead = { ms: todosMirror.ms, rows: todosMirror.value?.length ?? null, error: todosMirror.error }
  }
  if (sync) {
    const before = sync.lastResult
    const run = await timeIt(() => sync.syncNow())
    live.timings.googleSyncRun = { ms: run.ms, error: run.error, totals: sync.lastResult !== before ? sync.lastResult : null }
    live.counts.linkedCalendars = sync.linkedCalendars?.length ?? 0
    live.counts.taskLists = sync.tasks?.groups?.length ?? 0
  }
  return live
}

async function captureEnvironment() {
  const environment = {}
  if (navigator.storage?.estimate) {
    try {
      const { usage, quota } = await navigator.storage.estimate()
      environment.storage = {
        usageMB: usage != null ? Math.round(usage / 1e6) : null,
        quotaMB: quota != null ? Math.round(quota / 1e6) : null,
      }
    } catch { /* private mode or unavailable */ }
  }
  const connection = navigator.connection
  if (connection) {
    environment.network = {
      effectiveType: connection.effectiveType ?? null,
      downlinkMbps: connection.downlink ?? null,
      rttMs: connection.rtt ?? null,
      saveData: !!connection.saveData,
    }
  }
  if (navigator.getBattery) {
    try {
      const battery = await navigator.getBattery()
      environment.battery = { level: Math.round(battery.level * 100), charging: battery.charging }
    } catch { /* blocked in several browsers */ }
  }
  environment.viewport = {
    width: window.innerWidth,
    height: window.innerHeight,
    dpr: window.devicePixelRatio ?? 1,
  }
  try { environment.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone } catch { /* ignore */ }
  return environment
}

export async function runBenchmark({ data, sync, userId, buildVersion, onProgress } = {}) {
  const started = performance.now()
  const [device, environment] = await Promise.all([deviceInfo(), captureEnvironment()])
  await pause(180)

  const suite = await runPerfSuite({ onProgress })
  onProgress?.({ name: 'live', completed: 7, total: 7, percent: 92 })
  const live = await captureLive({ data, sync, userId })
  onProgress?.({ name: 'complete', completed: 7, total: 7, percent: 100 })

  return {
    at: new Date().toISOString(),
    buildVersion: buildVersion ?? null,
    suiteVersion: MEDBENCH_VERSION,
    durationMs: Math.round(performance.now() - started),
    userAgent: navigator.userAgent,
    online: navigator.onLine,
    device: {
      ...device,
      memoryGB: navigator.deviceMemory ?? null,
      cores: navigator.hardwareConcurrency ?? null,
    },
    environment,
    score: suite.score,
    variabilityPct: suite.variabilityPct,
    subtests: suite.subtests,
    live,
  }
}

export function downloadBenchmark(result) {
  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = `medbench-v${result.suiteVersion ?? 1}-${result.score}-${result.at.replace(/[:.]/g, '-')}.json`
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

const STORAGE_KEY = 'medtracker.lastBenchmark'
const HISTORY_KEY = 'medtracker.benchmarkHistory'
const HISTORY_LIMIT = 10

export function saveBenchmark(result) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(result)) } catch { /* private mode/full */ }
}

export function loadBenchmark() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function clearBenchmark() {
  try { localStorage.removeItem(STORAGE_KEY) } catch { /* ignore */ }
}

export function loadHistory() {
  try {
    const raw = localStorage.getItem(HISTORY_KEY)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

export function appendHistory(result) {
  const entry = {
    at: result.at,
    score: result.score,
    buildVersion: result.buildVersion ?? null,
    suiteVersion: result.suiteVersion ?? 1,
    variabilityPct: result.variabilityPct ?? null,
    model: result.device?.model ?? null,
  }
  const history = [...loadHistory(), entry].slice(-HISTORY_LIMIT)
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(history)) } catch { /* ignore */ }
  return history
}

export function clearHistory() {
  try { localStorage.removeItem(HISTORY_KEY) } catch { /* ignore */ }
}
