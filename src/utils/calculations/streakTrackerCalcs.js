import { format, subDays, isSameDay, parseISO } from 'date-fns'

// mode: 'any' | 'all' (both = unfiltered, any active day counts) | a topic id
// (filters sessions down to that topic before computing the day-run).
export function calcCurrentStreak(sessions, mode = 'any') {
  if (!sessions || sessions.length === 0) return 0

  const filtered = (mode === 'any' || mode === 'all')
    ? sessions
    : sessions.filter(s => s.topic_id === mode)

  if (filtered.length === 0) return 0

  const sessionDays = new Set(
    filtered.map(s => format(new Date(s.started_at), 'yyyy-MM-dd'))
  )

  const today = format(new Date(), 'yyyy-MM-dd')
  const yesterday = format(subDays(new Date(), 1), 'yyyy-MM-dd')

  // If neither today nor yesterday has a session the streak is broken
  if (!sessionDays.has(today) && !sessionDays.has(yesterday)) return 0

  // Start counting from today if studied, otherwise from yesterday
  let day = sessionDays.has(today) ? new Date() : subDays(new Date(), 1)
  let streak = 0

  while (true) {
    const key = format(day, 'yyyy-MM-dd')
    if (sessionDays.has(key)) {
      streak++
      day = subDays(day, 1)
    } else {
      break
    }
  }

  return streak
}

export function calcDayCompletion(sessions, topics, mode = 'any') {
  // mode: 'any' | 'specific' (topicId) | 'all'
  const days = new Map()

  for (const s of sessions) {
    const key = format(new Date(s.started_at), 'yyyy-MM-dd')
    if (!days.has(key)) days.set(key, new Set())
    days.get(key).add(s.topic_id)
  }

  const result = {}

  for (const [date, topicIds] of days) {
    if (mode === 'any') {
      result[date] = true
    } else if (mode === 'all') {
      result[date] = topics.every(t => topicIds.has(t.id))
    } else {
      result[date] = topicIds.has(mode)
    }
  }

  return result
}

export function calcHeatmapDotData(sessions, topics, mode, days = 84) {
  const completionMap = calcDayCompletion(sessions, topics, mode)
  const end = new Date()

  return Array.from({ length: days }, (_, i) => {
    const day = subDays(end, days - 1 - i)
    const key = format(day, 'yyyy-MM-dd')
    return {
      date: key,
      filled: !!completionMap[key],
    }
  })
}
