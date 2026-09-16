// Prompts for the local model. Small models (360M–1.5B) fail at one big "pick
// any of 20 intents and fill everything from this data dump" prompt, so the
// work is split into small single-purpose questions:
//   classify — choose one of a few candidate intents (schema: enum of ids)
//   compose  — build the command for one chosen intent, field by field
//   planner  — capable models only: choose and build in one step
//   repair   — the parser's error hints go back once for a corrected reply
//   answer   — answer a free question from the entries that match it
//
// The model never acts directly. It writes a command in the same language a
// user can type (engine/command.js), the parser checks every value, and a
// change still needs a tap. The JSON schema's property order is the order the
// model fills fields in, so a tiny model builds the command step by step:
// first what it acts on, then when, then the rest, then the command itself.
//
// Small models cannot do date arithmetic: the clock is read fresh on every
// call and the prompt carries a table of day names → dates to copy from.
// Bump PROMPT_VERSION when a prompt changes; feedback exports record it.

import { getIntent } from '../engine/registry.js'
import { clockInfo, dateTable } from '../engine/clock.js'
import { buildQueryContext } from '../engine/context.js'
import { learnedExamples } from '../engine/feedbackLog.js'
import { signature, slotSpec, stepOrder, grammarLines } from '../engine/schema.js'
import { screenSummary, recentSummary } from '../engine/references.js'
import { profileLine } from '../engine/profile.js'

export const PROMPT_VERSION = 3

function nowLine() {
  const c = clockInfo('en')
  return `Now: ${c.dateLong}, ${c.time}${c.tz ? ` (${c.tz})` : ''}, ISO week ${c.week}.`
}

const safe = (fn, fallback = '') => { try { return fn() } catch (e) { console.warn('[assistant] prompt part', e); return fallback } }

function contextLines(api, { title = null } = {}) {
  if (!api) return []
  return [
    safe(() => screenSummary(api)) && `On screen: ${safe(() => screenSummary(api))}.`,
    safe(() => recentSummary(api)) && `Before: ${safe(() => recentSummary(api))}.`,
    safe(() => profileLine(api, { title })) && `About the user: ${safe(() => profileLine(api, { title }))}.`,
  ].filter(Boolean)
}

const quote = list => list.map(s => `"${s}"`).join(', ')

// Real names the model may need for these intents, most similar to the query first.
function knownNames(api, query, intents) {
  if (!api) return ''
  const types = new Set(intents.flatMap(i => slotSpec(i).filter(s => s.type.startsWith('ref:')).map(s => s.type.slice(4))))
  const lines = []
  const idx = safe(() => api.index(), null)
  if (!idx) return ''
  const focus = safe(() => api.focus(), new Set())
  const add = (label, type, filter) => {
    // What the user points at (screen, last answer) first, then the most similar.
    const pointed = idx.ofType(type).filter(e => focus.has(e.key))
    const names = [...new Set([...pointed, ...idx.ranked(type, query, { limit: 6, filter })].map(e => e.name))].slice(0, 6)
    if (names.length) lines.push(`${label}: ${quote(names)}`)
  }
  if (types.has('todo')) add('todos', 'todo', e => e.open)
  if (types.has('event')) add('calendar entries', 'event', e => !!e.when().next || !!e.when().last)
  if (types.has('topic')) add('topics', 'topic')
  if (types.has('exam')) add('exams', 'exam')
  if (types.has('calendar')) add('calendars', 'calendar')
  return lines.length ? `KNOWN NAMES (copy exactly):\n${lines.join('\n')}` : ''
}

// ctx: { api, tagged } — tagged is tagger.tagQuery(...).tagged
export function classifyPrompt(query, ids, ctx = {}) {
  const list = ids.map(id => getIntent(id)).filter(Boolean)
  const lines = list.map(i => {
    const examples = [...(i.examples ?? []).slice(0, 2), ...learnedExamples(i.id, 3)]
    return `- ${i.id}: ${i.describe}${examples.length ? `\n  e.g. ${examples.map(e => `"${e}"`).join(', ')}` : ''}`
  }).join('\n')
  const extra = [
    ...(ctx.api ? contextLines(ctx.api).slice(0, 2) : []),
    ctx.tagged ? `Recognised in the message: ${ctx.tagged}` : '',
  ].filter(Boolean).join('\n')

  const system = `You decide which action of a study-planner app matches the user's message (German or English).
Read the whole message. Pick the action that does exactly what the user asks for.
Do not pick an action only because it shares a word with the message.
Renaming, changing, moving, completing or deleting something is never a free-time question.
"this", "that", "it", "das", "hier" mean what is on screen or in the last answer.
If no action fits, pick "none".
${extra ? `\n${extra}\n` : ''}
Actions:
${lines}
- none: nothing above fits, the message is a question about the user's data, or it is unclear

Reply with JSON: {"intent":"<action id>","confidence":"high" or "low"}`

  return {
    messages: [{ role: 'system', content: system }, { role: 'user', content: query }],
    schema: {
      type: 'object',
      properties: {
        intent: { type: 'string', enum: [...list.map(i => i.id), 'none'] },
        confidence: { type: 'string', enum: ['high', 'low'] },
      },
      required: ['intent', 'confidence'],
    },
  }
}

// Build the command for one intent, one field at a time.
// → { messages, schema, steps: [slot keys in fill order] }
export function composePrompt(query, id, ctx = {}) {
  const intent = getIntent(id)
  const steps = stepOrder(intent)
  const c = clockInfo('en')
  const api = ctx.api
  const titleGuess = steps.some(s => s.key === 'title') ? query : null
  const names = knownNames(api, query, [intent])
  const fields = steps.map((s, n) => `${n + 1}. ${s.key} (${s.type.replace(/^enum:/, 'one of: ')})${s.required ? ' — required' : ''}: ${s.describe}`).join('\n')

  const system = `You turn the user's message (German or English) into ONE command for a study-planner app.
The action is already chosen: ${signature(intent)}
It does: ${intent.describe}

${grammarLines([intent]).join('\n')}

${nowLine()}
Dates — copy from this table, never calculate:
${dateTable(c.today)}
${[...contextLines(api, { title: titleGuess }), names].filter(Boolean).join('\n')}

Work step by step. Fill the fields in this order, each only from the message
(write "" when the message does not say it):
${fields}
${steps.length + 1}. command: /${id} followed by every field you filled, as field:value

${ctx.tagged ? `Recognised in the message: ${ctx.tagged}\n` : ''}Reply with ONE JSON object.`

  const properties = Object.fromEntries(steps.map(s => [s.key, { type: 'string' }]))
  properties.command = { type: 'string' }
  return {
    messages: [{ role: 'system', content: system }, { role: 'user', content: query }],
    schema: { type: 'object', properties, required: [...steps.map(s => s.key), 'command'] },
    steps: steps.map(s => s.key),
  }
}

// Choose and build in one step (capable models). → { messages, schema }
export function plannerPrompt(query, ids, ctx = {}) {
  const list = ids.map(id => getIntent(id)).filter(Boolean).slice(0, 12)
  const c = clockInfo('en')
  const api = ctx.api
  const actions = list.map(i => `${signature(i)}\n  ${i.describe}${i.examples?.length ? ` — e.g. "${i.examples[api?.lang === 'en' ? 0 : 1] ?? i.examples[0]}"` : ''}`).join('\n')

  const system = `You turn the user's message (German or English) into ONE command for a study-planner app.

ACTIONS
${actions}

${grammarLines(list).join('\n')}

${nowLine()}
Dates — copy from this table, never calculate:
${dateTable(c.today)}
${[...contextLines(api, { title: query }), knownNames(api, query, list)].filter(Boolean).join('\n')}

Steps:
1. intent: the action that does exactly what the message asks. Renaming, moving, completing or deleting is never a free-time question. "none" if nothing fits.
2. command: /intent with the fields the message gives, values written as described above.

${ctx.tagged ? `Recognised in the message: ${ctx.tagged}\n` : ''}Reply with JSON: {"intent":"...","command":"/..."}`

  return {
    messages: [{ role: 'system', content: system }, { role: 'user', content: query }],
    schema: {
      type: 'object',
      properties: { intent: { type: 'string', enum: [...list.map(i => i.id), 'none'] }, command: { type: 'string' } },
      required: ['intent', 'command'],
    },
  }
}

// The same prompt once more, with the parser's objections to the last reply.
export function repairPrompt(prompt, reply, errors) {
  return {
    ...prompt,
    messages: [
      ...prompt.messages,
      { role: 'assistant', content: String(reply ?? '') },
      { role: 'user', content: `The app could not use that command:\n${errors}\nFix only these problems and reply with the corrected JSON object.` },
    ],
  }
}

export function answerPrompt(query, api) {
  let data
  try { data = buildQueryContext(api, query) } catch (e) { console.warn('[assistant] query context', e); data = 'unavailable' }
  const c = clockInfo('en')
  const context = contextLines(api).join('\n')

  const system = `You answer questions about the user's own calendar, todos, exams and study data.
${nowLine()}

Dates:
${dateTable(c.today)}
${context ? `\n${context}\n` : ''}
Answer in ${api.lang === 'en' ? 'English' : 'German'} with 1-3 short sentences, using ONLY the DATA below.
If DATA does not contain the answer, set "found" to false.
Never invent entries, places, times or numbers.

DATA:
${data}

Reply with JSON: {"answer":"...","found":true or false}`

  return {
    messages: [{ role: 'system', content: system }, { role: 'user', content: query }],
    schema: { type: 'object', properties: { answer: { type: 'string' }, found: { type: 'boolean' } }, required: ['answer', 'found'] },
  }
}
