// "this", "that", "it", "hier", "das" — what the user means without naming it.
//
// Order: a thing named in the sentence → the thing on screen (screenContext) →
// the thing in the last answer (api.recent). Command references `@screen`,
// `@last` and `@<type>:<id>` resolve the same way.

import { fold } from './normalize.js'

export const REF_TYPES = ['todo', 'event', 'topic', 'exam', 'calendar']

// Words that point at something instead of naming it. Articles alone
// ("den Brunch") are not enough — they only count when nothing else is left.
export const DEICTIC = /\b(this|that|it|them|these|those|there|here|dies\w*|diese[mnrs]?|jene\w*|ihn|ihm|es|hier|dort|dahin|dorthin|davon|dazu|damit|daran|dafuer|selbe\w*|same)\b/
const ARTICLE_ONLY = /^(?:(?:das|den|die|der|dem|the|ding|termin|event|todo|thema|topic|exam|pruefung|eintrag|entry|one)\s*)+$/

export const isDeictic = text => DEICTIC.test(fold(text ?? ''))
export const isArticleOnly = text => ARTICLE_ONLY.test(fold(text ?? '').trim())

// Entities an answer showed, for "move it" / "und morgen?" on the next turn.
export function entitiesOf(result) {
  if (!result) return { entities: [], date: null }
  const out = []
  const push = (type, id, date = null) => {
    if (id && !out.some(e => e.type === type && e.id === id)) out.push({ type, id, ...(date ? { date } : {}) })
  }
  for (const b of result.blocks ?? []) {
    const d = b.data ?? {}
    if (b.type === 'events') for (const it of d.items ?? []) push('event', it.eventId, it.date)
    if (b.type === 'saved') push('event', d.eventId)
    if (b.type === 'todos') for (const id of d.ids ?? []) push('todo', id)
    if (b.type === 'topics') for (const it of d.items ?? []) push('topic', it.topicId)
    if (b.type === 'stats') for (const it of d.items ?? []) if (it.topicId) push('topic', it.topicId)
    if (b.type === 'confirm' && d.entity) push(d.entity.type, d.entity.id)
  }
  const m = result.meta ?? {}
  for (const e of m.entities ?? []) push(e.type, e.id, e.date)
  const date = m.slots?.date ?? out.find(e => e.date)?.date ?? null
  return { entities: out.slice(0, 12), date, intent: m.intent ?? null, slots: m.slots ?? null, source: m.source ?? null }
}

const ROWS = { todo: 'todos', event: 'events', topic: 'topics', exam: 'exams', calendar: 'calendars' }
export const rowOf = (api, type, id) => (id ? (api[ROWS[type]] ?? []).find(r => r.id === id) ?? null : null)

// The entity of `type` the current screen is about.
export function screenEntity(api, type) {
  const s = api.screen ?? {}
  switch (type) {
    case 'topic': return rowOf(api, 'topic', s.topicId)
    case 'event': return rowOf(api, 'event', s.openEventId ?? s.editingEventId)
    case 'exam': return rowOf(api, 'exam', s.examId ?? s.nextExamId)
    case 'calendar': return rowOf(api, 'calendar', s.calendarId)
    case 'todo': return rowOf(api, 'todo', s.todoId)
    default: return null
  }
}

// The day the screen shows (calendar day/week view), else null.
export function screenDate(api) {
  const s = api.screen ?? {}
  return s.screen === 'calendar' && s.date ? s.date : null
}

// Most recent answer entity of `type` (newest answer first).
export function recentEntity(api, type) {
  for (const turn of api.recent ?? []) {
    for (const e of turn.entities ?? []) {
      if (e.type !== type) continue
      const row = rowOf(api, type, e.id)
      if (row) return row
    }
  }
  return null
}

export function recentDate(api) {
  for (const turn of api.recent ?? []) if (turn.date) return turn.date
  return null
}

// The thing "das" / "it" most likely means among `types`: what is on screen,
// else what the last answers showed. → { type, row, token, via } | null.
// `token` (@type:id) is exact and survives into a command.
export function contextRef(api, types) {
  for (const type of types) {
    const row = screenEntity(api, type)
    if (row) return { type, row, token: `@${type}:${row.id}`, via: 'screen' }
  }
  for (const turn of api.recent ?? []) {
    for (const e of turn.entities ?? []) {
      if (!types.includes(e.type)) continue
      const row = rowOf(api, e.type, e.id)
      if (row) return { type: e.type, row, token: `@${e.type}:${e.id}`, via: 'last' }
    }
  }
  return null
}

// A day the user points at: "an dem Tag", "this day", or the calendar day on screen.
const DAY_DEICTIC = /\b(an (?:dem|diesem) tag|dem tag|diesen tag|dieser tag|this day|that day|on that day|on this day|hier|da)\b/
export function contextDate(api, text) {
  if (DAY_DEICTIC.test(fold(text ?? ''))) return screenDate(api) ?? recentDate(api)
  const d = screenDate(api)
  return d && d !== api.today ? d : null
}

// Keys the index ranks first on a tie ("Brunch" while a brunch is on screen).
export function focusKeys(api) {
  const keys = new Set()
  const s = api.screen ?? {}
  if (s.topicId) keys.add(`topic:${s.topicId}`)
  if (s.openEventId) keys.add(`event:${s.openEventId}`)
  if (s.editingEventId) keys.add(`event:${s.editingEventId}`)
  if (s.nextExamId) keys.add(`exam:${s.nextExamId}`)
  for (const turn of (api.recent ?? []).slice(0, 2)) for (const e of turn.entities ?? []) keys.add(`${e.type}:${e.id}`)
  return keys
}

// One English line about the screen, for prompts. '' when nothing is known.
export function screenSummary(api) {
  const s = api.screen ?? {}
  if (!s.screen) return ''
  const parts = [`screen: ${s.screen}${s.view ? ` (${s.view} view)` : ''}`]
  if (s.date) parts.push(`showing ${s.date}${s.range?.to && s.range.to !== s.date ? ` to ${s.range.to}` : ''} (@screen)`)
  const topic = screenEntity(api, 'topic')
  if (topic) parts.push(`topic "${topic.name}" (@screen)`)
  const event = screenEntity(api, 'event')
  if (event) parts.push(`open entry "${event.title}" (@screen)`)
  const exam = screenEntity(api, 'exam')
  if (exam) parts.push(`next exam "${exam.title}" ${exam.exam_date ?? ''}`.trim())
  if (s.timeframe) parts.push(`timeframe ${s.timeframe}`)
  return parts.join(', ')
}

// One English line about the last answer, for prompts. '' when there is none.
export function recentSummary(api) {
  const turn = api.recent?.[0]
  if (!turn) return ''
  const names = (turn.entities ?? []).slice(0, 4).map(e => {
    const row = rowOf(api, e.type, e.id)
    return row ? `${e.type} "${row.title ?? row.text ?? row.name}"${e.date ? ` on ${e.date}` : ''}` : null
  }).filter(Boolean)
  const what = turn.intent ? `answered ${turn.intent}${turn.date ? ` for ${turn.date}` : ''}` : 'answered'
  return `last answer ${what}${names.length ? `; showed ${names.join(', ')} (@last = the first)` : ''}`
}

// `@screen` / `@last` / `@todo:<id>` → row, or null.
export function resolveToken(api, type, token) {
  const t = String(token ?? '').trim()
  if (t === '@screen' || t === '@this') return screenEntity(api, type)
  if (t === '@last' || t === '@it') return recentEntity(api, type)
  const m = t.match(/^@(\w+):(.+)$/)
  if (m && (m[1] === type || !REF_TYPES.includes(m[1]))) return rowOf(api, type, m[2])
  return null
}

// What `text` refers to. `named` is the row a name lookup already found.
// → { row, via: 'named' | 'screen' | 'last' } | null
export function resolveRef(api, type, text, named = null) {
  if (named) return { row: named, via: 'named' }
  if (String(text ?? '').startsWith('@')) {
    const row = resolveToken(api, type, text)
    return row ? { row, via: text.startsWith('@last') ? 'last' : 'screen' } : null
  }
  const empty = !String(text ?? '').trim() || isArticleOnly(text)
  if (!empty && !isDeictic(text)) return null
  const onScreen = screenEntity(api, type)
  if (onScreen) return { row: onScreen, via: 'screen' }
  const last = recentEntity(api, type)
  return last ? { row: last, via: 'last' } : null
}
