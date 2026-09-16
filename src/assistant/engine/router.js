// Query → Result.
//
// 0. A typed command ("/move_event title:Brunch date:fri") runs exactly as
//    written (command.js); problems come back as hints.
// 1. Every local intent scores the sentence (registry.matchAll). Phrasings the
//    user confirmed before (feedbackLog "learned") come first, then a
//    follow-up to the last answer ("und morgen?", followup.js). Several
//    requests in one sentence ("… und …") run as a chain.
// 2. Read-only answers show at once. When a model is on and already loaded, it
//    double-checks in the background and adds "Did you mean …?" if it
//    confidently disagrees.
// 3. Intents that change data straight away (`mutates`) only run when the
//    parser is sure. Otherwise the model checks first; if it disagrees — or no
//    model is on — the user picks from the candidates.
// 4. Nothing local fits: the model writes a command. Capable models plan in one
//    step; small ones pick among a few candidates, then build the command field
//    by field. The parser validates it and sends its objections back once for a
//    repair. A change it proposes still needs a tap. Failing that, the model
//    answers from the entries that match the question.
// Nothing falls back to an unrelated action: the last resort is a choice card.
//
// Every result carries meta.trace (candidates, decision, command, model
// replies) so a rated answer can be exported with everything needed to fix it.

import '../intents/index.js'
import { matchAll, getIntent, allIntents } from './registry.js'
import { normalize } from './normalize.js'
import { chatLLM, getLLMSettings, explainLoadError, llmReady, modelTier } from '../llm/index.js'
import { classifyPrompt, composePrompt, plannerPrompt, repairPrompt, answerPrompt, PROMPT_VERSION } from '../llm/prompt.js'
import { logUnknown } from './unknownLog.js'
import { findLearned } from './feedbackLog.js'
import { describeAction } from './describe.js'
import { parseCommand, looksLikeCommand, formatCommand, errorLines, MAX_CHAIN } from './command.js'
import { slotSpec, validateSlots, signature } from './schema.js'
import { tagQuery } from './tagger.js'
import { followupCandidate } from './followup.js'

export const LOCAL_THRESHOLD = 0.6
const SURE = 0.9            // a changing intent runs without a model check from here …
const SURE_NO_MODEL = 0.85  // … or from here when no model can check …
const GAP = 0.15            // … and only this far ahead of the runner-up
const WEAK = 0.35           // below this a candidate is not worth offering
const CHAIN_MIN = 0.85      // every part of a chained request must be this clear

// Intents the words of a question hint at, offered to the model next to the local matches.
const HINTS = [
  [/\btodo\b/, ['edit_todo', 'complete_todo', 'list_todos', 'add_todo', 'delete_todo']],
  [/\b(aender\w*|change|rename|benenn\w*|umbenenn\w*|heisst|heissen|update)\b/, ['edit_todo', 'move_event', 'rename_topic']],
  [/\b(verschieb\w*|verleg\w*|move|postpone|reschedule)\b/, ['move_event', 'edit_todo', 'move_exam']],
  [/\b(loesch\w*|entfern\w*|delete|remove|cancel|absag\w*)\b/, ['delete_event', 'delete_todo', 'delete_exam']],
  [/\b(wo|wohin|where|raum|room|ort|hoersaal|beginnt|endet|dauert|wie lange|how long)\b/, ['event_info', 'next_occurrence']],
  [/\b(zeit|frei|free|available)\b/, ['free_time']],
  [/\b(event|kalender|calendar|vorlesung|lecture|kurs|class)\b/, ['day_agenda', 'next_occurrence', 'event_info', 'add_event']],
  [/\bexam\b/, ['exam_countdown', 'exam_plan', 'add_exam', 'next_occurrence']],
  [/\bstudy\b/, ['study_suggestion', 'study_stats', 'topic_progress', 'start_session']],
  [/\b(woche|week)\b/, ['week_overview', 'weekly_review', 'workload_forecast']],
  [/\b(oeffne\w*|open|zeig\w*|show|geh\w*|go)\b/, ['open_screen']],
  [/\b(ziel\w*|target|gewicht\w*|weight)\b/, ['set_topic_target', 'set_topic_weight']],
  [/\b(merk\w*|remember|vergiss|forget|ueber mich|about me)\b/, ['remember', 'forget', 'about_me']],
  [/\b(hier|this|das|screen|bildschirm|seite|page)\b/, ['explain_screen']],
]
const FALLBACK_IDS = ['search_all', 'day_agenda', 'list_todos', 'event_info']

const round = n => Math.round((n ?? 0) * 100) / 100
const hasValues = slots => Object.values(slots ?? {}).some(v => v != null && v !== '' && v !== false)

function withMeta(result, meta) {
  return result ? { ...result, meta: { ...(result.meta ?? {}), ...meta } } : result
}

// Candidate ids for the model: local matches first, then what the words hint at.
function candidateIds(candidates, text, first = [], max = 6) {
  const ids = [...first, ...candidates.filter(c => c.score >= 0.2).slice(0, 4).map(c => c.intent.id)]
  for (const [re, list] of HINTS) if (re.test(text)) ids.push(...list)
  for (const id of FALLBACK_IDS) if (new Set(ids).size < 4) ids.push(id)
  return [...new Set(ids)].filter(id => getIntent(id)).slice(0, max)
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

// One card that runs several actions after a single tap.
export function confirmBlock(api, raw, cands, prompt = null) {
  return {
    type: 'confirm',
    data: {
      query: raw,
      prompt,
      actions: cands.map(c => ({ intent: c.intent.id, slots: c.slots ?? {}, label: describeAction(api, c.intent.id, c.slots ?? {}) })),
    },
  }
}

// Several results as one answer: later ones under their own heading. Only
// the last flow a part starts survives (one flow runs at a time).
function combineResults(results, api) {
  const parts = results.filter(Boolean)
  if (parts.length === 1) return parts[0]
  const blocks = []
  for (const r of parts) {
    blocks.push({ type: 'text', data: { text: r.title ?? '', heading: true } })
    blocks.push(...(r.blocks ?? []))
  }
  const flow = [...parts].reverse().find(r => r.startFlow)?.startFlow
  return {
    title: api.L(`${parts.length} answers`, `${parts.length} Antworten`),
    blocks,
    followups: parts.flatMap(r => r.followups ?? []).slice(0, 4),
    ...(flow ? { startFlow: flow } : {}),
  }
}

// "Was steht morgen an und wann habe ich Zeit?" → one clear intent per part.
function chainCandidates(raw, api, ctx) {
  if (!/;|\b(und|and|dann|then|danach)\b/i.test(raw)) return null
  const parts = raw.split(/\s*;\s*|\s*,?\s+(?:und dann|and then|und danach|danach|and also|und ausserdem|und außerdem|und|and)\s+/i).map(s => s.trim()).filter(Boolean)
  if (parts.length < 2 || parts.length > MAX_CHAIN) return null
  const cands = []
  for (const part of parts) {
    const text = normalize(part)
    const top = matchAll(text, { ...ctx, raw: part })[0]
    if (!top || top.score < CHAIN_MIN) return null
    cands.push({ ...top, raw: part })
  }
  const keys = new Set(cands.map(c => formatCommand(c.intent.id, c.slots)))
  if (keys.size < cands.length) return null
  // Two flows cannot run at once.
  if (cands.filter(c => ['add_event', 'add_todo'].includes(c.intent.id)).length > 1) return null
  return cands
}

// ── Typed commands ──────────────────────────────────────────────────────────

async function runCommands(raw, api, ctx, trace) {
  const { commands, errors } = parseCommand(raw, api)
  trace.command = raw.trim()
  if (errors.length) {
    trace.decision = 'command-error'
    const usage = [...new Set(commands.map(c => c.intent).filter(Boolean))].map(id => signature(getIntent(id)))
    return {
      title: api.L('Command not understood', 'Befehl nicht verstanden'),
      blocks: [
        { type: 'text', data: { text: errorLines(errors) } },
        ...(usage.length ? [{ type: 'text', data: { text: api.L(`Usage: ${usage.join('\n')}`, `So geht's: ${usage.join('\n')}`), mono: true } }] : []),
      ],
      meta: { source: 'command-error', trace },
    }
  }
  trace.decision = 'command'
  const results = []
  for (const c of commands) {
    const intent = getIntent(c.intent)
    // Typed exactly, so no "did you mean"; cards that guard a delete still show.
    const res = await intent.execute(c.slots, api, { ...ctx, command: true })
    results.push(res)
  }
  const out = combineResults(results, api)
  const first = commands[0]
  return withMeta(out, { source: 'command', intent: first.intent, slots: first.slots, score: 1, trace })
}

// ── Main ────────────────────────────────────────────────────────────────────

export async function runQuery(raw, api, { onStatus, onBackground } = {}) {
  const ctx = { raw, today: api.today, lang: api.lang, api }
  const trace = { promptVersion: PROMPT_VERSION, normalized: null, candidates: [], decision: null, command: null, llm: [] }
  if (looksLikeCommand(raw)) return runCommands(raw, api, ctx, trace)

  const text = normalize(raw)
  if (!text) return null
  trace.normalized = text
  if (api.screen?.screen) trace.screen = api.screen
  const settings = getLLMSettings()
  const modelOn = settings.backend !== 'off'
  const onProgress = p => onStatus?.('llm-loading', p)
  let llmError = null
  let tagged = null
  const tag = () => (tagged ??= (() => { try { return tagQuery(raw, api) } catch (e) { console.warn('[assistant] tag', e); return { tagged: text, mentions: [] } } })())

  let candidates = matchAll(text, ctx)
  const learned = findLearned(text)
  if (learned && getIntent(learned.intent)) {
    const local = candidates.find(c => c.intent.id === learned.intent)
    candidates = [
      { intent: getIntent(learned.intent), score: 0.97, slots: local?.slots ?? learned.slots ?? {}, learned: true },
      ...candidates.filter(c => c.intent.id !== learned.intent),
    ]
  }
  const fu = api.recent?.length ? followupCandidate(text, raw, api) : null
  if (fu && (!fu.rest || !candidates[0] || candidates[0].score < 0.85) && !candidates[0]?.learned) {
    candidates = [fu.cand, ...candidates.filter(c => c.intent.id !== fu.cand.intent.id)]
  }
  trace.candidates = candidates.slice(0, 5).map(c => ({ intent: c.intent.id, score: round(c.score), slots: c.slots ?? {}, ...(c.learned ? { learned: true } : {}), ...(c.followup ? { followup: true } : {}) }))

  const run = async (cand, source, decision, extraCtx = {}) => {
    trace.decision = decision
    trace.command = formatCommand(cand.intent.id, cand.slots ?? {})
    const res = await cand.intent.execute(cand.slots ?? {}, api, { ...ctx, ...extraCtx })
    return withMeta(res, { source, intent: cand.intent.id, slots: cand.slots ?? {}, score: round(cand.score), trace })
  }
  const ask = async (kind, prompt, opts = {}) => {
    const entry = { kind }
    trace.llm.push(entry)
    try {
      const out = await chatLLM(prompt.messages, { schema: prompt.schema, ...opts })
      Object.assign(entry, { raw: out?.raw ?? null, parsed: out?.parsed ?? null, ms: out?.ms ?? null, model: out?.model ?? null })
      return out
    } catch (e) {
      entry.error = String(e?.message ?? e)
      throw e
    }
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

  // A command the model wrote, checked like a typed one → { intent, slots, errors, command }.
  const readCommand = (command, expectId = null) => {
    if (typeof command !== 'string' || !command.trim()) return null
    const cmd = command.trim().startsWith('/') ? command.trim() : `/${command.trim()}`
    const c = parseCommand(cmd, api, { query: raw }).commands[0]
    if (!c?.intent || (expectId && c.intent !== expectId)) return null
    return { intent: c.intent, slots: c.slots, errors: c.errors, command: formatCommand(c.intent, c.slots) }
  }
  // The fields of a compose reply, or its command — whichever is valid.
  const readComposed = (intent, out) => {
    const parsed = out?.parsed ?? {}
    const fromCommand = readCommand(parsed.command, intent.id)
    const fields = Object.fromEntries(slotSpec(intent).map(s => [s.key, parsed[s.key]]).filter(([, v]) => v != null && String(v).trim() !== ''))
    const v = validateSlots(intent, fields, api, { query: raw })
    const fromFields = { intent: intent.id, slots: v.slots, errors: v.errors, command: formatCommand(intent.id, v.slots) }
    if (fromCommand && !fromCommand.errors.length) return fromCommand
    if (!fromFields.errors.length && hasValues(fromFields.slots)) return fromFields
    if (fromCommand && fromCommand.errors.length <= fromFields.errors.length) return fromCommand
    return fromFields
  }
  // Fill an intent's slots with the model, field by field, with one repair turn.
  const compose = async cand => {
    if (hasValues(cand.slots) || !slotSpec(cand.intent).length) return { ...cand, slots: cand.slots ?? {} }
    const prompt = composePrompt(raw, cand.intent.id, { api, tagged: tag().tagged })
    const first = await ask('compose', prompt, { maxTokens: 220 })
    let got = readComposed(cand.intent, first)
    if (got.errors.length && first?.raw) {
      const fixed = await ask('repair', repairPrompt(prompt, first.raw, errorLines(got.errors)), { maxTokens: 220 })
      const again = readComposed(cand.intent, fixed)
      if (again.errors.length <= got.errors.length) got = again
    }
    trace.command = got.command
    return { ...cand, slots: got.slots, errors: got.errors }
  }
  // Invalid optional values were already dropped; what counts is every required one.
  const usable = cand => !!cand && slotSpec(cand.intent).filter(s => s.required).every(s => cand.slots?.[s.key] != null)

  const top = candidates[0] ?? null
  const gap = top ? top.score - (candidates[1]?.score ?? 0) : 0

  // ── 1. Several clear requests in one message ─────────────────────────────
  const chain = !top?.learned && !top?.followup ? chainCandidates(raw, api, ctx) : null
  if (chain) {
    trace.decision = 'chain'
    trace.command = chain.map(c => formatCommand(c.intent.id, c.slots)).join(' ; ')
    if (chain.some(c => c.intent.mutates)) {
      return {
        title: api.L('Should I do all of this?', 'Soll ich das alles machen?'),
        blocks: [confirmBlock(api, raw, chain)],
        meta: { source: 'ask', trace },
      }
    }
    const results = []
    for (const c of chain) results.push(await c.intent.execute(c.slots ?? {}, api, { ...ctx, raw: c.raw }))
    return withMeta(combineResults(results, api), { source: 'chain', intent: chain[0].intent.id, slots: chain[0].slots, score: round(Math.min(...chain.map(c => c.score))), trace })
  }

  // ── 2. The parser has a confident match ──────────────────────────────────
  if (top && top.score >= LOCAL_THRESHOLD) {
    const source = top.learned ? 'learned' : top.followup ? 'followup' : 'local'
    if (!top.intent.mutates) {
      const result = await run(top, source, source === 'local' ? 'local' : source)
      if (modelOn && onBackground && source === 'local' && top.score < 0.95) {
        backgroundCheck({ raw, text, api, candidates, top, trace, onBackground, tag })
      }
      return result
    }
    if (top.learned) return run(top, 'learned', 'learned')

    const others = candidates.slice(1).filter(c => c.score >= WEAK)
    if (modelOn && !(top.score >= SURE && gap >= GAP)) {
      try {
        onStatus?.('llm')
        const out = await ask('verify', classifyPrompt(raw, candidateIds(candidates, text), { api, tagged: tag().tagged }), { maxTokens: 40, onProgress })
        const pick = out?.parsed
        if (pick?.intent === top.intent.id && pick.confidence === 'high') return run(top, 'local-verified', 'model-agreed')
        const intent = pick?.intent && pick.intent !== 'none' ? getIntent(pick.intent) : null
        const alt = intent ? await compose(candidates.find(c => c.intent.id === intent.id) ?? { intent, score: 0, slots: null }) : null
        return choices(
          api.L('Did you mean …?', 'Meintest du …?'),
          api.L("I'm not sure what you want me to do — pick one:", 'Ich bin nicht sicher, was ich machen soll — wähle aus:'),
          [usable(alt) ? alt : null, top, ...others],
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

  // ── 3. Nothing confident locally: the model writes the command ───────────
  if (modelOn) {
    try {
      onStatus?.('llm')
      let cand = null
      let confident = false
      const alts = id => candidates.filter(c => c.intent.id !== id && c.score >= WEAK)

      if (modelTier(settings) >= 2) {
        const ids = candidateIds(candidates, text, [], 12)
        const prompt = plannerPrompt(raw, ids, { api, tagged: tag().tagged })
        const out = await ask('plan', prompt, { maxTokens: 200, onProgress })
        const chosen = out?.parsed?.intent
        if (chosen && chosen !== 'none' && getIntent(chosen)) {
          let got = readCommand(out.parsed.command, chosen)
          if ((!got || got.errors.length) && out?.raw) {
            const errors = got?.errors?.length ? errorLines(got.errors) : `- the command must start with /${chosen} and use the fields ${signature(getIntent(chosen))}`
            const fixed = await ask('repair', repairPrompt(prompt, out.raw, errors), { maxTokens: 200 })
            const again = readCommand(fixed?.parsed?.command, chosen)
            if (again && (!got || again.errors.length <= got.errors.length)) got = again
          }
          const intent = getIntent(chosen)
          const local = candidates.find(c => c.intent.id === chosen)
          cand = { intent, score: local?.score ?? 0, slots: got?.slots ?? local?.slots ?? {}, errors: got?.errors ?? [] }
          if (got) trace.command = got.command
          // A plan the parser also found some reason for answers outright.
          confident = !!local && local.score >= 0.2
          if (!usable(cand)) cand = await compose({ ...cand, slots: null })
        }
      } else {
        const out = await ask('classify', classifyPrompt(raw, candidateIds(candidates, text), { api, tagged: tag().tagged }), { maxTokens: 40, onProgress })
        const pick = out?.parsed
        const intent = pick?.intent && pick.intent !== 'none' ? getIntent(pick.intent) : null
        if (intent) {
          const local = candidates.find(c => c.intent.id === intent.id)
          cand = await compose({ intent, score: local?.score ?? 0, slots: local?.slots ?? null })
          confident = pick.confidence === 'high'
        }
      }

      // Needed slots that stayed empty after checking mean the model could
      // not extract anything real from the message (only guessed the intent) —
      // running it would answer on nothing, so this falls through to a
      // free-text answer instead of e.g. "Nothing found for “”".
      const needsSlots = cand && slotSpec(cand.intent).length > 0
      if (cand && usable(cand) && (!needsSlots || hasValues(cand.slots))) {
        const others = alts(cand.intent.id)
        // A read-only guess only answers outright when the model is confident.
        // A low-confidence guess is exactly the case a small model gets wrong
        // most, so that becomes a confirmation instead of a silently wrong answer.
        if (cand.intent.mutates || !confident) {
          return choices(
            cand.intent.mutates ? api.L('Should I do this?', 'Soll ich das machen?') : api.L('Did you mean this?', 'Meintest du das?'),
            cand.intent.mutates ? null : api.L("I'm not sure I understood — is this it?", 'Ich bin nicht sicher, ob ich das richtig verstanden habe — ist es das?'),
            [cand, ...others],
            cand.intent.mutates ? 'model-proposed-change' : 'model-low-confidence',
            { primary: true },
          )
        }
        const res = await run(cand, 'llm', 'model-classified', { fromLLM: true })
        if (res && others.length) res.blocks = [...(res.blocks ?? []), choicesBlock(api, raw, others, { prompt: api.L('Or did you mean …?', 'Oder meintest du …?') })]
        return res
      }
      const ans = (await ask('answer', answerPrompt(raw, api), { maxTokens: 220 }))?.parsed
      if (ans?.answer && ans.found !== false) {
        trace.decision = 'model-answered'
        return { title: api.L('Assistant', 'Assistent'), blocks: [{ type: 'text', data: { text: String(ans.answer) } }], meta: { source: 'llm-answer', trace } }
      }
    } catch (e) {
      console.warn('[assistant] local LLM failed', e)
      llmError = explainLoadError(e, api.lang)
    }
  }

  // ── 4. Say so, and offer what might fit ──────────────────────────────────
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
            ? api.L('Try one of these, or enable the on-device model in Settings → Assistant. Commands work too: type “/”.', 'Probier eines davon oder aktiviere das lokale Modell unter Einstellungen → Assistent. Befehle gehen auch: tippe „/“.')
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
async function backgroundCheck({ raw, text, api, candidates, top, trace, onBackground, tag }) {
  try {
    if (!(await llmReady())) return
    const ids = candidateIds(candidates, text, [top.intent.id])
    if (ids.length < 2) return
    const prompt = classifyPrompt(raw, ids, { api, tagged: tag().tagged })
    const out = await chatLLM(prompt.messages, { schema: prompt.schema, maxTokens: 40, timeoutMs: 12000, background: true })
    const pick = out?.parsed
    trace.llm.push({ kind: 'background', raw: out?.raw ?? null, parsed: pick ?? null, ms: out?.ms ?? null, model: out?.model ?? null })
    trace.background = pick?.intent === top.intent.id ? 'agreed' : (pick?.intent ?? 'no-reply')
    if (!pick?.intent || pick.intent === 'none' || pick.intent === top.intent.id || pick.confidence !== 'high') return
    const intent = getIntent(pick.intent)
    if (!intent) return
    let alt = candidates.find(c => c.intent.id === intent.id) ?? { intent, score: 0, slots: null }
    if (!hasValues(alt.slots) && slotSpec(intent).length) {
      const cp = composePrompt(raw, intent.id, { api, tagged: tag().tagged })
      const filled = await chatLLM(cp.messages, { schema: cp.schema, maxTokens: 220, timeoutMs: 12000, background: true })
      trace.llm.push({ kind: 'background-compose', raw: filled?.raw ?? null, parsed: filled?.parsed ?? null, ms: filled?.ms ?? null })
      const parsed = filled?.parsed ?? {}
      const cmd = typeof parsed.command === 'string' ? parseCommand(parsed.command, api, { query: raw }).commands[0] : null
      const slots = cmd?.intent === intent.id && !cmd.errors.length
        ? cmd.slots
        : validateSlots(intent, Object.fromEntries(slotSpec(intent).map(s => [s.key, parsed[s.key]]).filter(([, v]) => v != null && v !== '')), api, { query: raw }).slots
      alt = { ...alt, slots }
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
