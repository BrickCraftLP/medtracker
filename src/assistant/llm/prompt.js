// Prompts for the local model. Small models (360M–1.5B) fail at one big "pick
// any of 20 intents and fill everything from this data dump" prompt, so the
// work is split into small single-purpose questions:
//   classify — choose one of a few candidate intents (schema: enum of ids)
//   slots    — fill the fields of one chosen intent
//   answer   — answer a free question from the entries that match it
// Bump PROMPT_VERSION when a prompt changes; feedback exports record it.
//
// Small models cannot do date arithmetic: the clock is read fresh on every
// call and the prompt carries a table of day names → dates to copy from.

import { getIntent } from '../engine/registry.js'
import { clockInfo, dateTable } from '../engine/clock.js'
import { buildQueryContext } from '../engine/context.js'
import { learnedExamples } from '../engine/feedbackLog.js'

export const PROMPT_VERSION = 2

function nowLine() {
  const c = clockInfo('en')
  return `Now: ${c.dateLong}, ${c.time}${c.tz ? ` (${c.tz})` : ''}, ISO week ${c.week}.`
}

export function classifyPrompt(query, ids) {
  const list = ids.map(id => getIntent(id)).filter(Boolean)
  const lines = list.map(i => {
    const examples = [...(i.examples ?? []).slice(0, 2), ...learnedExamples(i.id, 3)]
    return `- ${i.id}: ${i.describe}${examples.length ? `\n  e.g. ${examples.map(e => `"${e}"`).join(', ')}` : ''}`
  }).join('\n')

  const system = `You decide which action of a study-planner app matches the user's message (German or English).
Read the whole message. Pick the action that does exactly what the user asks for.
Do not pick an action only because it shares a word with the message.
Renaming, changing, moving, completing or deleting something is never a free-time question.
If no action fits, pick "none".

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

// `names` lists real todo / entry / topic names so the model copies instead of guessing.
export function slotPrompt(query, id, names = {}) {
  const intent = getIntent(id)
  const slots = Object.entries(intent?.slots ?? {})
  const c = clockInfo('en')
  const quote = list => list.map(s => `"${s}"`).join(', ')
  const known = [
    names.todos?.length ? `Existing todos: ${quote(names.todos)}` : '',
    names.events?.length ? `Existing calendar entries: ${quote(names.events)}` : '',
    names.topics?.length ? `Topics: ${quote(names.topics)}` : '',
  ].filter(Boolean).join('\n')

  const system = `Extract the fields for the action "${id}" (${intent?.describe ?? ''}) from the user's message.
${nowLine()}

Dates — copy from this table, never calculate:
${dateTable(c.today)}

Fields:
${slots.map(([k, v]) => `- ${k}: ${v}`).join('\n')}
${known ? `\n${known}\nWhen the user means one of these, copy its name exactly.\n` : ''}
Dates as "YYYY-MM-DD", times as "HH:MM" (24h), durations as whole minutes.
Only include fields the user actually mentioned. Reply with ONE JSON object.`

  return {
    messages: [{ role: 'system', content: system }, { role: 'user', content: query }],
    schema: { type: 'object', properties: Object.fromEntries(slots.map(([k]) => [k, { type: 'string' }])) },
  }
}

export function answerPrompt(query, api) {
  let data
  try { data = buildQueryContext(api, query) } catch (e) { console.warn('[assistant] query context', e); data = 'unavailable' }
  const c = clockInfo('en')

  const system = `You answer questions about the user's own calendar, todos, exams and study data.
${nowLine()}

Dates:
${dateTable(c.today)}

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
