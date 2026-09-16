// Ratings of assistant answers and phrasings the user confirmed, kept on this
// device only. Bad ratings are exported from Settings → Assistant as JSON so
// the parser can be fixed against real questions; confirmed phrasings
// ("learned") are matched directly next time and shown to the local model as
// examples.

import { getUnknown } from './unknownLog.js'
import { normalize } from './normalize.js'
import { getStoredProfile } from './userStore.js'

const FEEDBACK_KEY = 'mt_assistant_feedback'
const LEARNED_KEY = 'mt_assistant_learned'
const MAX_FEEDBACK = 300
const MAX_LEARNED = 100

export const APP_VERSION = typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'dev'  // eslint-disable-line no-undef

const read = key => { try { return JSON.parse(localStorage.getItem(key) ?? '[]') } catch { return [] } }
const write = (key, list) => {
  try { localStorage.setItem(key, JSON.stringify(list)) } catch { /* storage full or unavailable */ }
  window.dispatchEvent(new CustomEvent('mt-assistant-feedback'))
}
const newId = () => globalThis.crypto?.randomUUID?.() ?? `r${Date.now()}${Math.random().toString(36).slice(2)}`

// What an answer showed, without React-only data.
function snapshot(result) {
  if (!result) return null
  const blocks = result.blocks ?? []
  return {
    title: result.title ?? null,
    texts: blocks.filter(b => b.type === 'text').map(b => b.data?.text).filter(Boolean),
    blockTypes: blocks.map(b => b.type),
    choices: blocks.filter(b => b.type === 'choices').flatMap(b => (b.data?.options ?? []).map(o => o.intent)),
    followups: result.followups ?? [],
  }
}

// rating: 'good' | 'bad'; extra: { reason, expected, lang, today, flow, llmModel }
// `thread` is every turn of the chat so far ([{ query, result }]), oldest
// first, so a bad rating on a later turn keeps the context that led to it
// (an earlier flow step, a misread follow-up) — not just that one prompt.
export function rateAnswer({ query, result, thread = null }, rating, extra = {}) {
  const meta = result?.meta ?? {}
  const conversation = (thread?.length ? thread : [{ query, result }]).map(e => ({ query: e.query, result: snapshot(e.result) }))
  const ratedIndex = conversation.length - 1
  const entry = {
    id: newId(),
    at: new Date().toISOString(),
    rating,
    reason: extra.reason ?? null,
    expected: extra.expected?.trim() || null,
    query,
    lang: extra.lang ?? null,
    today: extra.today ?? null,
    result: snapshot(result),
    conversation,
    ratedIndex,
    meta: { source: meta.source ?? null, intent: meta.intent ?? null, slots: meta.slots ?? null },
    trace: meta.trace ?? null,
    flow: extra.flow ?? null,
    llmModel: extra.llmModel ?? null,
    appVersion: APP_VERSION,
    promptVersion: meta.trace?.promptVersion ?? null,
  }
  write(FEEDBACK_KEY, [entry, ...read(FEEDBACK_KEY)].slice(0, MAX_FEEDBACK))
  if (rating === 'good' && meta.intent && meta.source !== 'llm-answer') learn(query, meta.intent, meta.slots)
  if (rating === 'bad') unlearn(query)
  return entry
}

export const getFeedback = () => read(FEEDBACK_KEY)
export const removeFeedback = id => write(FEEDBACK_KEY, read(FEEDBACK_KEY).filter(e => e.id !== id))
export const clearFeedback = () => write(FEEDBACK_KEY, [])

export function exportFeedback(intentIds = []) {
  return {
    kind: 'medtracker-assistant-feedback',
    exportedAt: new Date().toISOString(),
    appVersion: APP_VERSION,
    intents: intentIds,
    feedback: read(FEEDBACK_KEY),
    notUnderstood: getUnknown(),
    learned: read(LEARNED_KEY),
    // Short forms and preferences change what phrasings mean; free notes stay private.
    taught: (({ aliases, places, preferences }) => ({ aliases, places, preferences }))(getStoredProfile()),
  }
}

// ── Learned phrasings ──────────────────────────────────────────────────────

// Slots are stored only when they carry no ids or dates that go stale, so a
// learned "Was steht morgen an?" keeps working on other days: the intent is
// re-matched and only the intent choice is taken from here.
export function learn(query, intent, slots = null) {
  const key = normalize(query)
  if (!key || !intent) return
  const list = read(LEARNED_KEY).filter(e => e.key !== key)
  list.unshift({ key, query, intent, slots: slots ?? null, at: new Date().toISOString() })
  write(LEARNED_KEY, list.slice(0, MAX_LEARNED))
}

export function unlearn(query) {
  const key = normalize(query)
  const list = read(LEARNED_KEY)
  if (list.some(e => e.key === key)) write(LEARNED_KEY, list.filter(e => e.key !== key))
}

export const getLearned = () => read(LEARNED_KEY)
export const findLearned = normalizedText => read(LEARNED_KEY).find(e => e.key === normalizedText) ?? null
export const learnedExamples = (intentId, max = 3) => read(LEARNED_KEY).filter(e => e.intent === intentId).slice(0, max).map(e => e.query)
