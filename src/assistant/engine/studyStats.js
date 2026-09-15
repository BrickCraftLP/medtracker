// Study history maths for the assistant: totals, accuracy trends and which
// topics the user tends to study back to back. Pure functions over session
// rows ({ topic_id, started_at, ended_at, duration_seconds, total_exercises, correct }).
// Only the last 90 days are loaded (SESSION_WINDOW_DAYS in DataContext).

import { dayKey, addDays } from '../../utils/calendar/eventModel.js'

export const DATA_WINDOW_DAYS = 90

// Local day of a session. Never started_at.slice(0, 10) — that is the UTC day.
export const sessionDay = s => {
  const d = new Date(s.started_at ?? s.created_at ?? NaN)
  return Number.isNaN(d.getTime()) ? null : dayKey(d)
}

const startMs = s => new Date(s.started_at ?? s.created_at ?? 0).getTime()

export function sessionMinutes(s) {
  if (s.duration_seconds != null) return Math.max(0, s.duration_seconds / 60)
  if (s.started_at && s.ended_at) return Math.max(0, (new Date(s.ended_at) - new Date(s.started_at)) / 60000)
  return 0
}

const endMs = s => (s.ended_at ? new Date(s.ended_at).getTime() : startMs(s) + sessionMinutes(s) * 60000)

export function inRange(sessions, { from = null, to = null, topicId = null } = {}) {
  return sessions.filter(s => {
    if (topicId && s.topic_id !== topicId) return false
    const d = sessionDay(s)
    if (!d) return false
    return (!from || d >= from) && (!to || d <= to)
  })
}

const partOfDay = h => (h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening')

export function summarize(sessions, filter = {}) {
  const list = inRange(sessions, filter)
  const days = [...new Set(list.map(sessionDay))].sort()
  const exercises = list.reduce((n, s) => n + (s.total_exercises ?? 0), 0)
  const correct = list.reduce((n, s) => n + (s.correct ?? 0), 0)
  const hours = list.map(s => new Date(startMs(s)).getHours()).sort((a, b) => a - b)
  const medianHour = hours.length ? hours[Math.floor(hours.length / 2)] : null
  return {
    sessions: list.length,
    minutes: Math.round(list.reduce((n, s) => n + sessionMinutes(s), 0)),
    exercises,
    accuracy: exercises > 0 ? (correct / exercises) * 100 : null,
    days,
    activeDays: days.length,
    lastDay: days[days.length - 1] ?? null,
    medianHour,
    partOfDay: medianHour == null ? null : partOfDay(medianHour),
  }
}

function pooled(list) {
  const total = list.reduce((n, s) => n + (s.total_exercises ?? 0), 0)
  const correct = list.reduce((n, s) => n + (s.correct ?? 0), 0)
  return { total, acc: total > 0 ? (correct / total) * 100 : null }
}

const MIN_EXERCISES = 10
const FLAT = 3

// Last 14 days vs the 14 before. With too little recent data, the older and
// newer half of the topic's sessions instead. null when there isn't enough.
export function accuracyTrend(sessions, topicId, today) {
  const own = sessions.filter(s => s.topic_id === topicId && (s.total_exercises ?? 0) > 0)
  const recentFrom = addDays(today, -13)
  const prevFrom = addDays(today, -27)
  let a = pooled(inRange(own, { from: prevFrom, to: addDays(recentFrom, -1) }))
  let b = pooled(inRange(own, { from: recentFrom, to: today }))
  let basis = '14d'
  if (a.total < MIN_EXERCISES || b.total < MIN_EXERCISES) {
    const sorted = [...own].sort((x, y) => startMs(x) - startMs(y))
    if (sorted.length < 2) return null
    const mid = Math.floor(sorted.length / 2)
    a = pooled(sorted.slice(0, mid))
    b = pooled(sorted.slice(mid))
    basis = 'halves'
    if (a.total < MIN_EXERCISES || b.total < MIN_EXERCISES) return null
  }
  const delta = b.acc - a.acc
  return { before: a.acc, now: b.acc, delta, dir: delta >= FLAT ? 'up' : delta <= -FLAT ? 'down' : 'flat', basis }
}

// Topic pairs studied back to back: B started at most `gapMin` minutes after
// A ended. Map<topicA, [{ topicId: B, count, share }]>, share = count / all
// follow-ups of A.
export function followPairs(sessions, gapMin = 30) {
  const sorted = sessions.filter(s => s.topic_id && s.started_at).sort((a, b) => startMs(a) - startMs(b))
  const counts = new Map()
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]
    const next = sorted[i]
    if (prev.topic_id === next.topic_id) continue
    const gap = (startMs(next) - endMs(prev)) / 60000
    if (gap < -5 || gap > gapMin) continue
    const m = counts.get(prev.topic_id) ?? new Map()
    m.set(next.topic_id, (m.get(next.topic_id) ?? 0) + 1)
    counts.set(prev.topic_id, m)
  }
  const out = new Map()
  for (const [a, m] of counts) {
    const sum = [...m.values()].reduce((n, c) => n + c, 0)
    out.set(a, [...m].map(([topicId, count]) => ({ topicId, count, share: count / sum })).sort((x, y) => y.count - x.count))
  }
  return out
}

// Most frequent followers of a topic worth mentioning.
export function habitualFollowers(pairs, topicId, { minCount = 2, minShare = 0.4 } = {}) {
  return (pairs.get(topicId) ?? []).filter(p => p.count >= minCount && p.share >= minShare)
}

// Topics that usually come right before `topicId`.
export function habitualPredecessors(pairs, topicId, { minCount = 2, minShare = 0.4 } = {}) {
  const out = []
  for (const [a, list] of pairs) {
    const hit = list.find(p => p.topicId === topicId)
    if (hit && hit.count >= minCount && hit.share >= minShare) out.push({ topicId: a, count: hit.count, share: hit.share })
  }
  return out.sort((x, y) => y.count - x.count)
}

export const fmtPctShort = v => (v == null ? '–' : `${Math.round(v)} %`)
export const fmtDelta = d => (d == null ? '' : `${d > 0 ? '+' : d < 0 ? '−' : '±'}${Math.abs(Math.round(d))} %`)
