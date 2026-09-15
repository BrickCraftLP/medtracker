// Clock times: "at 9", "9:30", "3pm", "um 15 uhr", "halb 11", "viertel nach 9",
// "from 10 to 12", "von 9 bis 10 uhr", "zwischen 9 und 11", "10-12".
// Returns minutes since midnight. Input is normalised text.

function toMinutes(h, m = 0, ampm = null) {
  let hour = Number(h)
  const min = Number(m ?? 0)
  if (ampm === 'pm' && hour < 12) hour += 12
  if (ampm === 'am' && hour === 12) hour = 0
  if (hour > 23 || min > 59) return null
  return hour * 60 + min
}

const clean = v => (v === 'uhr' ? null : v)

// Range first so "10-12" is not read as a start time alone.
export function parseTimeRange(text) {
  const m = text.match(/\b(?:from |von |ab )?(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|uhr)?\s*(?:-|–|to|bis|until|till)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|uhr)?\b/)
    || text.match(/\b(?:zwischen|between) (\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|uhr)?\s*(?:und|and)\s*(\d{1,2})(?:[:.](\d{2}))?\s*(am|pm|uhr)?\b/)
  if (!m) return null
  const endAmpm = clean(m[6])
  const start = toMinutes(m[1], m[2], clean(m[3]) ?? endAmpm)
  const end = toMinutes(m[4], m[5], endAmpm)
  if (start == null || end == null || end <= start) return null
  return { start, end, match: m[0] }
}

// German colloquial clock: "halb 11" = 10:30, "viertel nach 9" = 9:15,
// "viertel vor 9" / "dreiviertel 9" = 8:45.
function germanClock(text) {
  let m
  if ((m = text.match(/\b(?:um |ab |gegen )?halb (\d{1,2})\b/))) {
    return { minutes: ((Number(m[1]) + 23) % 24) * 60 + 30, match: m[0] }
  }
  if ((m = text.match(/\b(?:um |ab |gegen )?viertel nach (\d{1,2})\b/))) {
    return { minutes: (Number(m[1]) % 24) * 60 + 15, match: m[0] }
  }
  if ((m = text.match(/\b(?:um |ab |gegen )?(?:viertel vor|dreiviertel) (\d{1,2})\b/))) {
    return { minutes: ((Number(m[1]) + 23) % 24) * 60 + 45, match: m[0] }
  }
  return null
}

export function parseTime(text) {
  let m
  const g = germanClock(text)
  if (g) return g
  // "9:30" always; "9.30" only as "um 9.30" or "9.30 uhr" — bare "3.10" is a date.
  if ((m = text.match(/\b(?:at |um |ab |gegen )?(\d{1,2}):(\d{2})\s*(am|pm|uhr)?\b/))
    || (m = text.match(/\b(?:at |um |ab |gegen )(\d{1,2})\.(\d{2})\b(?!\.)\s*(uhr)?/))
    || (m = text.match(/\b(\d{1,2})\.(\d{2})\s*(uhr)\b/))) {
    const v = toMinutes(m[1], m[2], clean(m[3]))
    if (v != null) return { minutes: v, match: m[0] }
  }
  if ((m = text.match(/\b(?:at |um |ab |gegen )?(\d{1,2})\s*(am|pm|uhr)\b/))) {
    const v = toMinutes(m[1], 0, clean(m[2]))
    if (v != null) return { minutes: v, match: m[0] }
  }
  // Bare "at 9" / "um 9" — only with the preposition, otherwise it's any number.
  if ((m = text.match(/\b(?:at|um|gegen|ab) (\d{1,2})\b(?![.:/]\d)/))) {
    const v = toMinutes(m[1])
    if (v != null) return { minutes: v, match: m[0] }
  }
  if ((m = text.match(/\b(frueh|early)\b/))) return { minutes: 8 * 60, match: m[0], fuzzy: true }
  if ((m = text.match(/\b(morning|morgens|vormittags?)\b/))) return { minutes: 9 * 60, match: m[0], fuzzy: true }
  if ((m = text.match(/\b(noon|mittags?)\b/))) return { minutes: 12 * 60, match: m[0], fuzzy: true }
  if ((m = text.match(/\b(afternoon|nachmittags?)\b/))) return { minutes: 14 * 60, match: m[0], fuzzy: true }
  if ((m = text.match(/\b(evening|tonight|abends?)\b/))) return { minutes: 18 * 60, match: m[0], fuzzy: true }
  return null
}

export const fmtMin = min => `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`

export function fmtDuration(min, lang = 'en') {
  const h = Math.floor(min / 60), m = min % 60
  const hu = lang === 'de' ? 'Std' : 'h'
  if (!h) return `${m} min`
  return m ? `${h} ${hu} ${m} min` : `${h} ${hu}`
}
