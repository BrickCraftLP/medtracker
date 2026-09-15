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

// Every local match, best first. Ties keep registration order.
export function matchAll(text, ctx) {
  const out = []
  for (const intent of intents.values()) {
    if (!intent.match) continue
    let m = null
    try { m = intent.match(text, ctx) } catch { m = null }
    if (m) out.push({ intent, ...m })
  }
  return out.sort((a, b) => b.score - a.score)
}

// Best local match across every intent. Ties go to the earlier-registered one.
export const matchLocal = (text, ctx) => matchAll(text, ctx)[0] ?? null
