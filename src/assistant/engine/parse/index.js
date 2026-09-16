// Pull every structured piece out of a sentence at once. Order matters: time
// ranges and clock times are removed before dates so "9.30" is never read as
// a day, and whatever is left over is usable as a title.

import { parseDate, parseDateRange } from './dates.js'
import { normalize } from '../normalize.js'
import { parseDuration } from './durations.js'
import { parseTime, parseTimeRange } from './times.js'
import { parseRecurrence, stripRecurrence, firstDateOf } from './recurrence.js'
import { parseReminders } from './reminders.js'
import { addDays, parseDayKey } from '../../../utils/calendar/eventModel.js'

const EVENING = /\b(abends?|evening|tonight|nachmittags?|afternoon|nachts)\b/
const REL_NUM = { ein: 1, eine: 1, einer: 1, einem: 1, one: 1, a: 1, an: 1, zwei: 2, two: 2, drei: 3, three: 3, halben: 0.5, half: 0.5 }

// "in 2 Stunden", "in 30 min", "in einer halben Stunde" → a start time from now.
function parseRelativeTime(text, now) {
  const m = text.match(/\bin (\d{1,3}|ein\w*|one|an?|zwei|two|drei|three|half an|einer halben) ?(stunden?|std|hours?|h|minuten?|minutes?|mins?)\b/)
  if (!m) return null
  const n = /^\d/.test(m[1]) ? Number(m[1]) : m[1].includes('halb') || m[1].startsWith('half') ? 0.5 : REL_NUM[m[1]] ?? 1
  const add = Math.round(n * (/^(std|stunde|h)/.test(m[2]) ? 60 : 1))
  const total = now.getHours() * 60 + now.getMinutes() + add
  // Round up to the next 5 minutes; past midnight it is tomorrow.
  const rounded = Math.ceil(total / 5) * 5
  return { minutes: rounded % 1440, dayOffset: Math.floor(rounded / 1440), match: m[0] }
}

export function extract(text, today, { now = new Date() } = {}) {
  let rest = ` ${text} `
  const take = m => { if (m?.match) rest = rest.replace(m.match, ' '); return m }

  const range = take(parseTimeRange(rest))
  const reminders = parseReminders(rest)
  if (reminders) for (const part of reminders.matches) rest = rest.replace(part, ' ')
  const relative = range ? null : take(parseRelativeTime(rest, now))
  const duration = take(parseDuration(rest))
  const time = range || relative ? null : take(parseTime(rest))
  const recurrence = parseRecurrence(rest, today)
  if (recurrence) rest = stripRecurrence(rest, recurrence)
  const dateRange = take(parseDateRange(rest, today))
  const date = take(parseDate(rest, today))

  let startMin = range?.start ?? relative?.minutes ?? time?.minutes ?? null
  let endMin = range?.end ?? null
  // "um 7 abends", "nachmittags von 3 bis 5" → afternoon/evening clock.
  if (EVENING.test(text) && !time?.fuzzy && !relative && startMin != null && startMin >= 60 && startMin < 12 * 60) {
    startMin += 12 * 60
    if (endMin != null && endMin < 12 * 60) endMin += 12 * 60
  }

  let day = date?.date ?? (relative ? addDays(today, relative.dayOffset) : null)
  // "nächste Woche Montag": the weekday belongs inside the named week.
  if (dateRange && day && day < dateRange.from) day = addDays(day, 7)
  // "jeden Montag um 10": the series starts on the next such day.
  if (!day && recurrence) day = firstDateOf(recurrence, today, addDays, parseDayKey)

  return {
    date: day,
    range: dateRange && !day ? { from: dateRange.from, to: dateRange.to, past: !!dateRange.past } : null,
    startMin,
    endMin,
    minutes: duration?.minutes ?? (startMin != null && endMin != null ? endMin - startMin : null),
    fuzzyTime: !!time?.fuzzy,
    relative: !!relative,
    rrule: recurrence?.rrule ?? null,
    reminders: reminders?.reminders ?? null,
    rest: rest.replace(/\s+/g, ' ').trim(),
  }
}

// Remove command words from what is left, leaving a usable title.
export function cleanTitle(rest, stopwords) {
  let s = ` ${rest} `
  for (const w of stopwords) s = s.replace(new RegExp(`\\s${w}(?=\\s)`, 'g'), ' ')
  s = s.replace(/\s+/g, ' ').trim()
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

// A title in the user's own words. `rest` is what extract() left of the
// normalised sentence; every raw token whose normalised form is still in it
// (and is not a stopword) is kept exactly as typed — so "Anatomie lernen"
// stays "Anatomie lernen" instead of the canonical "anatomie study", and
// umlauts and capitals survive. Scans from the end, so in "benenne Skript
// lesen in Skript Kapitel 2 lesen um" the later words win.
export function labelFrom(raw, rest, stopwords = []) {
  const stop = new Set(stopwords)
  const bare = w => w.replace(/[^a-z0-9]/g, '')
  const left = new Map()
  for (const w of String(rest ?? '').split(/\s+/).map(bare).filter(Boolean)) left.set(w, (left.get(w) ?? 0) + 1)
  const out = []
  for (const tok of String(raw ?? '').split(/\s+/).reverse()) {
    const clean = tok.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    if (!clean) continue
    const parts = normalize(clean).split(/\s+/).map(bare).filter(Boolean)
    if (!parts.length || parts.every(p => stop.has(p))) continue
    if (!parts.every(p => (left.get(p) ?? 0) > 0)) continue
    for (const p of parts) left.set(p, left.get(p) - 1)
    out.push(clean)
  }
  const s = out.reverse().join(' ')
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : ''
}

// Titles come out of normalised (lowercased) text; give words back the
// capitalisation the user typed ("anna" → "Anna").
export function restoreCase(title, raw) {
  if (!title || !raw) return title
  const byFold = new Map()
  for (const tok of String(raw).split(/[\s,.!?;:]+/)) {
    const key = tok.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    if (key && !byFold.has(key)) byFold.set(key, tok)
  }
  const out = title.split(' ').map(w => byFold.get(w.toLowerCase()) ?? w).join(' ')
  return out.charAt(0).toUpperCase() + out.slice(1)
}
