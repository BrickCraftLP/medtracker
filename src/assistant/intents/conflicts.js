// "Kann ich morgen 15–17 Uhr zum Zahnarzt?" — checks a wanted time against the
// calendar. Free: offers a ready draft. Taken: shows what is in the way, the
// nearest free alternatives, a "move the other one" option and "add anyway".

import { registerIntent, getIntent } from '../engine/registry.js'
import { normalize } from '../engine/normalize.js'
import { extract, cleanTitle } from '../engine/parse/index.js'
import { fmtMin, fmtDuration } from '../engine/parse/times.js'
import { minutesOf } from '../../utils/calendar/eventModel.js'
import { EVENT_STOP, displayTitle, overlapping, findAlternatives, alternativeBlocks, occItem } from './calendar.js'
import { startEventFlow, eventQuestion } from '../flows/eventFlow.js'

const OVERLAP = /\b(ueberschneid\w*|konflikt\w*|kollidier\w*|kollision\w*|clash\w*|conflict\w*|overlap\w*|collide\w*|dazwischen)\b/
const ASK_START = /^(?:und |and |bitte |also )?(kann ich|koennte ich|darf ich|geht|ginge|passt|passen|klappt|habe? ich|hab ich|bin ich|ist|waere|can i|could i|may i|am i|is|would|does|do i|will)\b/
const ADD = /\b(add|create|schedule|book|eintragen|trag\w*|erstell\w*|anlegen|blocke?n?|reservier\w*|notier\w*)\b/
const MOVE_DEL = /\b(move|reschedule|verschieb\w*|verleg\w*|delete|loesch\w*|cancel|remove|entfern\w*)\b/

const STOP = [
  ...EVENT_STOP,
  'kann', 'koennte', 'darf', 'geht', 'ginge', 'passt', 'passen', 'klappt', 'ist', 'is', 'waere', 'bin', 'am', 'do', 'does', 'will', 'may',
  'frei', 'free', 'zeit', 'time', 'available', 'verfuegbar', 'moeglich', 'possible', 'ok', 'okay', 'es', 'it', 'das', 'there', 'da', 'dort',
  'sich', 'mit', 'etwas', 'was', 'something', 'ob', 'whether', 'noch', 'schon', 'also', 'und', 'and', 'gehen', 'go', 'fahren', 'machen', 'do',
  'ueberschneidet', 'ueberschneidung', 'konflikt', 'kollidiert', 'overlap', 'overlaps', 'conflict', 'clash', 'dazwischen', 'irgendwas', 'anything',
]

registerIntent({
  id: 'check_overlap',
  describe: 'Check whether a specific date + time is free or overlaps existing entries; suggests nearest free alternatives',
  slots: { date: 'YYYY-MM-DD', start: 'HH:MM', end: 'HH:MM optional', minutes: 'duration minutes optional', title: 'what the user wants to do, optional' },
  examples: ['Can I go to the dentist tomorrow 3-5pm?', 'Kann ich morgen von 15 bis 17 Uhr zum Zahnarzt?'],
  completions: {
    de: ['Kann ich {day} um {clock} {title}?', 'Passt {day} {time}?', 'Überschneidet sich {day} {time} mit etwas?'],
    en: ['Can I {title} {day} at {clock}?', 'Is {day} {time} free?'],
  },
  match(text, { today, raw }) {
    if (/\btodo\b/.test(text) || /\b(wann|when)\b/.test(text) || MOVE_DEL.test(text)) return null
    const x = extract(text, today)
    const overlap = OVERLAP.test(text)
    if (x.startMin == null || (x.fuzzyTime && !overlap)) return null
    const ask = ASK_START.test(text) || /\?\s*$/.test(raw ?? '')
    if (!overlap && !ask) return null
    if (ADD.test(text) && !ASK_START.test(text) && !overlap) return null
    return {
      score: overlap ? 0.93 : 0.92,
      slots: {
        date: x.date ?? x.range?.from ?? null,
        start: fmtMin(x.startMin),
        end: x.endMin != null ? fmtMin(x.endMin) : null,
        minutes: x.minutes,
        title: cleanTitle(x.rest, STOP),
      },
    }
  },
  execute(slots, api, ctx = {}) {
    const date = slots.date || api.today
    const start = slots.start ? minutesOf(slots.start) : null
    if (start == null) return getIntent('free_time').execute({ date }, api, ctx)
    const endIn = slots.end ? minutesOf(slots.end) : null
    const len = endIn != null && endIn > start ? endIn - start : Number(slots.minutes) || 60
    const end = Math.min(1439, start + len)

    const topic = api.findTopicIn(ctx.raw ?? slots.title ?? '')
    const kind = /\bstudy\b/.test(normalize(`${slots.title ?? ''} ${ctx.raw ?? ''}`)) ? 'study' : 'event'
    const title = displayTitle(api, slots.title, ctx.raw) || (kind === 'study' && topic ? api.L(`Study: ${topic.name}`, `Lernen: ${topic.name}`) : '')
    const draft = { title, date, startMin: start, endMin: end, kind, topic_id: topic?.id ?? null }
    const day = api.fmtDay(date)
    const span = `${fmtMin(start)}–${fmtMin(end)}`

    const notes = []
    const now = api.now?.() ?? new Date()
    if (date < api.today || (date === api.today && start < now.getHours() * 60 + now.getMinutes())) {
      notes.push(api.L('⏱ That time has already passed.', '⏱ Diese Zeit liegt schon in der Vergangenheit.'))
    }
    const exams = api.exams.filter(x => x.exam_date === date).map(x => x.title).filter(Boolean)
    if (exams.length) notes.push(`🎓 ${api.L('Exam that day', 'Prüfung an dem Tag')}: ${exams.join(', ')}`)
    const allDay = api.occurrences(date, date).filter(o => o.allDay).map(o => o.event.title).filter(Boolean)
    if (allDay.length) notes.push(`📅 ${api.L('All day', 'Ganztägig')}: ${allDay.join(', ')}`)
    const { dayStart, dayEnd } = api.settings
    if (start < dayStart || end > dayEnd) {
      notes.push(api.L(`Outside your waking hours (${fmtMin(dayStart)}–${fmtMin(dayEnd)}).`, `Außerhalb deiner Wachzeiten (${fmtMin(dayStart)}–${fmtMin(dayEnd)}).`))
    }
    const noteBlock = notes.length ? [{ type: 'text', data: { text: notes.join('\n') } }] : []

    const conflicts = overlapping(api, date, start, end)
    const init = { title, date, startMin: start, endMin: end, kind, topic_id: draft.topic_id }
    if (!conflicts.length) {
      // Free: continue straight into creating it (title asked if none was given).
      const flow = startEventFlow(init, api)
      return {
        title: api.L('Free ✓', 'Frei ✓'),
        blocks: [
          { type: 'text', data: { text: api.L(`${day}, ${span}: nothing in the way.`, `${day}, ${span}: nichts im Weg.`) } },
          ...noteBlock,
          ...eventQuestion(flow, api).blocks,
        ],
        startFlow: flow,
      }
    }

    const lines = conflicts.map(o => {
      const overlapMin = Math.min(end, o.endMin) - Math.max(start, o.startMin)
      return `• ${o.event.title || '—'} ${fmtMin(o.startMin)}–${fmtMin(o.endMin)} (${fmtDuration(overlapMin, api.lang)} ${api.L('overlap', 'Überschneidung')})`
    })
    const slotBase = { minutes: len, title, kind, topicId: topic?.id ?? null }

    // A single movable entry in the way: offer to move that one instead.
    const followups = []
    const only = conflicts.length === 1 ? conflicts[0] : null
    const e = only?.event
    if (e && !e.rrule && !e.recurrence_parent_id && !['exam', 'class', 'deadline'].includes(e.kind) && e.title) {
      const olen = only.endMin - only.startMin
      const alt = findAlternatives(api, date, only.startMin, olen, { ignoreId: e.id })
      const options = [
        ...alt.sameDay.filter(s => !(s.start < end && start < s.end)).map(s => ({ date, start: s.start })),
        ...alt.otherDays.map(d => ({ date: d.date, start: d.slots[0].start })),
      ]
      for (const o of options.slice(0, 2)) {
        followups.push(api.L(`Move ${e.title} to ${o.date} at ${fmtMin(o.start)}`, `Verschiebe ${e.title} auf ${o.date} um ${fmtMin(o.start)}`))
      }
    }

    return {
      title: api.L('Overlap', 'Überschneidung'),
      blocks: [
        { type: 'text', data: { text: `⚠️ ${api.L(`${day}, ${span} overlaps with:`, `${day}, ${span} überschneidet sich mit:`)}\n${lines.join('\n')}` } },
        { type: 'events', data: { items: conflicts.map(o => occItem(o)) } },
        ...noteBlock,
        ...alternativeBlocks(api, findAlternatives(api, date, start, len), date, slotBase),
        { type: 'flowButton', data: { label: api.L('Add it anyway', 'Trotzdem eintragen'), init: { ...init, conflictOk: true } } },
      ],
      followups,
    }
  },
})
