// Running accuracy (correct %) over course of a session

export function calcAccuracyTimeline(exercises) {
  if (!exercises || exercises.length === 0) return []

  let correctSoFar = 0
  return exercises.map((ex, i) => {
    if (ex.is_correct) correctSoFar++
    return {
      index: i + 1,
      accuracy: Math.round((correctSoFar / (i + 1)) * 100),
      isCorrect: ex.is_correct,
    }
  })
}

export function calcTopicAccuracy(sessions) {
  const map = {}
  for (const s of sessions) {
    const key = s.topic_id
    if (!map[key]) map[key] = { correct: 0, total: 0, topic: s.topics }
    map[key].correct += s.correct ?? 0
    map[key].total += s.total_exercises ?? 0
  }
  return Object.entries(map).map(([topicId, v]) => ({
    topicId,
    topic: v.topic,
    accuracy: v.total > 0 ? Math.round((v.correct / v.total) * 100) : 0,
    total: v.total,
  }))
}

export function calcDailyWeightedAccuracy(sessions, topics, from, to) {
  const map = {}
  for (const s of sessions) {
    const date = (s.started_at ?? s.created_at ?? '').slice(0, 10)
    if (!map[date]) map[date] = {}
    const tid = s.topic_id
    if (!map[date][tid]) map[date][tid] = { correct: 0, total: 0 }
    map[date][tid].correct += s.correct ?? 0
    map[date][tid].total += s.total_exercises ?? 0
  }

  const result = []
  const cursor = new Date(from)
  const end = new Date(to)
  while (cursor <= end) {
    const dateStr = cursor.toISOString().slice(0, 10)
    const dayData = map[dateStr]
    let value = 0
    let inactive = true
    if (dayData) {
      let weightedSum = 0
      let totalWeight = 0
      for (const [topicId, counts] of Object.entries(dayData)) {
        if (counts.total === 0) continue
        const topic = topics.find(t => t.id === topicId)
        const weight = Number(topic?.weight ?? 50)
        weightedSum += (counts.correct / counts.total) * 100 * weight
        totalWeight += weight
      }
      if (totalWeight > 0) {
        value = Math.round(weightedSum / totalWeight)
        inactive = false
      }
    }
    result.push({ date: dateStr.slice(5), value, inactive })
    cursor.setDate(cursor.getDate() + 1)
  }
  return result
}

// ── Running (cumulative) averages ────────────────────────────────────────────
// These produce a per-day series where each point pools every session from the
// start of the range up to and including that day. Because they accumulate, the
// final point equals the pooled headline value (calcOverallAccuracy /
// calcWeightedAccuracy over the whole range) — so the chart line always lands on
// the headline number instead of bouncing around per-day spikes.
//
// `value` is a raw (unrounded) percentage, or null on days before any data
// exists (Recharts renders those as a gap). `inactive` marks days with no
// exercises so the chart can still flag them.

function eachDay(from, to) {
  const days = []
  const cur = new Date(from)
  const end = new Date(to)
  while (cur <= end) {
    days.push(cur.toISOString().slice(0, 10))
    cur.setDate(cur.getDate() + 1)
  }
  return days
}

export function calcRunningOverallAccuracy(sessions, from, to) {
  const byDate = {}
  for (const s of sessions) {
    const d = (s.started_at ?? s.created_at ?? '').slice(0, 10)
    if (!byDate[d]) byDate[d] = { correct: 0, total: 0 }
    byDate[d].correct += s.correct ?? 0
    byDate[d].total += s.total_exercises ?? 0
  }

  let cumCorrect = 0
  let cumTotal = 0
  return eachDay(from, to).map(dateStr => {
    const day = byDate[dateStr]
    const inactive = !day || day.total === 0
    if (day) {
      cumCorrect += day.correct
      cumTotal += day.total
    }
    return {
      date: dateStr.slice(5),
      value: cumTotal > 0 ? (cumCorrect / cumTotal) * 100 : null,
      inactive,
    }
  })
}

export function calcRunningWeightedAccuracy(sessions, topics, from, to) {
  const byDateTopic = {}
  for (const s of sessions) {
    const d = (s.started_at ?? s.created_at ?? '').slice(0, 10)
    if (!byDateTopic[d]) byDateTopic[d] = {}
    const tid = s.topic_id
    if (!byDateTopic[d][tid]) byDateTopic[d][tid] = { correct: 0, total: 0 }
    byDateTopic[d][tid].correct += s.correct ?? 0
    byDateTopic[d][tid].total += s.total_exercises ?? 0
  }

  const cumByTopic = {}
  return eachDay(from, to).map(dateStr => {
    const dayTopics = byDateTopic[dateStr]
    let inactive = true
    if (dayTopics) {
      for (const [tid, c] of Object.entries(dayTopics)) {
        if (!cumByTopic[tid]) cumByTopic[tid] = { correct: 0, total: 0 }
        cumByTopic[tid].correct += c.correct
        cumByTopic[tid].total += c.total
        if (c.total > 0) inactive = false
      }
    }

    let weightedSum = 0
    let totalWeight = 0
    for (const [tid, c] of Object.entries(cumByTopic)) {
      if (c.total === 0) continue
      const weight = Number(topics.find(t => t.id === tid)?.weight ?? 50)
      weightedSum += (c.correct / c.total) * 100 * weight
      totalWeight += weight
    }

    return {
      date: dateStr.slice(5),
      value: totalWeight > 0 ? weightedSum / totalWeight : null,
      inactive,
    }
  })
}

// Canonical overall accuracy (pooled correct/total) as a raw percentage.
// Returns null when there are no exercises, so callers can show "no data".
export function calcOverallAccuracy(sessions) {
  const total   = sessions.reduce((s, x) => s + (x.total_exercises ?? 0), 0)
  const correct = sessions.reduce((s, x) => s + (x.correct ?? 0), 0)
  return total > 0 ? (correct / total) * 100 : null
}

// Canonical weighted accuracy: per-topic pooled accuracy weighted by topic
// weight. Returns a raw (unrounded) percentage, or null when there's no data.
// Both StatisticsScreen and the widgets call this so they always agree.
export function calcWeightedAccuracy(sessions, topics) {
  const byTopicTotals = {}
  for (const s of sessions) {
    const key = s.topic_id
    if (!byTopicTotals[key]) byTopicTotals[key] = { correct: 0, total: 0 }
    byTopicTotals[key].correct += s.correct ?? 0
    byTopicTotals[key].total += s.total_exercises ?? 0
  }

  let weightedSum = 0
  let totalWeight = 0
  for (const [topicId, v] of Object.entries(byTopicTotals)) {
    if (v.total === 0) continue
    const topic = topics.find(t => t.id === topicId)
    const weight = Number(topic?.weight ?? 50)
    weightedSum += (v.correct / v.total) * 100 * weight
    totalWeight += weight
  }

  return totalWeight > 0 ? weightedSum / totalWeight : null
}

// Single source of truth for rendering a percentage: two decimals + "%".
export function fmtPct(value) {
  if (value == null || Number.isNaN(value)) return '–'
  return `${Number(value).toFixed(2)}%`
}
