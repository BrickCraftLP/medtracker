// Month grid: 6×7 cells, up to three event chips per day, "+N" for the rest.
//
// Press-and-drag across cells creates a multi-day all-day event — the month
// equivalent of dragging a time range. Tapping a day selects it; tapping the
// selected day again opens it in the day view (handled by the parent).

import { useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import {
  startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, format, isSameMonth,
} from 'date-fns'
import { dayKey, colorOf, metaFor, withAlpha } from '../../utils/calendar/eventModel.js'
import { ProgressUnderline } from './ProgressOutline.jsx'
import { todoSwipeActive } from '../../utils/gestureState.js'

const MAX_CHIPS = 3

export default function MonthView({
  month, selected, occurrences, calendarById, progressOf, locale,
  onSelectDay, onOpenEvent, onCreateRange,
}) {
  const [range, setRange] = useState(null) // { from, to } while dragging
  const anchorRef = useRef(null)
  const today = dayKey()

  const weeks = useMemo(() => {
    const days = eachDayOfInterval({
      start: startOfWeek(startOfMonth(month), { weekStartsOn: 1 }),
      end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }),
    })
    const out = []
    for (let i = 0; i < days.length; i += 7) out.push(days.slice(i, i + 7))
    return out
  }, [month])

  const byDay = useMemo(() => {
    const map = new Map()
    for (const occ of occurrences) {
      let list = map.get(occ.date)
      if (!list) { list = []; map.set(occ.date, list) }
      list.push(occ)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.allDay === b.allDay ? a.startMin - b.startMin : a.allDay ? -1 : 1))
    }
    return map
  }, [occurrences])

  const weekdayLabels = useMemo(
    () => (weeks[0] ?? []).map(d => format(d, 'EEEEE', { locale })),
    [weeks, locale],
  )

  // ── Drag across days ─────────────────────────────────────────────────────

  function dayFromPoint(clientX, clientY) {
    const el = document.elementFromPoint(clientX, clientY)?.closest('[data-day]')
    return el?.getAttribute('data-day') ?? null
  }

  function handlePointerDown(e, key) {
    if (e.target.closest('button[data-chip]')) return
    anchorRef.current = key
  }

  function handlePointerMove(e) {
    if (!anchorRef.current) return
    const key = dayFromPoint(e.clientX, e.clientY)
    if (!key || key === anchorRef.current) return
    todoSwipeActive.current = true
    const from = key < anchorRef.current ? key : anchorRef.current
    const to = key < anchorRef.current ? anchorRef.current : key
    setRange({ from, to })
  }

  function handlePointerUp() {
    const dragged = range
    anchorRef.current = null
    setRange(null)
    setTimeout(() => { todoSwipeActive.current = false }, 80)
    if (dragged) onCreateRange?.(dragged)
  }

  const inRange = key => range && key >= range.from && key <= range.to

  return (
    <div
      style={{ padding: '0 12px 12px', userSelect: 'none' }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', marginBottom: 4 }}>
        {weekdayLabels.map((label, i) => (
          <div key={i} style={{
            textAlign: 'center', fontSize: 10.5, fontWeight: 600,
            color: 'var(--text-tertiary)', letterSpacing: 0.3, textTransform: 'uppercase',
          }}>{label}</div>
        ))}
      </div>

      {weeks.map((week, wi) => (
        <div key={wi} style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 2 }}>
          {week.map(d => {
            const key = dayKey(d)
            const list = byDay.get(key) ?? []
            const outside = !isSameMonth(d, month)
            const isToday = key === today
            const isSelected = key === selected

            return (
              <motion.div
                key={key}
                data-day={key}
                whileTap={{ scale: 0.96 }}
                transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
                onPointerDown={e => handlePointerDown(e, key)}
                onClick={() => onSelectDay?.(key)}
                style={{
                  minHeight: 74, borderRadius: 10, padding: '3px 3px 4px',
                  background: inRange(key)
                    ? 'var(--accent-light)'
                    : isSelected ? 'var(--bg-tertiary)' : 'transparent',
                  border: isSelected ? '1px solid var(--accent)' : '1px solid transparent',
                  opacity: outside ? 0.42 : 1,
                  transition: 'background 0.15s ease, border-color 0.15s ease',
                  cursor: 'pointer', overflow: 'hidden',
                }}
              >
                <div style={{
                  width: 21, height: 21, margin: '0 auto 2px', borderRadius: '50%',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 12, fontWeight: isToday ? 700 : 600,
                  background: isToday ? 'var(--accent)' : 'transparent',
                  color: isToday ? '#fff' : 'var(--text-primary)',
                }}>
                  {format(d, 'd')}
                </div>

                {list.slice(0, MAX_CHIPS).map(occ => {
                  const color = colorOf(occ.event, calendarById)
                  const progress = metaFor(occ.event.kind).ring ? progressOf?.(occ.event.id) : null
                  return (
                    <motion.button
                      key={occ.key}
                      data-chip
                      whileTap={{ scale: 0.94 }}
                      transition={{ duration: 0.1, ease: [0.23, 1, 0.32, 1] }}
                      onClick={e => { e.stopPropagation(); onOpenEvent?.(occ) }}
                      style={{
                        position: 'relative', display: 'block', width: '100%', border: 'none',
                        textAlign: 'left', cursor: 'pointer', marginBottom: 2,
                        background: withAlpha(color, 0.18), color: 'var(--text-primary)',
                        borderRadius: 4, padding: '1px 3px 2px', fontSize: 9.5, fontWeight: 600,
                        lineHeight: 1.25, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        textDecoration: occ.event.completed ? 'line-through' : 'none',
                      }}
                    >
                      {occ.event.title || '—'}
                      {progress && progress.total > 0 && (
                        <ProgressUnderline progress={progress.ratio} color={color} />
                      )}
                    </motion.button>
                  )
                })}

                {list.length > MAX_CHIPS && (
                  <div style={{ fontSize: 9, color: 'var(--text-tertiary)', paddingLeft: 3 }}>
                    +{list.length - MAX_CHIPS}
                  </div>
                )}
              </motion.div>
            )
          })}
        </div>
      ))}
    </div>
  )
}
