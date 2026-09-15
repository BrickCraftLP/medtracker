// Guided event creation: one question at a time, with selectors above the
// input (FlowComposer) for day, time, calendar, reminders and todo settings.
//
// Everything here is a pure state transition: (flow, input) → { flow } |
// { save } | { passthrough }. flows/index.js runs the async parts, the
// provider holds the state.
//
// Modes: 'guided' asks every step in turn; 'quick' (title, day and time were
// already given) goes straight to a review card that saves in one tap.

import { normalize } from '../engine/normalize.js'
import { extract, labelFrom } from '../engine/parse/index.js'
import { parseDuration } from '../engine/parse/durations.js'
import { matchScore } from '../engine/lexicon.js'
import { buildEvent, timeOf } from '../../utils/calendar/eventModel.js'
import { buildTodo } from '../../utils/calculations/todoPriorityCalcs.js'
import { overlapping, findAlternatives, occItem } from '../intents/calendar.js'
import { DONE, SKIP, YES, NO, newId, plain, looksLikeNewRequest } from './common.js'

export const REMINDER_CHOICES = [0, 5, 10, 30, 60, 24 * 60]

const GUIDED = ['title', 'date', 'time', 'conflict', 'location', 'calendar', 'reminder', 'askTodos']
const QUICK = ['title', 'date', 'time', 'conflict']
const OPTIONAL = ['location', 'calendar', 'reminder', 'askTodos']

// "… im Café Central" / "… at Starbucks" at the end of what is left after
// dates and times were taken out. Returns the place as the user typed it.
export function parseLocation(rest, raw) {
  const s = String(rest ?? '').replace(/\s+(ein|an|bitte|please)$/, '').trim()
  const m = s.match(/(?:^|\s)(?:im|in der|in dem|in|at the|at|@)\s+([a-z0-9][a-z0-9 .'&-]{1,40})$/)
  if (!m) return { location: null, rest }
  const words = m[1].trim().split(/\s+/)
  const key = w => normalize(w).replace(/[^a-z0-9]/g, '')
  const rawWords = String(raw ?? '').split(/\s+/)
  let location = m[1].trim()
  for (let i = 0; i + words.length <= rawWords.length; i++) {
    if (rawWords.slice(i, i + words.length).every((w, j) => key(w) === key(words[j]))) {
      location = rawWords.slice(i, i + words.length).join(' ').replace(/[?!.,;]+$/, '')
      break
    }
  }
  return { location, rest: s.slice(0, m.index).trim() }
}

const durationOf = d => (d.startMin != null && d.endMin != null && d.endMin > d.startMin ? d.endMin - d.startMin : d.kind === 'exam' ? 120 : 60)

export function startEventFlow(init, api) {
  const calendars = api.calendars ?? []
  const named = init.calendar
    ? calendars.map(c => ({ c, s: matchScore(init.calendar, c.name ?? '', { lang: api.lang }).score })).sort((a, b) => b.s - a.s)[0]
    : null
  const draft = {
    title: init.title ?? '',
    date: init.date ?? null,
    startMin: init.startMin ?? null,
    endMin: init.endMin ?? null,
    allDay: !!init.allDay,
    location: init.location ?? '',
    calendar_id: (named && named.s >= 0.5 ? named.c.id : null) ?? api.defaultCalendarId(),
    reminders: Array.isArray(init.reminders) ? init.reminders.map(Number).filter(n => Number.isFinite(n) && n >= 0) : [],
    kind: init.kind ?? 'event',
    topic_id: init.topic_id ?? null,
    notes: init.notes ?? '',
  }
  if (draft.startMin != null && (draft.endMin == null || draft.endMin <= draft.startMin)) {
    draft.endMin = Math.min(1439, draft.startMin + (Number(init.minutes) || durationOf({ kind: draft.kind })))
  }
  const quick = !!(draft.title && draft.date && (draft.startMin != null || draft.allDay))
  const flow = {
    id: newId(), rev: 0, type: 'event', mode: quick ? 'quick' : 'guided',
    step: null, forced: null, passed: {}, hint: null, alts: [], draft, todos: [],
    todoSettings: { due_date: draft.date, due_time: null, priority: null, topic_id: draft.topic_id },
  }
  if (calendars.length <= 1) flow.passed.calendar = true
  if (init.conflictOk) flow.passed.conflict = true
  const step = nextStep(flow, api)
  return { ...flow, step, alts: step === 'conflict' ? alternatives(flow, api) : [] }
}

function conflictsOf(flow, api) {
  const d = flow.draft
  if (d.allDay || d.startMin == null || !d.date) return []
  return overlapping(api, d.date, d.startMin, d.endMin)
}

function alternatives(flow, api) {
  const d = flow.draft
  const alt = findAlternatives(api, d.date, d.startMin, durationOf(d))
  return [
    ...alt.sameDay.map(s => ({ date: d.date, start: s.start, end: s.end })),
    ...alt.otherDays.map(x => ({ date: x.date, start: x.slots[0].start, end: x.slots[0].end })),
  ].slice(0, 5)
}

export function nextStep(flow, api) {
  if (flow.forced) return flow.forced
  const d = flow.draft
  for (const step of flow.mode === 'quick' ? QUICK : GUIDED) {
    if (step === 'title' && !d.title) return step
    if (step === 'date' && !d.date) return step
    if (step === 'time' && d.startMin == null && !d.allDay) return step
    if (step === 'conflict' && !flow.passed.conflict && conflictsOf(flow, api).length) return step
    if (OPTIONAL.includes(step) && !flow.passed[step]) return step
  }
  return flow.mode === 'quick' ? 'review' : 'save'
}

function advance(flow, api) {
  const f = { ...flow, hint: null }
  // A todo's default due date follows the event's day until the user changes it.
  if (f.todoSettings.due_date == null || f.todoSettings.due_date === flow.todoSettings.due_date) {
    f.todoSettings = { ...f.todoSettings, due_date: f.draft.date }
  }
  const step = nextStep(f, api)
  if (step === 'save') return { flow: { ...f, step }, save: true }
  return { flow: { ...f, step, rev: flow.rev + 1, alts: step === 'conflict' ? alternatives(f, api) : [] } }
}

const retry = (flow, hint) => ({ flow: { ...flow, hint, rev: flow.rev + 1 } })
const withDraft = (flow, patch) => ({ ...flow, draft: { ...flow.draft, ...patch } })
const pass = (flow, key, value = true) => ({ ...flow, passed: { ...flow.passed, [key]: value } })

// Time answer: "10-12", "um 15 Uhr", "10", "ganztägig", optionally with a day.
function parseWhen(text, flow, api) {
  const n = normalize(text)
  if (/\b(ganztaegig\w*|ganzer tag|den ganzen tag|ganztags|all day|allday|whole day)\b/.test(n)) return { allDay: true, startMin: null, endMin: null }
  if (/^\d{1,2}$/.test(n) && Number(n) < 24) {
    const s = Number(n) * 60
    return { startMin: s, endMin: Math.min(1439, s + durationOf(flow.draft)), allDay: false }
  }
  const x = extract(n, api.today)
  const date = x.date ?? null
  if (x.startMin == null) return date ? { date } : null
  const len = x.endMin != null && x.endMin > x.startMin ? x.endMin - x.startMin : x.minutes ?? durationOf(flow.draft)
  return { startMin: x.startMin, endMin: Math.min(1439, x.startMin + len), allDay: false, ...(date ? { date } : {}) }
}

function parseReminder(text) {
  const n = normalize(text)
  if (NO.test(plain(text)) || /\b(keine?|none|no reminder)\b/.test(n)) return []
  if (/\b(start|beginn|anfang|zum start|beim start|at start)\b/.test(n)) return [0]
  const day = n.match(/\b(\d+|ein|einen|one|a)?\s*(tag|tage|tagen|day|days)\b/)
  if (day) return [(/^\d+$/.test(day[1] ?? '') ? Number(day[1]) : 1) * 1440]
  const dur = parseDuration(n)
  if (dur) return [dur.minutes]
  if (/^\d+$/.test(n)) return [Number(n)]
  return null
}

function addTodo(flow, text, api) {
  const x = extract(normalize(text), api.today)
  const s = flow.todoSettings
  const todo = {
    text: x.date ? labelFrom(text, x.rest, ['bis', 'am', 'on', 'by', 'until', 'due', 'faellig', 'zum', 'fuer', 'for']) || text : text,
    due_date: x.date ?? s.due_date ?? flow.draft.date,
    due_time: s.due_time ?? null,
    priority: s.priority ?? null,
    topic_id: s.topic_id ?? api.findTopicIn(text)?.id ?? null,
  }
  return { flow: { ...flow, step: 'todos', forced: 'todos', todos: [...flow.todos, todo], hint: null, rev: flow.rev + 1 } }
}

export function answerEvent(flow, text, api) {
  const t = text.trim()
  const p = plain(t)
  const L = api.L

  // A question ("Was steht morgen an?") is a new request, even though it names a day.
  if (/\?\s*$/.test(t) && looksLikeNewRequest(t, api)) return { passthrough: true }

  switch (flow.step) {
    case 'title':
      if (looksLikeNewRequest(t, api)) return { passthrough: true }
      return advance(withDraft(flow, { title: t }), api)

    case 'date': {
      const w = parseWhen(t, flow, api)
      const x = extract(normalize(t), api.today)
      const date = w?.date ?? x.date ?? x.range?.from
      if (date) {
        const time = w && (w.startMin != null || w.allDay) ? { startMin: w.startMin, endMin: w.endMin, allDay: w.allDay } : {}
        return advance(withDraft(flow, { date, ...time }), api)
      }
      if (looksLikeNewRequest(t, api)) return { passthrough: true }
      return retry(flow, L('I didn\'t get the day — e.g. "tomorrow" or "Friday".', 'Den Tag habe ich nicht verstanden – z. B. „morgen“ oder „Freitag“.'))
    }

    case 'time':
    case 'conflict': {
      if (flow.step === 'conflict' && (YES.test(p) || /\b(trotzdem|anyway|behalten|keep)\b/.test(p))) return advance(pass(flow, 'conflict'), api)
      const w = parseWhen(t, flow, api)
      if (w && (w.startMin != null || w.allDay || w.date)) return advance(pass(withDraft(flow, w), 'conflict', !!w.allDay), api)
      if (looksLikeNewRequest(t, api)) return { passthrough: true }
      return retry(flow, L('I didn\'t get the time — e.g. "10-12" or "at 3pm".', 'Die Uhrzeit habe ich nicht verstanden – z. B. „10 bis 12“ oder „um 15 Uhr“.'))
    }

    case 'location': {
      const next = { ...flow, forced: flow.forced === 'location' ? null : flow.forced }
      if (SKIP.test(p)) return advance(pass(next, 'location'), api)
      if (looksLikeNewRequest(t, api)) return { passthrough: true }
      return advance(pass(withDraft(next, { location: t }), 'location'), api)
    }

    case 'calendar': {
      const best = (api.calendars ?? [])
        .map(c => ({ c, s: matchScore(t, c.name ?? '', { lang: api.lang }).score }))
        .sort((a, b) => b.s - a.s)[0]
      if (best && best.s >= 0.5) return advance(pass(withDraft(flow, { calendar_id: best.c.id }), 'calendar'), api)
      if (SKIP.test(p) || /^(weiter|next|ok|okay|standard|default)$/.test(p)) return advance(pass(flow, 'calendar'), api)
      if (looksLikeNewRequest(t, api)) return { passthrough: true }
      return retry(flow, L('Pick a calendar above.', 'Wähle oben einen Kalender.'))
    }

    case 'reminder': {
      if (/^(weiter|next|ok|okay|passt)$/.test(p)) return advance(pass(flow, 'reminder'), api)
      const r = parseReminder(t)
      if (r) return advance(pass(withDraft(flow, { reminders: r }), 'reminder'), api)
      if (looksLikeNewRequest(t, api)) return { passthrough: true }
      return retry(flow, L('Pick a reminder above, or type e.g. "30 min".', 'Wähle oben eine Erinnerung oder tippe z. B. „30 Min.“.'))
    }

    case 'askTodos':
      if (YES.test(p)) return advance({ ...pass(flow, 'askTodos'), forced: 'todos' }, api)
      if (NO.test(p) || SKIP.test(p)) return advance(pass(flow, 'askTodos'), api)
      if (looksLikeNewRequest(t, api)) return { passthrough: true }
      // Anything else already is the first todo.
      return addTodo(pass(flow, 'askTodos'), t, api)

    case 'todos':
      if (DONE.test(p) || NO.test(p)) return advance({ ...flow, forced: null }, api)
      if (looksLikeNewRequest(t, api, ['add_todo', 'add_event', 'check_overlap'])) return { passthrough: true }
      return addTodo(flow, t, api)

    case 'review': {
      if (/^(speicher\w*|save|ja|yes|ok|okay|passt|fertig|done)$/.test(p)) return { flow, save: true }
      const w = parseWhen(t, flow, api)
      if (w && (w.startMin != null || w.allDay || w.date)) return advance(pass(withDraft(flow, w), 'conflict', !!w.allDay), api)
      return { passthrough: true }
    }

    default:
      return { passthrough: true }
  }
}

export function eventAction(flow, action, payload, api) {
  switch (action) {
    case 'setDate': return advance(withDraft(flow, { date: payload }), api)
    case 'setTime': return advance(pass(withDraft(flow, { startMin: payload, endMin: Math.min(1439, payload + durationOf(flow.draft)), allDay: false }), 'conflict', false), api)
    case 'allDay': return advance(pass(withDraft(flow, { allDay: true, startMin: null, endMin: null }), 'conflict'), api)
    case 'pickAlt': {
      const alt = flow.alts[payload]
      return alt ? advance(pass(withDraft(flow, { date: alt.date, startMin: alt.start, endMin: alt.end }), 'conflict'), api) : { flow, silent: true }
    }
    case 'keep': return advance(pass(flow, 'conflict'), api)
    case 'setLocation': return advance(pass({ ...withDraft(flow, { location: payload }), forced: flow.forced === 'location' ? null : flow.forced }, 'location'), api)
    case 'skip': return advance(pass({ ...flow, forced: flow.forced === flow.step ? null : flow.forced }, flow.step), api)
    case 'setCalendar': {
      const f = withDraft(flow, { calendar_id: payload })
      return flow.step === 'calendar' ? advance(pass(f, 'calendar'), api) : { flow: f, silent: true }
    }
    case 'toggleReminder': {
      const r = flow.draft.reminders
      const next = payload == null ? [] : r.includes(payload) ? r.filter(m => m !== payload) : [...r, payload].sort((a, b) => a - b)
      return { flow: withDraft(flow, { reminders: next }), silent: true }
    }
    case 'next': return advance(pass(flow, flow.step), api)
    case 'todosYes': return advance({ ...pass(flow, 'askTodos'), forced: 'todos' }, api)
    case 'todosNo': return advance(pass(flow, 'askTodos'), api)
    case 'todoSetting': return { flow: { ...flow, todoSettings: { ...flow.todoSettings, ...payload } }, silent: true }
    case 'removeTodo': return { flow: { ...flow, todos: flow.todos.filter((_, i) => i !== payload) }, silent: true }
    case 'done': return advance({ ...flow, forced: null }, api)
    case 'addLocation': return advance({ ...flow, forced: 'location' }, api)
    case 'addTodos': return advance({ ...flow, forced: 'todos' }, api)
    case 'save': return { flow, save: true }
    case 'enter': return enter(flow, api)
    default: return { flow, silent: true }
  }
}

// Enter on an empty input: the obvious "go on" for the current step.
function enter(flow, api) {
  switch (flow.step) {
    case 'location':
    case 'calendar':
    case 'reminder': return eventAction(flow, 'skip', null, api)
    case 'askTodos': return eventAction(flow, 'todosNo', null, api)
    case 'todos': return eventAction(flow, 'done', null, api)
    case 'conflict': return eventAction(flow, 'keep', null, api)
    case 'review': return { flow, save: true }
    default: return retry(flow, api.L('Please answer the question above.', 'Bitte beantworte die Frage oben.'))
  }
}

export function eventQuestion(flow, api) {
  const d = flow.draft
  const L = api.L
  const Q = {
    title: L('What is it called?', 'Wie soll der Termin heißen?'),
    date: L(`Which day is “${d.title}”?`, `An welchem Tag ist „${d.title}“?`),
    time: L('What time? (e.g. "10-12", or all day)', 'Um wie viel Uhr? (z. B. „10 bis 12“ oder ganztägig)'),
    conflict: L('⚠️ That overlaps. Pick another time above, type one — or keep it.', '⚠️ Das überschneidet sich. Andere Zeit oben wählen, eintippen – oder trotzdem behalten.'),
    location: L('Where? Type a place — or skip.', 'Wo? Ort eintippen – oder überspringen.'),
    calendar: L('Which calendar?', 'In welchen Kalender?'),
    reminder: L('Reminder? Pick above, then “Next”.', 'Erinnerung? Oben auswählen, dann „Weiter“.'),
    askTodos: L('Add todos to it?', 'Todos dazu anlegen?'),
    todos: L('Type one todo per message. Due date, priority and topic are set above. Tap “Done” when finished.', 'Schreib ein Todo pro Nachricht. Fälligkeit, Priorität und Topic stellst du oben ein. „Fertig“, wenn du fertig bist.'),
    review: L('All good? Save — or add a place or todos.', 'Passt alles? Speichern – oder noch Ort oder Todos ergänzen.'),
  }
  const blocks = [{ type: 'eventPreview', data: { flowId: flow.id, rev: flow.rev, draft: d, todos: flow.todos } }]
  if (flow.step === 'conflict') {
    blocks.push({ type: 'events', data: { items: conflictsOf(flow, api).map(o => occItem(o)), label: L('Overlaps with', 'Überschneidet sich mit') } })
  }
  const q = Q[flow.step] ?? ''
  blocks.push({ type: 'text', data: { text: flow.hint ? `${flow.hint}\n${q}` : q } })
  return { title: d.title || L('New event', 'Neuer Termin'), blocks }
}

export async function saveEvent(flow, api) {
  const d = flow.draft
  const start = d.allDay ? null : d.startMin ?? 9 * 60
  const end = d.allDay ? null : Math.max(start + 5, d.endMin ?? start + 60)
  const saved = await api.upsertEvent(buildEvent({}, {
    calendar_id: d.calendar_id ?? api.defaultCalendarId(),
    kind: d.kind,
    title: d.title || api.L('Untitled', 'Ohne Titel'),
    start_date: d.date ?? api.today,
    end_date: d.date ?? api.today,
    all_day: !!d.allDay,
    start_time: d.allDay ? null : timeOf(start),
    end_time: d.allDay ? null : timeOf(end),
    location: d.location || null,
    notes: d.notes || null,
    reminders: d.reminders,
    topic_id: d.kind === 'study' || d.kind === 'exam' ? d.topic_id : null,
    planned_minutes: d.allDay ? null : end - start,
  }))

  let ids = []
  if (flow.todos.length) {
    const rows = flow.todos.map((td, i) => buildTodo({ id: newId(), completed: false }, {
      text: td.text,
      due_date: td.due_date,
      due_time: td.due_time,
      priority: td.priority ?? undefined,
      topic_id: td.topic_id ?? null,
      event_id: saved.id,
      sort_order: i + 1,
    }))
    const out = await api.upsertTodos(rows)
    ids = (out?.length ? out : rows).map(r => r.id)
  }

  return {
    title: api.L('Added to calendar', 'Eingetragen'),
    blocks: [{ type: 'saved', data: { eventId: saved.id } }, ...(ids.length ? [{ type: 'todos', data: { ids } }] : [])],
    followups: [api.L(`What's on ${saved.start_date}?`, `Was steht am ${saved.start_date} an?`)],
  }
}
