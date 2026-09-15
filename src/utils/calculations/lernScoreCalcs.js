import { calcDailyExerciseCounts, getDateRange } from './filterTimeframeCalcs.js'

export function calcLernScore(sessions) {
  const { from, to } = getDateRange('30d')
  const daily = calcDailyExerciseCounts(sessions, from, to)

  // Keep the calendar-day offset as x (calcDailyExerciseCounts emits one entry
  // per day in order, so the array index IS the day offset). Using the real
  // calendar position — instead of a compressed study-day index — makes the
  // slope a true % accuracy change per day, so normal trends land in the middle
  // of the scale rather than slamming into the rails. Each day is weighted by
  // its exercise count, so a single low-volume bad day can't drag the trend.
  const points = daily
    .map((d, i) => ({ x: i, y: (d.correct / d.exercises) * 100, w: d.exercises }))
    .filter(p => p.w >= 3)

  if (points.length < 3) {
    return { score: 1, position: 0.5, noData: true }
  }

  // Weighted linear regression (weights = exercise counts).
  const W   = points.reduce((s, p) => s + p.w, 0)
  const mx  = points.reduce((s, p) => s + p.w * p.x, 0) / W
  const my  = points.reduce((s, p) => s + p.w * p.y, 0) / W
  const sxy = points.reduce((s, p) => s + p.w * (p.x - mx) * (p.y - my), 0)
  const sxx = points.reduce((s, p) => s + p.w * (p.x - mx) * (p.x - mx), 0)
  const slope = sxx === 0 ? 0 : sxy / sxx  // % accuracy change per calendar day

  // Map slope (%/day) to a multiplier on a log2 scale. Sensitivity 2: ±1 %/day
  // maps to ×2 / ×0.5 — i.e. roughly a ±30 % accuracy shift across the 30-day
  // window is what reaches the ×4 / ×0.25 extremes.
  const rawScore = Math.pow(2, slope * 2)
  const score    = Math.max(0.25, Math.min(4, rawScore))

  // Position on arc [0 = left / 0.25×, 1 = right / 4×] using log2 scale
  const position = (Math.log2(score) + 2) / 4

  return { score, position, noData: false }
}
