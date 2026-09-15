// Speed timeline: seconds per exercise over course of session

export function calcSpeedTimeline(exercises) {
  if (!exercises || exercises.length === 0) return []

  return exercises.map((ex, i) => ({
    index: i + 1,
    seconds: parseFloat((ex.duration_ms / 1000).toFixed(2)),
    isCorrect: ex.is_correct,
  }))
}

export function calcRollingAvgSpeed(exercises, windowSize = 5) {
  if (!exercises || exercises.length === 0) return []

  return exercises.map((_, i) => {
    const start = Math.max(0, i - windowSize + 1)
    const window = exercises.slice(start, i + 1)
    const avgSec = window.reduce((sum, e) => sum + e.duration_ms, 0) / window.length / 1000
    return {
      index: i + 1,
      avgSeconds: parseFloat(avgSec.toFixed(2)),
    }
  })
}
