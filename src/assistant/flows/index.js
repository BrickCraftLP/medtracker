// Runs a guided flow step: the flow modules only return plain transitions;
// this applies their async effects (saving) and builds the next question.

import { answerEvent, eventAction, eventQuestion, saveEvent } from './eventFlow.js'
import { answerTodo, todoAction, todoQuestion } from './todoFlow.js'

const MODULES = {
  event: { answer: answerEvent, action: eventAction, question: eventQuestion, save: saveEvent },
  todo: { answer: answerTodo, action: todoAction, question: todoQuestion, save: null },
}

// → { flow, result } | { flow, silent: true } | { passthrough: true }
async function finish(mod, out, api) {
  if (out.effect) out = await out.effect()
  if (out.save) return { flow: null, result: await mod.save(out.flow, api) }
  if (out.end) return { flow: null, result: out.result }
  if (out.silent) return { flow: out.flow, silent: true }
  return { flow: out.flow, result: mod.question(out.flow, api) }
}

export async function handleFlowInput(flow, text, api) {
  const mod = MODULES[flow.type]
  const out = mod.answer(flow, text, api)
  if (out.passthrough) return { passthrough: true }
  return finish(mod, out, api)
}

export async function handleFlowAction(flow, action, payload, api) {
  if (action === 'cancel') return { flow: null, result: { title: api.L('Cancelled', 'Abgebrochen'), blocks: [] } }
  const mod = MODULES[flow.type]
  return finish(mod, mod.action(flow, action, payload, api), api)
}

export const questionFor = (flow, api) => MODULES[flow.type].question(flow, api)
