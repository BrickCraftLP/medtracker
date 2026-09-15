// Query → Result.
//
// 1. Every local intent scores the sentence (registry.matchAll). Phrasings the
//    user confirmed before (feedbackLog "learned") come first.
// 2. Read-only answers show at once. When a model is on and already loaded, it
//    double-checks in the background and adds "Did you mean …?" if it
//    confidently disagrees.
// 3. Intents that change data straight away (`mutates`) only run when the
//    parser is sure. Otherwise the model checks first; if it disagrees — or no
//    model is on — the user picks from the candidates.
// 4. Nothing local fits: the model picks among a few candidates (its reply is
//    constrained to their ids), fills the slots, or answers from the entries
//    that match the question. A change it proposes still needs a tap.
// Nothing falls back to an unrelated action: the last resort is a choice card.
//
// Every result carries meta.trace (candidates, decision, model replies) so a
// rated answer can be exported with everything needed to fix it.

import '../intents/index.js'
import { matchAll, getIntent, allIntents } from './registry.js'
import { normalize, fold } from './normalize.js'
import { matchScore, searchWords } from './lexicon.js'
import { addDays } from '../../utils/calendar/eventModel.js'
import { chatLLM, getLLMSettings, explainLoadError, llmReady } from '../llm/index.js'
import { classifyPrompt, slotPrompt, answerPrompt, PROMPT_VERSION } from '../llm/prompt.js'
import { logUnknown } from './unknownLog.js'
import { findLearned } from './feedbackLog.js'
import { describeAction } from './describe.js'

export const LOCAL_THRESHOLD = 0.6
const SURE = 0.9            // a changing intent runs without a model check from here …
const SURE_NO_MODEL = 0.85  // … or from here when no model can check …
const GAP = 0.15            // … and only this far ahead of the runner-up
const WEAK = 0.35           // below this a candidate is not worth offering

// Intents the words of a question hint at, offered to the model next to the local matches.
const HINTS = [
  [/\btodo\b/, ['edit_todo', 'complete_todo', 'list_todos', 'add_todo', 'delete_todo']],
  [/\b(aender\w*|change|rename|benenn\w*|umbenenn\w*|heisst|heissen|update)\b/, ['edit_todo', 'move_event']],
  [/\b(verschieb\w*|verleg\w*|move|postpone|reschedule)\b/, ['move_event', 'edit_todo']],
  [/\b(loesch\w*|entfern\w*|delete|remove|cancel|absag\w*)\b/, ['delete_event', 'delete_todo']],
  [/\b(wo|wohin|where|raum|room|ort|hoersaal|beginnt|endet|dauert|wie lange|how long)\b/, ['event_info', 'next_occurrence']],
  [/\b(zeit|frei|free|available)\b/, ['free_time']],
  [/\b(event|kalender|calendar|vorlesung|lecture|kurs|class)\b/, ['day_agenda', 'next_occurrence', 'event_info', 'add_event']],
  [/\bexam\b/, ['exam_countdown', 'next_occurrence']],
  [/\bstudy\b/, ['study_suggestion', 'study_stats', 'topic_progress']],
  [/\b(woche|week)\b/, ['week_overview']],
]
const FALLBACK_IDS = ['search_all', 'day_agenda', 'list_todos', 'event_info']

const round = n => Math.round((n ?? 0) * 100) / 100
const hasValues = slots => Object.values(slots ?? {}).some(v => v != null && v !== '' && v !== false)

function withMeta(result, meta) {
  return result ? { ...result, meta: { ...(result.meta ?? {}), ...meta } } : result
}

// Candidate ids for the model: local matches first, then what the words hint at.
function candidateIds(candidates, text, first = []) {
  const ids = [...first, ...candidates.filter(c => c.score >= 0.2).slice(0, 4).map(c => c.intent.id)]
  for (const [re, list] of HINTS) if (re.test(text)) ids.push(...list)
  for (const id of FALLBACK_IDS) if (new Set(ids).size < 4) ids.push(id)
  return [...new Set(ids)].filter(id => getIntent(id)).slice(0, 6)
}

// Real names for the slot prompt, most similar to the question first.
function knownNames(api, text) {
  const rank = (items, name) => items
    .map(x => ({ x, s: matchScore(name(x), text, { lang: api.lang }).score }))
    .sort((a, b) => b.s - a.s)
    .map(r => r.x)
  const todos = rank(api.todos.filter(t => !t.completed && t.text), t => t.text).slice(0, 8).map(t => t.text)
  const titles = [...new Set(api.occurrences(addDays(api.today, -7), addDays(api.today, 30)).map(o => o.event.title).filter(Boolean))]
  return { todos, events: rank(titles, s => s).slice(0, 8), topics: api.topics.map(t => t.name).filter(Boolean).slice(0, 10) }
}

function coerceSlots(obj) {
  const out = {}
  for (const [k, v] of Object.entries(obj ?? {})) {
    const s = typeof v === 'string' ? v.trim() : v
    if (s == null || s === '' || s === 'null' || s === 'none') continue
    if (s === 'true' || s === 'false') out[k] = s === 'true'
    else if (k === 'reminders' && typeof s === 'string') out[k] = s.split(/[,\s]+/).map(Number).filter(Number.isFinite)
    else out[k] = s
  }
  return out
}

// Small models sometimes answer a slot with the prompt's own vocabulary
// instead of the message — e.g. asked to fill "query" for the intent
// "search_all", replying {"query":"search_all"}. Free-text fields (title,
// query, name, …) are dropped unless at least one of their words actually
// appears in what the user typed.
const FREE_TEXT_SLOTS = new Set(['query', 'text', 'title', 'new_text', 'name'])
function sanitizeSlots(raw, intentId, slots) {
  const rawWords = new Set(searchWords(normalize(raw)))
  const out = {}
  for (const [k, v] of Object.entries(slots ?? {})) {
    if (typeof v === 'string') {
      const norm = fold(v)
      if (norm === fold(intentId) || norm === fold(k)) continue
      if (FREE_TEXT_SLOTS.has(k)) {
        const words = searchWords(v)
        if (words.length && !words.some(w => rawWords.has(w))) continue
      }
    }
    out[k] = v
  }
  return out
}

const uniqueCands = list => {
  const seen = new Set()
  return list.filter(c => c?.intent && !seen.has(c.intent.id) && seen.add(c.intent.id))
}

export function choicesBlock(api, raw, cands, { prompt = null, primary = false } = {}) {
  return {
    type: 'choices',
    data: {
      query: raw,
      prompt,
      primary,
      options: uniqueCands(cands).slice(0, 4).map(c => ({ label: describeAction(api, c.intent.id, c.slots ?? {}), intent: c.intent.id, slots: c.slots ?? {} })),
    },
  }
}

export async function runQuery(raw, api, { onStatus, onBackground } = {}) {
  const text = normalize(raw)
  if (!text) return null
  const ctx = { raw, today: api.today, lang: api.lang, api }
  const modelOn = getLLMSettings().backend !== 'off'
  const trace = { promptVersion: PROMPT_VERSION, normalized: text, candidates: [], decision: null, llm: [] }
  const onProgress = p => onStatus?.('llm-loading', p)
  let llmError = null

  let candidates = matchAll(text, ctx)
  const learned = findLearned(text)
  if (learned && getIntent(learned.intent)) {
    const local = candidates.find(c => c.intent.id === learned.intent)
    candidates = [
      { intent: getIntent(learned.intent), score: 0.97, slots: local?.slots ?? learned.slots ?? {}, learned: true },
      ...candidates.filter(c => c.intent.id !== learned.intent),
    ]
  }
  trace.candidates = candidates.slice(0, 5).map(c => ({ intent: c.intent.id, score: round(c.score), slots: c.slots ?? {}, ...(c.learned ? { learned: true } : {}) }))
  const top = candidates[0] ?? null
  const gap = top ? top.score - (candidates[1]?.score ?? 0) : 0

  const run = async (cand, source, decision, extraCtx = {}) => {
    trace.decision = decision
    const res = await cand.intent.execute(cand.slots ?? {}, api, { ...ctx, ...extraCtx })
    return withMeta(res, { source, intent: cand.intent.id, slots: cand.slots ?? {}, score: round(cand.score), trace })
  }
  const ask = async (kind, prompt, opts = {}) => {
    const entry = { kind }
    trace.llm.push(entry)
    try {
      const out = await chatLLM(prompt.messages, { schema: prompt.schema, ...opts })
      Object.assign(entry, { raw: out?.raw ?? null, parsed: out?.parsed ?? null, ms: out?.ms ?? null, model: out?.model ?? null })
      return out?.parsed ?? null
    } catch (e) {
      entry.error = String(e?.message ?? e)
      throw e
    }
  }
  const withSlots = async cand => {
    if (hasValues(cand.slots) || !Object.keys(cand.intent.slots ?? {}).length) return { ...cand, slots: cand.slots ?? {} }
    const filled = await ask('slots', slotPrompt(raw, cand.intent.id, knownNames(api, raw)), { maxTokens: 160 })
    return { ...cand, slots: sanitizeSlots(raw, cand.intent.id, coerceSlots(filled)) }
  }
  const choices = (title, lead, cands, decision, opts = {}) => {
    trace.decision = decision
    const list = uniqueCands(cands)
    return {
      title,
      blocks: [
        ...(lead ? [{ type: 'text', data: { text: lead } }] : []),
        ...(list.length ? [choicesBlock(api, raw, list, opts)] : []),
      ],
      meta: { source: 'ask', trace },
    }
  }

  // ── 1. The parser has a confident match ──────────────────────────────────
  if (top && top.score >= LOCAL_THRESHOLD) {
    if (!top.intent.mutates) {
      const result = await run(top, top.learned ? 'learned' : 'local', 'local')
      if (modelOn && onBackground && !top.learned && top.score < 0.95) {
        backgroundCheck({ raw, text, api, candidates, top, trace, onBackground })
      }
      return result
    }
    if (top.learned) return run(top, 'learned', 'learned')

    const others = candidates.slice(1).filter(c => c.score >= WEAK)
    if (modelOn && !(top.score >= SURE && gap >= GAP)) {
      try {
        onStatus?.('llm')
        const pick = await ask('verify', classifyPrompt(raw, candidateIds(candidates, text)), { maxTokens: 40, onProgress })
        if (pick?.intent === top.intent.id && pick.confidence === 'high') return run(top, 'local-verified', 'model-agreed')
        const intent = pick?.intent && pick.intent !== 'none' ? getIntent(pick.intent) : null
        const alt = intent ? await withSlots(candidates.find(c => c.intent.id === intent.id) ?? { intent, score: 0, slots: null }) : null
        return choices(
          api.L('Did you mean …?', 'Meintest du …?'),
          api.L("I'm not sure what you want me to do — pick one:", 'Ich bin nicht sicher, was ich machen soll — wähle aus:'),
          [alt, top, ...others],
          'model-disagreed',
        )
      } catch (e) {
        console.warn('[assistant] check before changing failed', e)
        llmError = explainLoadError(e, api.lang)
      }
    }
    if (top.score >= (modelOn && !llmError ? SURE : SURE_NO_MODEL) && gap >= GAP) return run(top, 'local', 'local-sure')
    return choices(
      api.L('Did you mean …?', 'Meintest du …?'),
      [llmError && `⚠️ ${llmError}`, api.L('Before I change anything — which one?', 'Bevor ich etwas ändere — was davon?')].filter(Boolean).join('\n'),
      [top, ...others],
      'ask-before-change',
    )
  }

  // ── 2. Nothing confident locally: the model chooses ──────────────────────
  if (modelOn) {
    try {
      onStatus?.('llm')
      const pick = await ask('classify', classifyPrompt(raw, candidateIds(candidates, text)), { maxTokens: 40, onProgress })
      const intent = pick?.intent && pick.intent !== 'none' ? getIntent(pick.intent) : null
      // Needed slots that stayed empty after sanitizing mean the model couldn't
      // actually extract anything real from the message (only guessed the
      // intent) — running it would just answer on nothing, so this falls
      // through to a free-text answer instead of e.g. "Nothing found for “”".
      const needsSlots = intent && Object.keys(intent.slots ?? {}).length > 0
      const local = intent ? candidates.find(c => c.intent.id === intent.id) : null
      const cand = intent ? await withSlots({ intent, score: local?.score ?? 0, slots: local?.slots ?? null }) : null
      if (intent && (!needsSlots || hasValues(cand.slots))) {
        const alts = candidates.filter(c => c.intent.id !== intent.id && c.score >= WEAK)
        // A read-only guess only answers outright when the model itself is
        // confident. A "low" confidence guess is exactly the case this was
        // getting wrong most — a small model picking something plausible-
        // sounding but not what was asked — so that becomes a confirmation
        // instead of a silently wrong answer.
        if (intent.mutates || pick.confidence !== 'high') {
          return choices(
            intent.mutates ? api.L('Should I do this?', 'Soll ich das machen?') : api.L('Did you mean this?', 'Meintest du das?'),
            intent.mutates ? null : api.L("I'm not sure I understood — is this it?", 'Ich bin nicht sicher, ob ich das richtig verstanden habe — ist es das?'),
            [cand, ...alts],
            intent.mutates ? 'model-proposed-change' : 'model-low-confidence',
            { primary: true },
          )
        }
        const res = await run(cand, 'llm', 'model-classified', { fromLLM: true })
        if (res && alts.length) res.blocks = [...(res.blocks ?? []), choicesBlock(api, raw, alts, { prompt: api.L('Or did you mean …?', 'Oder meintest du …?') })]
        return res
      }
      const ans = await ask('answer', answerPrompt(raw, api), { maxTokens: 220 })
      if (ans?.answer && ans.found !== false) {
        trace.decision = 'model-answered'
        return { title: api.L('Assistant', 'Assistent'), blocks: [{ type: 'text', data: { text: String(ans.answer) } }], meta: { source: 'llm-answer', trace } }
      }
    } catch (e) {
      console.warn('[assistant] local LLM failed', e)
      llmError = explainLoadError(e, api.lang)
    }
  }

  // ── 3. Say so, and offer what might fit ──────────────────────────────────
  logUnknown(raw)
  trace.decision = 'not-understood'
  const weak = candidates.filter(c => c.score >= WEAK)
  return {
    title: api.L("I didn't get that", 'Das habe ich nicht verstanden'),
    blocks: [
      ...(llmError ? [{ type: 'text', data: { text: `⚠️ ${llmError}` } }] : []),
      ...(weak.length ? [choicesBlock(api, raw, weak, { prompt: api.L('Did you mean …?', 'Meintest du …?') })] : []),
      {
        type: 'text',
        data: {
          text: !modelOn
            ? api.L('Try one of these, or enable the on-device model in Settings → Assistant.', 'Probier eines davon oder aktiviere das lokale Modell unter Einstellungen → Assistent.')
            : weak.length ? api.L('Or try one of these:', 'Oder probier eines davon:') : api.L('Try one of these:', 'Probier eines davon:'),
        },
      },
    ],
    followups: allIntents().map(i => i.examples?.[api.lang === 'de' ? 1 : 0] ?? i.examples?.[0]).filter(Boolean).slice(0, 6),
    meta: { source: 'unknown', trace },
  }
}

// After a read-only answer is shown: ask the (already loaded) model whether it
// would have picked the same intent. Only a confident disagreement shows up,
// as a "Did you mean this instead?" card under the answer.
async function backgroundCheck({ raw, text, api, candidates, top, trace, onBackground }) {
  try {
    if (!(await llmReady())) return
    const ids = candidateIds(candidates, text, [top.intent.id])
    if (ids.length < 2) return
    const prompt = classifyPrompt(raw, ids)
    const out = await chatLLM(prompt.messages, { schema: prompt.schema, maxTokens: 40, timeoutMs: 12000, background: true })
    const pick = out?.parsed
    trace.llm.push({ kind: 'background', raw: out?.raw ?? null, parsed: pick ?? null, ms: out?.ms ?? null, model: out?.model ?? null })
    trace.background = pick?.intent === top.intent.id ? 'agreed' : (pick?.intent ?? 'no-reply')
    if (!pick?.intent || pick.intent === 'none' || pick.intent === top.intent.id || pick.confidence !== 'high') return
    const intent = getIntent(pick.intent)
    if (!intent) return
    let alt = candidates.find(c => c.intent.id === intent.id) ?? { intent, score: 0, slots: null }
    const needsSlots = Object.keys(intent.slots ?? {}).length > 0
    if (!hasValues(alt.slots) && needsSlots) {
      const sp = slotPrompt(raw, intent.id, knownNames(api, raw))
      const filled = await chatLLM(sp.messages, { schema: sp.schema, maxTokens: 160, timeoutMs: 12000, background: true })
      trace.llm.push({ kind: 'background-slots', raw: filled?.raw ?? null, parsed: filled?.parsed ?? null, ms: filled?.ms ?? null })
      alt = { ...alt, slots: sanitizeSlots(raw, intent.id, coerceSlots(filled?.parsed)) }
      // Still nothing real to act on: not worth surfacing as an alternative.
      if (!hasValues(alt.slots)) return
    }
    onBackground(result => ({
      ...result,
      blocks: [...(result.blocks ?? []), choicesBlock(api, raw, [alt], { prompt: api.L('Did you mean this instead?', 'Oder meintest du das?') })],
    }))
  } catch (e) {
    if (!/skipped/.test(String(e?.message ?? e))) console.warn('[assistant] background check', e)
  }
}
