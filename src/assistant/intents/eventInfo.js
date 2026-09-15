// Details of calendar entries: where one is, when it starts or ends, how long
// it takes, its notes, calendar, how often it repeats and how many dates are
// left — "Wo muss ich in Genetik hin?", "Wann endet Chemie?", "Wie lange geht
// Physik morgen?". Plus the first / last entry of a day ("Wann bin ich morgen
// fertig?"). Finding entries by name reuses search.js (German and English).

import { registerIntent } from '../engine/registry.js'
import { extract } from '../engine/parse/index.js'
import { fmtMin, fmtDuration } from '../engine/parse/times.js'
import { searchWords } from '../engine/lexicon.js'
import { addDays } from '../../utils/calendar/eventModel.js'
import { occItem } from './calendar.js'
import { countdown } from './overview.js'
import { searchAll, QUESTION_WORDS, FREQ } from './search.js'

const WHEN = /\b(wann|when|um wie ?viel uhr|what time|bis wann|ab wann|until when)\b/

// [field, pattern, needs a when-word]. First hit wins, so the specific ones come first.
const FIELDS = [
  ['count', /\b(wie ?viele|how many)\b/, false],
  ['duration', /\b(wie lange?|how long|dauer|dauert|duration)\b/, false],
  ['recurrence', /\b(wie oft|how often|wiederholt\w*|repeats?|jede woche|jeden \w+tag|every week)\b/, false],
  ['notes', /\b(notiz\w*|beschreibung|notes?|details|description)\b/, false],
  ['calendar', /\b(welche[mnrs]? kalender|which calendar|in what calendar|kalender ist)\b/, false],
  ['location', /\b(wo|wohin|where|raum|room|hoersaal|saal|ort|adresse|address|location|standort|gebaeude|building)\b/, false],
  ['end', /\b(endet|enden|ende|aus|vorbei|ends?|finish(?:es)?|over|bis wann|until when)\b/, true],
  ['start', /\b(beginnt|beginn|beginnen|faengt|anfang|startet|starten|starts?|begins?|los|statt|take place)\b/, true],
]

// Words that belong to the question about a field, never to the entry's name.
const FIELD_WORDS = new Set(`
wo wohin hin hingehen gehen muss muessen musst sein raum room hoersaal saal ort adresse address location place standort gebaeude building
beginnt beginn beginnen faengt fangt anfang startet starten start starts begin begins los statt take takes endet enden ende aus vorbei ends end
finish finishes finished over bis wie lange lang long how dauer dauert geht gehts duration notiz notizen beschreibung notes note details
description kalender calendar welcher welchem oft often wiederholt wiederholen repeat repeats repeated jede jeden every woche week weekly
woechentlich viele wieviele many uhr um viel need go genau exactly eigentlich today tomorrow overmorrow heute morgen noch left
`.trim().split(/\s+/))

const nowMinutes = api => { const d = api.now?.() ?? new Date(); return d.getHours() * 60 + d.getMinutes() }
const byStart = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : (a.startMin ?? 0) - (b.startMin ?? 0))

export function fieldOf(text) {
  const when = WHEN.test(text)
  // "Wann findet Genetik statt?" asks for the time, not the place.
  if (when && /\b(statt|take place)\b/.test(text)) return 'start'
  for (const [field, re, needsWhen] of FIELDS) {
    if (re.test(text) && (!needsWhen || when)) return field
  }
  return null
}

const queryFor = rest => searchWords(rest).filter(w => !QUESTION_WORDS.has(w) && !FIELD_WORDS.has(w)).join(' ')

function spanOf(x, today) {
  if (x.date) return { from: x.date, to: x.date, explicit: true }
  if (x.range) return { from: x.range.from, to: x.range.to, explicit: true }
  return { from: today, to: addDays(today, 60), explicit: false }
}

registerIntent({
  id: 'event_info',
  describe: 'A detail of a calendar entry found by name: where it is (place/room), when it starts or ends, how long it takes, its notes, calendar, how often it repeats, or how many dates are left',
  slots: {
    query: 'words from the entry name, e.g. "genetics"',
    field: 'location|start|end|duration|notes|calendar|recurrence|count',
    from: 'YYYY-MM-DD optional', to: 'YYYY-MM-DD optional',
  },
  examples: ['Where do I need to be for genetics?', 'Wo muss ich in Genetik hin?'],
  completions: {
    de: ['Wo muss ich in {event} hin?', 'In welchem Raum ist {event}?', 'Wann endet {event}?', 'Wie lange geht {event}?'],
    en: ['Where is {event}?', 'Which room is {event} in?', 'When does {event} end?', 'How long is {event}?'],
  },
  match(text, { today, api }) {
    if (!api || /\btodo\b/.test(text)) return null
    if (/\b(zeit|frei|free|platz|luft|available)\b/.test(text)) return null
    if (/\b(gelernt|geuebt|studied|zuletzt|accuracy|genauigkeit)\b/.test(text)) return null
    if (/^(?:bitte )?(add|create|new|neue?[nrs]?|trag\w*|erstell\w*|leg\w*|loesch\w*|delete|remove|cancel|verschieb\w*|verleg\w*|move|aender\w*|change|rename|benenn\w*)\b/.test(text)) return null
    let field = fieldOf(text)
    if (!field) return null
    // "Wie lange noch bis zur Prüfung?" is a countdown, not a duration.
    if (field === 'duration' && /\b(noch|bis zu\w*|until|left|till)\b/.test(text)) return null
    const x = extract(text, today)
    const query = queryFor(x.rest)
    if (!query || query === 'study' || query === 'event' || (field === 'count' && query === 'exam')) return null
    const span = spanOf(x, today)
    const found = searchAll(api, query, span).occ.length > 0
      || (!span.explicit && searchAll(api, query, { from: addDays(today, -120), to: addDays(today, -1) }).occ.length > 0)
    return { score: found ? 0.98 : 0.55, slots: { query, field, from: span.explicit ? span.from : null, to: span.explicit ? span.to : null } }
  },
  execute(slots, api) {
    const q = String(slots.query ?? '').trim()
    const field = slots.field || 'location'
    const explicit = !!slots.from
    const from = slots.from || api.today
    const to = slots.to || (explicit ? from : addDays(api.today, 60))
    const nowMin = nowMinutes(api)
    const res = searchAll(api, q, { from, to })
    let list = res.occ
      .filter(o => explicit || o.date > api.today || (o.date === api.today && (o.allDay || o.endMin > nowMin)))
      .sort(byStart)
    let past = false
    if (!list.length && !explicit && !['start', 'end', 'count'].includes(field)) {
      list = searchAll(api, q, { from: addDays(api.today, -120), to: addDays(api.today, -1) }).occ.sort(byStart).reverse()
      past = list.length > 0
    }

    if (!list.length) {
      const exam = res.exams.find(x => x.exam_date && x.exam_date >= api.today)
      if (exam && (field === 'start' || field === 'location')) {
        return { title: exam.title, blocks: [{ type: 'text', data: { text: `🎓 ${exam.title} — ${api.fmtDay(exam.exam_date)} (${countdown(api, exam.exam_date, 0)})` } }] }
      }
      return {
        title: `„${q}“`,
        blocks: [{ type: 'text', data: { text: api.L(`No calendar entry matching “${q}” found.`, `Keinen Kalendereintrag zu „${q}“ gefunden.`) } }],
        followups: [api.L(`Find everything about ${q}`, `Suche alles zu ${q}`)],
      }
    }

    const first = list[0]
    const e = first.event
    const title = e.title || q
    const day = o => api.fmtDay(o.date)
    const span = o => (o.allDay ? api.L('all day', 'ganztägig') : `${fmtMin(o.startMin)}–${fmtMin(o.endMin)}`)
    const running = o => o.date === api.today && !o.allDay && o.startMin <= nowMin && o.endMin > nowMin
    const lastNote = past ? api.L(' (last time — nothing upcoming)', ' (zuletzt — nichts Kommendes)') : ''
    let text
    let items = [occItem(first, true)]

    switch (field) {
      case 'location': {
        // One line per distinct entry + place, so "Genetik VO" and "Genetik Übung" in different rooms both show.
        const seen = new Set()
        const rows = []
        for (const o of list) {
          const key = `${o.event.title}|${o.event.location ?? ''}`
          if (seen.has(key)) continue
          seen.add(key)
          rows.push(o)
          if (rows.length >= 4) break
        }
        const withPlace = rows.filter(o => o.event.location)
        if (!withPlace.length) {
          text = api.L(
            `No place saved for “${title}” (${past ? 'last' : 'next'}: ${day(first)}, ${span(first)}). Tap the entry to add one.`,
            `Für „${title}“ ist kein Ort gespeichert (${past ? 'zuletzt' : 'nächstes Mal'}: ${day(first)}, ${span(first)}). Tippe auf den Eintrag, um einen hinzuzufügen.`,
          )
        } else {
          text = withPlace.map(o => `📍 ${o.event.location} — ${o.event.title || q} · ${day(o)}, ${span(o)}`).join('\n') + lastNote
          items = withPlace.map(o => occItem(o, true))
        }
        break
      }
      case 'start':
        text = first.allDay
          ? api.L(`${title} is all day on ${day(first)}.`, `${title} ist am ${day(first)} ganztägig.`)
          : running(first)
            ? api.L(`${title} started at ${fmtMin(first.startMin)} and is running now (until ${fmtMin(first.endMin)}).`, `${title} hat um ${fmtMin(first.startMin)} begonnen und läuft gerade (bis ${fmtMin(first.endMin)}).`)
            : api.L(`${title} starts ${day(first)} at ${fmtMin(first.startMin)} (${countdown(api, first.date, first.startMin)}).`, `${title} beginnt am ${day(first)} um ${fmtMin(first.startMin)} (${countdown(api, first.date, first.startMin)}).`)
        break
      case 'end':
        text = first.allDay
          ? api.L(`${title} is all day on ${day(first)}.`, `${title} ist am ${day(first)} ganztägig.`)
          : running(first)
            ? api.L(`${title} is running now and ends at ${fmtMin(first.endMin)} (in ${fmtDuration(first.endMin - nowMin, 'en')}).`, `${title} läuft gerade und endet um ${fmtMin(first.endMin)} (in ${fmtDuration(first.endMin - nowMin, 'de')}).`)
            : api.L(`${title} ends ${day(first)} at ${fmtMin(first.endMin)} (${span(first)}).`, `${title} endet am ${day(first)} um ${fmtMin(first.endMin)} (${span(first)}).`)
        break
      case 'duration':
        text = first.allDay
          ? api.L(`${title} is all day on ${day(first)}.`, `${title} ist am ${day(first)} ganztägig.`)
          : api.L(`${title} takes ${fmtDuration(first.endMin - first.startMin, 'en')} (${day(first)}, ${span(first)}).`, `${title} dauert ${fmtDuration(first.endMin - first.startMin, 'de')} (${day(first)}, ${span(first)}).`) + lastNote
        break
      case 'notes':
        text = e.notes?.trim()
          ? `📝 ${e.notes.trim()}`
          : api.L(`No notes saved for “${title}”.`, `Für „${title}“ sind keine Notizen gespeichert.`)
        break
      case 'calendar': {
        const cal = api.calendars?.find(c => c.id === e.calendar_id)
        text = cal
          ? api.L(`${title} is in the calendar “${cal.name}”.`, `${title} ist im Kalender „${cal.name}“.`)
          : api.L(`${title} is in no named calendar.`, `${title} ist in keinem benannten Kalender.`)
        break
      }
      case 'recurrence': {
        const freq = String(e.rrule ?? '').match(/FREQ=(DAILY|WEEKLY|MONTHLY|YEARLY)/)?.[1]
        const soon = list.filter(o => o.event.id === e.id && o.date <= addDays(api.today, 27)).length
        text = freq
          ? api.L(`🔁 ${title} repeats ${FREQ[freq][0]} — ${soon} dates in the next 4 weeks.`, `🔁 ${title} wiederholt sich ${FREQ[freq][1]} — ${soon} Termine in den nächsten 4 Wochen.`)
          : api.L(`${title} does not repeat. ${list.length} matching dates coming up.`, `${title} wiederholt sich nicht. ${list.length} passende Termine stehen an.`)
        break
      }
      case 'count': {
        const dates = new Set(list.map(o => `${o.event.id}|${o.date}`)).size
        text = api.L(
          `${dates} ${dates === 1 ? 'date' : 'dates'} for “${q}” between ${api.fmtDay(from)} and ${api.fmtDay(to)}. Next: ${day(first)}, ${span(first)}.`,
          `${dates} ${dates === 1 ? 'Termin' : 'Termine'} zu „${q}“ zwischen ${api.fmtDay(from)} und ${api.fmtDay(to)}. Nächster: ${day(first)}, ${span(first)}.`,
        )
        items = list.slice(0, 6).map(o => occItem(o, true))
        break
      }
      default:
        text = `${title} — ${day(first)}, ${span(first)}${e.location ? ` · 📍 ${e.location}` : ''}`
    }

    return {
      title,
      blocks: [{ type: 'text', data: { text } }, { type: 'events', data: { items } }],
      followups: [
        field !== 'location' ? api.L(`Where is ${q}?`, `Wo ist ${q}?`) : api.L(`When does ${q} end?`, `Wann endet ${q}?`),
        api.L(`On which days do I have ${q}?`, `An welchen Tagen habe ich ${q}?`),
      ],
    }
  },
})

// ── First / last entry of a day ────────────────────────────────────────────

const LESSON = /\b(event|vorlesung|kurs|class|lecture|seminar|uebung|praktikum|lab)\b/
const FIRST = /\b(wann (?:muss ich (?:los|aus dem haus|anfangen|starten)|faengt mein tag an|beginnt mein tag|startet mein tag)|when do i (?:start|have to leave)|when does my day start)\b/
const LAST = /\b(wann bin ich (?:\w+ )?(?:fertig|durch|aus)|when am i (?:\w+ )?(?:done|finished|through)|when does my day end|wann endet mein tag|wann ist mein tag (?:vorbei|zu ende))\b/

registerIntent({
  id: 'day_bounds',
  describe: 'The first and/or last calendar entry of a day: when the day starts or when the user is done',
  slots: { date: 'YYYY-MM-DD optional', mode: '"first", "last" or "both"' },
  examples: ['When am I done tomorrow?', 'Wann ist morgen mein erster Termin?'],
  completions: {
    de: ['Wann bin ich {day} fertig?', 'Was ist {day} mein erster Termin?'],
    en: ['When am I done {day}?', 'What is my first class {day}?'],
  },
  match(text, { today }) {
    if (/\btodo\b/.test(text)) return null
    const first = FIRST.test(text) || (/\b(erste[nrms]?|first|frueheste[nrms]?|earliest)\b/.test(text) && LESSON.test(text))
    const last = LAST.test(text) || (/\b(letzte[nrms]?|last|spaeteste[nrms]?)\b/.test(text) && LESSON.test(text) && !/\b(war|was|gewesen)\b/.test(text))
    if (!first && !last) return null
    const x = extract(text, today)
    return { score: 0.92, slots: { date: x.date ?? x.range?.from ?? null, mode: first && last ? 'both' : first ? 'first' : 'last' } }
  },
  execute(slots, api) {
    const date = slots.date || api.today
    const timed = api.occurrences(date, date).filter(o => !o.allDay).sort(byStart)
    if (!timed.length) {
      return {
        title: api.fmtDay(date),
        blocks: [{ type: 'text', data: { text: api.L(`Nothing with a time on ${api.fmtDay(date)}.`, `Am ${api.fmtDay(date)} ist nichts mit Uhrzeit eingetragen.`) } }],
        followups: [api.L(`What's on ${date}?`, `Was steht am ${date} an?`)],
      }
    }
    const first = timed[0]
    const last = timed.reduce((a, b) => (b.endMin > a.endMin ? b : a))
    const place = o => (o.event.location ? ` · 📍 ${o.event.location}` : '')
    const lines = []
    if (slots.mode !== 'last') lines.push(api.L(`First: ${first.event.title || 'Untitled'} at ${fmtMin(first.startMin)}${place(first)}`, `Erster Termin: ${first.event.title || 'Ohne Titel'} um ${fmtMin(first.startMin)}${place(first)}`))
    if (slots.mode !== 'first') lines.push(api.L(`Done at ${fmtMin(last.endMin)} — last: ${last.event.title || 'Untitled'}${place(last)}`, `Fertig um ${fmtMin(last.endMin)} — zuletzt: ${last.event.title || 'Ohne Titel'}${place(last)}`))
    const shown = slots.mode === 'first' ? [first] : slots.mode === 'last' ? [last] : [...new Set([first, last])]
    return {
      title: api.fmtDay(date),
      blocks: [{ type: 'text', data: { text: lines.join('\n') } }, { type: 'events', data: { items: shown.map(o => occItem(o)) } }],
      followups: [api.L(`What's on ${date}?`, `Was steht am ${date} an?`), api.L(`When am I free on ${date}?`, `Wann habe ich am ${date} Zeit?`)],
    }
  },
})
