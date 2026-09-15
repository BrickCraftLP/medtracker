import { format, eachDayOfInterval, subDays } from 'date-fns'

// Bucket exercise count into 0–4 intensity levels
export function intensityLevel(count, maxCount) {
  if (count === 0) return 0
  if (maxCount === 0) return 0
  const ratio = count / maxCount
  if (ratio < 0.25) return 1
  if (ratio < 0.5) return 2
  if (ratio < 0.75) return 3
  return 4
}

export function calcHeatmapData(sessions, days = 84) {
  const end = new Date()
  const start = subDays(end, days - 1)
  const allDays = eachDayOfInterval({ start, end })

  const countsByDate = {}
  for (const s of sessions) {
    const day = format(new Date(s.started_at), 'yyyy-MM-dd')
    countsByDate[day] = (countsByDate[day] ?? 0) + (s.total_exercises ?? 0)
  }

  const max = Math.max(0, ...Object.values(countsByDate))

  return allDays.map(d => {
    const key = format(d, 'yyyy-MM-dd')
    const count = countsByDate[key] ?? 0
    return {
      date: key,
      count,
      level: intensityLevel(count, max),
    }
  })
}

export const INTENSITY_COLORS = {
  blue: {
    light: ['#e5e7eb', '#bfdbfe', '#93c5fd', '#3b82f6', '#1d4ed8'],
    dark: ['#27272a', '#1e3a5f', '#1e40af', '#2563eb', '#3b82f6'],
  },
  green: {
    light: ['#e5e7eb', '#bbf7d0', '#86efac', '#22c55e', '#15803d'],
    dark: ['#27272a', '#14532d', '#166534', '#16a34a', '#22c55e'],
  },
  purple: {
    light: ['#e5e7eb', '#ede9fe', '#c4b5fd', '#8b5cf6', '#6d28d9'],
    dark: ['#27272a', '#2e1065', '#4c1d95', '#7c3aed', '#8b5cf6'],
  },
}

// Resolve the 5 intensity colors for a theme. 'custom' derives the ramp from a
// single user-picked hex by mixing it into the empty-cell base at rising strength.
export function getHeatmapColors(theme, customColor, isDark) {
  if (theme === 'custom' && customColor) {
    const base = isDark ? '#27272a' : '#e5e7eb'
    return [
      base,
      `color-mix(in srgb, ${customColor} 30%, ${base})`,
      `color-mix(in srgb, ${customColor} 55%, ${base})`,
      `color-mix(in srgb, ${customColor} 80%, ${base})`,
      customColor,
    ]
  }
  return (INTENSITY_COLORS[theme] ?? INTENSITY_COLORS.blue)[isDark ? 'dark' : 'light']
}
