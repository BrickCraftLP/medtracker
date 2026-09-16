// What the user told the assistant about themselves, kept on this device only
// (localStorage, like feedbackLog.js). No imports: normalize.js reads aliases
// from here, so this module must not depend on the rest of the engine.
//
//   aliases      { "pk": "pharmakologie" }   folded short form → folded meaning
//   preferences  { dayStart, dayEnd, name, studyMinutes }   minutes since midnight / minutes
//   notes        [{ id, text, at }]           free "remember that …" facts
//   places       { "brunch": "Café Central" } folded title word → place as typed

const KEY = 'mt_assistant_profile'
const MAX_NOTES = 30
const EMPTY = () => ({ v: 1, aliases: {}, preferences: {}, notes: [], places: {} })

let cache = null
let rev = 0

const foldKey = s => String(s ?? '').toLowerCase()
  .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

export function getStoredProfile() {
  if (cache) return cache
  try {
    const raw = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null')
    cache = { ...EMPTY(), ...(raw && typeof raw === 'object' ? raw : {}) }
  } catch {
    cache = EMPTY()
  }
  return cache
}

// Bumped on every change, so memoised lookups (entity index, aliases) rebuild.
export const profileRevision = () => rev

function save(next) {
  cache = next
  rev++
  try { globalThis.localStorage?.setItem(KEY, JSON.stringify(next)) } catch { /* storage full or unavailable */ }
  try { globalThis.window?.dispatchEvent?.(new CustomEvent('mt-assistant-profile')) } catch { /* no window */ }
  return next
}

export function setAlias(short, meaning) {
  const k = foldKey(short)
  const v = foldKey(meaning)
  if (!k || !v || k === v) return null
  const p = getStoredProfile()
  save({ ...p, aliases: { ...p.aliases, [k]: v } })
  return { short: k, meaning: v }
}

export function removeAlias(short) {
  const p = getStoredProfile()
  const aliases = { ...p.aliases }
  delete aliases[foldKey(short)]
  save({ ...p, aliases })
}

export function setPreference(key, value) {
  const p = getStoredProfile()
  const preferences = { ...p.preferences }
  if (value == null) delete preferences[key]
  else preferences[key] = value
  save({ ...p, preferences })
}

export function setPlace(word, place) {
  const k = foldKey(word)
  if (!k || !place) return
  const p = getStoredProfile()
  save({ ...p, places: { ...p.places, [k]: String(place).trim() } })
}

export function removePlace(word) {
  const p = getStoredProfile()
  const places = { ...p.places }
  delete places[foldKey(word)]
  save({ ...p, places })
}

export function addNote(text) {
  const t = String(text ?? '').trim()
  if (!t) return null
  const p = getStoredProfile()
  const note = { id: globalThis.crypto?.randomUUID?.() ?? `n${Date.now()}`, text: t, at: new Date().toISOString() }
  save({ ...p, notes: [note, ...p.notes.filter(n => foldKey(n.text) !== foldKey(t))].slice(0, MAX_NOTES) })
  return note
}

export function removeNote(id) {
  const p = getStoredProfile()
  save({ ...p, notes: p.notes.filter(n => n.id !== id) })
}

// Forget whatever matches `what`: an alias, a place, a note or a preference key.
export function forget(what) {
  const k = foldKey(what)
  const p = getStoredProfile()
  const next = { ...p, aliases: { ...p.aliases }, places: { ...p.places }, preferences: { ...p.preferences } }
  let removed = 0
  for (const [a, m] of Object.entries(p.aliases)) if (a === k || m === k) { delete next.aliases[a]; removed++ }
  for (const w of Object.keys(p.places)) if (w === k || foldKey(p.places[w]) === k) { delete next.places[w]; removed++ }
  const notes = p.notes.filter(n => !foldKey(n.text).includes(k))
  removed += p.notes.length - notes.length
  next.notes = notes
  if (k && k in p.preferences) { delete next.preferences[k]; removed++ }
  if (removed) save(next)
  return removed
}

export function clearStoredProfile() {
  save(EMPTY())
}

export const getAliases = () => getStoredProfile().aliases ?? {}

// Test hook: forget the in-memory copy so the next read goes to storage.
export function resetUserStoreCache() {
  cache = null
  rev++
}
