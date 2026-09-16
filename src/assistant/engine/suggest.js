// Autocomplete for the pill. Runs synchronously on every keystroke.
//
// Sources, best first:
//   1. history   — the user's own earlier questions that start with the input
//   2. templates — each intent's `completions` ({ de: [...], en: [...] }),
//                  e.g. "Wann kann ich {day}?", with placeholders filled from
//                  live data (topics, upcoming events, open todos, free slots)
//   3. entities  — the last half-typed word completed to a topic / event /
//                  todo title ("verschiebe br" → "verschiebe Brunch")
//
// Placeholders: {day} {duration} {time} {clock} {topic} {event} {todo} are
// filled; {title} {person} are free text — the suggestion stops before them
// so the user keeps typing.
//
// Input starting with "/" completes the command language instead: action
// ids, then field names, then values (days, times, choices, real names).
// With nothing typed, the screen being looked at suggests questions first.

import { allIntents, getIntent } from './registry.js'
import { fold, correctToken } from './normalize.js'
import { addDays, parseDayKey } from '../../utils/calendar/eventModel.js'
import { sortTodos } from '../../utils/calculations/todoPriorityCalcs.js'
import { freeSlots, findEvents } from '../intents/calendar.js'
import { slotSpec, signature } from './schema.js'
import { resolveIntentId } from './command.js'
import { fmtMin } from './parse/times.js'
import '../intents/index.js'

const MAX = 5
const HISTORY_KEY = 'mt_assistant_history'
const FREE = new Set(['title', 'person'])

// ── History ────────────────────────────────────────────────────────────────

export function getHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? '[]') } catch { return [] }
}

export function rememberQuery(query) {
  const q = String(query ?? '').trim()
  if (!q) return
  try {
    const list = getHistory().filter(h => fold(h) !== fold(q))
    list.unshift(q)
    localStorage.setItem(HISTORY_KEY, JSON.stringify(list.slice(0, 30)))
  } catch { /* storage unavailable */ }
}

// ── Placeholder values from live data ──────────────────────────────────────

const norm = s => fold(s).replace(/[?!.,:;]+/g, '').trim()
const fillCache = new WeakMap()

function fillers(api) {
  if (fillCache.has(api)) return fillCache.get(api)
  const de = api.lang === 'de'
  const weekday = key => parseDayKey(key).toLocaleDateString(de ? 'de-AT' : 'en-US', { weekday: 'long' })
  const tomorrow = addDays(api.today, 1)
  const cache = {}
  const lazy = (name, fn) => () => (cache[name] ??= fn())

  const get = {
    day: lazy('day', () => de
      ? ['morgen', 'heute', 'übermorgen', weekday(addDays(api.today, 3)), 'am Wochenende', 'nächste Woche']
      : ['tomorrow', 'today', weekday(addDays(api.today, 2)), weekday(addDays(api.today, 3)), 'this weekend', 'next week']),
    duration: lazy('duration', () => de
      ? ['2 Stunden', '1 Stunde', '3 Stunden', '30 Minuten']
      : ['2 hours', '1 hour', '3 hours', '30 minutes']),
    time: lazy('time', () => {
      const starts = safe(() => freeSlots(api, tomorrow, 60).map(s => Math.ceil(s.start / 60)), [])
      const hours = [...new Set([...starts, 9, 14, 18])].filter(h => h < 23).slice(0, 3)
      return hours.map(h => `${h}-${h + 1}`)
    }),
    clock: lazy('clock', () => {
      const starts = safe(() => freeSlots(api, tomorrow, 60).map(s => Math.ceil(s.start / 60)), [])
      const hours = [...new Set([...starts, 10, 14, 18])].filter(h => h < 23).slice(0, 3)
      return hours.map(h => (de ? `${h} Uhr` : `${h % 12 || 12}${h < 12 ? 'am' : 'pm'}`))
    }),
    topic: lazy('topic', () => [...api.topics]
      .sort((a, b) => (api.urgency?.get(b.id) ?? 0) - (api.urgency?.get(a.id) ?? 0))
      .map(t => t.name).filter(Boolean).slice(0, 8)),
    event: lazy('event', () => [...new Set(safe(() => findEvents(api, ''), []).map(o => o.event.title).filter(Boolean))].slice(0, 8)),
    todo: lazy('todo', () => sortTodos(api.todos.filter(t => !t.completed), { urgency: api.urgency, today: api.today })
      .map(t => t.text).filter(Boolean).slice(0, 8)),
  }
  const fill = ph => (FREE.has(ph) ? null : get[ph]?.() ?? null)
  fillCache.set(api, fill)
  return fill
}

function safe(fn, fallback) {
  try { return fn() } catch { return fallback }
}

// ── Template matching ──────────────────────────────────────────────────────

function parseTemplate(tpl) {
  return tpl.split(' ').filter(Boolean).map(word => {
    const m = word.match(/^\{(\w+)\}(.*)$/)
    return m ? { ph: m[1], tail: m[2], raw: word } : { lit: norm(word), raw: word }
  })
}

// Returns suggestions for one template, or [] when the input diverges from it.
function matchTemplate(tpl, input, fill) {
  const parts = parseTemplate(tpl)
  const partial = !/\s$/.test(input)
  const rawTokens = input.trim().split(/\s+/).filter(Boolean)
  const tokens = rawTokens.map(norm)
  const n = tokens.length
  const words = []
  let i = 0
  let j = 0
  let literals = 0
  let completed = false   // the input ended inside a word we completed

  while (j < parts.length && i < n) {
    const p = parts[j]
    const lastPartial = partial && i === n - 1

    if (p.lit !== undefined) {
      if (!p.lit) { j++; continue }
      if (tokens[i] === p.lit || (!lastPartial && correctToken(tokens[i]) === p.lit)) {
        words.push(rawTokens[i]); i++; j++; literals++
        continue
      }
      if (lastPartial && p.lit.startsWith(tokens[i])) {
        words.push(p.raw); i++; j++; literals++; completed = true
        continue
      }
      return []
    }

    // Placeholder.
    const values = fill(p.ph)
    const rest = tokens.slice(i).join(' ')
    let handled = false
    for (const v of values ?? []) {
      const vf = norm(v)
      const len = vf.split(' ').length
      if (rest.startsWith(`${vf} `) || (rest === vf && !partial)) {
        words.push(...rawTokens.slice(i, i + len)); i += len; j++; handled = true
        break
      }
      if (partial && vf.startsWith(rest) && rest.length > 0) {
        words.push(v + p.tail); i = n; j++; handled = true; completed = true
        break
      }
    }
    if (handled) continue
    // Free text in the slot (a title, or a date typed another way): consume up
    // to the next literal of the template. Never let a template that starts
    // with a placeholder swallow arbitrary input.
    if (literals === 0) return []
    const nextLit = parts.slice(j + 1).find(x => x.lit)?.lit
    let k = i + 1
    while (k < n && tokens[k] !== nextLit && !(partial && k === n - 1 && nextLit?.startsWith(tokens[k]))) k++
    // A slot with known values ({duration}, {topic}, …) may hold something
    // typed another way ("am 20.9."), but not a half-typed word that matched
    // none of them — that would suggest "Wann kann ich anat lernen?".
    if (values?.length && partial && k >= n) return []
    words.push(...rawTokens.slice(i, k)); i = k; j++
  }
  if (i < n) return []                           // input longer than the template
  if (literals === 0 && !completed) return []

  // Complete the rest of the template. The first fillable placeholder fans out
  // into a few alternatives; later ones take their best value.
  let variants = [{ words: [...words], stop: false }]
  let fanned = false
  for (; j < parts.length; j++) {
    const p = parts[j]
    variants = variants.flatMap(v => {
      if (v.stop) return [v]
      if (p.lit !== undefined) return [{ ...v, words: [...v.words, p.raw] }]
      const values = fill(p.ph)
      if (!values?.length) {
        // Free slot: suggestion ends here, label shows the remaining shape.
        const tail = parts.slice(j + 1).map(x => x.raw).join(' ')
        return [{ words: v.words, stop: true, label: `${v.words.join(' ')} …${p.tail}${tail ? ` ${tail}` : ''}` }]
      }
      if (!fanned) return values.slice(0, 3).map(val => ({ ...v, words: [...v.words, val + p.tail] }))
      return [{ ...v, words: [...v.words, values[0] + p.tail] }]
    })
    if (p.ph && fill(p.ph)?.length) fanned = true
  }

  const cap = s => s.charAt(0).toUpperCase() + s.slice(1)
  return variants.map(v => {
    const text = cap(v.words.join(' '))
    return {
      value: v.stop ? `${text} ` : text,
      label: v.stop ? cap(v.label) : text,
      submit: !v.stop,
      score: literals * 10 + (completed ? 3 : 0),
    }
  })
}

// ── Public ─────────────────────────────────────────────────────────────────

// ── Commands ───────────────────────────────────────────────────────────────

const quoteIfNeeded = v => (/[\s"]/.test(v) ? `"${v.replace(/"/g, '\\"')}"` : v)

function valueOptions(spec, api, screen) {
  const t = spec.type
  if (t === 'date') {
    const days = ['today', 'tomorrow', ...[2, 3, 4, 5, 6].map(i => parseDayKey(addDays(api.today, i)).toLocaleDateString('en-US', { weekday: 'short' }).toLowerCase())]
    return screen?.date ? ['@screen', ...days] : days
  }
  if (t === 'time') {
    const starts = safe(() => freeSlots(api, addDays(api.today, 1), 60).map(s => fmtMin(Math.ceil(s.start / 30) * 30)), [])
    return [...new Set([...starts, '09:00', '14:00', '18:00'])].slice(0, 5)
  }
  if (t === 'minutes') return ['30', '60', '90', '120']
  if (t === 'bool') return ['true', 'false']
  if (t === 'percent') return ['70', '80', '85', '90']
  if (t.startsWith('enum:')) return t.slice(5).split('|')
  if (t.startsWith('ref:')) {
    const type = t.slice(4)
    const names = safe(() => api.index().ranked(type, '', { limit: 8, filter: e => type !== 'todo' || e.open }).map(e => e.name), [])
    return [...names, ...(screen?.topicId && type === 'topic' ? ['@screen'] : []), '@last']
  }
  return []
}

function suggestCommand(text, api, screen) {
  const out = []
  const m = text.match(/^\/([a-z_]*)$/i)
  if (m) {
    for (const intent of allIntents()) {
      if (!intent.id.startsWith(m[1].toLowerCase())) continue
      out.push({ value: `/${intent.id} `, label: signature(intent), submit: !slotSpec(intent).some(s => s.required), score: 10 })
    }
    return out.slice(0, MAX)
  }
  const head = text.match(/^\/([a-z_]+)\s/i)
  const id = head ? resolveIntentId(head[1]) : null
  const intent = id ? getIntent(id) : null
  if (!intent) return []
  const spec = slotSpec(intent)
  const trailing = /\s$/.test(text)
  const last = trailing ? '' : text.split(/\s+/).pop()
  const before = trailing ? text : text.slice(0, text.length - last.length)
  const used = new Set([...text.matchAll(/([a-z_]+)\s*:/gi)].map(x => x[1].toLowerCase()))
  const kv = last.match(/^([a-z_]+):(.*)$/i)
  // Every required field has a value: the command can be sent as it is.
  const complete = spec.filter(s => s.required).every(s => used.has(s.key)) && (trailing || (kv && kv[2]))
  const send = { value: text.trim(), label: `↵ ${text.trim()}`, submit: true, score: 20 }
  if (kv) {
    const s = spec.find(x => x.key === kv[1].toLowerCase())
    if (!s) return complete ? [send] : []
    // A value being typed: completions first, sending after them.
    const typedValue = fold(kv[2].replace(/^"/, ''))
    for (const v of valueOptions(s, api, screen)) {
      if (typedValue && (!fold(v).startsWith(typedValue) || fold(v) === typedValue)) continue
      out.push({ value: `${before}${s.key}:${quoteIfNeeded(v)} `, label: `${s.key}:${v}`, submit: false, score: 5 })
    }
    if (complete) out.push(send)
    return out.slice(0, MAX)
  }
  if (complete) out.push(send)
  for (const s of spec) {
    if (used.has(s.key) || (last && !s.key.startsWith(last.toLowerCase()))) continue
    out.push({ value: `${before}${s.key}:`, label: `${s.key}: ${s.describe}${s.required ? ' *' : ''}`, submit: false, score: s.required ? 6 : 4 })
  }
  return out.slice(0, MAX)
}

// ── Screen starters ────────────────────────────────────────────────────────

function screenStarters(api, screen) {
  const L = api.L
  const topic = screen?.topicId ? api.topics.find(t => t.id === screen.topicId) : null
  switch (screen?.screen) {
    case 'calendar':
      return screen.date && screen.date !== api.today
        ? [L("What's on this day?", 'Was steht an dem Tag an?'), L('When am I free this day?', 'Wann habe ich an dem Tag Zeit?')]
        : [L("What's on today?", 'Was steht heute an?'), L('How busy will the next two weeks be?', 'Wie stressig werden die nächsten zwei Wochen?')]
    case 'topic-stats':
      return topic ? [L(`Is ${topic.name} improving?`, `Wird ${topic.name} besser?`), L(`Start a session for ${topic.name}`, `Starte eine Session für ${topic.name}`), L(`When can I study ${topic.name}?`, `Wann kann ich ${topic.name} lernen?`)] : []
    case 'exams': return [L('Make a study plan for my next exam', 'Lernplan für meine nächste Prüfung'), L('Which exams do I have?', 'Welche Prüfungen habe ich?')]
    case 'statistics': return [L('Weekly review', 'Wochenrückblick'), L('Where did I get worse?', 'Wo habe ich mich verschlechtert?')]
    case 'topics': return [L('What should I study today?', 'Was soll ich heute lernen?'), L('How am I doing overall?', 'Wie läuft es insgesamt?')]
    case 'home': return [L('How am I doing overall?', 'Wie läuft es insgesamt?')]
    default: return []
  }
}

export function suggest(input, api, { screen = null } = {}) {
  if (!api) return []
  const lang = api.lang === 'en' ? 'en' : 'de'
  const fill = fillers(api)
  const text = String(input ?? '')
  if (/^\s*\//.test(text)) return safe(() => suggestCommand(text.trimStart(), api, screen), [])
  const typed = norm(text)
  const templates = allIntents().flatMap(intent => intent.completions?.[lang] ?? [])
  const out = []

  // Empty input: what fits the screen, recent questions, then ready-to-send starters.
  if (!typed) {
    for (const s of safe(() => screenStarters(api, screen), []).slice(0, 2)) out.push({ value: s, label: s, submit: true, score: 200 })
    for (const h of getHistory().slice(0, 3)) out.push({ value: h, label: h, submit: true, score: 100 })
    for (const tpl of templates) {
      if (out.length >= MAX) break
      const filled = fillWhole(tpl, fill)
      if (filled) out.push({ value: filled, label: filled, submit: true, score: 1 })
    }
    return dedupe(out, '').slice(0, MAX)
  }

  for (const h of getHistory()) {
    if (norm(h).startsWith(typed) && norm(h) !== typed) out.push({ value: h, label: h, submit: true, score: 100 })
  }
  for (const tpl of templates) {
    for (const s of matchTemplate(tpl, text, fill)) out.push(s)
  }

  // Entity completion of the half-typed last word.
  const lastWord = /\s$/.test(text) ? '' : norm(text.trim().split(/\s+/).pop() ?? '')
  if (lastWord.length >= 2) {
    const head = text.trim().split(/\s+/).slice(0, -1).join(' ')
    const names = [...new Set([...(fill('topic') ?? []), ...(fill('event') ?? []), ...(fill('todo') ?? []), ...(fill('day') ?? [])])]
    for (const name of names) {
      const nf = norm(name)
      if (nf === lastWord) continue
      if (nf.startsWith(lastWord) || nf.split(' ').some(w => w.startsWith(lastWord) && w !== lastWord)) {
        const value = head ? `${head} ${name}` : name
        out.push({ value: `${value} `, label: value, submit: false, score: 2 })
      }
    }
  }

  return dedupe(out.sort((a, b) => b.score - a.score), typed).slice(0, MAX)
}

function fillWhole(tpl, fill) {
  const words = []
  for (const p of parseTemplate(tpl)) {
    if (p.lit !== undefined) { words.push(p.raw); continue }
    const v = fill(p.ph)?.[0]
    if (!v) return null
    words.push(v + p.tail)
  }
  const s = words.join(' ')
  return s.charAt(0).toUpperCase() + s.slice(1)
}

function dedupe(list, typed) {
  const seen = new Set([typed])
  return list.filter(s => {
    const key = norm(s.value)
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
