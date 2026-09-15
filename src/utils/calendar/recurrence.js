// RRULE subset + range expansion.
//
// Recurring classes are the backbone of a timetable, but a full RFC 5545
// implementation (rrule.js is ~50 KB) is far more than a semester schedule
// needs. Supported: FREQ=DAILY|WEEKLY|MONTHLY, INTERVAL, BYDAY, BYMONTHDAY,
// COUNT, UNTIL. Anything else in the string is ignored rather than throwing —
// an imported .ics must never blank the calendar.
//
// Expansion is always bounded by the visible range, so a weekly class with no
// UNTIL costs nothing beyond the days actually on screen.

import { addDays, dayKey, parseDayKey, daysBetween, minutesOf, durationOf, MINUTES_PER_DAY } from './eventModel.js'

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']

export function parseRrule(rrule) {
  if (!rrule) return null
  const parts = {}
  for (const chunk of String(rrule).split(';')) {
    const [rawKey, rawValue] = chunk.split('=')
    if (!rawKey || rawValue == null) continue
    parts[rawKey.trim().toUpperCase()] = rawValue.trim()
  }
  const freq = (parts.FREQ ?? '').toUpperCase()
  if (!['DAILY', 'WEEKLY', 'MONTHLY'].includes(freq)) return null

  return {
    freq,
    interval: Math.max(1, Number(parts.INTERVAL) || 1),
    byDay: parts.BYDAY
      ? parts.BYDAY.split(',').map(d => DAY_CODES.indexOf(d.trim().toUpperCase())).filter(i => i >= 0)
      : null,
    byMonthDay: parts.BYMONTHDAY ? Number(parts.BYMONTHDAY) : null,
    count: parts.COUNT ? Number(parts.COUNT) : null,
    // UNTIL may arrive as '20270131' (iCal) or '2027-01-31' (ours).
    until: parts.UNTIL
      ? (parts.UNTIL.includes('-')
        ? parts.UNTIL.slice(0, 10)
        : `${parts.UNTIL.slice(0, 4)}-${parts.UNTIL.slice(4, 6)}-${parts.UNTIL.slice(6, 8)}`)
      : null,
  }
}

export function buildRrule({ freq, interval = 1, byDay = null, until = null, count = null }) {
  if (!freq) return null
  const parts = [`FREQ=${freq}`]
  if (interval > 1) parts.push(`INTERVAL=${interval}`)
  if (byDay?.length) parts.push(`BYDAY=${byDay.map(i => DAY_CODES[i]).join(',')}`)
  if (count) parts.push(`COUNT=${count}`)
  if (until) parts.push(`UNTIL=${until}`)
  return parts.join(';')
}

// Every start-day of `event` that falls inside [from, to]. The series anchor is
// the event's own start_date, so INTERVAL counts from there — that is what
// makes an "every 2 weeks" class land on the right parity week.
function occurrenceDates(event, rule, from, to) {
  const anchor = event.start_date
  const hardEnd = [to, rule.until, event.rrule_until].filter(Boolean).sort()[0]
  if (anchor > hardEnd) return []

  const dates = []
  let emitted = 0

  const push = key => {
    if (key >= from && key <= hardEnd) dates.push(key)
    emitted += 1
  }

  if (rule.freq === 'DAILY') {
    // Jump straight to the first occurrence inside the window instead of
    // walking day by day from the anchor — a two-year-old daily series would
    // otherwise cost 700 iterations to draw one week.
    const skipped = Math.max(0, Math.floor(daysBetween(anchor, from) / rule.interval))
    let cursor = addDays(anchor, skipped * rule.interval)
    emitted = skipped
    while (cursor <= hardEnd && (!rule.count || emitted < rule.count)) {
      push(cursor)
      cursor = addDays(cursor, rule.interval)
    }
    return dates
  }

  if (rule.freq === 'WEEKLY') {
    const anchorDate = parseDayKey(anchor)
    const days = rule.byDay?.length ? rule.byDay : [anchorDate.getDay()]
    // Week 0 is the anchor's week, starting on the anchor's own weekday-0.
    const weekStart = addDays(anchor, -anchorDate.getDay())
    const weeksToFrom = Math.max(0, Math.floor(daysBetween(weekStart, from) / (7 * rule.interval)))
    let week = weeksToFrom
    // COUNT counts occurrences, not weeks, so when it is set we must start
    // from the beginning to know how many have already been emitted.
    if (rule.count) week = 0
    for (;;) {
      const base = addDays(weekStart, week * 7 * rule.interval)
      if (base > hardEnd) break
      for (const dow of [...days].sort((a, b) => a - b)) {
        const key = addDays(base, dow)
        if (key < anchor) continue
        if (rule.count && emitted >= rule.count) return dates
        push(key)
      }
      week += 1
    }
    return dates
  }

  // MONTHLY: same day-of-month as the anchor unless BYMONTHDAY says otherwise.
  const wanted = rule.byMonthDay ?? parseDayKey(anchor).getDate()
  const start = parseDayKey(anchor)
  for (let i = 0; ; i += 1) {
    const d = new Date(start.getFullYear(), start.getMonth() + i * rule.interval, 1)
    // Skip months that are too short for the wanted day (31st of February).
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate()
    if (wanted <= lastDay) {
      const key = dayKey(new Date(d.getFullYear(), d.getMonth(), wanted))
      if (key > hardEnd) break
      if (rule.count && emitted >= rule.count) break
      if (key >= anchor) push(key)
    } else if (dayKey(d) > hardEnd) break
    if (i > 600) break // safety net: 50 years of monthly
  }
  return dates
}

// One rendered instance of an event on one day.
function makeOccurrence(event, date, { segmentOf = null } = {}) {
  const allDay = event.all_day || !event.start_time
  const startMin = allDay ? 0 : minutesOf(event.start_time)
  const endMin = allDay
    ? MINUTES_PER_DAY
    : Math.min(MINUTES_PER_DAY, startMin + durationOf(event))

  return {
    key: `${event.id}:${date}${segmentOf ? `:${segmentOf}` : ''}`,
    event,
    date,
    allDay,
    startMin: segmentOf ? segmentOf.startMin : startMin,
    endMin: segmentOf ? segmentOf.endMin : endMin,
    // Multi-day events render one block per day; only the first carries the
    // resize handle for the start edge.
    continuesBefore: !!segmentOf?.continuesBefore,
    continuesAfter: !!segmentOf?.continuesAfter,
    isRecurring: !!event.rrule,
  }
}

// A timed event that crosses midnight, or an all-day event spanning several
// days, becomes one occurrence per covered day.
function spanOccurrences(event, firstDate, from, to) {
  // The span is measured on the master row and re-applied to this occurrence's
  // own start day, so a recurring multi-day event keeps its length.
  const spanDays = event.end_date && event.end_date > event.start_date
    ? daysBetween(event.start_date, event.end_date)
    : 0
  const lastDate = spanDays > 0 ? addDays(firstDate, spanDays) : firstDate

  if (lastDate === firstDate) {
    const single = makeOccurrence(event, firstDate)
    return single.date >= from && single.date <= to ? [single] : []
  }

  const out = []
  for (let cursor = firstDate; cursor <= lastDate; cursor = addDays(cursor, 1)) {
    if (cursor < from || cursor > to) continue
    const isFirst = cursor === firstDate
    const isLast = cursor === lastDate
    out.push(makeOccurrence(event, cursor, {
      segmentOf: {
        startMin: isFirst && !event.all_day ? minutesOf(event.start_time) ?? 0 : 0,
        endMin: isLast && !event.all_day ? minutesOf(event.end_time) ?? MINUTES_PER_DAY : MINUTES_PER_DAY,
        continuesBefore: !isFirst,
        continuesAfter: !isLast,
      },
    }))
  }
  return out
}

// Every occurrence of every event between two day keys, inclusive.
//
// Detached overrides (a single moved or edited instance) are matched by
// `recurrence_parent_id` + `recurrence_date` and replace the generated slot;
// `exdates` delete one outright.
export function expandRange(events, from, to) {
  const overrides = new Map()
  for (const e of events) {
    if (e.recurrence_parent_id && e.recurrence_date) {
      overrides.set(`${e.recurrence_parent_id}:${e.recurrence_date}`, e)
    }
  }

  const out = []
  for (const event of events) {
    if (event.recurrence_parent_id) continue // rendered in place of its slot below
    if (!event.rrule) {
      out.push(...spanOccurrences(event, event.start_date, from, to))
      continue
    }

    const rule = parseRrule(event.rrule)
    if (!rule) { out.push(...spanOccurrences(event, event.start_date, from, to)); continue }

    const exdates = new Set(event.exdates ?? [])
    for (const date of occurrenceDates(event, rule, from, to)) {
      if (exdates.has(date)) continue
      const override = overrides.get(`${event.id}:${date}`)
      if (override) {
        out.push(...spanOccurrences(override, override.start_date, from, to))
        continue
      }
      out.push(...spanOccurrences(event, date, from, to))
    }
  }
  return out
}

// Occurrences bucketed by day key, timed ones sorted by start.
export function bucketByDay(occurrences) {
  const map = new Map()
  for (const occ of occurrences) {
    let bucket = map.get(occ.date)
    if (!bucket) { bucket = { allDay: [], timed: [] }; map.set(occ.date, bucket) }
    ;(occ.allDay ? bucket.allDay : bucket.timed).push(occ)
  }
  for (const bucket of map.values()) {
    bucket.timed.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin)
  }
  return map
}
