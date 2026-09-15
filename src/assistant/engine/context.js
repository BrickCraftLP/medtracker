// A compact plain-text snapshot of the user's data for the local model, so it
// can answer free questions ("which day this week is least busy?") instead of
// only routing. Kept small: small models have ~4k tokens of context in total.

import { addDays } from '../../utils/calendar/eventModel.js'
import { sortTodos } from '../../utils/calculations/todoPriorityCalcs.js'
import { calcCurrentStreak } from '../../utils/calculations/streakTrackerCalcs.js'
import { fmtMin } from './parse/times.js'
import { summarize, accuracyTrend, followPairs } from './studyStats.js'
import { freeSlots } from '../intents/calendar.js'
import { searchAll, queryOf } from '../intents/search.js'
import { extract } from './parse/index.js'
import { normalize } from './normalize.js'

const MAX_CHARS = 4500
const QUERY_MAX_CHARS = 3000
const pct = v => (v == null ? 'n/a' : `${Math.round(v)}%`)

export function buildDataContext(api) {
  const today = api.today
  const name = new Map(api.topics.map(t => [t.id, t.name]))
  const sections = []
  const section = (title, lines, max) => {
    if (!lines.length) return
    const more = lines.length > max ? `\n(+${lines.length - max} more)` : ''
    sections.push(`${title}:\n${lines.slice(0, max).join('\n')}${more}`)
  }

  const occ = api.occurrences(today, addDays(today, 6))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startMin - b.startMin))
  section('Calendar, next 7 days', occ.map(o =>
    `${o.date} ${o.allDay ? 'all day' : `${fmtMin(o.startMin)}-${fmtMin(o.endMin)}`} ${o.event.title || 'untitled'} [${o.event.kind}]${o.event.location ? ` @ ${o.event.location}` : ''}`), 40)

  section('Free windows (waking hours)', [today, addDays(today, 1)].map(d => {
    const slots = freeSlots(api, d, 30)
    return `${d}: ${slots.length ? slots.map(s => `${fmtMin(s.start)}-${fmtMin(s.end)}`).join(', ') : 'none'}`
  }), 2)

  const todos = sortTodos(api.todos.filter(t => !t.completed), { urgency: api.urgency, today })
  section('Open todos', todos.map(t =>
    `- ${t.text}${t.due_date ? ` (due ${t.due_date}${t.due_time ? ` ${String(t.due_time).slice(0, 5)}` : ''})` : ''}${t.topic_id && name.get(t.topic_id) ? ` [${name.get(t.topic_id)}]` : ''}`), 15)

  const exams = new Map()
  for (const x of api.exams) if (x.exam_date && x.exam_date >= today) exams.set(`${x.title}|${x.exam_date}`, `${x.exam_date} ${x.title}`)
  for (const o of api.occurrences(today, addDays(today, 180))) {
    if (o.event.kind === 'exam') exams.set(`${o.event.title}|${o.date}`, `${o.date} ${o.event.title}`)
  }
  section('Upcoming exams', [...exams.values()].sort(), 10)

  const weekFrom = addDays(today, -6)
  const topics = [...api.topics].sort((a, b) => (api.urgency?.get(b.id) ?? 0) - (api.urgency?.get(a.id) ?? 0))
  section('Topics (last 90 days)', topics.map(t => {
    const s = summarize(api.sessions, { topicId: t.id })
    const w = summarize(api.sessions, { topicId: t.id, from: weekFrom, to: today })
    const tr = accuracyTrend(api.sessions, t.id, today)
    const trend = tr ? `${tr.delta >= 0 ? '+' : ''}${Math.round(tr.delta)} pts (${tr.dir === 'up' ? 'improving' : tr.dir === 'down' ? 'worse' : 'stable'})` : 'n/a'
    return `- ${t.name}: accuracy ${pct(s.accuracy)} (target ${t.target_accuracy ?? 80}%), trend ${trend}, ${s.sessions} sessions, ${w.minutes} min last 7 days, last studied ${s.lastDay ?? 'never'}`
  }), 30)

  const week = summarize(api.sessions, { from: weekFrom, to: today })
  sections.push(`Study last 7 days: ${week.minutes} min, ${week.sessions} sessions on ${week.activeDays} days. Streak: ${calcCurrentStreak(api.sessions)} days.`)

  const pairs = [...followPairs(api.sessions)]
    .flatMap(([a, list]) => list.map(p => ({ a, b: p.topicId, count: p.count })))
    .filter(p => p.count >= 2 && name.get(p.a) && name.get(p.b))
    .sort((x, y) => y.count - x.count)
  section('Often studied back to back', pairs.map(p => `${name.get(p.a)} -> ${name.get(p.b)} (${p.count}x)`), 5)

  const out = sections.join('\n\n')
  return out.length > MAX_CHARS ? `${out.slice(0, MAX_CHARS)}\n(truncated)` : out
}

// A smaller snapshot for one free question: the entries, todos and exams that
// match its words (with place, calendar, repeat and notes) come first, then a
// compact look at the coming week. Small models answer far better from ~2k
// characters of relevant rows than from a full dump.
export function buildQueryContext(api, query) {
  const today = api.today
  const calName = new Map((api.calendars ?? []).map(c => [c.id, c.name]))
  const topicName = new Map(api.topics.map(t => [t.id, t.name]))
  const sections = []
  const section = (title, lines, max) => {
    if (lines.length) sections.push(`${title}:\n${lines.slice(0, max).join('\n')}${lines.length > max ? `\n(+${lines.length - max} more)` : ''}`)
  }
  const when = o => `${o.date} ${o.allDay ? 'all day' : `${fmtMin(o.startMin)}-${fmtMin(o.endMin)}`}`
  const entryLine = o => {
    const e = o.event
    const bits = [`${when(o)} ${e.title || 'untitled'} [${e.kind}]`]
    if (e.location) bits.push(`place: ${e.location}`)
    if (calName.get(e.calendar_id)) bits.push(`calendar: ${calName.get(e.calendar_id)}`)
    const freq = String(e.rrule ?? '').match(/FREQ=(\w+)/)?.[1]
    if (freq) bits.push(`repeats ${freq.toLowerCase()}`)
    if (e.notes) bits.push(`notes: ${String(e.notes).replace(/\s+/g, ' ').slice(0, 100)}`)
    return bits.join(' | ')
  }
  const todoLine = t => `- ${t.text}${t.completed ? ' (done)' : ''}${t.due_date ? ` (due ${t.due_date})` : ''}${topicName.get(t.topic_id) ? ` [${topicName.get(t.topic_id)}]` : ''}`

  const q = queryOf(extract(normalize(query), today).rest)
  if (q) {
    const res = searchAll(api, q, { from: addDays(today, -60), to: addDays(today, 90) })
    // Per entry the next upcoming date, else the latest past one.
    const byEvent = new Map()
    for (const o of res.occ) {
      const prev = byEvent.get(o.event.id)
      if (!prev || (o.date >= today && (prev.date < today || o.date < prev.date)) || (prev.date < today && o.date > prev.date)) byEvent.set(o.event.id, o)
    }
    const hits = [...byEvent.values()].sort((a, b) => (a.date < b.date ? -1 : 1))
    const counts = new Map()
    for (const o of res.occ) if (o.date >= today) counts.set(o.event.id, (counts.get(o.event.id) ?? 0) + 1)
    section(`Entries matching "${q}" (next date, else last)`, hits.map(o => `${entryLine(o)}${counts.get(o.event.id) > 1 ? ` | ${counts.get(o.event.id)} upcoming dates` : ''}`), 10)
    section(`Todos matching "${q}"`, res.todos.map(todoLine), 8)
    section(`Exams matching "${q}"`, res.exams.map(x => `${x.exam_date ?? '?'} ${x.title}`), 5)
  }

  const occ = api.occurrences(today, addDays(today, 6))
    .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startMin - b.startMin))
  section('Calendar, next 7 days', occ.map(o => `${when(o)} ${o.event.title || 'untitled'}${o.event.location ? ` @ ${o.event.location}` : ''}`), 25)

  const todos = sortTodos(api.todos.filter(t => !t.completed), { urgency: api.urgency, today })
  section('Open todos', todos.map(todoLine), 10)

  const exams = api.exams.filter(x => x.exam_date && x.exam_date >= today).sort((a, b) => (a.exam_date < b.exam_date ? -1 : 1))
  section('Upcoming exams', exams.map(x => `${x.exam_date} ${x.title}`), 5)

  const out = sections.join('\n\n') || 'no data'
  return out.length > QUERY_MAX_CHARS ? `${out.slice(0, QUERY_MAX_CHARS)}\n(truncated)` : out
}
