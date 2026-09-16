// The command language: one exact way to say what the assistant should do.
//
//   /intent_id key:value key:"two words" key:[30,60] ; /other_intent …
//
// Typed by power users ("/add_event title:Brunch date:fri start:10:00"), built
// step by step by the local model (llm/prompt.js), and stored in every trace.
// Values are checked against the intent's typed slots (schema.js); every
// problem comes back with a hint precise enough for a repair turn.
//
// Words without a key go to the intent's primary slot: "/search_all chemie".

import { getIntent, allIntents } from './registry.js'
import { slotSpec, validateSlots, signature } from './schema.js'

export const MAX_CHAIN = 3

export const looksLikeCommand = s => /^\s*\/[a-z_]/i.test(String(s ?? ''))

// Split on ';' outside quotes and brackets.
function splitChain(s) {
  const out = []
  let cur = ''
  let quote = null
  let depth = 0
  for (const ch of s) {
    if (quote) { if (ch === quote) quote = null; cur += ch; continue }
    if (ch === '"' || ch === '“' || ch === '„') { quote = ch === '„' ? '“' : ch; cur += ch; continue }
    if (ch === '[') depth++
    if (ch === ']') depth = Math.max(0, depth - 1)
    if (ch === ';' && !depth) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out.map(x => x.trim()).filter(Boolean)
}

const ARG = /([a-z_]+)\s*[:=]\s*("(?:[^"\\]|\\.)*"|“[^”]*”|„[^“”]*[“”]|'[^']*'|\[[^\]]*\]|[^\s]+)/gi

function unquote(v) {
  const s = v.trim()
  if (/^\[.*\]$/.test(s)) return s.slice(1, -1).split(/[,\s]+/).filter(Boolean)
  if (/^".*"$/.test(s)) return s.slice(1, -1).replace(/\\"/g, '"')
  if (/^[“„'].*[”“']$/.test(s)) return s.slice(1, -1)
  return s
}

// Exact id, else a unique prefix ("/list_to" → list_todos), else null.
export function resolveIntentId(name) {
  const n = String(name ?? '').toLowerCase()
  if (getIntent(n)) return n
  const hits = allIntents().filter(i => i.id.startsWith(n) || (i.command ?? []).includes(n))
  return hits.length === 1 ? hits[0].id : null
}

export const primarySlot = intent => {
  const spec = slotSpec(intent)
  return (spec.find(s => s.primary) ?? spec.find(s => s.type === 'text' || s.type.startsWith('ref:')))?.key ?? null
}

// One command string (without chaining) → { intent, slots, rows, errors, raw }.
export function parseOne(text, api, { query = null } = {}) {
  const raw = text.trim()
  const m = raw.match(/^\/?([a-z_]+)\b\s*(.*)$/is)
  if (!m) return { intent: null, slots: {}, rows: {}, errors: [{ key: null, message: `"${raw}" does not start with /intent_id` }], raw }
  const id = resolveIntentId(m[1])
  if (!id) {
    const close = allIntents().map(i => i.id).filter(x => x.includes(m[1].toLowerCase().split('_')[0])).slice(0, 5)
    return { intent: null, slots: {}, rows: {}, errors: [{ key: null, message: `unknown action "/${m[1]}"${close.length ? ` — did you mean ${close.map(c => `/${c}`).join(', ')}?` : ''}` }], raw }
  }
  const intent = getIntent(id)
  const input = {}
  let rest = m[2]
  for (const a of m[2].matchAll(ARG)) {
    input[a[1].toLowerCase()] = unquote(a[2])
    rest = rest.replace(a[0], ' ')
  }
  const free = rest.replace(/\s+/g, ' ').trim()
  if (free) {
    const key = primarySlot(intent)
    if (key && input[key] == null) input[key] = unquote(free)
    else return { intent: id, slots: {}, rows: {}, errors: [{ key: null, message: `could not read "${free}" — write fields as key:value` }], raw }
  }
  const { slots, errors, rows } = validateSlots(intent, input, api, { query })
  return { intent: id, slots, rows, errors, raw }
}

// "/a …; /b …" → { commands: [...], errors: [...all] }
export function parseCommand(text, api, opts = {}) {
  const parts = splitChain(String(text ?? '').trim())
  const commands = parts.slice(0, MAX_CHAIN).map(p => parseOne(p, api, opts))
  const errors = commands.flatMap((c, i) => c.errors.map(e => ({ ...e, index: i })))
  if (parts.length > MAX_CHAIN) errors.push({ key: null, index: MAX_CHAIN, message: `at most ${MAX_CHAIN} commands at once` })
  return { commands, errors }
}

function fmtValue(v) {
  if (Array.isArray(v)) return `[${v.join(',')}]`
  if (typeof v === 'boolean' || typeof v === 'number') return String(v)
  const s = String(v)
  return /^[^\s"'[\];]+$/.test(s) ? s : `"${s.replace(/"/g, '\\"')}"`
}

// Canonical string for an intent + slots, fields in declaration order.
export function formatCommand(intentId, slots = {}) {
  const intent = getIntent(intentId)
  const keys = intent ? slotSpec(intent).map(s => s.key) : Object.keys(slots ?? {})
  const extra = Object.keys(slots ?? {}).filter(k => !keys.includes(k))
  const parts = [`/${intentId}`]
  for (const k of [...keys, ...extra]) {
    const v = slots?.[k]
    if (v == null || v === '' || v === false || (Array.isArray(v) && !v.length)) continue
    parts.push(`${k}:${fmtValue(v)}`)
  }
  return parts.join(' ')
}

// Errors as lines, for the user or a repair prompt.
export const errorLines = errors => errors.map(e => `- ${e.message}`).join('\n')

export { signature }
