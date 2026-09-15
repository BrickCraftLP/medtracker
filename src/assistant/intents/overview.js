// Overview lookups: current date/time, what's next, the week at a glance and
// how long until exams.

import { registerIntent } from '../engine/registry.js'
import { fold } from '../engine/normalize.js'
import { matchScore } from '../engine/lexicon.js'
import { extract, cleanTitle } from '../engine/parse/index.js'
import { fmtMin, fmtDuration } from '../engine/parse/times.js'
import { clockInfo } from '../engine/clock.js'
import { summarize, accuracyTrend, fmtPctShort, fmtDelta } from '../engine/studyStats.js'
import { addDays, daysBetween, parseDayKey } from '../../utils/calendar/eventModel.js'
import { freeSlots, occItem } from './calendar.js'

const nowMinutes = api => {
  const d = api.now?.() ?? new Date()
  return d.getHours() * 60 + d.getMinutes()
}

const byStart = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startMin - b.startMin)

// Timed occurrences that have not ended yet, soonest first.
function upcoming(api, days = 30) {
  const nowMin = nowMinutes(api)
  return api.occurrences(api.today, addDays(api.today, days))
    .filter(o => !o.allDay && (o.date > api.today || o.endMin > nowMin))
    .sort(byStart)
}

export function countdown(api, date, startMin) {
  const days = daysBetween(api.today, date)
  const mins = days * 1440 + (startMin ?? 0) - nowMinutes(api)
  if (mins <= 0) return api.L('now', 'jetzt')
  if (mins < 1440) return `in ${fmtDuration(mins, api.lang)}`
  return days === 1 ? api.L('tomorrow', 'morgen') : api.L(`in ${days} days`, `in ${days} Tagen`)
}

// ── Current date / time ────────────────────────────────────────────────────

const TIME_Q = /\b(wie spaet|wieviel uhr|wie viel uhr|uhrzeit|what time|time is it|current time|what'?s the time|whats the time)\b/
const DATE_Q = /\b(welche[rsnm]? (?:tag|datum|wochentag)|welches datum|der wievielte|den wievielten|what day|which day|what date|what'?s the date|whats the date)\b/
const WEEK_Q = /\b(kalenderwoche|welche kw|which week|what week|week number|calendar week)\b/

registerIntent({
  id: 'current_time',
  describe: 'Tell the current time, date, weekday or calendar week',
  slots: {},
  examples: ['What time is it?', 'Welcher Tag ist heute?'],
  completions: {
    de: ['Wie spät ist es?', 'Welches Datum ist heute?'],
    en: ['What time is it?', "What's the date today?"],
  },
  match(text) {
    if (/\b(event|todo|exam|study)\b/.test(text)) return null
    const date = DATE_Q.test(text) && (/\btoday\b/.test(text) || /\b(haben wir|ist es|is it)\b/.test(text) || text.split(' ').length <= 4)
    return TIME_Q.test(text) || WEEK_Q.test(text) || date ? { score: 0.95, slots: {} } : null
  },
  execute(_, api) {
    const c = clockInfo(api.lang, api.now?.())
    const blocks = [{ type: 'text', data: { text: api.L(`It's ${c.time} on ${c.dateLong} (week ${c.week}).`, `Es ist ${c.time} Uhr, ${c.dateLong} (KW ${c.week}).`) } }]
    const next = upcoming(api, 7).find(o => o.date > api.today || o.startMin > c.minutes)
    if (next) {
      blocks.push({ type: 'text', data: { text: api.L(
        `Next: ${next.event.title || 'Untitled'} ${countdown(api, next.date, next.startMin)}.`,
        `Als Nächstes: ${next.event.title || 'Ohne Titel'} ${countdown(api, next.date, next.startMin)}.`,
      ) } })
    }
    return {
      title: c.time,
      blocks,
      followups: [api.L("What's on today?", 'Was steht heute an?'), api.L('How does my week look?', 'Wie sieht meine Woche aus?')],
    }
  },
})

// ── Next event ─────────────────────────────────────────────────────────────

registerIntent({
  id: 'next_event',
  describe: "The user's next calendar entry, with a countdown, and what is running right now",
  slots: {},
  examples: ["What's next?", 'Was ist als Nächstes?'],
  completions: {
    de: ['Was ist als Nächstes?', 'Wann ist mein nächster Termin?'],
    en: ["What's next?", 'When is my next event?'],
  },
  match(text) {
    if (/\b(todo|exam)\b/.test(text)) return null
    const hit = /\b(als naechste[sn]?|what'?s next|whats next|what is next|up next|next event|naechste[rns]? event|was kommt (?:jetzt|als naechstes|gleich|dann|danach)|what do i have (?:next|now|after(?: that)?)|what'?s after(?: that)?|whats after(?: that)?|was jetzt|was (?:habe|hab) ich (?:jetzt|gleich|danach)|und danach|and after that)\b/.test(text)
    return hit ? { score: 0.9, slots: {} } : null
  },
  execute(_, api) {
    const nowMin = nowMinutes(api)
    const list = upcoming(api, 30)
    const running = list.filter(o => o.date === api.today && o.startMin <= nowMin)
    const next = list.filter(o => o.date > api.today || o.startMin > nowMin).slice(0, 3)
    const lines = running.map(o => api.L(
      `▶️ Running now: ${o.event.title || 'Untitled'} — ${fmtDuration(o.endMin - nowMin, 'en')} left.`,
      `▶️ Läuft gerade: ${o.event.title || 'Ohne Titel'} — noch ${fmtDuration(o.endMin - nowMin, 'de')}.`,
    ))
    if (next.length) {
      const n = next[0]
      lines.push(api.L(
        `${n.event.title || 'Untitled'} ${countdown(api, n.date, n.startMin)} (${api.fmtDay(n.date)}, ${fmtMin(n.startMin)}).`,
        `${n.event.title || 'Ohne Titel'} ${countdown(api, n.date, n.startMin)} (${api.fmtDay(n.date)}, ${fmtMin(n.startMin)}).`,
      ))
    } else {
      lines.push(api.L('Nothing planned in the next 30 days.', 'In den nächsten 30 Tagen ist nichts geplant.'))
    }
    const items = [...running, ...next].map(o => occItem(o, true))
    return {
      title: api.L('Up next', 'Als Nächstes'),
      blocks: [{ type: 'text', data: { text: lines.join('\n') } }, ...(items.length ? [{ type: 'events', data: { items } }] : [])],
      followups: [api.L('When am I free today?', 'Wann habe ich heute Zeit?'), api.L('How does my week look?', 'Wie sieht meine Woche aus?')],
    }
  },
})

// ── Week overview ──────────────────────────────────────────────────────────

// Booked minutes inside waking hours, overlapping blocks counted once.
function bookedMinutes(occ, dayStart, dayEnd) {
  const spans = occ.map(o => [Math.max(dayStart, o.startMin), Math.min(dayEnd, o.endMin)]).filter(([s, e]) => e > s).sort((a, b) => a[0] - b[0])
  let total = 0
  let cursor = -1
  for (const [s, e] of spans) {
    const from = Math.max(s, cursor)
    if (e > from) total += e - from
    cursor = Math.max(cursor, e)
  }
  return total
}

registerIntent({
  id: 'week_overview',
  describe: 'Overview of a week (or other span): per day how many entries, booked vs free hours, exams and todos due',
  slots: { from: 'YYYY-MM-DD optional, default today', to: 'YYYY-MM-DD optional, default end of this week' },
  examples: ['How does my week look?', 'Wie sieht meine Woche aus?'],
  completions: {
    de: ['Wie sieht meine Woche aus?', 'Wie sieht nächste Woche aus?'],
    en: ['How does my week look?', 'How does next week look?'],
  },
  match(text, { today }) {
    if (/\b(todo|exam)\b/.test(text) || /\b(wann|when)\b/.test(text)) return null
    if (/\b(gelernt|geuebt|studied|study)\b/.test(text)) return null
    const x = extract(text, today)
    if (x.date && !x.range) return null
    if (!x.range && !/\b(woche|week|wochenende|weekend)\b/.test(text)) return null
    const asks = /\b(wie sieht|wie schaut|wie ist|how does|how is|how'?s|what does|overview|uebersicht|zusammenfassung|summary|was steht|what'?s on|whats on|was habe ich|was hab ich|was ist los|plan|geplant|planned|agenda|zeig\w*|show)\b/.test(text)
    return asks ? { score: 0.9, slots: { from: x.range?.from ?? null, to: x.range?.to ?? null } } : null
  },
  execute(slots, api) {
    const dow = parseDayKey(api.today).getDay()
    let from = slots.from || api.today
    let to = slots.to || addDays(api.today, (7 - dow) % 7)
    if (daysBetween(from, to) < 2 && !slots.to) to = addDays(from, 6)
    if (daysBetween(from, to) > 13) to = addDays(from, 13)
    const { dayStart, dayEnd } = api.settings

    const days = []
    for (let d = from; d <= to; d = addDays(d, 1)) days.push(d)
    const rows = days.map(d => {
      const occ = api.occurrences(d, d)
      const booked = bookedMinutes(occ.filter(o => !o.allDay), dayStart, dayEnd)
      const free = d < api.today ? 0 : freeSlots(api, d, 30).reduce((n, s) => n + s.end - s.start, 0)
      const exams = [...new Set([
        ...api.exams.filter(x => x.exam_date === d).map(x => x.title),
        ...occ.filter(o => o.event.kind === 'exam').map(o => o.event.title),
      ].filter(Boolean))]
      const due = api.todos.filter(t => !t.completed && t.due_date === d).length
      return { d, occ, booked, free, exams, due }
    })

    const items = rows.map(r => ({
      icon: r.exams.length ? '🎓' : r.occ.length ? '📅' : '🌿',
      label: api.fmtDay(r.d),
      value: api.L(`${r.occ.length} ${r.occ.length === 1 ? 'entry' : 'entries'}`, `${r.occ.length} ${r.occ.length === 1 ? 'Termin' : 'Termine'}`),
      sub: [
        r.booked ? api.L(`${fmtDuration(r.booked, 'en')} booked`, `${fmtDuration(r.booked, 'de')} verplant`) : null,
        r.d >= api.today ? api.L(`${fmtDuration(r.free, 'en')} free`, `${fmtDuration(r.free, 'de')} frei`) : null,
        r.exams.length ? `🎓 ${r.exams.join(', ')}` : null,
        r.due ? `${r.due} Todo${r.due === 1 ? '' : 's'}` : null,
      ].filter(Boolean).join(' · '),
      query: api.L(`What's on ${r.d}?`, `Was steht am ${r.d} an?`),
    }))

    const future = rows.filter(r => r.d >= api.today)
    const freest = [...future].sort((a, b) => b.free - a.free)[0]
    const busiest = [...rows].sort((a, b) => b.booked - a.booked)[0]
    const total = rows.reduce((n, r) => n + r.occ.length, 0)
    const lines = [api.L(
      `${total} ${total === 1 ? 'entry' : 'entries'} between ${api.fmtDay(from)} and ${api.fmtDay(to)}.`,
      `${total} ${total === 1 ? 'Termin' : 'Termine'} von ${api.fmtDay(from)} bis ${api.fmtDay(to)}.`,
    )]
    if (busiest?.booked) lines.push(api.L(`Busiest: ${api.fmtDay(busiest.d)} (${fmtDuration(busiest.booked, 'en')}).`, `Am vollsten: ${api.fmtDay(busiest.d)} (${fmtDuration(busiest.booked, 'de')}).`))
    if (freest?.free) lines.push(api.L(`Most free time: ${api.fmtDay(freest.d)} (${fmtDuration(freest.free, 'en')}).`, `Am meisten frei: ${api.fmtDay(freest.d)} (${fmtDuration(freest.free, 'de')}).`))
    const examDays = rows.filter(r => r.exams.length)
    if (examDays.length) lines.push(`🎓 ${examDays.map(r => `${r.exams.join(', ')} (${api.fmtDay(r.d)})`).join(', ')}`)

    const all = rows.flatMap(r => r.occ).sort(byStart).map(o => occItem(o, true))
    return {
      title: api.L('Your week', 'Deine Woche'),
      blocks: [
        { type: 'text', data: { text: lines.join('\n') } },
        { type: 'stats', data: { items } },
        ...(all.length ? [{ type: 'events', data: { items: all.slice(0, 40) } }] : []),
      ],
      followups: [api.L('When am I free this week?', 'Wann habe ich diese Woche Zeit?'), api.L('What should I study today?', 'Was soll ich heute lernen?')],
    }
  },
})

// ── Exam countdown ─────────────────────────────────────────────────────────

const EXAM_STOP = [
  'wie', 'lange', 'noch', 'bis', 'zur', 'zum', 'zu', 'der', 'die', 'das', 'den', 'dem', 'meine', 'meiner', 'meinen', 'mein', 'my', 'the',
  'next', 'naechste', 'naechsten', 'naechster', 'kommende', 'kommenden', 'upcoming', 'how', 'long', 'until', 'till', 'many', 'days', 'tage',
  'viele', 'wieviele', 'wann', 'ist', 'sind', 'is', 'are', 'when', 'exam', 'countdown', 'habe', 'hab', 'ich', 'i', 'have', 'do', 'zeig', 'zeige',
  'show', 'alle', 'all', 'es', 'it', 'in', 'an', 'am', 'list', 'liste', 'uebersicht', 'welche', 'which', 'fuer', 'for', 'es', 'gibt', 'there',
]

registerIntent({
  id: 'exam_countdown',
  describe: 'Upcoming exams: days left and how ready the linked topic is (accuracy vs target, trend)',
  slots: { query: 'words from the exam title, optional' },
  examples: ['How long until the anatomy exam?', 'Wie lange noch bis zur Anatomie-Prüfung?'],
  completions: {
    de: ['Wie lange noch bis zur Prüfung?', 'Welche Prüfungen habe ich?'],
    en: ['How long until my next exam?', 'Which exams do I have?'],
  },
  match(text, { today }) {
    if (!/\bexam\b/.test(text)) return null
    if (/\b(add|trag\w*|erstell\w*|eintragen|anlegen|neue?[nrs]?|schedule|plan\w*|verschieb\w*|loesch\w*|delete|move|cancel|study|gelernt)\b/.test(text)) return null
    if (!/\b(wie lange|wie viele|wieviele|how long|how many|countdown|wann|when|naechste\w*|next|meine\w*|my|kommende\w*|upcoming|bis|until|welche\w*|which|alle|all|list\w*|uebersicht|zeig\w*|show|gibt es)\b/.test(text)) return null
    const x = extract(text, today)
    return { score: 0.9, slots: { query: cleanTitle(x.rest, EXAM_STOP).toLowerCase() } }
  },
  execute(slots, api) {
    const seen = new Set()
    let list = []
    const add = (title, date, topicId, startMin = null) => {
      const key = `${fold(title)}|${date}`
      if (seen.has(key)) return
      seen.add(key)
      list.push({ title: title || api.L('Exam', 'Prüfung'), date, topicId, startMin })
    }
    for (const x of api.exams) if (x.exam_date && x.exam_date >= api.today) add(x.title, x.exam_date, x.topic_id ?? null)
    for (const o of api.occurrences(api.today, addDays(api.today, 365))) {
      if (o.event.kind === 'exam') add(o.event.title, o.date, o.event.topic_id ?? null, o.allDay ? null : o.startMin)
    }

    const topicOf = e => (e.topicId ? api.topics.find(t => t.id === e.topicId) : null) ?? api.findTopicIn(e.title)
    const q = String(slots.query ?? '').trim()
    if (q) list = list.filter(e => matchScore(q, `${e.title} ${topicOf(e)?.name ?? ''}`, { lang: api.lang }).score >= 0.5)
    list.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0))

    if (!list.length) {
      return {
        title: api.L('Exams', 'Prüfungen'),
        blocks: [{ type: 'text', data: { text: q ? api.L(`No upcoming exam matching “${q}”.`, `Keine anstehende Prüfung passend zu „${q}“.`) : api.L('No upcoming exams.', 'Keine anstehenden Prüfungen.') } }],
      }
    }

    const items = list.slice(0, 8).map(e => {
      const topic = topicOf(e)
      const days = daysBetween(api.today, e.date)
      const acc = topic ? summarize(api.sessions, { topicId: topic.id }).accuracy : null
      const trend = topic ? accuracyTrend(api.sessions, topic.id, api.today) : null
      return {
        e, topic, days, acc,
        item: {
          topicId: topic?.id ?? null,
          icon: '🎓',
          label: e.title,
          value: days === 0 ? api.L('today', 'heute') : days === 1 ? api.L('tomorrow', 'morgen') : api.L(`${days} d`, `${days} T`),
          sub: [
            `${api.fmtDay(e.date)}${e.startMin != null ? ` ${fmtMin(e.startMin)}` : ''}`,
            topic ? `${topic.name}: ${fmtPctShort(acc)} / ${api.L('target', 'Ziel')} ${topic.target_accuracy ?? 80} %` : null,
            trend ? fmtDelta(trend.delta) : null,
          ].filter(Boolean).join(' · '),
          trend: trend?.dir ?? null,
          query: topic ? api.L(`Is ${topic.name} improving?`, `Wird ${topic.name} besser?`) : null,
        },
      }
    })

    const first = items[0]
    let head = first.days === 0
      ? api.L(`🎓 ${first.e.title} is today.`, `🎓 ${first.e.title} ist heute.`)
      : api.L(`🎓 ${first.e.title} in ${first.days} days (${api.fmtDay(first.e.date)}).`, `🎓 ${first.e.title} in ${first.days} Tagen (${api.fmtDay(first.e.date)}).`)
    if (first.topic && first.acc != null) {
      const target = Number(first.topic.target_accuracy ?? 80)
      head += first.acc >= target
        ? api.L(` You're at ${fmtPctShort(first.acc)} — target reached ✓`, ` Du liegst bei ${fmtPctShort(first.acc)} — Ziel erreicht ✓`)
        : api.L(` You're at ${fmtPctShort(first.acc)}, target ${target} %.`, ` Du liegst bei ${fmtPctShort(first.acc)}, Ziel ${target} %.`)
    }

    return {
      title: list.length === 1 ? first.e.title : api.L('Upcoming exams', 'Anstehende Prüfungen'),
      blocks: [{ type: 'text', data: { text: head } }, { type: 'stats', data: { items: items.map(x => x.item) } }],
      followups: [
        api.L('What should I study today?', 'Was soll ich heute lernen?'),
        ...(first.topic ? [api.L(`When can I study ${first.topic.name}?`, `Wann kann ich ${first.topic.name} lernen?`)] : []),
      ],
    }
  },
})
