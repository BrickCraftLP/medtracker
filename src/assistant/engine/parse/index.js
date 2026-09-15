// Pull every structured piece out of a sentence at once. Order matters: time
// ranges and clock times are removed before dates so "9.30" is never read as
// a day, and whatever is left over is usable as a title.

import { parseDate, parseDateRange } from './dates.js'
import { normalize } from '../normalize.js'
import { parseDuration } from './durations.js'
import { parseTime, parseTimeRange } from './times.js'
import { addDays } from '../../../utils/calendar/eventModel.js'

const EVENING = /\b(abends?|evening|tonight|nachmittags?|afternoon|nachts)\b/

export function extract(text, today) {
  let rest = ` ${text} `
  const take = m => { if (m?.match) rest = rest.replace(m.match, ' '); return m }

  const range = take(parseTimeRange(rest))
  const duration = take(parseDuration(rest))
  const time = range ? null : take(parseTime(rest))
  const dateRange = take(parseDateRange(rest, today))
  const date = take(parseDate(rest, today))

  let startMin = range?.start ?? time?.minutes ?? null
  let endMin = range?.end ?? null
  // "um 7 abends", "nachmittags von 3 bis 5" → afternoon/evening clock.
  if (EVENING.test(text) && !time?.fuzzy && startMin != null && startMin >= 60 && startMin < 12 * 60) {
    startMin += 12 * 60
    if (endMin != null && endMin < 12 * 60) endMin += 12 * 60
  }

  let day = date?.date ?? null
  // "nächste Woche Montag": the weekday belongs inside the named week.
  if (dateRange && day && day < dateRange.from) day = addDays(day, 7)

  return {
    date: day,
    range: dateRange && !day ? { from: dateRange.from, to: dateRange.to, past: !!dateRange.past } : null,
    startMin,
    endMin,
    minutes: duration?.minutes ?? (startMin != null && endMin != null ? endMin - startMin : null),
    fuzzyTime: !!time?.fuzzy,
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
