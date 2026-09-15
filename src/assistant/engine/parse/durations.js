// "5 hours", "90 min", "2h30", "1.5h", "5 std", "half an hour", "eine stunde" → minutes.
// Returns { minutes, match } or null.

const WORD_NUM = { a: 1, an: 1, one: 1, eine: 1, einer: 1, ein: 1, two: 2, zwei: 2, three: 3, drei: 3, four: 4, vier: 4, five: 5, fuenf: 5, six: 6, sechs: 6 }

export function parseDuration(text) {
  let m

  // 2h30 / 2h 30m / 2:30h
  if ((m = text.match(/\b(\d{1,2})\s*(?:h|std)\s*(\d{1,2})\s*(?:m|min)?\b/))) {
    return { minutes: Number(m[1]) * 60 + Number(m[2]), match: m[0] }
  }
  if ((m = text.match(/\b(half an hour|halbe stunde|einer halben stunde)\b/))) return { minutes: 30, match: m[0] }

  // Digits may take short units ("5h", "90m"); number words need the full
  // unit, otherwise "am" would read as "a m" = one minute.
  const DIGITS = '(\\d+(?:[.,]\\d+)?)'
  const WORDS = `(${Object.keys(WORD_NUM).join('|')})`
  const patterns = [
    [`\\b(?:for |fuer )?${DIGITS}\\s*(?:hours?|hrs?|h|stunden?|std)\\b`, 60],
    [`\\b(?:for |fuer )?${WORDS}\\s+(?:hours?|stunden?)\\b`, 60],
    [`\\b(?:for |fuer )?${DIGITS}\\s*(?:minutes?|mins?|m|minuten?)\\b`, 1],
    [`\\b(?:for |fuer )?${WORDS}\\s+(?:minutes?|minuten?)\\b`, 1],
  ]
  for (const [re, mult] of patterns) {
    if ((m = text.match(new RegExp(re)))) return { minutes: Math.round(toNum(m[1]) * mult), match: m[0] }
  }
  return null
}

function toNum(s) {
  return WORD_NUM[s] ?? Number(String(s).replace(',', '.'))
}
