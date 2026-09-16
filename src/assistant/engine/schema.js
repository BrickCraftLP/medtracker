// Typed slots: the one description of what each intent accepts. The command
// language (command.js), the model prompts (llm/prompt.js), autocomplete and
// the router's validation all read it from here.
//
// An intent declares slots either the old way — { name: 'description' } — or
// typed: { name: slot('date', 'new due date', { required: true }) }.
//
// Types
//   text              free words, as the user wrote them
//   date              YYYY-MM-DD  (accepts today, tomorrow, +3d, +1w, fri, next-fri, @screen, @last, "3.10.")
//   time              HH:MM       (accepts now, +2h, +30m, 15:30, "3pm", "15 uhr")
//   minutes           whole minutes (accepts 90, 1h30, 2h, 45m, "2 stunden")
//   int / percent     whole number / 0–100 (accepts "85%")
//   bool              true / false
//   enum:a|b|c        one of the listed words
//   list:minutes      [30,1440]
//   ref:todo|event|topic|exam|calendar
//                     a name as it appears in the data, or @screen / @last / @<type>:<id>

import { normalize, fold } from './normalize.js'
import { parseDate } from './parse/dates.js'
import { parseTime, fmtMin } from './parse/times.js'
import { parseDuration } from './parse/durations.js'
import { searchWords } from './lexicon.js'
import { addDays, parseDayKey, dayKey } from '../../utils/calendar/eventModel.js'
import { resolveToken, screenDate, recentDate } from './references.js'

export const slot = (type, describe, opts = {}) => ({ type, describe, ...opts })

// Old string descriptions → a type, so every intent has a usable signature.
function inferType(key, describe) {
  const d = String(describe ?? '')
  if (/YYYY-MM-DD/.test(d) || /^(date|from|to|from_date|due_date)$/.test(key)) return 'date'
  if (/HH:MM/.test(d) || /^(start|end|due_time)$/.test(key)) return 'time'
  if (/minutes/.test(d) || key === 'minutes') return 'minutes'
  if (/^true\b|^"?true/.test(d) || /^(all_day|overdue|scan|all)$/.test(key)) return 'bool'
  return 'text'
}

// → [{ key, type, describe, required, primary }] in declaration order.
export function slotSpec(intent) {
  return Object.entries(intent?.slots ?? {}).map(([key, v]) => {
    if (v && typeof v === 'object') return { key, required: false, primary: false, ...v }
    return { key, type: inferType(key, v), describe: String(v ?? ''), required: false, primary: false }
  })
}

const typeLabel = t => (t.startsWith('enum:') ? t.slice(5) : t)

// How to write each type — the command-language primer for the model and
// PARSER_GUIDE.md are generated from these lines.
export const TYPE_HELP = {
  date: 'date: YYYY-MM-DD copied from the date table (also today, tomorrow, fri, +3d, @screen = day on screen)',
  time: 'time: HH:MM in 24h, e.g. 09:30 or 18:00',
  minutes: 'minutes: whole minutes, e.g. 90 for 1.5 hours',
  int: 'int: a whole number',
  percent: 'percent: a number 0-100, e.g. 85',
  bool: 'bool: true or false',
  enum: 'choice: exactly one of the listed words',
  'list:minutes': 'list: minutes before start in brackets, e.g. [30,1440]',
  text: 'text: the user\'s own words, quoted when longer than one word',
  ref: 'name: copied exactly from KNOWN NAMES, or @screen (on screen) / @last (shown in the last answer)',
}

export const typeKey = t => (t.startsWith('enum:') ? 'enum' : t.startsWith('ref:') ? 'ref' : t)

// Primer lines for the types these intents use (all types when none given).
export function grammarLines(intents = null) {
  const used = intents ? new Set(intents.flatMap(i => slotSpec(i).map(s => typeKey(s.type)))) : new Set(Object.keys(TYPE_HELP))
  return [
    'Command format: /action field:value field:"several words"',
    ...Object.entries(TYPE_HELP).filter(([k]) => used.has(k)).map(([, v]) => `- ${v}`),
    '- leave out fields the message does not give',
  ]
}

// Order the model should fill fields in: what it acts on, then when, then the rest.
export function stepOrder(intent) {
  const rank = s => (s.type.startsWith('ref:') || s.primary ? 0 : s.type === 'date' ? 1 : s.type === 'time' ? 2 : s.type === 'minutes' ? 3 : 4)
  return slotSpec(intent).map((s, i) => ({ s, i })).sort((a, b) => rank(a.s) - rank(b.s) || a.i - b.i).map(x => x.s)
}

// "/move_event event:ref:event date:date? start:time?"
export function signature(intent) {
  const parts = slotSpec(intent).map(s => `${s.key}:${typeLabel(s.type)}${s.required ? '' : '?'}`)
  return [`/${intent.id}`, ...parts].join(' ')
}

// ── Value parsing ──────────────────────────────────────────────────────────

const WEEKDAY = { sun: 0, so: 0, sonntag: 0, sunday: 0, mon: 1, mo: 1, montag: 1, monday: 1, tue: 2, di: 2, dienstag: 2, tuesday: 2, wed: 3, mi: 3, mittwoch: 3, wednesday: 3, thu: 4, do: 4, donnerstag: 4, thursday: 4, fri: 5, fr: 5, freitag: 5, friday: 5, sat: 6, sa: 6, samstag: 6, saturday: 6 }

export function parseDateValue(value, api) {
  const v = String(value ?? '').trim()
  const today = api.today
  if (!v) return null
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return dayKey(parseDayKey(v)) === v ? v : null
  if (v === '@screen' || v === '@this') return screenDate(api)
  if (v === '@last' || v === '@it') return recentDate(api)
  const f = fold(v).replace(/_/g, '-')
  if (f === 'today' || f === 'heute') return today
  if (f === 'tomorrow' || f === 'morgen') return addDays(today, 1)
  if (f === 'overmorrow' || f === 'uebermorgen') return addDays(today, 2)
  if (f === 'yesterday' || f === 'gestern') return addDays(today, -1)
  let m
  if ((m = f.match(/^([+-])(\d{1,3})([dw])$/))) return addDays(today, (m[1] === '-' ? -1 : 1) * Number(m[2]) * (m[3] === 'w' ? 7 : 1))
  if ((m = f.match(/^(next-)?([a-z]+)$/)) && WEEKDAY[m[2]] != null) {
    const dow = parseDayKey(today).getDay()
    let diff = (WEEKDAY[m[2]] - dow + 7) % 7
    if (m[1] && diff === 0) diff = 7
    return addDays(today, diff)
  }
  return parseDate(` ${normalize(v)} `, today)?.date ?? null
}

export function parseTimeValue(value, api) {
  const v = fold(String(value ?? '').trim())
  if (!v) return null
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(v)) {
    const [h, mi] = v.split(':').map(Number)
    return h < 24 && mi < 60 ? fmtMin(h * 60 + mi) : null
  }
  const now = api.now?.() ?? new Date()
  const nowMin = now.getHours() * 60 + now.getMinutes()
  if (v === 'now' || v === 'jetzt') return fmtMin(nowMin)
  let m
  if ((m = v.match(/^\+(\d{1,3})(h|m)$/))) return fmtMin(Math.min(1439, nowMin + Number(m[1]) * (m[2] === 'h' ? 60 : 1)))
  if (/^\d{1,2}$/.test(v) && Number(v) < 24) return fmtMin(Number(v) * 60)
  const t = parseTime(` ${normalize(v)} `)
  return t ? fmtMin(t.minutes) : null
}

export function parseMinutesValue(value) {
  const v = fold(String(value ?? '').trim())
  if (!v) return null
  if (/^\d+$/.test(v)) return Number(v)
  const d = parseDuration(` ${normalize(v)} `)
  return d ? d.minutes : null
}

// ── Validation ─────────────────────────────────────────────────────────────

const REF_LOOKUP = {
  todo: (api, name) => api.index().best(name, { types: ['todo'], min: 0.501 })?.row ?? null,
  event: (api, name) => api.index().best(name, { types: ['event'], min: 0.5 })?.row ?? null,
  topic: (api, name) => api.findTopic(name),
  exam: (api, name) => api.index().best(name, { types: ['exam', 'event'], min: 0.5 })?.row ?? null,
  calendar: (api, name) => api.index().best(name, { types: ['calendar'], min: 0.5 })?.row ?? null,
}

// Close names for a "not found" hint, so the model (or the user) can copy one.
function nameHint(api, type, value) {
  const types = type === 'exam' ? ['exam'] : [type]
  const names = api.index().ranked(types[0], value, { limit: 4 }).map(e => `"${e.name}"`)
  return names.length ? ` Known: ${names.join(', ')}.` : ''
}

// One value → { value } | { error }.
export function coerce(spec, raw, api) {
  const type = spec.type
  if (raw == null || raw === '' || raw === 'null' || raw === 'none') return { value: null }
  if (type === 'date') {
    const d = parseDateValue(raw, api)
    return d ? { value: d } : { error: `"${raw}" is not a date — use YYYY-MM-DD, today, tomorrow, +3d, fri or a value from the date table` }
  }
  if (type === 'time') {
    const t = parseTimeValue(raw, api)
    return t ? { value: t } : { error: `"${raw}" is not a time — use HH:MM (24h), e.g. 14:30` }
  }
  if (type === 'minutes') {
    const n = parseMinutesValue(raw)
    return n != null && n > 0 ? { value: n } : { error: `"${raw}" is not a duration — use whole minutes, e.g. 90` }
  }
  if (type === 'int') {
    const n = Number(String(raw).trim())
    return Number.isInteger(n) ? { value: n } : { error: `"${raw}" is not a whole number` }
  }
  if (type === 'percent') {
    const n = Number(String(raw).replace('%', '').replace(',', '.').trim())
    return Number.isFinite(n) && n >= 0 && n <= 100 ? { value: Math.round(n) } : { error: `"${raw}" is not a percentage between 0 and 100` }
  }
  if (type === 'bool') {
    if (raw === true || raw === false) return { value: raw }
    const f = fold(String(raw))
    if (['true', 'yes', 'ja', '1'].includes(f)) return { value: true }
    if (['false', 'no', 'nein', '0'].includes(f)) return { value: false }
    return { error: `"${raw}" is not true or false` }
  }
  if (type.startsWith('enum:')) {
    const options = type.slice(5).split('|')
    const f = fold(String(raw)).trim()
    return options.includes(f) ? { value: f } : { error: `"${raw}" is not one of ${options.join(', ')}` }
  }
  if (type === 'list:minutes') {
    const parts = Array.isArray(raw) ? raw : String(raw).replace(/[[\]]/g, '').split(/[,\s]+/).filter(Boolean)
    const nums = parts.map(p => parseMinutesValue(p))
    return nums.every(n => n != null) ? { value: nums } : { error: `"${raw}" is not a list of minutes, e.g. [30,1440]` }
  }
  if (type.startsWith('ref:')) {
    const refType = type.slice(4)
    const v = String(raw).trim()
    if (v.startsWith('@')) {
      const row = resolveToken(api, refType, v)
      return row ? { value: v, row } : { error: `${v} points at no ${refType} — nothing like that is on screen or in the last answer` }
    }
    const row = REF_LOOKUP[refType]?.(api, v) ?? null
    return row || spec.optionalRef ? { value: v, row } : { error: `no ${refType} named "${v}".${nameHint(api, refType, v)}` }
  }
  return { value: typeof raw === 'string' ? raw.trim() : raw }
}

// Free-text fields a model filled must share a word with what the user typed —
// small models otherwise echo prompt words ({"query":"search_all"}).
const FREE_TEXT = new Set(['query', 'text', 'title', 'new_text', 'name', 'topic', 'event', 'todo', 'exam'])

// slots (strings or values) → { slots, errors: [{ key, message }], rows: { key: row } }.
// `query`: the user's own words, to reject echoed free text (model output only).
export function validateSlots(intent, input, api, { query = null, partial = false } = {}) {
  const spec = slotSpec(intent)
  const byKey = new Map(spec.map(s => [s.key, s]))
  const slots = {}
  const rows = {}
  const errors = []
  const words = query ? new Set(searchWords(normalize(query))) : null
  for (const [key, raw] of Object.entries(input ?? {})) {
    const s = byKey.get(key)
    if (!s) {
      errors.push({ key, message: `unknown field "${key}" — ${intent.id} takes ${spec.map(x => x.key).join(', ') || 'no fields'}` })
      continue
    }
    if (words && typeof raw === 'string' && !raw.startsWith('@')) {
      const f = fold(raw)
      if (f === fold(intent.id) || f === fold(key)) continue
      if (FREE_TEXT.has(key) || s.type === 'text' || s.type.startsWith('ref:')) {
        const w = searchWords(raw)
        if (w.length && !w.some(x => words.has(x) || [...words].some(y => y.startsWith(x.slice(0, 4)) && x.length >= 4))) continue
      }
    }
    const out = coerce(s, raw, api)
    if (out.error) errors.push({ key, message: `${key}: ${out.error}` })
    else if (out.value != null) {
      slots[key] = out.value
      if (out.row) rows[key] = out.row
    }
  }
  if (!partial) {
    for (const s of spec) if (s.required && slots[s.key] == null) errors.push({ key: s.key, message: `${s.key} is required (${s.describe})` })
  }
  return { slots, errors, rows }
}
