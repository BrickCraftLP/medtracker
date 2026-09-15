import { useEffect, useMemo, useRef, useState } from 'react'
import { useData } from '../../../context/DataContext.jsx'
import { calcHeatmapData, getHeatmapColors } from '../../../utils/calculations/heatmapIntensityCalcs.js'
import { format } from 'date-fns'
import { useLanguage } from '../../../context/LanguageContext.jsx'
import { useGraphSettings } from '../../../context/GraphSettingsContext.jsx'

export default function HeatmapIntensityWidget({ config = {}, size }) {
  const { recentSessions } = useData()
  const { t } = useLanguage()
  const { heatmapTheme, heatmapCustomColor } = useGraphSettings()
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches

  // Measure the grid area so cells stay perfectly square at any widget size:
  // cell size comes from the height (7 weekday rows), then as many week
  // columns as fit the width. If the width is the tighter bound, shrink cells
  // and the day range shrinks with it (fewer weeks shown, never non-square).
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

  const rows = 7
  const GAP = 3
  const MIN_WEEKS = size === 'small' ? 5 : 7
  // Reserve a few px so edge cells aren't clipped.
  const PAD = 4
  const availW = box.w - PAD
  const availH = box.h - PAD
  let cell = Math.floor(Math.max(0, (availH - GAP * 6) / rows))
  // Medium is a small widget's height but double width: cap cells at the size
  // a small widget gets (half width, 5 weeks) so squares match across sizes.
  if (size === 'medium') {
    const smallCell = Math.floor(Math.max(0, ((availW - GAP) / 2 - GAP * 4) / 5))
    cell = Math.min(cell, smallCell)
  }
  let weeks = cell > 0 ? Math.floor((availW + GAP) / (cell + GAP)) : MIN_WEEKS
  if (weeks < MIN_WEEKS) {
    weeks = MIN_WEEKS
    cell = Math.floor(Math.max(0, (availW - GAP * (weeks - 1)) / weeks))
  }
  weeks = Math.min(weeks, 53)

  // Weekday rows (Mon–Sun), columns = weeks. Trim the leading cells so the
  // last column ends exactly on today's weekday.
  const todayRow = (new Date().getDay() + 6) % 7
  const days = weeks * rows - (6 - todayRow)
  const data = useMemo(() => calcHeatmapData(recentSessions, days), [recentSessions, days])

  // Per-widget colors (set in widget settings) win over the global default.
  const colors = getHeatmapColors(
    config.heatmap_theme ?? heatmapTheme,
    config.heatmap_custom_color ?? heatmapCustomColor,
    isDark
  )

  return (
    <div style={{
      padding: 14,
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, minWidth: 0 }}>
        <div style={{
          width: 28, height: 28, flexShrink: 0, borderRadius: 8, background: 'var(--accent)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15,
        }}>
          🗓️
        </div>
        <span style={{
          flex: 1, minWidth: 0, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {t('widget.activity')}
        </span>
      </div>
      <div ref={gridRef} style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {cell > 0 && <div style={{
          position: 'absolute',
          inset: 0,
          margin: 'auto',
          width: 'fit-content',
          height: 'fit-content',
          display: 'grid',
          gridAutoFlow: 'column',
          gridTemplateRows: `repeat(${rows}, ${cell}px)`,
          gridTemplateColumns: `repeat(${weeks}, ${cell}px)`,
          gap: GAP,
        }}>
          {data.map((d, i) => (
            <div
              key={d.date}
              className="heatmap-cell"
              title={`${d.date}: ${t('widget.exercisesCount', { n: d.count })}`}
              style={{
                background: colors[d.level],
                borderRadius: 3,
              }}
            />
          ))}
        </div>}
      </div>
    </div>
  )
}
