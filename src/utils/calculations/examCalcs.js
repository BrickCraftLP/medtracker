// Grades, averages, and the one number a student actually wants: what they
// still need on what's left.
//
// Two schemes, chosen per calendar (calendars.grade_scheme):
//   'at-de' — 1 to 5, LOWER is better, 4 or better passes (AT/DE universities)
//   'pct'   — 0 to 100, higher is better, 50 or better passes
// Everything below reads the scheme rather than assuming a direction, because
// getting that backwards silently inverts every average on the page.

export const SCHEMES = {
  'at-de': { min: 1, max: 5, lowerIsBetter: true, passAt: 4 },
  pct: { min: 0, max: 100, lowerIsBetter: false, passAt: 50 },
}

export const schemeOf = calendar => SCHEMES[calendar?.grade_scheme] ?? SCHEMES['at-de']

// The number used for averages. Prefers an explicit grade_numeric, falls back
// to parsing what the user typed, then to score/max_score as a percentage.
export function gradeValue(exam, scheme) {
  if (exam.grade_numeric != null) return Number(exam.grade_numeric)

  const parsed = Number(String(exam.grade ?? '').replace(',', '.'))
  if (Number.isFinite(parsed) && parsed !== 0) return parsed

  if (exam.score != null && exam.max_score) {
    const pct = (Number(exam.score) / Number(exam.max_score)) * 100
    if (!scheme.lowerIsBetter) return pct
    // Map a percentage onto a 1–5 scale so a scored-but-ungraded exam still
    // contributes: 100% → 1, 50% → 4, below 50% → 5.
    if (pct >= 87.5) return 1
    if (pct >= 75) return 2
    if (pct >= 62.5) return 3
    if (pct >= 50) return 4
    return 5
  }
  return null
}

export const isGraded = exam => exam.status === 'graded' || exam.grade != null || exam.score != null

export function hasPassed(exam, scheme) {
  if (exam.passed != null) return exam.passed
  const value = gradeValue(exam, scheme)
  if (value == null) return null
  return scheme.lowerIsBetter ? value <= scheme.passAt : value >= scheme.passAt
}

// Weight-weighted mean over everything that has a grade. ECTS, when set, is
// what actually counts at a university, so it wins over the manual weight.
export function weightedAverage(exams, scheme) {
  let sum = 0
  let weight = 0
  for (const exam of exams) {
    const value = gradeValue(exam, scheme)
    if (value == null) continue
    const w = Number(exam.ects ?? exam.weight ?? 1) || 1
    sum += value * w
    weight += w
  }
  return weight ? sum / weight : null
}

export function ectsSummary(exams, scheme) {
  let earned = 0
  let planned = 0
  for (const exam of exams) {
    const ects = Number(exam.ects ?? 0)
    if (!ects) continue
    planned += ects
    if (hasPassed(exam, scheme)) earned += ects
  }
  return { earned, planned }
}

export function examCounts(exams, scheme) {
  let graded = 0
  let passed = 0
  for (const exam of exams) {
    if (!isGraded(exam)) continue
    graded += 1
    if (hasPassed(exam, scheme)) passed += 1
  }
  return { graded, passed, total: exams.length, open: exams.length - graded }
}

// "You need ≥ 2.3 on the remaining 2 exams to hit your 2.0 target."
// Returns null when there is nothing left to write, or no target.
export function neededGrade(exams, target, scheme) {
  if (target == null) return null
  let doneSum = 0
  let doneWeight = 0
  let openWeight = 0
  let openCount = 0

  for (const exam of exams) {
    const w = Number(exam.ects ?? exam.weight ?? 1) || 1
    const value = gradeValue(exam, scheme)
    if (value == null) { openWeight += w; openCount += 1; continue }
    doneSum += value * w
    doneWeight += w
  }
  if (!openWeight) return null

  const needed = (Number(target) * (doneWeight + openWeight) - doneSum) / openWeight
  return {
    needed,
    openCount,
    // Out of range means the target can no longer be reached (or is already
    // safe whatever happens) — worth saying plainly rather than showing a
    // grade nobody can score.
    impossible: needed < scheme.min || needed > scheme.max,
  }
}

// Semester covering a day key, else the next one starting, else the last.
export function currentSemester(semesters, today) {
  if (!semesters.length) return null
  const active = semesters.find(s => s.start_date <= today && today <= s.end_date)
  if (active) return active
  const upcoming = semesters.filter(s => s.start_date > today).sort((a, b) => (a.start_date < b.start_date ? -1 : 1))
  if (upcoming.length) return upcoming[0]
  return [...semesters].sort((a, b) => (a.end_date > b.end_date ? -1 : 1))[0]
}

export function daysUntil(dateKey, today) {
  if (!dateKey) return null
  const a = new Date(`${today}T12:00:00`)
  const b = new Date(`${dateKey}T12:00:00`)
  return Math.round((b - a) / 86400000)
}

export function formatGrade(exam, scheme) {
  if (exam.grade) return exam.grade
  const value = gradeValue(exam, scheme)
  if (value == null) return null
  return scheme.lowerIsBetter ? value.toFixed(1) : `${Math.round(value)}%`
}
