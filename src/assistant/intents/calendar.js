// Calendar: when-am-I-free, day agenda, add / move / delete events.
// Searching by name lives in search.js.

import { registerIntent, getIntent } from '../engine/registry.js'
import { matchScore } from '../engine/lexicon.js'
import { startEventFlow, eventQuestion, parseLocation } from '../flows/eventFlow.js'
import { extract, cleanTitle, restoreCase } from '../engine/parse/index.js'
import { fmtMin, fmtDuration } from '../engine/parse/times.js'
import { addDays, minutesOf, timeOf, buildEvent } from '../../utils/calendar/eventModel.js'

// ── Vocabulary ─────────────────────────────────────────────────────────────

const ADD = /\b(add|create|new|plane?n?|schedule|book|put|block|eintragen|eintrag|trag\w*|erstell\w*|anlegen|leg\w* an|blocke?n?|blockier\w*|reservier\w*|setz\w*)\b|\bneue?[nrs]? event\b|\bmach\w*\b(?=.*\bevent\b)/
// "Wann kann ich …", "when can I …" — asks for a free window.
const WHEN_CAN = /\b(wann (?:kann|koennte|koennen|habe?|hab|haette|bin|passt|geht|waere|soll|sollte)|when (?:can|could|am|do|would|should|is)|wo (?:habe?|hab) ich (?:zeit|platz|luft))\b/
const HAVE_TIME = /\b(zeit|time|free|frei|freie[nrs]?|available|verfuegbar|luft|platz|busy|beschaeftigt)\b/
// "i have" / "ich habe" alone (no "do") also counts: a typo can eat the verb
// ("fo i have time" for "do i have time"), and there is often no "?" either.
const QUESTION = /\b(do i|have i|i have|am i|habe? ich|ich habe|hab ich|bin ich|can i|kann ich|is there|gibt es|geht|passt)\b/
const STARTS_QUESTION = /^(was|wie|wo|welche\w*|what'?s?|how|where|which|do|does|habe? ich|hab ich|bin ich|gibt es|is|are|zeig\w*|show|find\w*|such\w*)\b/
// Changing or renaming something is never a calendar lookup or a new event.
const EDIT_VERB = /^(?:bitte )?(?:aender\w*|change|rename|benenn\w*|umbenenn\w*|update)\b|\b(?:umbenennen|heisst jetzt|soll \w+ heissen)\b/

const KIND_WORDS = [
  ['exam', /\bexam\b/],
  ['class', /\b(class|lecture|vorlesung|kurs|seminar|praktikum|lab|uebung)\b/],
  ['deadline', /\b(deadline|abgabe|due)\b/],
  ['assignment', /\b(assignment|hausaufgabe|hausuebung|homework)\b/],
  ['study', /\bstudy\b/],
]

const PURPOSES = [
  ['study', /\bstudy\b/],
  ['friends', /\bfriends\b/],
  ['meal', /\b(brunch|fruehstueck\w*|breakfast|lunch|mittagessen|dinner|abendessen|essen|kaffee|coffee|grab (?:a )?(?:bite|snack|something)|imbiss|kleinigkeit essen)\b/],
  ['sport', /\b(sport|gym|fitness|training|trainieren|laufen|joggen|workout|schwimmen)\b/],
  ['meet', /\b(treffen|treffe|meet|meeting|verabreden|date|besuch\w*|visit|hang out|unternehmen|was machen|etwas machen|something)\b/],
]

export const EVENT_STOP = [
  'add', 'create', 'new', 'neue', 'neuen', 'neues', 'neuer', 'plan', 'plane', 'planen', 'schedule', 'book', 'put',
  'eintragen', 'trage', 'trag', 'erstelle', 'erstellen', 'anlegen', 'lege', 'leg', 'block', 'blocke', 'blocken', 'blockiere',
  'reserviere', 'setze', 'setz', 'notiere', 'mache', 'mach', 'an', 'ein', 'eine', 'einen', 'einem', 'a', 'the',
  'event', 'in', 'into', 'ins', 'im', 'to', 'my', 'mir', 'mich', 'uns', 'dir', 'ich', 'habe', 'hab', 'have', 'i',
  'calendar', 'kalender', 'meinen', 'meine', 'mein', 'den', 'die', 'das', 'der', 'dem', 'on', 'am', 'at', 'um',
  'for', 'fuer', 'please', 'bitte', 'mal', 'noch', 'dann', 'von', 'bis', 'und', 'zum', 'zur', 'called', 'namens',
  'kannst', 'koenntest', 'wuerdest', 'du', 'can', 'could', 'would', 'you', 'me',
  'hey', 'hi', 'hallo', 'hello', 'servus', 'yo', 'ok', 'okay',
  'uhr', 'abends', 'abend', 'morgens', 'mittags', 'nachmittags', 'vormittags', 'frueh', 'evening', 'morning', 'afternoon', 'tonight', 'noon',
]

// ── Helpers ────────────────────────────────────────────────────────────────

export function freeSlots(api, date, minMinutes = 30, { ignoreId = null } = {}) {
  const { dayStart, dayEnd } = api.settings
  let from = dayStart
  if (date === api.today) {
    const now = new Date()
    from = Math.max(from, Math.ceil((now.getHours() * 60 + now.getMinutes()) / 15) * 15)
  }
  const busy = api.occurrences(date, date)
    .filter(o => !o.allDay && o.endMin > o.startMin && o.event.id !== ignoreId)
    .map(o => [o.startMin, o.endMin])
    .sort((a, b) => a[0] - b[0])

  const slots = []
  let cursor = from
  for (const [s, e] of busy) {
    if (s - cursor >= minMinutes && s > cursor) slots.push({ start: cursor, end: Math.min(s, dayEnd) })
    cursor = Math.max(cursor, e)
    if (cursor >= dayEnd) break
  }
  if (dayEnd - cursor >= minMinutes) slots.push({ start: cursor, end: dayEnd })
  return slots.filter(s => s.end - s.start >= minMinutes)
}

function rangeDays(from, to) {
  const out = []
  for (let d = from; d <= to && out.length < 31; d = addDays(d, 1)) out.push(d)
  return out
}

function detectPurpose(text) {
  const hit = PURPOSES.find(([, re]) => re.test(text))
  const w = text.match(/\b(?:mit|with) (?!jemand\w*|someone|somebody|friends|meinen|meiner|meinem|einem|einer|dem|der|den)([a-z][a-z-]{1,})/)
  return {
    purpose: hit?.[0] ?? null,
    meal: hit?.[0] === 'meal' ? text.match(hit[1])[1] : null,
    with: w?.[1] ?? null,
  }
}

const cap = s => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s)

function purposeTitle(api, slots, topic, raw) {
  const who = slots.with ? restoreCase(slots.with, raw) : null
  switch (slots.purpose) {
    case 'study': return topic ? api.L(`Study: ${topic.name}`, `Lernen: ${topic.name}`) : api.L('Study', 'Lernen')
    case 'friends': return api.L('With friends', 'Mit Freunden')
    case 'meal': return cap(restoreCase(slots.meal ?? 'essen', raw)) + (who ? api.L(` with ${who}`, ` mit ${who}`) : '')
    case 'sport': return 'Sport'
    case 'meet': return who ? api.L(`Meet ${who}`, `Treffen mit ${who}`) : api.L('Meeting', 'Treffen')
    default: return who ? api.L(`With ${who}`, `Mit ${who}`) : ''
  }
}

// Canonical words the normaliser introduced, turned back into readable ones.
export function displayTitle(api, title, raw) {
  if (!title) return ''
  let s = ` ${title.toLowerCase()} `
  s = s.replace(/^\s*(?:mit|with)\s+/, ' ').replace(/\s+(?:mit|with)\s*$/, ' ')
  s = s.replace(/\sfriends\s/g, api.L(' friends ', ' Freunden '))
    .replace(/\sexam\s/g, api.L(' exam ', ' Prüfung '))
    .replace(/\sstudy\s/g, api.L(' study ', ' Lernen '))
  return restoreCase(s.replace(/\s+/g, ' ').trim(), raw)
}

export function makeEventRow(api, d) {
  const s = d.startMin
  const e = Math.max(s + 5, d.endMin)
  return buildEvent({}, {
    calendar_id: api.defaultCalendarId(),
    kind: d.kind ?? 'event',
    title: d.title || api.L('Untitled', 'Ohne Titel'),
    start_date: d.date,
    start_time: timeOf(s),
    end_date: d.date,
    end_time: timeOf(e),
    all_day: false,
    topic_id: d.kind === 'study' ? d.topic_id ?? null : null,
    planned_minutes: e - s,
  })
}

// Occurrences whose title matches, next upcoming first, one per event.
export function findEvents(api, query, date = null) {
  const q = cleanTitle(query ?? '', ['the', 'my', 'den', 'die', 'das', 'der', 'dem', 'meinen', 'meine', 'mein', 'event', 'termin']).toLowerCase()
  const from = date ?? addDays(api.today, -1)
  const to = date ?? addDays(api.today, 120)
  const seen = new Set()
  const out = []
  const occ = api.occurrences(from, to).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startMin - b.startMin))
  for (const o of occ) {
    if (seen.has(o.event.id)) continue
    if (q && matchScore(q, `${o.event.title ?? ''} ${o.event.location ?? ''}`, { lang: api.lang }).score < 0.5) continue
    seen.add(o.event.id)
    out.push(o)
  }
  return out
}

export const occItem = (o, showDate = false) => ({ eventId: o.event.id, date: o.date, startMin: o.startMin, endMin: o.endMin, allDay: o.allDay, showDate })

// Timed occurrences on `date` overlapping [start, end).
export function overlapping(api, date, start, end, ignoreId = null) {
  return api.occurrences(date, date).filter(o => !o.allDay && o.event.id !== ignoreId && o.startMin < end && start < o.endMin)
}

// Other times for a block of `len` minutes that was wanted at `startMin` on
// `date` but clashes: the closest free start before and after on that day,
// and the same clock time on the following days where it is free.
export function findAlternatives(api, date, startMin, len, { ignoreId = null, days = 7, maxOther = 3 } = {}) {
  let before = null
  let after = null
  for (const slot of freeSlots(api, date, len, { ignoreId })) {
    const start = Math.max(slot.start, Math.min(startMin, slot.end - len))
    if (start < startMin && (!before || start > before.start)) before = { start, end: start + len }
    if (start > startMin && (!after || start < after.start)) after = { start, end: start + len }
  }
  const otherDays = []
  for (let i = 1; i <= days && otherDays.length < maxOther; i++) {
    const d = addDays(date, i)
    if (freeSlots(api, d, len, { ignoreId }).some(s => s.start <= startMin && s.end >= startMin + len)) {
      otherDays.push({ date: d, slots: [{ start: startMin, end: startMin + len }] })
    }
  }
  return { sameDay: [before, after].filter(Boolean), otherDays }
}

// Alternatives as result blocks. Tapping a window opens a prefilled draft.
export function alternativeBlocks(api, alt, date, slotBase) {
  const blocks = []
  if (alt.sameDay.length) {
    blocks.push({ type: 'text', data: { text: api.L(`Free instead on ${api.fmtDay(date)}:`, `Stattdessen frei am ${api.fmtDay(date)}:`) } })
    blocks.push({ type: 'slots', data: { ...slotBase, days: [{ date, slots: alt.sameDay }] } })
  }
  if (alt.otherDays.length) {
    blocks.push({ type: 'text', data: { text: api.L('Same time on another day:', 'Gleiche Uhrzeit an einem anderen Tag:') } })
    blocks.push({ type: 'slots', data: { ...slotBase, days: alt.otherDays } })
  }
  if (!blocks.length) blocks.push({ type: 'text', data: { text: api.L('No free alternative in the next days.', 'Keine freie Alternative in den nächsten Tagen.') } })
  return blocks
}

// ── Free time ──────────────────────────────────────────────────────────────

registerIntent({
  id: 'free_time',
  describe: 'When is the user free? Checks one day, a range, or the next 7 days for a free window (optionally of a given length and purpose)',
  slots: {
    date: 'YYYY-MM-DD optional', from: 'range start YYYY-MM-DD optional', to: 'range end optional',
    minutes: 'integer minutes needed, optional', purpose: 'study|meet|friends|meal|sport optional', with: 'person name optional', scan: 'true to search the coming week',
  },
  examples: ['When can I meet someone for 3 hours?', 'Wann kann ich mich für 3 Stunden mit jemandem treffen?'],
  completions: {
    de: ['Wann kann ich {day}?', 'Wann kann ich mich für {duration} treffen?', 'Wann kann ich {duration} lernen?', 'Wann kann ich {topic} lernen?', 'Wann habe ich {day} Zeit?', 'Habe ich {day} {duration} Zeit?'],
    en: ['When can I {day}?', 'When can I meet for {duration}?', 'When can I study {topic}?', 'When am I free {day}?', 'Do I have {duration} free {day}?'],
  },
  match(text, { today, raw }) {
    if (/\btodo\b/.test(text) || EDIT_VERB.test(text)) return null
    // "Wann bin ich morgen fertig?" asks for the end of the day (day_bounds).
    if (/\b(fertig|durch|done|finished|through)\b/.test(text)) return null
    // "Wann habe ich Kardio zuletzt gelernt?" asks about the past (study_stats).
    if (/\b(gelernt|geuebt|zuletzt|studied|practi[sc]ed|last time|meistens|usually)\b/.test(text)) return null
    // "Wann habe ich das nächste Mal Chemie?" looks up an entry (next_occurrence).
    if (/\b(naechste[ns]? mal|wieder|again|als naechstes)\b/.test(text) && !HAVE_TIME.test(text)) return null
    const when = WHEN_CAN.test(text)
    if (!when && !HAVE_TIME.test(text)) return null
    const x = extract(text, today)
    const question = when || QUESTION.test(text) || /\?\s*$/.test(raw ?? '')
    if (!question && !x.minutes && !x.date && !x.range) return null
    // "trag mir morgen 9–10 frei ein" is still an add.
    if (!when && ADD.test(text) && x.startMin != null) return null
    const p = detectPurpose(text)
    return {
      score: when ? 0.95 : question ? 0.9 : 0.65,
      slots: { date: x.date, from: x.range?.from ?? null, to: x.range?.to ?? null, minutes: x.minutes, ...p, scan: when && !x.date && !x.range },
    }
  },
  execute(slots, api, ctx = {}) {
    const minutes = Number(slots.minutes) || null
    const need = minutes ?? 30
    let days
    if (slots.from && slots.to) days = rangeDays(slots.from, slots.to)
    else if (slots.date) days = [slots.date]
    else if (slots.scan) days = rangeDays(api.today, addDays(api.today, 6))
    else days = [api.today]

    const topic = slots.purpose === 'study' ? api.findTopicIn(ctx.raw ?? '') : null
    const title = purposeTitle(api, slots, topic, ctx.raw)
    const kind = slots.purpose === 'study' ? 'study' : 'event'
    const slotBase = { minutes: minutes ?? 60, title, kind, topicId: topic?.id ?? null, hint: api.L('Tap a window to add it', 'Tippe auf ein Fenster, um es einzutragen') }
    const perDay = days.map(date => ({ date, slots: freeSlots(api, date, need) })).filter(d => d.slots.length)
    const dur = minutes ? fmtDuration(minutes, api.lang) : null

    // One day — full answer with what's already planned.
    if (days.length === 1) {
      const date = days[0]
      const day = api.fmtDay(date)
      const all = freeSlots(api, date, 30)
      const fitting = perDay[0]?.slots ?? []
      const longest = Math.max(0, ...all.map(s => s.end - s.start))
      const total = all.reduce((n, s) => n + s.end - s.start, 0)
      const text = minutes
        ? fitting.length
          ? api.L(`Yes — ${fitting.length === 1 ? 'one window' : fitting.length + ' windows'} on ${day} fit ${dur}.`, `Ja — am ${day} ${fitting.length === 1 ? 'passt ein Zeitfenster' : 'passen ' + fitting.length + ' Zeitfenster'} für ${dur}.`)
          : api.L(`No ${dur} block free on ${day}. Longest gap: ${fmtDuration(longest, 'en')}.`, `Am ${day} ist kein Block von ${dur} frei. Längste Lücke: ${fmtDuration(longest, 'de')}.`)
        : all.length
          ? api.L(`${fmtDuration(total, 'en')} free on ${day}. Best: ${fmtMin(all[0].start)}–${fmtMin(all[0].end)}.`, `Am ${day} sind ${fmtDuration(total, 'de')} frei. Frühestes Fenster: ${fmtMin(all[0].start)}–${fmtMin(all[0].end)}.`)
          : api.L(`${day} is fully booked.`, `${day} ist komplett verplant.`)

      const blocks = [
        { type: 'text', data: { text } },
        { type: 'slots', data: { ...slotBase, days: [{ date, slots: minutes ? fitting : all }] } },
      ]
      const busy = api.occurrences(date, date)
      if (busy.length) blocks.push({ type: 'events', data: { items: busy.map(o => occItem(o)), collapsed: true, label: api.L('Already planned', 'Bereits geplant') } })

      if (minutes && !fitting.length) {
        for (let i = 1; i <= 14; i++) {
          const d = addDays(date, i)
          const s = freeSlots(api, d, minutes)
          if (s.length) {
            blocks.push({ type: 'text', data: { text: api.L(`Next day with ${dur} free: ${api.fmtDay(d)}`, `Nächster Tag mit ${dur} frei: ${api.fmtDay(d)}`) } })
            blocks.push({ type: 'slots', data: { ...slotBase, days: [{ date: d, slots: s }] } })
            break
          }
        }
      }
      return { title: title ? `${title} · ${day}` : day, blocks }
    }

    // Several days — earliest fitting window first, grouped by day.
    const span = `${api.fmtDay(days[0])} – ${api.fmtDay(days[days.length - 1])}`
    const heading = title || api.L('When you have time', 'Wann du Zeit hast')
    if (!perDay.length) {
      return {
        title: heading,
        blocks: [{ type: 'text', data: { text: api.L(`No ${dur ?? 'free'} window between ${span}.`, `Zwischen ${span} ist kein ${dur ? `Block von ${dur}` : 'Fenster'} frei.`) } }],
        followups: [api.L(`When can I next week for ${minutes ?? 60} minutes?`, `Wann kann ich nächste Woche ${minutes ?? 60} Minuten?`)],
      }
    }
    const best = perDay[0]
    return {
      title: dur ? `${heading} · ${dur}` : heading,
      blocks: [
        { type: 'text', data: { text: api.L(
          `Earliest: ${api.fmtDay(best.date)}, ${fmtMin(best.slots[0].start)}–${fmtMin(best.slots[0].end)}. Free on ${perDay.length} of ${days.length} days.`,
          `Am frühesten: ${api.fmtDay(best.date)}, ${fmtMin(best.slots[0].start)}–${fmtMin(best.slots[0].end)}. Frei an ${perDay.length} von ${days.length} Tagen.`,
        ) } },
        { type: 'slots', data: { ...slotBase, days: perDay.slice(0, 7).map(d => ({ date: d.date, slots: d.slots.slice(0, 4) })) } },
      ],
    }
  },
})

// ── Agenda ─────────────────────────────────────────────────────────────────

registerIntent({
  id: 'day_agenda',
  describe: "Show what's in the calendar on a day (events, exams, todos due)",
  slots: { date: 'YYYY-MM-DD' },
  examples: ["What's on tomorrow?", 'Was steht morgen an?'],
  completions: {
    de: ['Was steht {day} an?', 'Was habe ich {day}?'],
    en: ["What's on {day}?"],
  },
  match(text, { today }) {
    if (/\btodo\b/.test(text) || WHEN_CAN.test(text) || EDIT_VERB.test(text)) return null
    if (ADD.test(text) && !STARTS_QUESTION.test(text)) return null
    const x = extract(text, today)
    const date = x.date ?? x.range?.from
    const asks = /\b(what'?s on|whats on|what do i have|what am i doing|what'?s planned|my plan|was habe ich|was hab ich|was steht|steht .*an|ansteht|was ist .*los|was geht|was mache ich|was ist geplant|geplant|agenda|overview|uebersicht|show)\b/.test(text)
    if (asks && date) return { score: 0.85, slots: { date } }
    if (/\bevent\b/.test(text) && date && !/\b(find|search|such\w*|loesch\w*|delete|verschieb\w*|move)\b/.test(text)) return { score: 0.7, slots: { date } }
    return null
  },
  execute(slots, api) {
    const date = slots.date || api.today
    const occ = api.occurrences(date, date).sort((a, b) => (b.allDay - a.allDay) || a.startMin - b.startMin)
    const exams = api.exams.filter(x => x.exam_date === date)
    const todos = api.todos.filter(t => !t.completed && t.due_date === date)
    const blocks = []
    if (!occ.length && !exams.length && !todos.length) blocks.push({ type: 'text', data: { text: api.L('Nothing planned.', 'Nichts geplant.') } })
    if (exams.length) blocks.push({ type: 'text', data: { text: `🎓 ${exams.map(x => x.title).join(', ')}` } })
    if (occ.length) blocks.push({ type: 'events', data: { items: occ.map(o => occItem(o)) } })
    if (todos.length) blocks.push({ type: 'todos', data: { ids: todos.map(t => t.id) } })
    return {
      title: api.fmtDay(date),
      blocks,
      followups: [api.L(`When am I free on ${date}?`, `Wann habe ich am ${date} Zeit?`), api.L(`Add event on ${date}`, `Termin am ${date} eintragen`)],
    }
  },
})

// ── Add ────────────────────────────────────────────────────────────────────

registerIntent({
  id: 'add_event',
  describe: 'Create a calendar event. Asks step by step for what is missing (day, time, place, calendar, reminder, todos); with title, day and time given it shows a review card to save',
  slots: {
    title: 'event title', date: 'YYYY-MM-DD optional', start: 'HH:MM optional', end: 'HH:MM optional', minutes: 'duration minutes optional',
    all_day: 'true optional', kind: 'class|study|assignment|exam|deadline|event|other', topic: 'topic name optional',
    location: 'place optional', calendar: 'calendar name optional', reminders: 'minutes before as a list, e.g. [30] optional', notes: 'optional',
  },
  examples: ['Add brunch tomorrow 9-10', 'Trage mir morgen von 9-10 einen Brunch ein'],
  completions: {
    de: ['Trage mir {day} von {time} {title} ein', 'Trag {day} um {clock} {title} ein', 'Neuer Termin {title} {day} um {clock}'],
    en: ['Add {title} {day} at {clock}', 'Schedule {title} {day} {time}'],
  },
  match(text, { today, raw }) {
    if (/\btodo\b/.test(text) || WHEN_CAN.test(text) || EDIT_VERB.test(text)) return null
    const x = extract(text, today)
    const kind = KIND_WORDS.find(([, re]) => re.test(text))?.[0] ?? 'event'
    const date = x.date ?? x.range?.from ?? null
    const hasWhen = date != null || x.startMin != null
    // "… im Café Central": the place comes off the end before the title is cleaned.
    const place = parseLocation(x.rest, raw)
    const title = cleanTitle(place.rest, EVENT_STOP)

    let score = 0
    if (ADD.test(text) && !STARTS_QUESTION.test(text)) {
      score = hasWhen || kind !== 'event' || /\b(event|calendar|kalender)\b/.test(text) ? 0.9 : 0.62
    } else if (STARTS_QUESTION.test(text) || HAVE_TIME.test(text)) {
      return null
    } else if (/^(ich habe|ich hab|i have|hab|habe|i've got|ich muss|i need to go to)\b/.test(text) && date && x.startMin != null) {
      score = 0.7                                   // "Ich habe Freitag um 15 Uhr Zahnarzt"
    } else if (date && x.startMin != null && title.length >= 3) {
      score = 0.62                                  // "morgen 9-10 Brunch mit Anna"
    } else if (date && title.length >= 3 && text.split(' ').length <= 5 && !/\b(muss|sollte|need to|have to|must|vergessen|bis|by|until)\b/.test(text)) {
      score = 0.6                                   // "hey Brunch morgen" — the flow asks the rest
    }
    if (!score) return null
    return {
      score,
      slots: {
        title, date, kind, location: place.location,
        start: x.startMin != null ? fmtMin(x.startMin) : null,
        end: x.endMin != null ? fmtMin(x.endMin) : null,
        minutes: x.minutes,
        explicit: date != null && x.startMin != null && !x.fuzzyTime,
      },
    }
  },
  // Starts the guided flow (flows/eventFlow.js): it asks for whatever is
  // missing, checks for overlaps and saves with calendar, reminders and todos.
  execute(slots, api, ctx = {}) {
    const kind = slots.kind ?? 'event'
    const topic = slots.topic ? api.findTopic(slots.topic) : api.findTopicIn(ctx.raw ?? slots.title ?? '')
    const title = displayTitle(api, slots.title, ctx.raw) || (kind === 'study' ? (topic ? api.L(`Study: ${topic.name}`, `Lernen: ${topic.name}`) : api.L('Study', 'Lernen')) : '')
    const reminders = Array.isArray(slots.reminders) ? slots.reminders : slots.reminders != null && slots.reminders !== '' ? [slots.reminders] : []
    const flow = startEventFlow({
      title, kind, topic_id: topic?.id ?? null,
      date: slots.date || null,
      startMin: slots.start ? minutesOf(slots.start) : null,
      endMin: slots.end ? minutesOf(slots.end) : null,
      minutes: slots.minutes,
      allDay: slots.all_day === true || slots.all_day === 'true',
      location: slots.location || '',
      calendar: slots.calendar || null,
      reminders,
      notes: slots.notes || '',
    }, api)
    return { ...eventQuestion(flow, api), startFlow: flow }
  },
})

// ── Move ───────────────────────────────────────────────────────────────────

registerIntent({
  id: 'move_event',
  mutates: true,
  describe: 'Move / reschedule an existing calendar event to another date and/or time',
  slots: { title: 'words from the event title', from_date: 'current date YYYY-MM-DD optional', date: 'new date optional', start: 'new start HH:MM optional' },
  examples: ['Move brunch to 11am', 'Verschiebe den Brunch auf Freitag 10 Uhr'],
  completions: {
    de: ['Verschiebe {event} auf {day}', 'Verschiebe {event} auf {clock}'],
    en: ['Move {event} to {day}', 'Move {event} to {clock}'],
  },
  match(text, { today }) {
    const m = text.match(/^(?:bitte )?(?:move|reschedule|shift|push|verschieb\w*|verleg\w*)\s+(?:the |den |die |das |mein\w* )?(?:event )?(.+?)\s+(?:to|auf|nach|zu|in|um)\s+(.+)$/)
    if (!m) return null
    const target = extract(` ${m[2]} `, today)
    if (target.date == null && target.startMin == null && !target.range) return null
    const src = extract(m[1], today)
    return {
      score: /\btodo\b/.test(text) ? 0.3 : 0.85,
      slots: { title: src.rest, from_date: src.date, date: target.date ?? target.range?.from ?? null, start: target.startMin != null ? fmtMin(target.startMin) : null },
    }
  },
  async execute(slots, api, ctx) {
    const hits = findEvents(api, slots.title, slots.from_date)
    if (!hits.length) {
      // Maybe a todo was meant ("verschiebe Skript lesen auf Freitag").
      const todo = getIntent('edit_todo')
      if (todo && slots.date) {
        const r = await todo.execute({ text: slots.title, due_date: slots.date }, api, ctx)
        if (r?.blocks?.[0]?.data?.ids?.length === 1 && !/No todo|Kein Todo/.test(r.title)) return r
      }
      return { title: api.L(`No event matching “${slots.title}”`, `Kein Termin passend zu „${slots.title}“`), blocks: [{ type: 'text', data: { text: api.L('Try the exact title, e.g. “move brunch to 11”.', 'Probier den genauen Titel, z.B. „verschiebe Brunch auf 11 Uhr“.') } }] }
    }
    const occ = hits[0]
    const e = occ.event
    if (e.rrule || e.recurrence_parent_id || occ.allDay) {
      return {
        title: api.L('Open in editor to move', 'Im Editor verschieben'),
        blocks: [{ type: 'text', data: { text: api.L('Repeating or all-day events are moved in the editor.', 'Wiederkehrende oder ganztägige Termine im Editor verschieben.') } }, { type: 'events', data: { items: [occItem(occ, true)] } }],
      }
    }
    const length = occ.endMin - occ.startMin
    const newStart = slots.start ? minutesOf(slots.start) : occ.startMin
    const newDate = slots.date ?? e.start_date
    const saved = await api.upsertEvent(buildEvent(e, {
      start_date: newDate, end_date: newDate,
      start_time: timeOf(newStart), end_time: timeOf(Math.min(1439, newStart + length)),
    }))
    const clash = overlapping(api, newDate, newStart, newStart + length, e.id)
    const blocks = [{ type: 'saved', data: { eventId: saved.id, undo: e } }]
    let followups
    if (clash.length) {
      blocks.push({ type: 'text', data: { text: api.L('⚠️ Now overlaps with:', '⚠️ Überschneidet sich jetzt mit:') } })
      blocks.push({ type: 'events', data: { items: clash.map(o => occItem(o)) } })
      // Offered as "move again" chips — tapping a slot would create a copy.
      const alt = findAlternatives(api, newDate, newStart, length, { ignoreId: e.id })
      const options = [...alt.sameDay.map(s => ({ date: newDate, start: s.start })), ...alt.otherDays.map(d => ({ date: d.date, start: d.slots[0].start }))]
      followups = options.slice(0, 4).map(o => api.L(`Move ${e.title} to ${o.date} at ${fmtMin(o.start)}`, `Verschiebe ${e.title} auf ${o.date} um ${fmtMin(o.start)}`))
    }
    return { title: api.L('Event moved', 'Termin verschoben'), blocks, followups }
  },
})

// ── Delete ─────────────────────────────────────────────────────────────────

registerIntent({
  id: 'delete_event',
  describe: 'Delete / cancel a calendar event (asks for confirmation)',
  slots: { title: 'words from the event title', date: 'YYYY-MM-DD optional' },
  examples: ['Cancel brunch tomorrow', 'Sag das Treffen mit Anna ab'],
  completions: {
    de: ['Lösche Termin {event}', 'Sag {event} ab'],
    en: ['Cancel {event}', 'Delete event {event}'],
  },
  match(text, { today }) {
    if (/\btodo\b/.test(text)) return null
    const m = text.match(/^(?:bitte )?(?:delete|remove|cancel|loesch\w*|entfern\w*|streich\w*|sag\w*)\s+(?:the |den |die |das |mein\w* )?(?:event\s+)?(.+?)(?:\s+ab)?$/)
    if (!m) return null
    if (/^sag/.test(text) && !/\sab$/.test(text)) return null
    const x = extract(m[1], today)
    return { score: /\bevent\b/.test(text) ? 0.9 : 0.72, slots: { title: x.rest, date: x.date } }
  },
  execute(slots, api) {
    const hits = findEvents(api, slots.title, slots.date).slice(0, 8)
    if (!hits.length) return { title: api.L(`No event matching “${slots.title}”`, `Kein Termin passend zu „${slots.title}“`), blocks: [] }
    return {
      title: hits.length === 1 ? api.L('Delete this event?', 'Diesen Termin löschen?') : api.L('Which one?', 'Welchen?'),
      blocks: [{ type: 'events', data: { items: hits.map(o => occItem(o, true)), confirmId: hits.length === 1 ? hits[0].event.id : null } }],
    }
  },
})
