// Todo creation with its settings above the input (FlowComposer): due date,
// time, priority, topic and linked event. Every typed message becomes one
// todo with the current settings; "Fertig" ends the flow.

import { normalize } from '../engine/normalize.js'
import { extract, labelFrom } from '../engine/parse/index.js'
import { buildTodo } from '../../utils/calculations/todoPriorityCalcs.js'
import { DONE, newId, plain, looksLikeNewRequest } from './common.js'

export const DUE_WORDS = ['bis', 'am', 'on', 'by', 'until', 'due', 'faellig', 'zum', 'fuer', 'for']

export function startTodoFlow(init = {}) {
  return {
    id: newId(), rev: 0, type: 'todo',
    // With a text already given, the user only checks the settings and saves.
    step: init.text ? 'review' : 'add',
    text: init.text ?? '',
    settings: {
      due_date: init.due_date ?? null,
      due_time: init.due_time ?? null,
      priority: init.priority ?? null,
      topic_id: init.topic_id ?? null,
      event_id: init.event_id ?? null,
    },
    created: [],
    hint: null,
  }
}

export function todoQuestion(flow, api) {
  const L = api.L
  const blocks = []
  if (flow.created.length) blocks.push({ type: 'todos', data: { ids: [...flow.created] } })
  const q = flow.step === 'review'
    ? L(`“${flow.text}” — check the settings above, then save (Enter).`, `„${flow.text}“ – Einstellungen oben prüfen, dann speichern (Enter).`)
    : flow.created.length
      ? L('Another one? Just type it — or tap “Done”.', 'Noch eins? Einfach tippen – oder „Fertig“.')
      : L('What should the todo say? Due date, priority and topic are set above.', 'Was soll im Todo stehen? Fälligkeit, Priorität und Topic stellst du oben ein.')
  blocks.push({ type: 'text', data: { text: flow.hint ? `${flow.hint}\n${q}` : q } })
  return {
    title: flow.created.length ? L(`${flow.created.length} todo(s) added`, `${flow.created.length} Todo(s) angelegt`) : L('New todo', 'Neues Todo'),
    blocks,
  }
}

function create(flow, text, api) {
  const x = extract(normalize(text), api.today)
  const s = flow.settings
  // "Skript lesen bis Freitag": the date goes into due_date, not into the text.
  const label = x.date ? labelFrom(text, x.rest, DUE_WORDS) || text : text
  const row = buildTodo({ id: newId(), completed: false }, {
    text: label,
    due_date: x.date ?? s.due_date ?? null,
    due_time: s.due_time ?? null,
    priority: s.priority ?? undefined,
    topic_id: s.topic_id ?? api.findTopicIn(text)?.id ?? null,
    event_id: s.event_id ?? undefined,
  })
  return {
    effect: async () => {
      const saved = await api.upsertTodo(row)
      return { flow: { ...flow, step: 'add', text: '', hint: null, created: [...flow.created, saved?.id ?? row.id], rev: flow.rev + 1 } }
    },
  }
}

function end(flow, api) {
  return {
    end: true,
    result: flow.created.length
      ? { title: api.L('Todos added', 'Todos angelegt'), blocks: [{ type: 'todos', data: { ids: [...flow.created] } }], followups: [api.L('Show my todos', 'Zeig meine Todos')] }
      : { title: api.L('No todo added', 'Kein Todo angelegt'), blocks: [] },
  }
}

export function answerTodo(flow, text, api) {
  const t = text.trim()
  if (DONE.test(plain(t))) return end(flow, api)
  if (!t) return flow.step === 'review' ? create(flow, flow.text, api) : end(flow, api)
  if (looksLikeNewRequest(t, api, ['add_todo'])) return { passthrough: true }
  return create(flow, t, api)
}

export function todoAction(flow, action, payload, api) {
  switch (action) {
    case 'setting': return { flow: { ...flow, settings: { ...flow.settings, ...payload } }, silent: true }
    case 'save': return flow.text ? create(flow, flow.text, api) : end(flow, api)
    case 'done': return end(flow, api)
    case 'enter': return flow.step === 'review' && flow.text ? create(flow, flow.text, api) : end(flow, api)
    default: return { flow, silent: true }
  }
}
