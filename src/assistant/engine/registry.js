// Intent registry — the single place the assistant's "understanding" lives.
//
// An intent is a plain object:
//   id        stable string, also what the local LLM answers with
//   describe  one line for the LLM prompt (what it does)
//   slots     { name: 'description' } the LLM may fill in
//   examples  sample phrasings (shown as suggestions, fed to the LLM prompt)
//   match(text, ctx)      → null | { score: 0..1, slots }
//   execute(slots, api)   → Result | Promise<Result>
//
// Adding understanding = adding a file under ../intents and registering it.
// The LLM prompt is generated from this list, so it learns new intents for free.

const intents = new Map()

export function registerIntent(intent) {
  if (!intent?.id || typeof intent.execute !== 'function') {
    throw new Error('registerIntent: id and execute are required')
  }
  intents.set(intent.id, intent)
}

export const getIntent = id => intents.get(id)
export const allIntents = () => [...intents.values()]

// Share of the sentence's words an intent's slots account for — "Verschieb
// Brunch mit Anna auf Freitag" explains more words as move_event(title, date)
// than as a bare date lookup.
function coverage(text, slots) {
  const words = text.split(' ').filter(w => w.length > 2)
  if (!words.length) return 0
  const values = ` ${Object.values(slots ?? {}).filter(v => v != null && v !== false).map(v => String(v).toLowerCase()).join(' ')} `
  return words.filter(w => values.includes(w)).length / words.length
}

const NEAR_TIE = 0.02

// Every local match, best first. Near-ties (within 0.02) go to the intent whose
// slots explain more of the sentence; exact ties then keep registration order.
// Scores themselves are never changed, so thresholds keep their meaning.
export function matchAll(text, ctx) {
  const out = []
  for (const intent of intents.values()) {
    if (!intent.match) continue
    let m = null
    try { m = intent.match(text, ctx) } catch (e) { if (import.meta.env?.DEV) console.warn(`[assistant] ${intent.id}.match`, e); m = null }
    if (m) out.push({ intent, ...m })
  }
  out.sort((a, b) => b.score - a.score)
  if (out.length > 1 && out[0].score - out[1].score <= NEAR_TIE) {
    const top = out[0].score
    const near = out.filter(c => top - c.score <= NEAR_TIE)
    const rank = new Map(near.map(c => [c, c.score + 0.03 * coverage(text, c.slots)]))
    near.sort((a, b) => rank.get(b) - rank.get(a))
    out.splice(0, near.length, ...near)
  }
  return out
}

// Best local match across every intent. Ties go to the earlier-registered one.
export const matchLocal = (text, ctx) => matchAll(text, ctx)[0] ?? null
