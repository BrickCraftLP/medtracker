// What the assistant knows about the user: habits derived from their own rows
// (never stored, recomputed when the data changes) plus what the user told it
// (userStore.js). Everything stays on the device.
//
// Used for defaults ("Brunch" → usually 10:00, 60 min, Café Central), for the
// model prompts (one short profile line) and for "What do you know about me?".

import { searchWords, STOP } from './lexicon.js'
import { getStoredProfile, profileRevision } from './userStore.js'
import { sessionMinutes, sessionDay, followPairs } from './studyStats.js'
import { minutesOf, durationOf, parseDayKey } from '../../utils/calendar/eventModel.js'
import { fmtMin } from './parse/times.js'
import { calcCurrentStreak } from '../../utils/calculations/streakTrackerCalcs.js'

const memo = new WeakMap()
const MIN_HABIT = 2

const median = xs => {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.floor(s.length / 2)]
}
const mode = xs => {
  const counts = new Map()
  for (const x of xs) if (x != null && x !== '') counts.set(x, (counts.get(x) ?? 0) + 1)
  const best = [...counts].sort((a, b) => b[1] - a[1])[0]
  return best ? { value: best[0], count: best[1], share: best[1] / xs.length } : null
}

// Title words that say what an entry is ("brunch", "zahnarzt"), not filler.
const HEAD_STOP = new Set([...STOP, 'mit', 'with', 'lernen', 'study', 'termin', 'event', 'vo', 'ue', 'se', 'np'])
export const headWords = title => searchWords(title ?? '').filter(w => w.length >= 3 && !HEAD_STOP.has(w) && !/^\d+$/.test(w))

export function getProfile(api) {
  const deps = [api.events, api.todos, api.topics, profileRevision()]
  const hit = memo.get(api.sessions)
  if (hit && hit.deps.every((d, i) => d === deps[i])) return hit.profile
  const profile = buildProfile(api)
  memo.set(api.sessions, { deps, profile })
  return profile
}

function buildProfile(api) {
  const topicName = new Map(api.topics.map(t => [t.id, t.name]))

  // ── Study ──────────────────────────────────────────────────────────────
  const sessions = api.sessions.filter(s => s.started_at)
  const hours = sessions.map(s => new Date(s.started_at).getHours())
  let window = null
  for (let h = 0; h < 24; h++) {
    const n = hours.filter(x => x >= h && x < h + 3).length
    if (n && (!window || n > window.count)) window = { from: h, to: Math.min(24, h + 3), count: n }
  }
  const dayCounts = new Map()
  for (const s of sessions) { const d = new Date(s.started_at).getDay(); dayCounts.set(d, (dayCounts.get(d) ?? 0) + 1) }
  const topDays = [...dayCounts].sort((a, b) => b[1] - a[1]).slice(0, 2).filter(([, n]) => n >= MIN_HABIT).map(([d]) => d)
  const minutesByTopic = new Map()
  for (const s of sessions) if (s.topic_id) minutesByTopic.set(s.topic_id, (minutesByTopic.get(s.topic_id) ?? 0) + sessionMinutes(s))
  const topTopics = [...minutesByTopic].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id, m]) => ({ id, name: topicName.get(id), minutes: Math.round(m) })).filter(t => t.name)
  const pairs = [...followPairs(api.sessions)].flatMap(([a, list]) => list.map(p => ({ a, b: p.topicId, count: p.count })))
    .filter(p => p.count >= MIN_HABIT && topicName.get(p.a) && topicName.get(p.b)).sort((x, y) => y.count - x.count).slice(0, 2)
  const activeDays = new Set(sessions.map(sessionDay).filter(Boolean)).size
  const study = {
    sessions: sessions.length,
    window: window && window.count >= MIN_HABIT ? window : null,
    topDays,
    medianMinutes: (m => (m != null ? Math.round(m) : null))(median(sessions.map(sessionMinutes).filter(m => m > 0))),
    topTopics,
    pairs: pairs.map(p => ({ from: topicName.get(p.a), to: topicName.get(p.b), count: p.count })),
    activeDays,
    streak: calcCurrentStreak(api.sessions),
  }

  // ── Calendar ───────────────────────────────────────────────────────────
  const byWord = new Map()
  const byKind = new Map()
  const people = new Map()
  const reminders = []
  const calByKind = new Map()
  for (const e of api.events) {
    if (e.recurrence_parent_id) continue
    const timed = !e.all_day && e.start_time
    const len = timed ? durationOf(e) : null
    const start = timed ? minutesOf(e.start_time) : null
    if (len != null && len < 24 * 60) {
      if (!byKind.has(e.kind)) byKind.set(e.kind, [])
      byKind.get(e.kind).push(len)
    }
    if (Array.isArray(e.reminders) && e.reminders.length) reminders.push(JSON.stringify([...e.reminders].sort((a, b) => a - b)))
    if (e.calendar_id) {
      if (!calByKind.has(e.kind)) calByKind.set(e.kind, [])
      calByKind.get(e.kind).push(e.calendar_id)
    }
    for (const w of new Set(headWords(e.title))) {
      if (!byWord.has(w)) byWord.set(w, { word: w, count: 0, lens: [], starts: [], places: [], reminders: [], kinds: [], calendars: [] })
      const h = byWord.get(w)
      h.count++
      if (len != null && len < 24 * 60) h.lens.push(len)
      if (start != null) h.starts.push(start)
      if (e.location?.trim()) h.places.push(e.location.trim())
      if (Array.isArray(e.reminders)) h.reminders.push(JSON.stringify([...e.reminders].sort((a, b) => a - b)))
      h.kinds.push(e.kind)
      if (e.calendar_id) h.calendars.push(e.calendar_id)
    }
    for (const m of String(e.title ?? '').matchAll(/\b(?:mit|with)\s+(\p{Lu}[\p{L}'-]{1,30})/gu)) {
      people.set(m[1], (people.get(m[1]) ?? 0) + 1)
    }
  }
  const habits = new Map()
  for (const [w, h] of byWord) {
    if (h.count < MIN_HABIT) continue
    const start = mode(h.starts)
    const place = mode(h.places)
    const rem = mode(h.reminders)
    const cal = mode(h.calendars)
    habits.set(w, {
      word: w,
      count: h.count,
      minutes: median(h.lens),
      start: start && start.share >= 0.5 ? start.value : null,
      location: place && place.share >= 0.5 ? place.value : null,
      reminders: rem && rem.share >= 0.5 ? JSON.parse(rem.value) : null,
      kind: mode(h.kinds)?.value ?? null,
      calendarId: cal && cal.share >= 0.6 ? cal.value : null,
    })
  }
  const calendar = {
    habits,
    kindMinutes: Object.fromEntries([...byKind].filter(([, l]) => l.length >= MIN_HABIT).map(([k, l]) => [k, median(l)])),
    kindCalendar: Object.fromEntries([...calByKind].map(([k, l]) => [k, mode(l)]).filter(([, m]) => m && m.share >= 0.6).map(([k, m]) => [k, m.value])),
    reminders: (() => { const m = mode(reminders); return m && m.count >= MIN_HABIT ? JSON.parse(m.value) : null })(),
    people: [...people].filter(([, n]) => n >= MIN_HABIT).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
  }

  // ── Todos ──────────────────────────────────────────────────────────────
  const dueTimes = mode(api.todos.map(t => (t.due_time ? String(t.due_time).slice(0, 5) : null)).filter(Boolean))
  const todos = {
    open: api.todos.filter(t => !t.completed).length,
    overdue: api.todos.filter(t => !t.completed && t.due_date && t.due_date < api.today).length,
    dueTime: dueTimes && dueTimes.count >= MIN_HABIT ? dueTimes.value : null,
    usesPriority: api.todos.some(t => t.priority),
  }

  return { study, calendar, todos, stored: getStoredProfile() }
}

// Defaults for a new entry called `title`: { minutes, start, location, reminders, calendarId, kind } | null.
export function habitFor(api, title) {
  const p = getProfile(api)
  const words = headWords(title)
  const stored = p.stored.places ?? {}
  let out = null
  for (const w of words) {
    const h = p.calendar.habits.get(w)
    if (h) { out = { ...h }; break }
  }
  for (const w of words) {
    if (stored[w]) { out = { ...(out ?? { word: w }), location: stored[w] }; break }
  }
  return out
}

const DAY_NAMES = {
  en: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'],
  de: ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa'],
}

// One line (≤ `max` chars) for model prompts. English: it is prompt text.
export function profileLine(api, { title = null, max = 200 } = {}) {
  const p = getProfile(api)
  const bits = []
  const s = p.study
  if (s.window) bits.push(`studies mostly ${s.window.from}-${s.window.to}h${s.topDays.length ? ` on ${s.topDays.map(d => DAY_NAMES.en[d]).join('/')}` : ''}`)
  if (s.medianMinutes) bits.push(`sessions ~${s.medianMinutes} min`)
  if (s.topTopics.length) bits.push(`main topics ${s.topTopics.map(t => t.name).join(', ')}`)
  const h = title ? habitFor(api, title) : null
  if (h) bits.push(`"${h.word}" usually${h.start != null ? ` ${fmtMin(h.start)}` : ''}${h.minutes ? ` ${h.minutes} min` : ''}${h.location ? ` @ ${h.location}` : ''}`)
  const aliases = Object.entries(p.stored.aliases ?? {}).slice(0, 3).map(([k, v]) => `"${k}"="${v}"`)
  if (aliases.length) bits.push(`short forms ${aliases.join(', ')}`)
  const line = bits.join('; ')
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

// Rows for the "What do you know about me?" card.
export function profileFacts(api) {
  const p = getProfile(api)
  const L = api.L
  const days = DAY_NAMES[api.lang === 'en' ? 'en' : 'de']
  const items = []
  const s = p.study
  if (s.window) items.push({ icon: '🕐', label: L('Usual study time', 'Übliche Lernzeit'), value: `${s.window.from}–${s.window.to} ${L('h', 'Uhr')}`, sub: s.topDays.length ? L(`mostly ${s.topDays.map(d => days[d]).join(', ')}`, `meist ${s.topDays.map(d => days[d]).join(', ')}`) : '' })
  if (s.medianMinutes) items.push({ icon: '⏱', label: L('Typical session', 'Typische Session'), value: `${s.medianMinutes} min`, sub: L(`${s.sessions} sessions on ${s.activeDays} days`, `${s.sessions} Sessions an ${s.activeDays} Tagen`) })
  if (s.topTopics.length) items.push({ icon: '📚', label: L('Main topics', 'Hauptthemen'), value: s.topTopics[0].name, sub: s.topTopics.map(t => `${t.name} ${t.minutes} min`).join(' · '), topicId: s.topTopics[0].id })
  for (const pr of s.pairs) items.push({ icon: '🔗', label: L('Studied back to back', 'Direkt hintereinander'), value: `${pr.from} → ${pr.to}`, sub: `${pr.count}×` })
  if (s.streak) items.push({ icon: '🔥', label: L('Streak', 'Serie'), value: `${s.streak} ${L('days', 'Tage')}` })
  for (const h of [...p.calendar.habits.values()].sort((a, b) => b.count - a.count).slice(0, 4)) {
    const sub = [h.start != null ? fmtMin(h.start) : null, h.minutes ? `${h.minutes} min` : null, h.location ? `📍 ${h.location}` : null].filter(Boolean).join(' · ')
    if (sub) items.push({ icon: '📅', label: `„${h.word}“`, value: `${h.count}×`, sub })
  }
  if (p.calendar.people.length) items.push({ icon: '👥', label: L('Often with', 'Oft mit'), value: p.calendar.people.map(x => x.name).join(', ') })
  if (p.todos.dueTime) items.push({ icon: '✅', label: L('Todos usually due at', 'Todos meist fällig um'), value: p.todos.dueTime })
  return items
}

// What the user told the assistant, for the card and settings.
export function storedFacts(api) {
  const st = getStoredProfile()
  const L = api.L
  const out = []
  for (const [k, v] of Object.entries(st.aliases ?? {})) out.push({ kind: 'alias', key: k, text: L(`“${k}” means “${v}”`, `„${k}“ heißt „${v}“`) })
  for (const [k, v] of Object.entries(st.places ?? {})) out.push({ kind: 'place', key: k, text: L(`“${k}” is at ${v}`, `„${k}“ ist in/bei ${v}`) })
  const pr = st.preferences ?? {}
  if (pr.name) out.push({ kind: 'pref', key: 'name', text: L(`Name: ${pr.name}`, `Name: ${pr.name}`) })
  if (pr.studyMinutes) out.push({ kind: 'pref', key: 'studyMinutes', text: L(`Study blocks: ${pr.studyMinutes} min`, `Lernblöcke: ${pr.studyMinutes} min`) })
  for (const n of st.notes ?? []) out.push({ kind: 'note', key: n.id, text: n.text })
  return out
}

export const weekdayShort = (api, key) => DAY_NAMES[api.lang === 'en' ? 'en' : 'de'][parseDayKey(key).getDay()]
