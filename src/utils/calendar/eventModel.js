// The calendar_events row, and everything that reads or writes one.
//
// Times are floating local wall time: `start_date` is a 'YYYY-MM-DD' day key
// and `start_time` a 'HH:MM:SS' clock time, exactly as Postgres returns them.
// Nothing here ever builds a Date from a date+time pair — that is what would
// reintroduce the UTC-boundary shift localDayKey exists to prevent. Minutes
// since midnight are the working unit; day keys are compared as strings.

export const KINDS = ['class', 'study', 'assignment', 'exam', 'deadline', 'event', 'other']

// Per-kind presentation. `ring` marks the kinds whose outline doubles as a
// progress bar once tasks are attached (see ProgressOutline).
export const KIND_META = {
  class:      { icon: '🏫', ring: false, labelKey: 'calendar.kind.class' },
  study:      { icon: '📚', ring: false, labelKey: 'calendar.kind.study' },
  assignment: { icon: '📝', ring: true,  labelKey: 'calendar.kind.assignment' },
  exam:       { icon: '🎓', ring: true,  labelKey: 'calendar.kind.exam' },
  deadline:   { icon: '⏳', ring: true,  labelKey: 'calendar.kind.deadline' },
  event:      { icon: '📅', ring: false, labelKey: 'calendar.kind.event' },
  other:      { icon: '•',  ring: false, labelKey: 'calendar.kind.other' },
}

export const metaFor = kind => KIND_META[kind] ?? KIND_META.event

export const DEFAULT_EVENT_MINUTES = 60
export const MINUTES_PER_DAY = 1440

// ── Day keys ───────────────────────────────────────────────────────────────

const pad = n => String(n).padStart(2, '0')

// Local day key. Never toISOString() — that shifts the day for anyone
// east/west of UTC. Same rule as localDayKey in todoPriorityCalcs.js.
export function dayKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function parseDayKey(key) {
  const [y, m, d] = String(key).split('-').map(Number)
  return new Date(y, (m ?? 1) - 1, d ?? 1)
}

export function addDays(key, n) {
  const d = parseDayKey(key)
  d.setDate(d.getDate() + n)
  return dayKey(d)
}

// Whole days between two keys (b - a). Computed at noon so a DST change
// inside the interval can't round the division down to 22 hours.
export function daysBetween(a, b) {
  const da = parseDayKey(a); da.setHours(12, 0, 0, 0)
  const db = parseDayKey(b); db.setHours(12, 0, 0, 0)
  return Math.round((db - da) / 86400000)
}

// ── Clock times ────────────────────────────────────────────────────────────

// 'HH:MM:SS' | 'HH:MM' | null → minutes since midnight, or null.
export function minutesOf(time) {
  if (!time) return null
  const h = Number(String(time).slice(0, 2))
  const m = Number(String(time).slice(3, 5))
  return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null
}

// minutes → 'HH:MM:SS' for Postgres. Clamped inside the day.
export function timeOf(minutes) {
  const m = Math.max(0, Math.min(MINUTES_PER_DAY - 1, Math.round(minutes)))
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}:00`
}

// 'HH:MM:SS' → 'HH:MM' for display and <input type="time">.
export const hhmm = time => (time ? String(time).slice(0, 5) : '')

export function formatRange(event) {
  if (event.all_day || !event.start_time) return null
  const start = hhmm(event.start_time)
  return event.end_time ? `${start} – ${hhmm(event.end_time)}` : start
}

// ── Row construction ───────────────────────────────────────────────────────

// Duration in minutes, from the row's own end or its planned_minutes.
export function durationOf(event) {
  const start = minutesOf(event.start_time)
  if (start == null) return MINUTES_PER_DAY
  const end = minutesOf(event.end_time)
  if (end != null && event.end_date && event.end_date !== event.start_date) {
    return MINUTES_PER_DAY - start + daysBetween(event.start_date, event.end_date) * MINUTES_PER_DAY + end
  }
  if (end != null) return Math.max(5, end - start)
  return event.planned_minutes ?? DEFAULT_EVENT_MINUTES
}

// Build a complete row from a partial one. Mirrors buildTodo's contract:
// callers hand over what the user edited, this fills in what the table needs.
export function buildEvent(base = {}, patch = {}) {
  const merged = { ...base, ...patch }
  const allDay = !!merged.all_day
  const startDate = merged.start_date ?? dayKey()
  const startMin = allDay ? null : minutesOf(merged.start_time)

  let endDate = merged.end_date ?? startDate
  let endTime = allDay ? null : merged.end_time ?? null

  if (!allDay && startMin != null && !endTime) {
    const minutes = merged.planned_minutes ?? DEFAULT_EVENT_MINUTES
    // An event that would run past midnight stops at 23:59 rather than
    // wrapping into a negative-length block on the next day's grid.
    endTime = timeOf(Math.min(MINUTES_PER_DAY - 1, startMin + minutes))
    endDate = startDate
  }

  return {
    ...merged,
    kind: merged.kind ?? 'event',
    title: (merged.title ?? '').trim(),
    all_day: allDay,
    start_date: startDate,
    start_time: allDay ? null : merged.start_time ?? null,
    end_date: endDate,
    end_time: endTime,
    notes: merged.notes?.trim() || null,
    location: merged.location?.trim() || null,
    links: Array.isArray(merged.links) ? merged.links : [],
    reminders: Array.isArray(merged.reminders) ? merged.reminders : [],
    exdates: Array.isArray(merged.exdates) ? merged.exdates : [],
    completed: !!merged.completed,
  }
}

// A draft produced by dragging across empty grid: no title yet, the sheet asks.
export function draftFromDrag({ date, startMin, endMin, calendarId, kind = 'event' }) {
  return buildEvent({}, {
    calendar_id: calendarId,
    kind,
    title: '',
    start_date: date,
    start_time: timeOf(startMin),
    end_date: date,
    end_time: timeOf(Math.max(endMin, startMin + 5)),
    all_day: false,
  })
}

// ── Colours ────────────────────────────────────────────────────────────────

export function colorOf(event, calendarById) {
  return event.color ?? calendarById?.get(event.calendar_id)?.color ?? 'var(--accent)'
}

// Hex → rgba, for the translucent block fill. Falls back to the CSS variable
// unchanged when the colour isn't a hex literal (a theme token, say).
export function withAlpha(color, alpha) {
  if (typeof color !== 'string' || !color.startsWith('#')) return color
  const hex = color.length === 4
    ? color.slice(1).split('').map(c => c + c).join('')
    : color.slice(1)
  const n = parseInt(hex, 16)
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`
}

// ── Conflicts ──────────────────────────────────────────────────────────────

// Timed occurrences on the same day that overlap. Only reported between
// fixed commitments (classes and exams) — study blocks are meant to be moved
// around and flagging them would cry wolf.
const FIXED = new Set(['class', 'exam'])

export function findConflicts(occurrences) {
  const fixed = occurrences.filter(o => !o.allDay && FIXED.has(o.event.kind))
  const clashing = new Set()
  for (let i = 0; i < fixed.length; i++) {
    for (let j = i + 1; j < fixed.length; j++) {
      const a = fixed[i], b = fixed[j]
      if (a.date === b.date && a.startMin < b.endMin && b.startMin < a.endMin) {
        clashing.add(a.key); clashing.add(b.key)
      }
    }
  }
  return clashing
}
