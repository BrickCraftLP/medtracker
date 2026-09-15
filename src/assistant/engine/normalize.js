// Text normalisation shared by every parser. Lowercase, umlauts folded,
// punctuation squashed — but digits, ':' and '.' survive for times and dates.
//
// Typos in the words the parsers key on ("m9orgen", "freitga", "stunen") are
// corrected against VOCAB before SYNONYMS rewrites phrasings onto one
// canonical word. Extend both freely.

const SYNONYMS = [
  [/\b(to-?dos?|aufgaben?|tasks?)\b/g, 'todo'],
  [/\b(termine?|events?|eintrage?|eintrag|appointments?|entr(y|ies))\b/g, 'event'],
  [/\b(pruefungs?|pruefungen|klausur(en)?|tests?|exams?)\b/g, 'exam'],
  [/\b(lernen|lerne|studieren|study|revise|learn)\b/g, 'study'],
  [/\b(freunden?|friends?|kumpels?)\b/g, 'friends'],
  [/\b(heute|today)\b/g, 'today'],
  [/\b(morgen|tomorrow)\b/g, 'tomorrow'],
  [/\b(uebermorgen|day after tomorrow)\b/g, 'overmorrow'],
]

// Words worth auto-correcting. Only tokens of 5+ letters are corrected, and
// only onto these, so free-text titles are left alone almost always.
const VOCAB = new Set([
  'heute', 'morgen', 'morgens', 'uebermorgen', 'today', 'tomorrow', 'tonight',
  'montag', 'dienstag', 'mittwoch', 'donnerstag', 'freitag', 'samstag', 'sonntag',
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday',
  'stunde', 'stunden', 'minute', 'minuten', 'hours', 'minutes',
  'termin', 'termine', 'eintragen', 'trage', 'treffen', 'treffe', 'lernen', 'study',
  'naechste', 'naechsten', 'naechster', 'naechstes', 'woche', 'wochenende', 'weekend',
  'kalender', 'calendar', 'todos', 'abends', 'mittags', 'nachmittags', 'vormittags',
  'fruehstueck', 'zwischen', 'verschiebe', 'verschieben', 'loesche', 'loeschen',
  'pruefung', 'klausur', 'vorlesung', 'erinnere', 'schedule', 'appointment', 'meeting',
  'freunden', 'friends', 'erledigt', 'zeitfenster',
])
const PROTECT = new Set(['sorgen', 'borgen', 'morgan', 'heuer', 'leben', 'lesen', 'house', 'monate', 'wache', 'trager'])

// Edit distance where swapping two neighbouring letters ("freitga") counts as
// one typo, not two (optimal string alignment).
function lev(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1
  let prev2 = null
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    let rowMin = i
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
      if (prev2 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) cur[j] = Math.min(cur[j], prev2[j - 2] + 1)
      if (cur[j] < rowMin) rowMin = cur[j]
    }
    if (rowMin > max) return max + 1
    prev2 = prev
    prev = cur
  }
  return prev[b.length]
}

export function correctToken(tok) {
  // A stray digit inside a word ("m9orgen") is a typo, not a number.
  const stripped = /^[a-z]+\d+[a-z]+$/.test(tok) ? tok.replace(/\d+/g, '') : tok
  if (VOCAB.has(stripped)) return stripped
  if (!/^[a-z]{5,}$/.test(stripped) || PROTECT.has(stripped)) return tok
  const max = stripped.length >= 8 ? 2 : 1
  let best = null
  let bestD = max + 1
  for (const v of VOCAB) {
    const d = lev(stripped, v, max)
    if (d < bestD) { best = v; bestD = d }
  }
  return best ?? tok
}

export function fold(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function normalize(text) {
  let s = fold(text).replace(/[!?,;"“”„()]/g, ' ')
  s = s.split(/\s+/).map(correctToken).join(' ')
  // "day after tomorrow" must win before "tomorrow" alone is rewritten.
  s = s.replace(/\bday after tomorrow\b/g, 'overmorrow')
  for (const [re, rep] of SYNONYMS) s = s.replace(re, rep)
  return s.replace(/\s+/g, ' ').trim()
}

// Does the normalised text contain any of these words / regexes?
export function hasAny(text, patterns) {
  return patterns.some(p => (p instanceof RegExp ? p.test(text) : new RegExp(`\\b${p}\\b`).test(text)))
}

// Simple similarity for fuzzy search: share of query tokens found in target.
export function tokenScore(query, target) {
  const q = fold(query).split(/\s+/).filter(w => w.length > 1)
  if (!q.length) return 0
  const tgt = fold(target)
  return q.filter(w => tgt.includes(w)).length / q.length
}
