// Look things up by name across calendar entries, todos and exams, in German
// and English: "when do I have chemistry next?" finds "Einführung in die
// Chemie NP". When nothing matches and a local model is on, it supplies
// translations for words the built-in vocabulary does not know.

import { registerIntent } from '../engine/registry.js'
import { slot } from '../engine/schema.js'
import { extract } from '../engine/parse/index.js'
import { fmtMin } from '../engine/parse/times.js'
import { matchScore, searchWords } from '../engine/lexicon.js'
import { addDays, parseDayKey } from '../../utils/calendar/eventModel.js'
import { expandRange } from '../../utils/calendar/recurrence.js'
import { occItem } from './calendar.js'
import { countdown } from './overview.js'

// Words that belong to the question, not to what is searched for.
export const QUESTION_WORDS = new Set(`
wann when wo where was what welche welcher which habe hab have has had ich i do does did is ist sind are war was werde will kann can could koennte soll should
my mein meine meinen meiner meinem the das der die den dem naechste naechsten naechster naechstes next mal time times wieder again als as
kommt findet statt dran beginnt starts start event study todo und and an am on zu zum zur for fuer upcoming kommende kommenden schon noch denn eigentlich
bitte please find finde such suche search look show zeig zeige mir me alles all everything about ueber nach in im of von it es there gibt a ein eine einen einem einer
welchen welchem tagen tage tag days day immer usually meistens normalerweise
`.trim().split(/\s+/))

export const queryOf = rest => searchWords(rest).filter(w => !QUESTION_WORDS.has(w)).join(' ')

const nowMinutes = api => { const d = api.now?.() ?? new Date(); return d.getHours() * 60 + d.getMinutes() }
const byStart = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.startMin ?? 0) - (b.startMin ?? 0))

function eventHay(api, e) {
  const cal = api.calendars?.find(c => c.id === e.calendar_id)?.name ?? ''
  const topic = e.topic_id ? api.topics.find(t => t.id === e.topic_id)?.name ?? '' : ''
  return `${e.title ?? ''} ${e.notes ?? ''} ${e.location ?? ''} ${cal} ${topic} ${e.kind === 'exam' ? 'pruefung exam' : ''}`
}

function todoHay(api, td) {
  const topic = td.topic_id ? api.topics.find(t => t.id === td.topic_id)?.name ?? '' : ''
  const ev = td.event_id ? api.events.find(e => e.id === td.event_id)?.title ?? '' : ''
  return `${td.text ?? ''} ${td.notes ?? ''} ${topic} ${ev}`
}

export function searchAll(api, query, { from, to, extraTerms = [] }) {
  const opts = { lang: api.lang, extraTerms }
  const via = new Set()
  const scoreOf = hay => {
    const r = matchScore(query, hay, opts)
    if (r.score >= 0.5) r.via.forEach(v => via.add(v))
    return r.score
  }
  const eventHit = new Map()
  // The index names the series that can match at all; only those get expanded.
  // Translated terms (extraTerms) may reach rows the query words do not.
  const allowed = extraTerms.length ? null : new Set(api.index().candidates(query, ['event']).map(e => e.id))
  const occ = (allowed ? expandRange(api.events.filter(e => allowed.has(e.id) || allowed.has(e.recurrence_parent_id)), from, to) : api.occurrences(from, to)).filter(o => {
    if (!eventHit.has(o.event.id)) eventHit.set(o.event.id, scoreOf(eventHay(api, o.event)) >= 0.5)
    return eventHit.get(o.event.id)
  })
  const todos = api.todos.filter(td => scoreOf(todoHay(api, td)) >= 0.5 || (td.event_id && eventHit.get(td.event_id)))
  const exams = api.exams.filter(x => scoreOf(`${x.title ?? ''} pruefung exam`) >= 0.5)
  return { occ, todos, exams, via: [...via] }
}

const empty = r => !r.occ.length && !r.todos.length && !r.exams.length

// Local vocabulary first; the on-device model only when that finds nothing.
async function withTranslation(api, query, run) {
  const first = run([])
  if (!empty(first)) return first
  try {
    const { translateTerms } = await import('../llm/index.js')
    const terms = await translateTerms(searchWords(query), api.lang)
    if (terms.length) return run(terms)
  } catch (e) {
    console.warn('[assistant] translate', e)
  }
  return first
}

const viaNote = (api, res, query) => {
  const words = new Set(searchWords(query))
  const v = res.via.find(x => !words.has(x))
  return v ? api.L(` (matched “${v}”)`, ` (gefunden über „${v}“)`) : ''
}

export const FREQ = { DAILY: ['daily', 'täglich'], WEEKLY: ['weekly', 'wöchentlich'], MONTHLY: ['monthly', 'monatlich'], YEARLY: ['yearly', 'jährlich'] }

// ── Next time / on which days something happens ────────────────────────────

const NEXT = /\b(naechste[nsrm]?|next|wieder|again|als naechstes)\b/
const DAYS = /\b(an welchen tagen|an welchem tag|welche[nm]? tagen?|on which days?|which days?|what days?)\b/
const WHEN_HAVE = /^(?:und |and )?(?:wann|when)\s+(?:habe?|hab|have|do i have|is|ist|sind|are)\b/

// "An welchen Tagen habe ich Chemie?" — every date in the span, summed up as
// weekday + time per entry ("Mittwoch 08:15–09:45 — Chemie (4×)").
async function daysAnswer(api, q, slots) {
  const from = slots.from ?? api.today
  const to = slots.to ?? addDays(from, 27)
  const res = await withTranslation(api, q, extraTerms => searchAll(api, q, { from, to, extraTerms }))
  const occ = [...res.occ].sort(byStart)
  const todos = res.todos.filter(td => !td.completed)
  const todoBlock = todos.length ? [{ type: 'todos', data: { ids: todos.slice(0, 10).map(td => td.id) } }] : []
  const span = `${api.fmtDay(from)} – ${api.fmtDay(to)}`

  if (!occ.length) {
    return { title: `„${q}“`, blocks: [{ type: 'text', data: { text: api.L(`Nothing for “${q}” between ${span}.`, `Nichts zu „${q}“ zwischen ${span}.`) } }, ...todoBlock] }
  }

  const locale = api.lang === 'en' ? 'en-US' : 'de-AT'
  const pattern = new Map()
  for (const o of occ) {
    const key = JSON.stringify([
      o.event.title || q,
      parseDayKey(o.date).toLocaleDateString(locale, { weekday: 'long' }),
      o.allDay ? '' : `${fmtMin(o.startMin)}–${fmtMin(o.endMin)}`,
    ])
    pattern.set(key, (pattern.get(key) ?? 0) + 1)
  }
  const lines = [...pattern].slice(0, 8).map(([key, n]) => {
    const [title, day, time] = JSON.parse(key)
    return `• ${day}${time ? ` ${time}` : ''} — ${title}${n > 1 ? ` (${n}×)` : ''}`
  })
  const one = occ.length === 1
  const head = api.L(
    `${occ.length} ${one ? 'date' : 'dates'} between ${span}${viaNote(api, res, q)}:`,
    `${occ.length} ${one ? 'Termin' : 'Termine'} zwischen ${span}${viaNote(api, res, q)}:`,
  )
  const titles = new Set(occ.map(o => o.event.title))
  return {
    title: titles.size === 1 ? occ[0].event.title : `„${q}“`,
    blocks: [
      { type: 'text', data: { text: [head, ...lines].join('\n') } },
      { type: 'events', data: { items: occ.slice(0, 12).map(o => occItem(o, true)) } },
      ...todoBlock,
    ],
    followups: [api.L(`When do I have ${q} next?`, `Wann habe ich das nächste Mal ${q}?`)],
  }
}

registerIntent({
  id: 'next_occurrence',
  describe: 'When / on which days the user has a calendar entry matching a name or subject (searches titles, notes, places, calendars and topics in German and English), with related todos',
  slots: {
    query: slot('text', 'words to search for, e.g. "chemistry"', { required: true, primary: true }),
    mode: slot('enum:next|days', 'next = the next time, days = every date in a span'), from: slot('date', 'span start'), to: slot('date', 'span end'),
  },
  examples: ['When do I have chemistry next?', 'An welchen Tagen habe ich Chemie?'],
  completions: {
    de: ['Wann habe ich das nächste Mal {event}?', 'An welchen Tagen habe ich {event}?', 'Wann ist die nächste {event}?'],
    en: ['When do I have {event} next?', 'On which days do I have {event}?'],
  },
  match(text, { today, api }) {
    if (/\b(zeit|frei|free|platz|todo|gelernt|geuebt|zuletzt|studied)\b/.test(text)) return null
    const days = DAYS.test(text)
    const next = NEXT.test(text)
    const whenHave = WHEN_HAVE.test(text)
    if (!days && !next && !whenHave) return null
    const x = extract(text, today)
    if (!days && (x.date || x.range)) return null
    const query = queryOf(x.rest)
    if (!query || query === 'exam') return null
    if (days) return { score: 0.96, slots: { query, mode: 'days', from: x.range?.from ?? x.date ?? null, to: x.range?.to ?? x.date ?? null } }
    const asks = /\b(wann|when|wo|where)\b/.test(text) || /^(?:mein\w* |my |die |der |das |the )?(?:naechste[nsrm]?|next)\b/.test(text)
    if (next && asks) return { score: 0.96, slots: { query, mode: 'next' } }
    // Plain "Wann habe ich Chemie?" — only when an entry by that name exists,
    // otherwise it stays a free-time question.
    if (whenHave && api && searchAll(api, query, { from: today, to: addDays(today, 60) }).occ.length) {
      return { score: 0.97, slots: { query, mode: 'days' } }
    }
    return null
  },
  async execute(slots, api) {
    const q = String(slots.query ?? '').trim()
    if (slots.mode === 'days') return daysAnswer(api, q, slots)
    const nowMin = nowMinutes(api)
    const res = await withTranslation(api, q, extraTerms => searchAll(api, q, { from: api.today, to: addDays(api.today, 365), extraTerms }))
    const upcoming = res.occ.filter(o => o.date > api.today || o.allDay || o.endMin > nowMin).sort(byStart)
    const todos = res.todos.filter(td => !td.completed)
    const todoBlock = todos.length ? [{ type: 'todos', data: { ids: todos.slice(0, 10).map(td => td.id) } }] : []

    if (!upcoming.length) {
      const past = searchAll(api, q, { from: addDays(api.today, -365), to: addDays(api.today, -1) }).occ.sort(byStart).pop()
      const text = api.L(`Nothing upcoming for “${q}”.`, `Nichts Kommendes zu „${q}“.`)
        + (past ? api.L(` Last time: ${past.event.title}, ${api.fmtDay(past.date)}.`, ` Zuletzt: ${past.event.title}, ${api.fmtDay(past.date)}.`) : '')
      return { title: `„${q}“`, blocks: [{ type: 'text', data: { text } }, ...todoBlock] }
    }

    const first = upcoming[0]
    const e = first.event
    const when = first.allDay ? api.fmtDay(first.date) : `${api.fmtDay(first.date)}, ${fmtMin(first.startMin)}–${fmtMin(first.endMin)}`
    const lines = [`${e.title || q} ${countdown(api, first.date, first.allDay ? 0 : first.startMin)} (${when})${viaNote(api, res, q)}`]
    const freq = String(e.rrule ?? '').match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/)?.[1]
    if (freq) lines.push(api.L(`🔁 Repeats ${FREQ[freq][0]}`, `🔁 Wiederholt sich ${FREQ[freq][1]}`))
    if (e.location) lines.push(`📍 ${e.location}`)

    return {
      title: e.title || q,
      blocks: [
        { type: 'text', data: { text: lines.join('\n') } },
        { type: 'events', data: { items: upcoming.slice(0, 3).map(o => occItem(o, true)) } },
        ...todoBlock,
      ],
      followups: [api.L(`Find everything about ${q}`, `Suche alles zu ${q}`)],
    }
  },
})

// ── Search everything ──────────────────────────────────────────────────────

registerIntent({
  id: 'search_all',
  describe: 'Find calendar entries, todos and exams by words in their title, notes, place, calendar or topic (German and English)',
  slots: { query: slot('text', 'search words', { required: true, primary: true }) },
  examples: ['Find dentist appointment', 'Suche alles zu Chemie'],
  completions: {
    de: ['Suche {title}', 'Wann ist {event}?', 'Zeig mir alles zu {topic}'],
    en: ['Find {title}', 'When is {event}?', 'Show me everything about {topic}'],
  },
  match(text, { today }) {
    const m = text.match(/\b(?:find|search(?: for)?|look for|look up|suche?(?: nach)?|finde?|zeig(?:e)? mir(?: alles)?(?: zu| ueber| von)?|show me(?: everything)?(?: about| for| on)?|alles (?:zu|ueber)|everything (?:about|on)|where is|wo ist|when is|when'?s|wann ist|wann war|when was|todo (?:zu|fuer|for|about))\b\s+(.+)$/)
    if (!m) return null
    // Dates are no search words ("Zeig meine Aufgaben für morgen" is a todo list).
    const query = queryOf(extract(m[1], today).rest)
    return query ? { score: 0.85, slots: { query } } : null
  },
  async execute(slots, api) {
    const q = String(slots.query ?? '').trim()
    const res = await withTranslation(api, q, extraTerms => searchAll(api, q, { from: addDays(api.today, -365), to: addDays(api.today, 365), extraTerms }))

    // One row per event: the next upcoming occurrence, else the latest past one.
    const byEvent = new Map()
    for (const o of res.occ) {
      const prev = byEvent.get(o.event.id)
      const better = !prev || (o.date >= api.today && (prev.date < api.today || o.date < prev.date)) || (prev.date < api.today && o.date < api.today && o.date > prev.date)
      if (better) byEvent.set(o.event.id, o)
    }
    const items = [...byEvent.values()]
      .sort((a, b) => ((a.date >= api.today) === (b.date >= api.today) ? (a.date < b.date ? -1 : 1) : a.date >= api.today ? -1 : 1))
      .slice(0, 20)
      .map(o => occItem(o, true))
    const todos = [...res.todos].sort((a, b) => Number(!!a.completed) - Number(!!b.completed)).slice(0, 15)

    const blocks = []
    const note = viaNote(api, res, q)
    if (note) blocks.push({ type: 'text', data: { text: note.trim() } })
    if (res.exams.length) blocks.push({ type: 'text', data: { text: res.exams.map(x => `🎓 ${x.title} — ${x.exam_date ? api.fmtDay(x.exam_date) : '?'}`).join('\n') } })
    if (items.length) blocks.push({ type: 'events', data: { items } })
    if (todos.length) blocks.push({ type: 'todos', data: { ids: todos.map(td => td.id) } })
    if (empty(res)) blocks.push({ type: 'text', data: { text: api.L(`Nothing found for “${q}”.`, `Nichts gefunden für „${q}“.`) } })
    return { title: api.L(`Results for “${q}”`, `Ergebnisse für „${q}“`), blocks }
  },
})
