// Session-level metric calculations from an exercises array

export function calcSessionMetrics(exercises) {
  if (!exercises || exercises.length === 0) {
    return { total: 0, correct: 0, wrong: 0, accuracy: 0, avgMs: 0, minMs: 0, maxMs: 0 }
  }

  const total = exercises.length
  const correct = exercises.filter(e => e.is_correct).length
  const wrong = total - correct
  const accuracy = total > 0 ? Math.round((correct / total) * 100) : 0

  const durations = exercises.map(e => e.duration_ms).filter(d => d > 0)
  const avgMs = durations.length > 0
    ? Math.round(durations.reduce((a, b) => a + b, 0) / durations.length)
    : 0
  const minMs = durations.length > 0 ? Math.min(...durations) : 0
  const maxMs = durations.length > 0 ? Math.max(...durations) : 0

  return { total, correct, wrong, accuracy, avgMs, minMs, maxMs }
}

export function formatMs(ms) {
  if (ms < 1000) return `${ms}ms`
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`
  const min = Math.floor(ms / 60000)
  const sec = Math.floor((ms % 60000) / 1000)
  return `${min}m ${sec}s`
}

export function formatDuration(seconds) {
  if (seconds < 60) return `${seconds}s`
  const min = Math.floor(seconds / 60)
  const sec = seconds % 60
  if (min < 60) return sec > 0 ? `${min}m ${sec}s` : `${min}m`
  const h = Math.floor(min / 60)
  const m = min % 60
  return `${h}h ${m}m`
}
