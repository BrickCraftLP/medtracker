// Natural-language day → 'YYYY-MM-DD' day key (EN + DE), relative to `today`.
// Input must already be normalised (see normalize.js).
//
// Returns { date, match } — `match` is the consumed substring so callers can
// strip it from a title — or null when no date is mentioned.

import { dayKey, addDays, parseDayKey } from '../../../utils/calendar/eventModel.js'

const WEEKDAYS = [
  ['sunday', 'sonntag', 'sun', 'so'],
  ['monday', 'montag', 'mon', 'mo'],
  ['tuesday', 'dienstag', 'tue', 'di'],
  ['wednesday', 'mittwoch', 'wed', 'mi'],
  ['thursday', 'donnerstag', 'thu', 'do'],
  ['friday', 'freitag', 'fri', 'fr'],
  ['saturday', 'samstag', 'sonnabend', 'sat', 'sa'],
]
// Only the long names are safe inside free text ("do", "so", "mi" are words).
const WEEKDAY_RE = new RegExp(
  `\\b(?:(next|naechsten?|kommenden?|this|diesen?)\\s+)?(?:on\\s+|am\\s+)?(${WEEKDAYS.map(w => w.slice(0, w.length - 2).join('|')).join('|')})\\b`,
)

const MONTHS = [
  ['january', 'januar', 'jan', 'jaenner'], ['february', 'februar', 'feb'], ['march', 'maerz', 'mar'],
  ['april', 'apr'], ['may', 'mai'], ['june', 'juni', 'jun'], ['july', 'juli', 'jul'],
  ['august', 'aug'], ['september', 'sept', 'sep'], ['october', 'oktober', 'oct', 'okt'],
  ['november', 'nov'], ['december', 'dezember', 'dec', 'dez'],
]
const monthIndex = word => MONTHS.findIndex(names => names.includes(word))
export const MONTH_WORDS = MONTHS.flat().join('|')
// Weekday names incl. "mo".."so" — only safe right next to "bis" / "-".
const WEEKDAY_NAMES = WEEKDAYS.flat().join('|')

// Spelled-out day numbers ("October first", "the first of October") — only
// digits ("1st", "3.") were understood before, so a wholly-worded date fell
// through to nothing being parsed at all.
const ORDINAL_ONES = ['first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth']
const ORDINAL_TEENS = ['tenth', 'eleventh', 'twelfth', 'thirteenth', 'fourteenth', 'fifteenth', 'sixteenth', 'seventeenth', 'eighteenth', 'nineteenth']
const ORDINAL_SIMPLE = Object.fromEntries([
  ...ORDINAL_ONES.map((w, i) => [w, i + 1]),
  ...ORDINAL_TEENS.map((w, i) => [w, i + 10]),
  ['twentieth', 20], ['thirtieth', 30],
])
function ordinalDay(word) {
  const w = word.replace(/-/g, ' ').trim()
  if (ORDINAL_SIMPLE[w] != null) return ORDINAL_SIMPLE[w]
  const m = w.match(/^(twenty|thirty)\s+(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)$/)
  return m ? (m[1] === 'twenty' ? 20 : 30) + ORDINAL_SIMPLE[m[2]] : null
}
const ORDINAL_WORD_RE = `(?:${[...ORDINAL_ONES, ...ORDINAL_TEENS, 'twentieth', 'thirtieth', '(?:twenty|thirty)[- ]?(?:first|second|third|fourth|fifth|sixth|seventh|eighth|ninth)'].join('|')})`
// A day: digits ("3rd", "3.") or a spelled-out ordinal ("third").
const DAY_WORD_RE = `(?:\\d{1,2}(?:st|nd|rd|th|\\.)?|${ORDINAL_WORD_RE})`
const dayNumber = s => (/^\d/.test(s) ? Number(s.match(/^\d{1,2}/)[0]) : ordinalDay(s))

// A bare day/month without a year means the next such day, never one in the past.
function nextOccurrence(month, day, todayKey) {
  const t = parseDayKey(todayKey)
  let d = new Date(t.getFullYear(), month, day)
  if (dayKey(d) < todayKey) d = new Date(t.getFullYear() + 1, month, day)
  return dayKey(d)
}

export function parseDate(text, todayKey = dayKey()) {
  let m

  if ((m = text.match(/\bovermorrow\b/))) return { date: addDays(todayKey, 2), match: m[0] }
  if ((m = text.match(/\btomorrow\b/)))   return { date: addDays(todayKey, 1), match: m[0] }
  if ((m = text.match(/\b(today|tonight|heute abend|this evening)\b/))) return { date: todayKey, match: m[0] }
  if ((m = text.match(/\b(yesterday|gestern)\b/))) return { date: addDays(todayKey, -1), match: m[0] }

  // in 3 days / in 2 weeks / in 3 tagen / in 2 wochen
  if ((m = text.match(/\bin (\d+|a|one|einem|einer) (days?|tagen?|weeks?|wochen?)\b/))) {
    const n = /^\d+$/.test(m[1]) ? Number(m[1]) : 1
    const mult = /^(week|woche)/.test(m[2]) ? 7 : 1
    return { date: addDays(todayKey, n * mult), match: m[0] }
  }

  // end of the week → Friday; end of the month → its last day
  if ((m = text.match(/\b(?:(?:bis )?(?:zum |am )?ende (?:der|dieser) woche|end of (?:the|this) week|wochenende? ende)\b/))) {
    const dow = parseDayKey(todayKey).getDay()
    return { date: addDays(todayKey, dow <= 5 ? 5 - dow : 6), match: m[0] }
  }
  if ((m = text.match(/\b(?:(?:bis )?(?:zum |am )?(?:monatsende|ende (?:des|dieses) monats)|end of (?:the|this) month)\b/))) {
    const t = parseDayKey(todayKey)
    return { date: dayKey(new Date(t.getFullYear(), t.getMonth() + 1, 0)), match: m[0] }
  }

  // week after next → Monday of that week
  if ((m = text.match(/\b(week after next|uebernaechste woche|uebernaechsten woche)\b/))) {
    const dow = parseDayKey(todayKey).getDay()
    return { date: addDays(todayKey, (((8 - dow) % 7) || 7) + 7), match: m[0] }
  }

  // next week / naechste woche → Monday of next week
  if ((m = text.match(/\b(next week|naechste woche|kommende woche)\b/))) {
    const dow = parseDayKey(todayKey).getDay()
    return { date: addDays(todayKey, ((8 - dow) % 7) || 7), match: m[0] }
  }

  // ISO 2026-10-03
  if ((m = text.match(/\b(\d{4})-(\d{2})-(\d{2})\b/))) return { date: m[0], match: m[0] }

  // 3.10. / 03.10.2026 / 3/10
  if ((m = text.match(/\b(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?\.?(?=\s|$)/))) {
    const day = Number(m[1]), month = Number(m[2]) - 1
    if (day >= 1 && day <= 31 && month >= 0 && month <= 11) {
      if (m[3]) {
        const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])
        return { date: dayKey(new Date(y, month, day)), match: m[0] }
      }
      return { date: nextOccurrence(month, day, todayKey), match: m[0] }
    }
  }

  // 3 october / 3. oktober / october 3 / on the 3rd of october / october first
  if ((m = text.match(new RegExp(`\\b(?:on |am )?(?:the )?(${DAY_WORD_RE})\\s*(?:of )?(${MONTH_WORDS})\\b`)))) {
    return { date: nextOccurrence(monthIndex(m[2]), dayNumber(m[1]), todayKey), match: m[0] }
  }
  if ((m = text.match(new RegExp(`\\b(${MONTH_WORDS})\\s+(${DAY_WORD_RE})\\b`)))) {
    return { date: nextOccurrence(monthIndex(m[1]), dayNumber(m[2]), todayKey), match: m[0] }
  }

  // weekday — "friday" is the next Friday (today if today is Friday),
  // "next friday" skips a week when today already is one.
  if ((m = text.match(WEEKDAY_RE))) {
    const target = WEEKDAYS.findIndex(names => names.includes(m[2]))
    const dow = parseDayKey(todayKey).getDay()
    let diff = (target - dow + 7) % 7
    if (m[1] && /^(next|naechst)/.test(m[1]) && diff === 0) diff = 7
    return { date: addDays(todayKey, diff), match: m[0] }
  }

  // "on the 20th" / "am 20."
  if ((m = text.match(/\b(?:on the|am) (\d{1,2})(?:st|nd|rd|th|\.)(?=\s|$)/))) {
    const t = parseDayKey(todayKey)
    return { date: nextOccurrence(t.getMonth(), Number(m[1]), todayKey), match: m[0] }
  }

  return null
}

// Spans: "this week", "next week", "(am) Wochenende", "in the next 3 days".
// Returns { from, to, match } or null.
export function parseDateRange(text, todayKey = dayKey()) {
  let m
  const dow = parseDayKey(todayKey).getDay()
  const NUM = { zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10 }
  const num = s => NUM[s] ?? Number(s)

  // Looking back — statistics questions ("wie viel habe ich letzte Woche gelernt").
  if ((m = text.match(/\b(?:in der |in )?(last week|letzte woche|letzten woche|vergangene woche|vergangenen woche|vorige woche|vorigen woche)\b/))) {
    const thisMon = addDays(todayKey, -((dow + 6) % 7))
    const from = addDays(thisMon, -7)
    return { from, to: addDays(from, 6), match: m[0], past: true }
  }
  if ((m = text.match(/\b(?:in den |die |the |in the )?(?:letzten|letzte|vergangenen|last|past) (\d+|zwei|drei|vier|fuenf|sechs|sieben|acht|neun|zehn|two|three|four|five|six|seven|eight|nine|ten) (tagen?|days|wochen?|weeks|monaten?|months)\b/))) {
    const unit = /^(woche|week)/.test(m[2]) ? 7 : /^(monat|month)/.test(m[2]) ? 30 : 1
    const n = Math.min(365, num(m[1]) * unit)
    return { from: addDays(todayKey, -(n - 1)), to: todayKey, match: m[0], past: true }
  }
  if ((m = text.match(/\b(?:im |in )?(last month|letzten monat|letzter monat|vergangenen monat|vorigen monat)\b/))) {
    const t = parseDayKey(todayKey)
    const from = dayKey(new Date(t.getFullYear(), t.getMonth() - 1, 1))
    return { from, to: dayKey(new Date(t.getFullYear(), t.getMonth(), 0)), match: m[0], past: true }
  }
  if ((m = text.match(/\b(?:in |im )?(this month|diesen monat|dieser monat|diesem monat)\b/))) {
    const t = parseDayKey(todayKey)
    return { from: dayKey(new Date(t.getFullYear(), t.getMonth(), 1)), to: dayKey(new Date(t.getFullYear(), t.getMonth() + 1, 0)), match: m[0] }
  }
  if ((m = text.match(new RegExp(`\\b(?:seit|since) (?:letztem |letzten |last )?(${WEEKDAYS.map(w => w.slice(0, w.length - 2).join('|')).join('|')})\\b`)))) {
    const target = WEEKDAYS.findIndex(names => names.includes(m[1]))
    const back = ((dow - target + 7) % 7) || 7
    return { from: addDays(todayKey, -back), to: todayKey, match: m[0], past: true }
  }

  // "vom 3. bis 5. Oktober", "3.-5.10.", "october 3 to 5"
  if ((m = text.match(new RegExp(`\\b(?:vom |von |from |between )?(\\d{1,2})\\.?\\s*(?:bis|-|–|to|until|and|und)\\s*(\\d{1,2})\\.?\\s*(${MONTH_WORDS})\\b`)))) {
    const month = monthIndex(m[3])
    const from = nextOccurrence(month, Number(m[1]), todayKey)
    const to = dayKey(new Date(parseDayKey(from).getFullYear(), month, Number(m[2])))
    if (to >= from) return { from, to, match: m[0] }
  }
  if ((m = text.match(/\b(?:vom |von |from )?(\d{1,2})\.(\d{1,2})?\.?\s*(?:bis|-|–|to|until)\s*(\d{1,2})\.(\d{1,2})\.?(?=\s|$)/))) {
    const endMonth = Number(m[4]) - 1
    const startMonth = m[2] ? Number(m[2]) - 1 : endMonth
    if (startMonth >= 0 && startMonth <= 11 && endMonth >= 0 && endMonth <= 11) {
      const from = nextOccurrence(startMonth, Number(m[1]), todayKey)
      let to = dayKey(new Date(parseDayKey(from).getFullYear(), endMonth, Number(m[3])))
      if (to < from) to = dayKey(new Date(parseDayKey(from).getFullYear() + 1, endMonth, Number(m[3])))
      return { from, to, match: m[0] }
    }
  }
  if ((m = text.match(new RegExp(`\\b(${MONTH_WORDS})\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s*(?:-|–|to|until|bis)\\s*(\\d{1,2})(?:st|nd|rd|th)?\\b`)))) {
    const month = monthIndex(m[1])
    const from = nextOccurrence(month, Number(m[2]), todayKey)
    const to = dayKey(new Date(parseDayKey(from).getFullYear(), month, Number(m[3])))
    if (to >= from) return { from, to, match: m[0] }
  }
  // "Montag bis Freitag", "mo-fr", "monday to wednesday" — from the next such day
  if ((m = text.match(new RegExp(`\\b(?:von |from )?(${WEEKDAY_NAMES})\\s*(?:bis|-|–|to|until|through)\\s*(${WEEKDAY_NAMES})\\b`)))) {
    const a = WEEKDAYS.findIndex(names => names.includes(m[1]))
    const b = WEEKDAYS.findIndex(names => names.includes(m[2]))
    if (a >= 0 && b >= 0) {
      const from = addDays(todayKey, (a - dow + 7) % 7)
      return { from, to: addDays(from, (b - a + 7) % 7), match: m[0] }
    }
  }
  if ((m = text.match(/\b(?:in der |in )?(week after next|uebernaechste woche|uebernaechsten woche)\b/))) {
    const from = addDays(todayKey, (((8 - dow) % 7) || 7) + 7)
    return { from, to: addDays(from, 6), match: m[0] }
  }
  if ((m = text.match(/\b(?:in )?(this week|diese woche|dieser woche|die woche)\b/))) {
    return { from: todayKey, to: addDays(todayKey, (7 - dow) % 7), match: m[0] }
  }
  if ((m = text.match(/\b(?:in der |in )?(next week|naechste woche|naechsten woche|kommende woche|kommenden woche)\b/))) {
    const from = addDays(todayKey, ((8 - dow) % 7) || 7)
    return { from, to: addDays(from, 6), match: m[0] }
  }
  if ((m = text.match(/\b(?:(?:am|this|dieses|on the|at the|over the|ueber das|uebers)\s+)?(weekend|wochenende)\b/))) {
    if (dow === 6) return { from: todayKey, to: addDays(todayKey, 1), match: m[0] }
    if (dow === 0) return { from: todayKey, to: todayKey, match: m[0] }
    const sat = addDays(todayKey, 6 - dow)
    return { from: sat, to: addDays(sat, 1), match: m[0] }
  }
  if ((m = text.match(/\b(?:in den |die |the )?(?:naechsten|next|kommenden) (\d+|zwei|drei|vier|fuenf|sechs|sieben|two|three|four|five|six|seven) (?:tagen?|days)\b/))) {
    const words = { zwei: 2, drei: 3, vier: 4, fuenf: 5, sechs: 6, sieben: 7, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }
    const n = Math.min(31, words[m[1]] ?? Number(m[1]))
    return { from: todayKey, to: addDays(todayKey, n - 1), match: m[0] }
  }
  return null
}
