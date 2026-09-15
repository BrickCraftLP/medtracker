import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../../../context/DataContext.jsx'
import { useLanguage } from '../../../context/LanguageContext.jsx'
import { calcHeatmapDotData, calcCurrentStreak } from '../../../utils/calculations/streakTrackerCalcs.js'

export default function HeatmapDayTrackerWidget({ config = {}, size }) {
  const { recentSessions, topics } = useData()
  const { t } = useLanguage()
  const rawMode = config.tracker_mode ?? 'any'
  // 'topic' mode picks the actual topic id from config.topic_id; fall back to
  // 'any' until one's chosen so the widget never silently shows nothing.
  const mode = rawMode === 'topic' ? (config.topic_id ?? 'any') : rawMode
  const topic = rawMode === 'topic' ? topics?.find(tp => tp.id === config.topic_id) : null
  // A color picked in widget settings wins; otherwise topic color, then accent.
  const color = config.tracker_color ?? topic?.color_from ?? 'var(--accent)'

  // Measure the grid area so cells stay perfectly square at any widget size:
  // cell size comes from the height (7 weekday rows), then as many week
  // columns as fit the width. If the width is the tighter bound, shrink cells.
  const gridRef = useRef(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect
      setBox({ w: width, h: height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const GAP = 3
  const MIN_COLS = size === 'small' ? 5 : 7
  // Reserve a few px so today's ring/glow isn't clipped at the edges.
  const PAD = 4
  const availW = box.w - PAD
  const availH = box.h - PAD
  let cell = Math.floor(Math.max(0, (availH - GAP * 6) / 7))
  let cols = cell > 0 ? Math.floor((availW + GAP) / (cell + GAP)) : MIN_COLS
  if (cols < MIN_COLS) {
    cols = MIN_COLS
    cell = Math.floor(Math.max(0, (availW - GAP * (cols - 1)) / cols))
  }
  cols = Math.min(cols, 53)

  // Weekday rows (Mon–Sun), columns = weeks. Trim the leading cells so the
  // last column ends exactly on today's weekday.
  const todayRow = (new Date().getDay() + 6) % 7
  const days = cols * 7 - (6 - todayRow)

  const data = useMemo(
    () => calcHeatmapDotData(recentSessions, topics, mode, days),
    [recentSessions, topics, mode, days]
  )

  const streak = useMemo(() => calcCurrentStreak(recentSessions, mode), [recentSessions, mode])

  return (
    <div style={{
      padding: 14,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, minWidth: 0 }}>
        <div style={{
          width: 28, height: 28, flexShrink: 0, borderRadius: 8, background: color,
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
        }}>
          {topic?.emoji ?? '🔥'}
        </div>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {topic?.name ?? t('widget.type.heatmap_tracker')}
        </span>
        <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-secondary)', flexShrink: 0 }}>🔥 {streak}</span>
      </div>
      {/* Grid is absolutely positioned so its own size never feeds back into
          the measured box (otherwise the flex item grows and rows overflow). */}
      <div ref={gridRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {cell > 0 && <div style={{
          position: 'absolute',
          inset: 0,
          margin: 'auto',
          width: 'fit-content',
          height: 'fit-content',
          display: 'grid',
          gridAutoFlow: 'column',
          gridTemplateRows: `repeat(7, ${cell}px)`,
          gridTemplateColumns: `repeat(${cols}, ${cell}px)`,
          gap: GAP,
        }}>
          {data.map((d, i) => {
            const isToday = i === data.length - 1
            return (
              <div
                key={d.date}
                title={d.date}
                style={{
                  borderRadius: 3,
                  background: d.filled ? color : `color-mix(in srgb, ${color} 15%, transparent)`,
                  boxShadow: isToday ? `0 0 0 1.5px ${color}, 0 0 6px ${color}` : 'none',
                  transition: 'background 0.2s',
                }}
              />
            )
          })}
        </div>}
      </div>
    </div>
  )
}
