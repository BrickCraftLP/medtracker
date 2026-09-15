// Shared bits of the guided flows (event and todo creation).

import { matchLocal } from '../engine/registry.js'
import { fold, normalize } from '../engine/normalize.js'

// Folded, punctuation-free text for yes/no/done checks ("Das war's!" → "das war s").
export const plain = s => fold(s).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

export const DONE = /^(fertig|done|finish(ed)?|das wars?|das war s|that s it|thats it|ende|stop|nichts mehr|keine mehr|no more|genug)$/
export const SKIP = /^(nein|no|nope|nee|keine?[nrs]?|nichts|nirgends|nowhere|none|skip|ueberspringen|egal|-)$/
export const YES = /^(ja|yes|yep|yeah|klar|gerne?|ok|okay|sure|jo|jup|passt)\b/
export const NO = /^(nein|no|nope|nee|ne|keine?|nicht|lieber nicht)\b/

export const newId = () => globalThis.crypto?.randomUUID?.() ?? `f${Date.now()}${Math.random().toString(36).slice(2)}`

// While a flow waits for an answer, a message that is clearly a new request
// ("Was steht morgen an?") leaves the flow instead of becoming, say, a place.
export function looksLikeNewRequest(text, api, ignore = []) {
  const n = normalize(text)
  if (!n) return false
  const m = matchLocal(n, { raw: text, today: api.today, lang: api.lang, api })
  if (!m || ignore.includes(m.intent.id)) return false
  return m.score >= 0.9 || (m.score >= 0.85 && /\?\s*$/.test(text))
}
