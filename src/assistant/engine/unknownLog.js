// Queries nobody understood, kept on this device only. Shown in
// Settings → Assistant so new intents can be written against real phrasing.

const KEY = 'mt_assistant_unknown'
const MAX = 50

export function logUnknown(text) {
  try {
    const list = getUnknown().filter(e => e.text !== text)
    list.unshift({ text, at: new Date().toISOString() })
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)))
  } catch { /* storage unavailable */ }
}

export function getUnknown() {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '[]') } catch { return [] }
}

export function clearUnknown() {
  try { localStorage.removeItem(KEY) } catch { /* ignore */ }
}
