// Exams (the Exams tab rows): add, move, delete. Adding and deleting show a
// card first; a tap (or a typed command) does it.

import { registerIntent } from '../engine/registry.js'
import { slot } from '../engine/schema.js'
import { extract, labelFrom } from '../engine/parse/index.js'
import { contextRef, isDeictic, isArticleOnly, resolveToken } from '../engine/references.js'

const ADD = /\b(add|create|new|neue?[nrs]?|trag\w*|eintragen|erstell\w*|leg\w*|anlegen|schedule|plan\w*|notier\w*|hab\w*|have|got|ist|is)\b/
const MOVE = /^(?:bitte )?(?:move|reschedule|postpone|verschieb\w*|verleg\w*)\s+(.+?)\s+(?:to|auf|nach|in)\s+(.+)$/
const DELETE = /^(?:bitte )?(?:delete|remove|cancel|loesch\w*|entfern\w*|streich\w*)\s+(.+)$/
const STOP = ['add', 'new', 'neue', 'neuen', 'neues', 'trag', 'trage', 'eintragen', 'ein', 'erstelle', 'lege', 'leg', 'an', 'anlegen', 'schedule', 'plane', 'notiere',
  'ich', 'habe', 'hab', 'have', 'i', 'got', 'a', 'an', 'the', 'my', 'eine', 'einen', 'meine', 'mir', 'am', 'on', 'um', 'fuer', 'for', 'bitte', 'please', 'ist', 'is', 'die', 'der', 'den', 'das']

// An exam row by name or reference. Exams in the calendar (events of kind
// exam) are move_event / delete_event's.
export function findExam(api, name) {
  if (!name) return null
  if (String(name).startsWith('@')) return resolveToken(api, 'exam', name)
  return api.index().best(name, { types: ['exam'], min: 0.5, focus: api.focus() })?.row ?? null
}

function examCalendar(api) {
  if (api.screen?.screen === 'exams' && api.screen.calendarId) return api.screen.calendarId
  const counts = new Map()
  for (const x of api.exams) if (x.calendar_id) counts.set(x.calendar_id, (counts.get(x.calendar_id) ?? 0) + 1)
  return [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? api.defaultCalendarId()
}

const examText = (api, x) => `🎓 ${x.title} — ${x.exam_date ? api.fmtDay(x.exam_date) : '?'}`

registerIntent({
  id: 'add_exam',
  describe: 'Add an exam to the Exams list with its date (and topic)',
  slots: {
    title: slot('text', 'exam name', { required: true, primary: true }),
    date: slot('date', 'exam day', { required: true }),
    topic: slot('ref:topic', 'topic the exam is about'),
    calendar: slot('ref:calendar', 'calendar it belongs to'),
  },
  examples: ['Add exam pharmacology on October 3', 'Trag die Klausur Pharmakologie am 3.10. ein'],
  completions: {
    de: ['Trag die Prüfung {title} am {day} ein', 'Neue Klausur {title} {day}'],
    en: ['Add exam {title} on {day}'],
  },
  match(text, { today, raw, api }) {
    if (!/\bexam\b/.test(text) || !ADD.test(text)) return null
    if (/\b(wann|when|wie|how|welche\w*|which|was|what)\b/.test(text) || /\?\s*$/.test(raw ?? '')) return null
    if (/\b(todo|study|verschieb\w*|move|loesch\w*|delete)\b/.test(text)) return null
    const x = extract(text, today)
    if (!x.date) return null
    const title = labelFrom(raw ?? text, x.rest, STOP)
    if (!title || /^(klausur|pruefung|exam|test)$/i.test(title.trim())) return null
    const topic = api?.findTopicIn(raw ?? '') ?? null
    // With a clock time it is a calendar entry of kind exam (add_event).
    return { score: x.startMin != null ? 0.86 : 0.92, slots: { title, date: x.date, topic: topic?.name ?? null } }
  },
  async execute(slots, api, ctx = {}) {
    const topic = slots.topic ? api.findTopic(slots.topic) : api.findTopicIn(slots.title ?? '')
    const calendar = slots.calendar ? api.index().best(slots.calendar, { types: ['calendar'], min: 0.5 })?.row : null
    const row = { title: String(slots.title ?? '').trim(), exam_date: slots.date, topic_id: topic?.id ?? null, calendar_id: calendar?.id ?? examCalendar(api), semester_id: null }
    if (!row.title || !row.exam_date) return { title: api.L('Exam needs a name and a day', 'Prüfung braucht Name und Tag'), blocks: [] }
    // Saved after a tap on the card, or straight away from a typed command.
    if (ctx.confirmed !== 'card' && !ctx.command) {
      return {
        title: api.L('Add this exam?', 'Diese Prüfung eintragen?'),
        blocks: [{ type: 'confirm', data: {
          prompt: `${examText(api, row)}${topic ? ` · ${topic.name}` : ''}`,
          actions: [{ intent: 'add_exam', slots: { ...slots, topic: topic?.name ?? null }, label: api.L('Add exam', 'Prüfung eintragen') }],
          confirmLabel: api.L('Add', 'Eintragen'),
        } }],
      }
    }
    const saved = await api.upsertExam(row)
    return {
      title: api.L('Exam added', 'Prüfung eingetragen'),
      blocks: [{ type: 'text', data: { text: examText(api, saved ?? row) } }],
      followups: [api.L(`Make a study plan for ${row.title}`, `Lernplan für ${row.title}`)],
      meta: { entities: saved?.id ? [{ type: 'exam', id: saved.id }] : [] },
    }
  },
})

registerIntent({
  id: 'move_exam',
  mutates: true,
  describe: 'Move an exam of the Exams list to another date',
  slots: { exam: slot('ref:exam', 'the exam', { required: true, primary: true }), date: slot('date', 'new day', { required: true }) },
  examples: ['Move the pharmacology exam to October 20', 'Verschiebe die Pharmakologie-Klausur auf den 20.10.'],
  completions: { de: ['Verschiebe die Prüfung {title} auf {day}'], en: ['Move exam {title} to {day}'] },
  match(text, { today, api }) {
    const m = text.match(MOVE)
    if (!m || !api) return null
    const target = extract(` ${m[2]} `, today)
    if (!target.date) return null
    const what = m[1].replace(/^(?:the|die|den|das|meine?)\s+/, '')
    if (isDeictic(what) || isArticleOnly(what)) {
      const ref = contextRef(api, ['exam', 'event', 'todo'])
      return ref?.type === 'exam' ? { score: 0.9, slots: { exam: ref.token, date: target.date } } : null
    }
    const exam = findExam(api, what)
    if (!exam) return null
    return { score: /\bexam\b/.test(text) ? 0.92 : 0.86, slots: { exam: exam.title, date: target.date } }
  },
  async execute(slots, api) {
    const exam = findExam(api, slots.exam)
    if (!exam) return { title: api.L(`No exam matching “${slots.exam}”`, `Keine Prüfung passend zu „${slots.exam}“`), blocks: [] }
    const saved = await api.upsertExam({ ...exam, exam_date: slots.date })
    return {
      title: api.L('Exam moved', 'Prüfung verschoben'),
      blocks: [{ type: 'text', data: { text: `${examText(api, saved ?? { ...exam, exam_date: slots.date })}\n${api.L('before', 'vorher')}: ${exam.exam_date ? api.fmtDay(exam.exam_date) : '?'}` } }],
      meta: { entities: [{ type: 'exam', id: exam.id }] },
    }
  },
})

registerIntent({
  id: 'delete_exam',
  describe: 'Delete an exam from the Exams list (asks for confirmation)',
  slots: { exam: slot('ref:exam', 'the exam', { required: true, primary: true }) },
  examples: ['Delete the pharmacology exam', 'Lösche die Klausur Pharmakologie'],
  completions: { de: ['Lösche die Prüfung {title}'], en: ['Delete exam {title}'] },
  match(text, { api }) {
    const m = text.match(DELETE)
    if (!m || !api || /\btodo\b/.test(text)) return null
    const what = m[1].replace(/^(?:the|die|den|das|meine?)\s+/, '')
    if (isDeictic(what) || isArticleOnly(what)) {
      const ref = contextRef(api, ['exam', 'event', 'todo'])
      return ref?.type === 'exam' ? { score: 0.88, slots: { exam: ref.token } } : null
    }
    const exam = findExam(api, what)
    return exam ? { score: /\bexam\b/.test(text) ? 0.92 : 0.8, slots: { exam: exam.title } } : null
  },
  async execute(slots, api, ctx = {}) {
    const exam = findExam(api, slots.exam)
    if (!exam) return { title: api.L(`No exam matching “${slots.exam}”`, `Keine Prüfung passend zu „${slots.exam}“`), blocks: [] }
    // Deleting always needs the tap on this card.
    if (ctx.confirmed !== 'card') {
      return {
        title: api.L('Delete this exam?', 'Diese Prüfung löschen?'),
        blocks: [{ type: 'confirm', data: {
          prompt: examText(api, exam),
          actions: [{ intent: 'delete_exam', slots: { exam: `@exam:${exam.id}` }, label: api.L('Delete exam', 'Prüfung löschen') }],
          confirmLabel: api.L('Delete', 'Löschen'),
          danger: true,
          entity: { type: 'exam', id: exam.id },
        } }],
      }
    }
    await api.removeExam(exam.id)
    return { title: api.L('Exam deleted', 'Prüfung gelöscht'), blocks: [{ type: 'text', data: { text: `🗑 ${exam.title}` } }] }
  },
})
