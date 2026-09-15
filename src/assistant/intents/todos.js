// Todos: add, list, complete, edit (date, time, text, priority), delete.
//
// German splits many verbs around the object ("füge X hinzu", "trag X ein",
// "hake X ab"), so edit / complete / delete look for an existing todo named
// anywhere in the sentence instead of relying on word order alone.

import { registerIntent } from '../engine/registry.js'
import { hasAny, fold, normalize } from '../engine/normalize.js'
import { extract, cleanTitle, labelFrom } from '../engine/parse/index.js'
import { fmtMin } from '../engine/parse/times.js'
import { buildTodo, sortTodos } from '../../utils/calculations/todoPriorityCalcs.js'
import { matchScore } from '../engine/lexicon.js'
import { startTodoFlow, todoQuestion } from '../flows/todoFlow.js'

const ADD = [/\b(add|create|new|neu|neue[nrs]?|hinzu\w*|fueg\w*|erstell\w*|notier\w*|aufschreiben|schreib\w* (?:mir )?auf|merk\w*|pack\w*|trag\w*|eintragen|leg\w*|anlegen|remind me|erinner\w* mich)\b/]
const DELETE = /\b(delete|remove|loesch\w*|entfern\w*|streich\w*)\b/
const DONE_WORDS = /\b(done|erledigt|abhaken|abgehakt|fertig|completed?|check(?:ed)? off|tick(?:ed)? off)\b/
const QUESTION_START = /^(was|welche\w*|wie|wo|wann|what'?s?|which|how|where|when|zeig\w*|show|list\w*|gibt es|habe? ich|hab ich)\b/
const PRIORITY = [
  [null, /\b(keine priori\w*|ohne priori\w*|no priority)\b/],
  [3, /\b(hoch|hohe\w*|high|wichtig\w*|dringend\w*|urgent|important)\b/],
  [2, /\b(mittel\w*|medium)\b/],
  [1, /\b(niedrig\w*|low|unwichtig\w*)\b/],
]

// Command and filler words that never belong to a todo's text.
const TODO_STOP = [
  'add', 'create', 'new', 'neu', 'neue', 'neuen', 'neues', 'neuer', 'hinzu', 'hinzufuegen', 'fuege', 'fueg', 'erstelle', 'erstellen',
  'trage', 'trag', 'eintragen', 'ein', 'lege', 'leg', 'anlegen', 'notiere', 'notier', 'schreib', 'schreibe', 'aufschreiben', 'merke', 'merk',
  'pack', 'packe', 'remind', 'erinnere', 'erinner', 'mich', 'mir', 'dir', 'me', 'daran', 'dran', 'dass', 'ich', 'muss', 'sollte', 'darf',
  'nicht', 'vergessen', 'i', 'need', 'have', 'must', 'dont', 'forget', 'a', 'an', 'the', 'eine', 'einen', 'einem', 'einer', 'todo', 'to',
  'my', 'list', 'liste', 'meine', 'meinen', 'meiner', 'meinem', 'mein', 'zur', 'zu', 'in', 'ins', 'auf', 'die', 'das', 'den', 'der', 'dem',
  'please', 'bitte', 'by', 'bis', 'until', 'due', 'faellig', 'on', 'am', 'for', 'fuer', 'called', 'namens', 'noch', 'mal', 'kannst', 'du',
  'can', 'could', 'you', 'hey', 'hi', 'ok', 'okay', 'wichtig', 'wichtiges', 'wichtige', 'dringend', 'dringendes', 'dringende', 'urgent', 'important',
  'priority', 'prioritaet', 'prioritaeten', 'hoch', 'hohe', 'hohen', 'hohes', 'high', 'mittel', 'mittlere', 'mittleren', 'medium',
  'niedrig', 'niedrige', 'niedrigen', 'niedriges', 'low', 'unwichtig', 'unwichtige', 'unwichtiges', 'keine', 'ohne',
]

function priorityOf(text) {
  for (const [p, re] of PRIORITY) if (re.test(text)) return p
  return undefined
}

const PRIORITY_LABEL = { 1: ['low', 'niedrig'], 2: ['medium', 'mittel'], 3: ['high', 'hoch'] }

// Text a todo can be found by: its own text and notes, its topic, its event.
export function todoSearchText(api, t) {
  const topic = t.topic_id ? api.topics.find(tp => tp.id === t.topic_id)?.name ?? '' : ''
  const event = t.event_id ? api.events.find(e => e.id === t.event_id)?.title ?? '' : ''
  return `${t.text ?? ''} ${t.notes ?? ''} ${topic} ${event}`
}

// Best todo for a name → { t, s } (s: 2 = exact text), open ones win ties.
export function findTodoScored(api, query) {
  const q = cleanTitle(query ?? '', ['todo', 'the', 'my', 'die', 'das', 'den', 'meine'])
  if (!q) return null
  let best = null
  for (const t of api.todos) {
    const s = fold(t.text) === fold(q) ? 2 : matchScore(q, todoSearchText(api, t), { lang: api.lang }).score
    if (s > 0.5 && (!best || s > best.s || (s === best.s && best.t.completed && !t.completed))) best = { t, s }
  }
  return best
}

export const findTodo = (api, query) => findTodoScored(api, query)?.t ?? null

// The todo whose words appear in a whole sentence ("ändere das Datum von
// Skript lesen auf Montag" → "Skript lesen"). The most complete, then the
// longest match wins.
export function findTodoIn(api, sentence, { openOnly = false } = {}) {
  let best = null
  for (const t of api.todos) {
    if (openOnly && t.completed) continue
    if (!t.text?.trim()) continue
    const s = matchScore(t.text, sentence, { lang: api.lang }).score
    const len = t.text.trim().split(/\s+/).length
    if (s >= 0.75 && (!best || s > best.s || (s === best.s && len > best.len))) best = { t, s, len }
  }
  return best?.t ?? null
}

const RENAME_VERB = /^(?:bitte\s)?(aender\w*|change|update|rename|benenn\w*|umbenenn\w*)\s+(?:(?:den\s|the\s)?(?:namen|name|titel|title|text|bezeichnung)\s+(?:von\s|vom\s|des\s|der\s|of\s)?)?(?:das\s|den\s|die\s|the\s|my\s|mein\w*\s)?/
const RENAME_SPLIT = /\s(?:(?:ist|is)\s)?(?:in|zu|auf|to|into|nach)\s/g

// "Ändere Todo X in Y", "Benenne X in Y um", "Todo X heißt jetzt Y", "X soll Y
// heißen" (normalised text). X is cut at the separator whose left part best
// names an existing todo, so an "in" inside a todo name does not break it.
// → { from, to, todo, s, explicit } or null. `to` may still be a date or a
// priority ("ändere Todo X auf Montag") — edit_todo decides.
export function parseRename(text, api) {
  const m = text.match(RENAME_VERB)
  if (m) {
    const body = text.slice(m[0].length).replace(/^todo\s+/, '').replace(/\s+um$/, '').trim()
    const words = s => s.split(/\s+/).length
    let best = null
    for (const s of body.matchAll(RENAME_SPLIT)) {
      const from = body.slice(0, s.index).trim()
      const to = body.slice(s.index + s[0].length).trim()
      if (!from || !to) continue
      const hit = api ? findTodoScored(api, from) : null
      const score = hit?.s ?? 0
      // Equal scores: the cut whose length is closest to the todo's name
      // (later cuts win remaining ties); with nothing found, the first cut.
      const diff = hit ? Math.abs(words(normalize(hit.t.text)) - words(from)) : 99
      if (!best || score > best.s || (score === best.s && score > 0 && diff <= best.diff)) best = { from, to, todo: hit?.t ?? null, s: score, diff }
    }
    return best ? { ...best, explicit: !/^(aender|change|update)/.test(m[1]) } : null
  }
  const alt = text.match(/^(?:das |the )?todo\s+(.+?)\s+heisst\s+(?:jetzt\s+|nun\s+|ab jetzt\s+)?(.+)$/)
    || text.match(/^(?:das |the )?(?:todo\s+)?(.+?)\s+soll\s+(?:jetzt\s+|nun\s+)?(.+?)\s+heissen$/)
    || text.match(/^(?:das |the )?(?:todo\s+)?(.+?)\s+umbenennen\s+(?:in|zu|to)\s+(.+)$/)
  if (!alt) return null
  const hit = api ? findTodoScored(api, alt[1]) : null
  return { from: alt[1], to: alt[2], todo: hit?.t ?? null, s: hit?.s ?? 0, explicit: true }
}

const todoBlock = (api, ids, extra = {}) => ({ type: 'todos', data: { ids, ...extra } })

registerIntent({
  id: 'add_todo',
  describe: 'Create a todo/task, optionally with due date/time, priority and topic. Opens the todo settings above the input',
  slots: { text: 'task text', due_date: 'YYYY-MM-DD optional', due_time: 'HH:MM optional', topic: 'topic name optional', priority: '1-3 optional' },
  examples: ['Add todo read cardio chapter tomorrow', 'Neues Todo Skript lesen bis Freitag'],
  completions: {
    de: ['Neues Todo {title}', 'Erinnere mich an {title}', 'Füge {title} zu meinen Todos hinzu', 'Ich muss {day} {title}'],
    en: ['Add todo {title}', 'Remind me to {title}'],
  },
  match(text, { today, raw }) {
    if (DELETE.test(text) || QUESTION_START.test(text) || /\?\s*$/.test(raw ?? '')) return null
    if (/^(?:bitte )?(?:aender\w*|change|update|rename|benenn\w*)\b|\b(?:heisst|heissen|umbenenn\w*)\b/.test(text)) return null
    const x = extract(text, today)
    const todoWord = hasAny(text, [/\btodo\b/, /\bremind me\b/, /\berinner\w* mich\b/])
    const add = hasAny(text, ADD)
    const writeDown = /^(?:bitte )?(notier\w*|schreib\w* (?:mir )?auf|merk\w* (?:dir|mir)|aufschreiben)\b/.test(text)
    const must = /^(?:ich muss|ich sollte|ich darf nicht vergessen|nicht vergessen|i need to|i have to|i must|dont forget)\b/.test(text)
    if (DONE_WORDS.test(text) && !todoWord) return null

    let score = 0
    if (todoWord && (add || /^todo\b/.test(text))) score = 0.9
    else if (writeDown && x.startMin == null) score = 0.85   // "Notiere Bücher zurückbringen"
    else if (must && x.startMin == null) score = 0.8         // "Ich muss morgen Wäsche waschen"
    if (!score) return null

    const label = labelFrom(raw ?? text, x.rest, TODO_STOP)
    if (!label && !(todoWord && add)) return null
    const priority = priorityOf(text)
    return {
      score,
      slots: { text: label, due_date: x.date, due_time: x.startMin != null ? fmtMin(x.startMin) : null, priority: priority ?? null },
    }
  },
  // Opens the todo flow: settings (due, priority, topic, event) above the
  // input; a given text is only saved after the user confirms them.
  execute(slots, api) {
    const text = String(slots.text ?? '').trim()
    const topic = slots.topic ? api.findTopic(slots.topic) : text ? api.findTopicIn(text) : null
    const flow = startTodoFlow({
      text,
      due_date: slots.due_date || null,
      due_time: slots.due_time || null,
      topic_id: topic?.id ?? null,
      priority: slots.priority ? Number(slots.priority) : null,
    })
    return { ...todoQuestion(flow, api), startFlow: flow }
  },
})

registerIntent({
  id: 'list_todos',
  describe: 'Show open todos, optionally only those due by a date or overdue',
  slots: { date: 'YYYY-MM-DD optional', overdue: 'true optional' },
  examples: ['Show my todos', 'Was muss ich heute noch erledigen?'],
  completions: {
    de: ['Zeig meine Todos', 'Welche Todos habe ich {day}?', 'Was muss ich {day} erledigen?'],
    en: ['Show my todos', 'Which todos are due {day}?'],
  },
  match(text, { today }) {
    const todoWord = /\btodo\b/.test(text)
    const openQ = /\b(was muss ich|was habe ich noch zu tun|was hab ich noch zu tun|was ist noch offen|was steht noch aus|what do i (?:have|need) to do|what'?s left)\b/.test(text)
    if (!todoWord && !openQ) return null
    const asks = openQ || QUESTION_START.test(text)
    if (!asks && (hasAny(text, ADD) || DONE_WORDS.test(text))) return null
    if (DELETE.test(text) || /\b(rename|umbenenn\w*|benenn\w*|abhaken|aender\w*|change|update|heisst|heissen|verschieb\w*|move)\b/.test(text)) return null
    const x = extract(text, today)
    return {
      score: openQ ? 0.9 : 0.8,
      slots: { date: x.date ?? x.range?.to ?? null, overdue: /\b(overdue|ueberfaellig\w*|verpasst\w*|late)\b/.test(text) },
    }
  },
  execute(slots, api) {
    let list = api.todos.filter(t => !t.completed)
    if (slots.overdue) list = list.filter(t => t.due_date && t.due_date < api.today)
    else if (slots.date) list = list.filter(t => t.due_date && t.due_date <= slots.date)
    const sorted = sortTodos(list, { urgency: api.urgency, today: api.today })
    const title = slots.overdue
      ? api.L('Overdue todos', 'Überfällige Todos')
      : slots.date
        ? api.L(`Todos due by ${api.fmtDay(slots.date)}`, `Todos bis ${api.fmtDay(slots.date)}`)
        : api.L('Your open todos', 'Deine offenen Todos')
    const empty = slots.overdue ? api.L('Nothing overdue. 🎉', 'Nichts überfällig. 🎉') : api.L('Nothing open. 🎉', 'Nichts offen. 🎉')
    return {
      title,
      blocks: [
        sorted.length ? null : { type: 'text', data: { text: empty } },
        todoBlock(api, sorted.slice(0, 25).map(t => t.id), { addMode: true, addDefaults: { due_date: slots.date ?? null } }),
      ].filter(Boolean),
    }
  },
})

registerIntent({
  id: 'complete_todo',
  mutates: true,
  describe: 'Mark a todo as done',
  slots: { text: 'part of the todo text' },
  examples: ['Mark read cardio chapter as done', 'Hake Skript lesen ab'],
  completions: {
    de: ['{todo} erledigt', 'Hake {todo} ab'],
    en: ['Mark {todo} as done'],
  },
  match(text, { raw, api }) {
    if (QUESTION_START.test(text) || /\?\s*$/.test(raw ?? '') || DELETE.test(text)) return null
    if (!DONE_WORDS.test(text) && !/^(?:hake?|hak\w*)\b/.test(text)) return null
    const m = text.match(/^(?:mark|check off|tick off|complete|hake?|hak\w*|markier\w*|setz\w*|ich habe|ich hab|i have|i)\s+(?:das |the |mein\w* |my )?(?:todo )?(.+?)(?:\s+(?:as|als|auf|is|ist))?(?:\s+(?:done|completed?|erledigt|ab|abgehakt|fertig))?$/)
      || text.match(/^(?:das |the |mein\w* )?(?:todo )?(.+?)\s+(?:is |ist |bin |habe |hab )?(?:done|erledigt|abhaken|abgehakt|fertig)$/)
    const guess = m?.[1]?.replace(/\btodo\b/, '').trim()
    const found = api ? (guess && findTodo(api, guess)) || findTodoIn(api, text, { openOnly: true }) : null
    if (!found && (!guess || guess.length < 3 || /^(ich|es|das|i|it)$/.test(guess))) return null
    return { score: found ? 0.88 : 0.75, slots: { text: found?.text ?? guess } }
  },
  async execute(slots, api) {
    const todo = findTodo(api, slots.text ?? '')
    if (!todo) return notFound(api, slots.text, { intent: 'complete_todo', slots: {}, label: api.L('Done', 'Erledigt'), hint: api.L('Which todo is done?', 'Welches Todo ist erledigt?') })
    await api.upsertTodo({ ...todo, completed: true })
    return { title: api.L('Marked as done', 'Als erledigt markiert'), blocks: [todoBlock(api, [todo.id])] }
  },
})

registerIntent({
  id: 'edit_todo',
  mutates: true,
  describe: "Change an existing todo: rename it, or set its due date, due time or priority",
  slots: { text: 'current todo text', new_text: 'new text optional', due_date: 'YYYY-MM-DD optional', due_time: 'HH:MM optional', priority: '1-3, or null to clear, optional' },
  examples: ['Move todo read script to Friday', 'Ändere das Datum von Skript lesen auf Montag'],
  completions: {
    de: ['Verschiebe {todo} auf {day}', '{todo} bis {day}', 'Mach {todo} wichtig', 'Benenne {todo} in {title} um'],
    en: ['Move todo {todo} to {day}', 'Make {todo} important', 'Rename todo {todo} to {title}'],
  },
  match(text, { today, raw, api }) {
    if (DELETE.test(text) || QUESTION_START.test(text) || /\?\s*$/.test(raw ?? '')) return null
    const todoWord = /\btodo\b/.test(text)

    // Rename — or a date / priority given the same way ("ändere Todo X auf Montag").
    const r = parseRename(text, api)
    if (r) {
      const target = extract(` ${r.to} `, today)
      const leftover = cleanTitle(target.rest, ['um', 'uhr', 'am', 'den', 'the', 'on', 'at', 'bis', 'by', 'ab'])
      const priority = priorityOf(r.to)
      const isDate = (target.date != null || target.startMin != null) && !leftover
      const isPriority = priority !== undefined && r.to.split(' ').length <= 2
      if (isDate || isPriority) {
        if (r.todo || todoWord) {
          const slots = { text: r.todo?.text ?? r.from }
          if (target.date) slots.due_date = target.date
          if (target.startMin != null) slots.due_time = fmtMin(target.startMin)
          if (isPriority) slots.priority = priority
          return { score: r.todo ? 0.9 : 0.85, slots }
        }
      } else if (r.todo) {
        return { score: 0.92, slots: { text: r.todo.text, new_text: labelFrom(raw ?? text, r.to, ['um']) || r.to } }
      } else if (todoWord || r.explicit) {
        // Clearly a todo rename, but no todo by that name: execute shows a picker.
        return { score: 0.86, slots: { text: labelFrom(raw ?? text, r.from, ['todo']) || r.from, new_text: labelFrom(raw ?? text, r.to, ['um']) || r.to } }
      }
    }

    let m
    const found = api ? findTodoIn(api, text, { openOnly: true }) : null
    const change = /^(?:bitte )?(?:aender\w*|change|setz\w*|stell\w*|mach\w*|make|update|verschieb\w*|verleg\w*|schieb\w*|move|postpone)\b/.test(text)

    // Date, time or priority of a todo named in the sentence.
    if (found && (change || /\b(bis|by|until|faellig\w*|due)\b/.test(text))) {
      const x = extract(text, today)
      const priority = priorityOf(text)
      const slots = { text: found.text }
      if (x.date) slots.due_date = x.date
      if (x.startMin != null) slots.due_time = fmtMin(x.startMin)
      if (priority !== undefined) slots.priority = priority
      if (slots.due_date || slots.due_time || 'priority' in slots) {
        return { score: change || /\btodo\b/.test(text) ? 0.88 : 0.8, slots }
      }
    }

    // "verschiebe Todo X auf Freitag" for a todo that was not found by its words.
    m = text.match(/^(?:move|postpone|verschieb\w*)\s+(?:todo\s+)?(.+?)\s+(?:to|auf|nach)\s+(.+)$/)
    if (m) {
      const d = extract(m[2], today)
      if (d.date) return { score: /\btodo\b/.test(text) ? 0.85 : 0.55, slots: { text: m[1], due_date: d.date } }
    }
    return null
  },
  async execute(slots, api, ctx = {}) {
    // The new name in the user's own spelling (slots hold normalised words).
    const newText = slots.new_text ? labelFrom(ctx.raw ?? slots.new_text, normalize(slots.new_text), ['um']) || cleanTitle(slots.new_text, []) : null
    const todo = findTodo(api, slots.text ?? '')
    if (!todo) {
      return notFound(api, slots.text, {
        intent: 'edit_todo',
        slots: { ...slots, text: undefined, new_text: newText ?? undefined },
        label: api.L('Change', 'Ändern'),
        hint: newText
          ? api.L(`Which todo should be renamed to “${newText}”?`, `Welches Todo soll „${newText}“ heißen?`)
          : api.L('Which todo do you mean?', 'Welches Todo meinst du?'),
      })
    }
    const patch = {}
    const changes = []
    if (newText) {
      patch.text = newText
      changes.push(`„${patch.text}“`)
    }
    if (slots.due_date) {
      patch.due_date = slots.due_date
      changes.push(api.L(`due ${api.fmtDay(slots.due_date)}`, `fällig ${api.fmtDay(slots.due_date)}`))
    }
    if (slots.due_time) {
      patch.due_time = slots.due_time
      changes.push(api.L(`at ${slots.due_time}`, `um ${slots.due_time}`))
    }
    if ('priority' in slots && slots.priority !== undefined) {
      const p = slots.priority == null || slots.priority === 'null' ? null : Number(slots.priority)
      patch.priority = p
      changes.push(p ? api.L(`priority ${PRIORITY_LABEL[p][0]}`, `Priorität ${PRIORITY_LABEL[p][1]}`) : api.L('no priority', 'keine Priorität'))
    }
    const merged = { ...todo, ...patch }
    await api.upsertTodo(buildTodo(todo, {
      text: merged.text,
      topic_id: merged.topic_id,
      due_date: merged.due_date,
      due_time: merged.due_date ? merged.due_time : null,
      priority: merged.priority,
      parent_id: merged.parent_id,
      event_id: merged.event_id,
      sort_order: merged.sort_order,
      notes: merged.notes,
    }))
    return {
      title: api.L('Todo updated', 'Todo aktualisiert'),
      blocks: [
        ...(changes.length ? [{ type: 'text', data: { text: changes.join(' · ') } }] : []),
        todoBlock(api, [todo.id]),
      ],
    }
  },
})

registerIntent({
  id: 'delete_todo',
  describe: 'Delete a todo (asks for confirmation)',
  slots: { text: 'part of the todo text' },
  examples: ['Delete todo buy scrubs', 'Lösche das Todo Kittel kaufen'],
  completions: {
    de: ['Lösche Todo {todo}', 'Entferne {todo} aus meinen Todos'],
    en: ['Delete todo {todo}'],
  },
  match(text, { api }) {
    if (!DELETE.test(text)) return null
    const m = text.match(/^(?:bitte )?(?:delete|remove|loesch\w*|entfern\w*|streich\w*)\s+(?:the\s+|das\s+|den\s+|die\s+)?todo\s+(.+)$/)
      || text.match(/^(?:das\s+|the\s+)?todo\s+(.+?)\s+(?:loeschen|entfernen|streichen|delete|remove)$/)
    if (m) return { score: 0.9, slots: { text: m[1] } }
    const found = api ? findTodoIn(api, text) : null
    if (!found) return null
    return { score: /\b(todo|liste|list)\b/.test(text) ? 0.9 : 0.8, slots: { text: found.text } }
  },
  execute(slots, api) {
    const todo = findTodo(api, slots.text ?? '')
    if (!todo) return notFound(api, slots.text, { intent: 'delete_todo', slots: {}, label: api.L('Delete', 'Löschen'), hint: api.L('Which todo should be deleted?', 'Welches Todo soll gelöscht werden?') })
    // Deleting is destructive: show the row with its delete button instead of acting blind.
    return { title: api.L('Delete this todo?', 'Dieses Todo löschen?'), blocks: [todoBlock(api, [todo.id], { confirmDelete: todo.id })] }
  },
})

// No todo by that name. With `pick` ({ intent, slots, label, hint }) every
// row gets a button that runs the intent on that todo — never a guess.
function notFound(api, text, pick = null) {
  const open = api.todos.filter(t => !t.completed)
  const matches = open.filter(t => matchScore(text ?? '', todoSearchText(api, t), { lang: api.lang }).score > 0).slice(0, 8)
  const ids = (matches.length ? matches : open.slice(0, 8)).map(t => t.id)
  return {
    title: api.L(`No todo matching “${text ?? ''}”`, `Kein Todo passend zu „${text ?? ''}“`),
    blocks: pick
      ? [{ type: 'text', data: { text: pick.hint } }, todoBlock(api, ids, { pick: { intent: pick.intent, slots: pick.slots, label: pick.label } })]
      : [todoBlock(api, ids, { addMode: true })],
  }
}
