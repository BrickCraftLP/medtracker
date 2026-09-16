// Reminders: "30 min vorher", "a day before", "erinnere mich 1 Stunde davor",
// "mit Erinnerung", "ohne Erinnerung". Input is normalised text.
//
// → { reminders: [minutes before start], matches: [substrings] } | null

const UNIT = [
  [/^(min|mins|minute|minuten|minutes|m)$/, 1],
  [/^(h|std|stunde|stunden|hour|hours)$/, 60],
  [/^(tag|tage|tagen|day|days)$/, 1440],
  [/^(woche|wochen|week|weeks)$/, 10080],
]
const WORD = { ein: 1, eine: 1, einen: 1, einer: 1, einem: 1, one: 1, a: 1, an: 1, zwei: 2, two: 2, drei: 3, three: 3, halbe: 0.5, half: 0.5 }

export const DEFAULT_REMINDER = 30

export function parseReminders(text) {
  const matches = []
  const reminders = []
  if (/\b(ohne erinnerung\w*|keine erinnerung\w*|no reminders?|without (?:a )?reminders?)\b/.test(text)) {
    return { reminders: [], matches: [text.match(/\b(ohne erinnerung\w*|keine erinnerung\w*|no reminders?|without (?:a )?reminders?)\b/)[0]] }
  }
  const re = /\b(?:(?:und |and )?(?:erinner\w* (?:mich |mir )?|remind me |reminder |erinnerung )?)(\d{1,3}|ein|eine|einen|einer|einem|one|a|an|zwei|two|drei|three|halbe|half)\s*(min|mins|minute|minuten|minutes|m|h|std|stunde|stunden|hour|hours|tag|tage|tagen|day|days|woche|wochen|week|weeks)\s+(vorher|davor|before|in advance|frueher|earlier|zuvor)\b/g
  for (const m of text.matchAll(re)) {
    const n = WORD[m[1]] ?? Number(m[1])
    const mult = UNIT.find(([u]) => u.test(m[2]))?.[1] ?? 1
    if (Number.isFinite(n) && n > 0) {
      reminders.push(Math.round(n * mult))
      matches.push(m[0])
    }
  }
  // "30 min und 1 tag vorher": the first amount shares the last "vorher".
  const shared = text.match(/\b(\d{1,3})\s*(min|minuten|minutes|h|stunden?|hours?)\s+(?:und|and)\s+(?=(?:\d{1,3}|ein\w*|one|a)\s*\w+\s+(?:vorher|davor|before))/)
  if (shared) {
    const mult = UNIT.find(([u]) => u.test(shared[2]))?.[1] ?? 1
    reminders.push(Number(shared[1]) * mult)
    matches.push(shared[0])
  }
  if (!reminders.length) {
    const m = text.match(/\b(mit erinnerung|with (?:a )?reminder|erinnere mich( daran)?|remind me)\b/)
    if (m && /\b(event|termin|mit erinnerung|with (?:a )?reminder)\b/.test(text)) return { reminders: [DEFAULT_REMINDER], matches: [m[0]] }
    return null
  }
  return { reminders: [...new Set(reminders)].sort((a, b) => a - b), matches }
}
