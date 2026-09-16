// Times next to another entry: "nach der Vorlesung", "right after brunch",
// "vor dem Zahnarzt". The entry is found through the entity index (or its
// kind: Vorlesung / lecture / Übung → a class), on the given day or next.
// Input is normalised text.
//
// → { date, startMin | endMin, after, event, match } | null

import { expandRange } from '../../../utils/calendar/recurrence.js'
import { addDays } from '../../../utils/calendar/eventModel.js'

const KIND = [
  ['class', /^(vorlesung\w*|lecture|class|kurs|seminar|uebung|tutorium|praktikum|lab|vo|ue)$/],
  ['exam', /^(exam|pruefung\w*|klausur\w*)$/],
  ['study', /^(study|lernsession|session)$/],
]
const ARTICLE = /^(der|dem|den|die|das|the|my|meiner|meinem|meinen|meine)$/

export function parseAnchor(text, api, date = null) {
  const m = text.match(/\b(direkt nach|gleich nach|right after|just after|nach|after|direkt vor|kurz vor|right before|just before|vor|before)\s+(.+)$/)
  if (!m || !api) return null
  const after = /nach|after/.test(m[1])
  const words = m[2].split(' ')
  let i = 0
  if (ARTICLE.test(words[0] ?? '')) i = 1
  const phraseWords = words.slice(i, i + 5)
  if (!phraseWords.length) return null

  const from = date ?? api.today
  const to = date ?? addDays(api.today, 14)
  const byStart = (a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startMin - b.startMin)
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes()
  const upcoming = o => !o.allDay && (o.date > api.today || o.date === date || o.endMin > nowMin)

  let occ = null
  let used = 0
  // A named entry: the longest leading phrase that names one.
  for (let n = phraseWords.length; n >= 1 && !occ; n--) {
    const phrase = phraseWords.slice(0, n).join(' ')
    const hit = api.index().mentions(phrase, { types: ['event'], min: 0.5 })[0]
    if (!hit) continue
    const list = expandRange(api.events.filter(e => e.id === hit.row.id || e.recurrence_parent_id === hit.row.id), from, to).filter(upcoming).sort(byStart)
    if (list.length) { occ = list[0]; used = n }
  }
  // Or a kind: "nach der Vorlesung" → the next class that day.
  if (!occ) {
    const kind = KIND.find(([, re]) => re.test(phraseWords[0]))?.[0]
    if (kind) {
      occ = api.occurrences(from, to).filter(o => o.event.kind === kind && upcoming(o)).sort(byStart)[0] ?? null
      used = 1
    }
  }
  if (!occ) return null
  const match = [m[1], ...words.slice(0, i + used)].join(' ')
  return after
    ? { date: occ.date, startMin: occ.endMin, after: true, event: occ.event, match }
    : { date: occ.date, endMin: occ.startMin, after: false, event: occ.event, match }
}
