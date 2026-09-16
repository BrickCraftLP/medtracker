// Follow-ups that only change one part of the last question:
//   "Was steht morgen an?" → "und Freitag?"
//   "Wird Anatomie besser?" → "und Chemie?"
//   "Wo ist Genetik?" → "what about chemistry?"
// The last read-only answer's intent runs again with the new day, span, time,
// topic or search words merged into its slots.

import { getIntent } from './registry.js'
import { extract } from './parse/index.js'
import { fmtMin } from './parse/times.js'
import { searchWords } from './lexicon.js'
import { slotSpec } from './schema.js'
import { QUESTION_WORDS } from '../intents/search.js'

const LEAD = /^(?:und|and|what about|how about|und was ist mit|was ist mit|und wie (?:ist|sieht) es (?:mit|aus)|dann|then|also|und auch|and also|und fuer|and for|und am|and on|und um|and at|und bei|and in|und in|und ab|ok und|okay und)\b/
const FILLER = new Set(['mit', 'with', 'how', 'wie', 'ist', 'sieht', 'es', 'aus', 'dann', 'then', 'also', 'auch', 'was', 'denn', 'bei', 'and', 'und', 'ok', 'okay', 'dort', 'da'])
// Intents that start a flow or change data never repeat on their own.
const NO_REPEAT = new Set(['add_event', 'add_todo', 'check_overlap', 'current_time'])

// → { cand: { intent, slots, score, followup }, rest } | null
export function followupCandidate(text, raw, api) {
  const prev = api.recent?.[0]
  const intent = prev?.intent ? getIntent(prev.intent) : null
  if (!intent || intent.mutates || NO_REPEAT.has(intent.id)) return null
  const words = text.split(' ').filter(Boolean)
  if (words.length > 7) return null
  const lead = LEAD.test(text)
  if (!lead && words.length > 3 && !/\?\s*$/.test(raw ?? '')) return null

  const x = extract(text, api.today)
  const mentions = api.index().mentions(text, { types: ['topic', 'event', 'exam'], min: 1 })
  const named = new Set(mentions.flatMap(m => searchWords(m.entity.name)))
  const restWords = searchWords(x.rest).filter(w => !QUESTION_WORDS.has(w) && !FILLER.has(w))
  const rest = restWords.filter(w => !named.has(w)).join(' ')
  if (rest.split(' ').filter(Boolean).length > 2) return null

  const spec = slotSpec(intent)
  const has = key => spec.some(s => s.key === key)
  const slots = { ...(prev.slots ?? {}) }
  let changed = false
  if (x.range) {
    if (has('from')) { slots.from = x.range.from; slots.to = x.range.to; if (has('date')) slots.date = null; changed = true }
    else if (has('date')) { slots.date = x.range.from; changed = true }
  } else if (x.date) {
    if (has('date')) { slots.date = x.date; if (has('from')) { slots.from = null; slots.to = null } changed = true }
    else if (has('from')) { slots.from = x.date; slots.to = x.date; changed = true }
  }
  if (x.startMin != null && has('start')) { slots.start = fmtMin(x.startMin); changed = true }
  if (x.minutes && has('minutes')) { slots.minutes = x.minutes; changed = true }

  const topicKey = spec.find(s => s.type === 'ref:topic')?.key
  const topic = mentions.find(m => m.entity.type === 'topic')
  if (topicKey && topic) { slots[topicKey] = topic.entity.name; changed = true }
  if (has('query') && (rest || mentions.length) && !(topicKey && topic)) {
    slots.query = rest || searchWords(mentions[0].entity.name).join(' ')
    changed = true
  }
  if (!changed) return null
  // Leftover words the follow-up could not place mean it is probably a new question.
  if (rest && !has('query')) return null
  return { cand: { intent, slots, score: lead ? 0.93 : 0.9, followup: true }, rest }
}
