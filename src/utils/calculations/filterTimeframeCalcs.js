import { subDays, subWeeks, startOfDay, endOfDay } from 'date-fns'

export function getDateRange(preset) {
  const now = new Date()
  switch (preset) {
    case '7d': return { from: subDays(now, 7).toISOString(), to: now.toISOString() }
    case '14d': return { from: subDays(now, 14).toISOString(), to: now.toISOString() }
    case '30d': return { from: subDays(now, 30).toISOString(), to: now.toISOString() }
    case '90d': return { from: subDays(now, 90).toISOString(), to: now.toISOString() }
    case '4w': return { from: subWeeks(now, 4).toISOString(), to: now.toISOString() }
    case '12w': return { from: subWeeks(now, 12).toISOString(), to: now.toISOString() }
    default: return { from: subDays(now, 30).toISOString(), to: now.toISOString() }
  }
}

export function filterSessionsByRange(sessions, from, to) {
  const f = new Date(from).getTime()
  const t = new Date(to).getTime()
  return sessions.filter(s => {
    const ts = new Date(s.started_at).getTime()
    return ts >= f && ts <= t
  })
}

export function groupSessionsByDay(sessions) {
  const map = {}
  for (const s of sessions) {
    const key = s.started_at.slice(0, 10)
    if (!map[key]) map[key] = []
    map[key].push(s)
  }
  return map
}

export function calcDailyExerciseCounts(sessions, from, to) {
  const days = []
  const start = new Date(from)
  const end = new Date(to)
  const cur = new Date(start)

  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }

  const grouped = groupSessionsByDay(sessions)

  return days.map(date => ({
    date,
    exercises: grouped[date]?.reduce((sum, s) => sum + (s.total_exercises ?? 0), 0) ?? 0,
    correct: grouped[date]?.reduce((sum, s) => sum + (s.correct ?? 0), 0) ?? 0,
  }))
}

export const TIMEFRAME_OPTIONS = [
  { label: '7 Tage', value: '7d' },
  { label: '14 Tage', value: '14d' },
  { label: '30 Tage', value: '30d' },
  { label: '4 Wochen', value: '4w' },
  { label: '12 Wochen', value: '12w' },
  { label: '90 Tage', value: '90d' },
]
