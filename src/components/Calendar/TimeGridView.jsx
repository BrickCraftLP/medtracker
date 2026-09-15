// Day / 3-day / week time grid: hour rows, an all-day strip, the now-line,
// and the three drag gestures (create on empty grid, move a block, resize an
// edge).
//
// Gesture notes, because these are the parts that break subtly:
//
// • Touch move is bound manually with { passive: false }. Once a create-drag
//   is armed we must preventDefault to stop the scroller, and React 18's
//   delegated touchmove cannot reliably do that.
// • A touch drag only arms after a long press, so a plain swipe still scrolls
//   the grid. A mouse arms immediately, like Google Calendar.
// • While any drag is live, todoSwipeActive is set so App.jsx's tab-swipe
//   ignores the gesture — and released 80ms late, so the trailing pan-end
//   doesn't page tabs either (same trick as SwipeDeleteTodo).
// • Horizontal pans over the grid page the visible range rather than
//   switching tabs. To change tabs from the calendar, swipe on the toolbar.
//   That is deliberate: do not "fix" it back.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import EventBlock from './EventBlock.jsx'
import NowIndicator from './NowIndicator.jsx'
import { layoutDay } from '../../utils/calendar/eventLayout.js'
import { nowMinutes } from '../../utils/calendar/gridGeometry.js'
import {
  dayKey, parseDayKey, colorOf, timeOf, metaFor, withAlpha, MINUTES_PER_DAY,
} from '../../utils/calendar/eventModel.js'
import { todoSwipeActive } from '../../utils/gestureState.js'

const LONG_PRESS_MS = 280
const MOVE_TOLERANCE = 8
const AUTOSCROLL_ZONE = 52
const AUTOSCROLL_SPEED = 9
const PAGE_DISTANCE = 45
const PAGE_VELOCITY = 420

export default function TimeGridView({
  days, occurrences, geo, calendarById, progressOf, conflicts,
  locale, onOpenEvent, onCreateDraft, onCommitEvent, onPage,
}) {
  const scrollerRef = useRef(null)
  const bodyRef = useRef(null)
  const [colWidth, setColWidth] = useState(0)

  const dragRef = useRef(null)
  const [drag, setDrag] = useState(null)
  const longPressRef = useRef(null)
  const pressRef = useRef(null)
  const autoScrollRef = useRef(0)

  const today = dayKey()

  // ── Buckets ──────────────────────────────────────────────────────────────

  const { allDayByDay, timedByDay } = useMemo(() => {
    const allDayMap = new Map()
    const timedMap = new Map()
    for (const d of days) { allDayMap.set(d, []); timedMap.set(d, []) }
    for (const occ of occurrences) {
      const bucket = occ.allDay ? allDayMap : timedMap
      if (bucket.has(occ.date)) bucket.get(occ.date).push(occ)
    }
    for (const [d, list] of timedMap) timedMap.set(d, layoutDay(list))
    return { allDayByDay: allDayMap, timedByDay: timedMap }
  }, [days, occurrences])

  const allDayRows = Math.min(3, Math.max(0, ...days.map(d => allDayByDay.get(d)?.length ?? 0)))

  // ── Measurement ──────────────────────────────────────────────────────────

  useLayoutEffect(() => {
    const el = bodyRef.current
    if (!el) return
    const measure = () => setColWidth(el.clientWidth / days.length)
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [days.length])

  // Open on the working day, not on midnight: an hour before now, or 07:00
  // when the calendar is showing some other week.
  const didScroll = useRef(false)
  useEffect(() => {
    if (didScroll.current || !scrollerRef.current || !colWidth) return
    didScroll.current = true
    const target = days.includes(today) ? Math.max(0, nowMinutes() - 60) : 7 * 60
    scrollerRef.current.scrollTop = geo.minutesToY(target)
  }, [colWidth, days, today, geo])

  // ── Pointer geometry ─────────────────────────────────────────────────────

  const pointToSlot = useCallback((clientX, clientY) => {
    const body = bodyRef.current
    if (!body) return null
    // getBoundingClientRect already accounts for the scroller's offset, so no
    // scrollTop arithmetic is needed here.
    const rect = body.getBoundingClientRect()
    const width = rect.width / days.length
    const dayIndex = Math.max(0, Math.min(days.length - 1, Math.floor((clientX - rect.left) / width)))
    const minute = geo.clamp(geo.yToMinutes(clientY - rect.top))
    return { dayIndex, minute }
  }, [days.length, geo])

  const stopAutoScroll = () => {
    if (autoScrollRef.current) { cancelAnimationFrame(autoScrollRef.current); autoScrollRef.current = 0 }
  }

  const runAutoScroll = useCallback((clientY) => {
    const scroller = scrollerRef.current
    if (!scroller) return
    const rect = scroller.getBoundingClientRect()
    let delta = 0
    if (clientY - rect.top < AUTOSCROLL_ZONE) delta = -AUTOSCROLL_SPEED
    else if (rect.bottom - clientY < AUTOSCROLL_ZONE) delta = AUTOSCROLL_SPEED
    stopAutoScroll()
    if (!delta) return
    const step = () => {
      scroller.scrollTop += delta
      autoScrollRef.current = requestAnimationFrame(step)
    }
    autoScrollRef.current = requestAnimationFrame(step)
  }, [])

  // ── Drag lifecycle ───────────────────────────────────────────────────────

  const setDragState = next => { dragRef.current = next; setDrag(next) }

  const armCreate = useCallback((clientX, clientY) => {
    const slot = pointToSlot(clientX, clientY)
    if (!slot) return
    const anchor = geo.snap(slot.minute)
    navigator.vibrate?.(8)
    todoSwipeActive.current = true
    setDragState({
      mode: 'create',
      dayIndex: slot.dayIndex,
      anchorMin: anchor,
      startMin: anchor,
      endMin: Math.min(MINUTES_PER_DAY, anchor + geo.snapMinutes * 2),
    })
  }, [geo, pointToSlot])

  const armMove = useCallback((occurrence, clientX, clientY, mode) => {
    const slot = pointToSlot(clientX, clientY)
    if (!slot) return
    navigator.vibrate?.(8)
    todoSwipeActive.current = true
    setDragState({
      mode,
      occurrence,
      dayIndex: days.indexOf(occurrence.date),
      startMin: occurrence.startMin,
      endMin: occurrence.endMin,
      grabOffsetMin: slot.minute - occurrence.startMin,
      duration: occurrence.endMin - occurrence.startMin,
    })
  }, [days, pointToSlot])

  const updateDrag = useCallback((clientX, clientY) => {
    const d = dragRef.current
    if (!d) return
    const slot = pointToSlot(clientX, clientY)
    if (!slot) return
    const cur = geo.snap(slot.minute)

    if (d.mode === 'create') {
      const startMin = Math.min(d.anchorMin, cur)
      const endMin = Math.max(d.anchorMin, cur, d.anchorMin + geo.snapMinutes)
      setDragState({ ...d, startMin, endMin })
      return
    }
    if (d.mode === 'move') {
      const startMin = geo.clamp(geo.snap(slot.minute - d.grabOffsetMin))
      const endMin = Math.min(MINUTES_PER_DAY, startMin + d.duration)
      setDragState({ ...d, dayIndex: slot.dayIndex, startMin, endMin })
      return
    }
    if (d.mode === 'resize-end') {
      setDragState({ ...d, endMin: Math.max(cur, d.startMin + geo.snapMinutes) })
      return
    }
    if (d.mode === 'resize-start') {
      setDragState({ ...d, startMin: Math.min(cur, d.endMin - geo.snapMinutes) })
    }
  }, [geo, pointToSlot])

  const releaseSwipeGuard = () => {
    // Late release: the pan-end that follows a drag must not reach the tab
    // swiper. Same 80ms as SwipeDeleteTodo.
    setTimeout(() => { todoSwipeActive.current = false }, 80)
  }

  const commitDrag = useCallback(() => {
    clearTimeout(longPressRef.current)
    stopAutoScroll()
    const d = dragRef.current
    setDragState(null)
    pressRef.current = null
    if (!d) { todoSwipeActive.current = false; return }
    releaseSwipeGuard()

    const date = days[d.dayIndex] ?? days[0]
    if (d.mode === 'create') {
      onCreateDraft?.({ date, startMin: d.startMin, endMin: d.endMin })
      return
    }

    const unchanged = date === d.occurrence.date &&
      d.startMin === d.occurrence.startMin && d.endMin === d.occurrence.endMin
    if (unchanged) return

    onCommitEvent?.(d.occurrence, {
      start_date: date,
      start_time: timeOf(d.startMin),
      end_date: date,
      end_time: timeOf(d.endMin),
      all_day: false,
      planned_minutes: d.endMin - d.startMin,
    })
  }, [days, onCreateDraft, onCommitEvent])

  const cancelDrag = useCallback(() => {
    clearTimeout(longPressRef.current)
    stopAutoScroll()
    setDragState(null)
    pressRef.current = null
    todoSwipeActive.current = false
  }, [])

  // Native listeners: the touch path needs { passive: false } to be allowed to
  // preventDefault, and pointer capture on the window keeps a mouse drag alive
  // outside the grid.
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller) return

    const onTouchMove = e => {
      if (!dragRef.current) return
      e.preventDefault()
      const t = e.touches[0]
      updateDrag(t.clientX, t.clientY)
      runAutoScroll(t.clientY)
    }
    const onTouchStartMove = e => {
      // Before the long press fires, a finger that travels cancels it so the
      // gesture stays a plain scroll.
      if (dragRef.current || !pressRef.current) return
      const t = e.touches[0]
      if (Math.abs(t.clientX - pressRef.current.x) > MOVE_TOLERANCE ||
          Math.abs(t.clientY - pressRef.current.y) > MOVE_TOLERANCE) {
        clearTimeout(longPressRef.current)
        pressRef.current = null
      }
    }
    const onPointerMove = e => {
      if (!dragRef.current || e.pointerType === 'touch') return
      updateDrag(e.clientX, e.clientY)
      runAutoScroll(e.clientY)
    }
    const onUp = () => { if (dragRef.current || pressRef.current) commitDrag() }

    scroller.addEventListener('touchmove', onTouchMove, { passive: false })
    scroller.addEventListener('touchmove', onTouchStartMove, { passive: true })
    scroller.addEventListener('touchend', onUp)
    scroller.addEventListener('touchcancel', cancelDrag)
    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerup', onUp)
    return () => {
      scroller.removeEventListener('touchmove', onTouchMove)
      scroller.removeEventListener('touchmove', onTouchStartMove)
      scroller.removeEventListener('touchend', onUp)
      scroller.removeEventListener('touchcancel', cancelDrag)
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerup', onUp)
      stopAutoScroll()
      clearTimeout(longPressRef.current)
    }
  }, [updateDrag, commitDrag, cancelDrag, runAutoScroll])

  function handleBackgroundPointerDown(e) {
    // Never hijack a tap that belongs to a block or a control.
    if (e.target.closest('[data-event-block], button, a, input, [data-resize]')) return
    if (e.pointerType === 'touch') {
      pressRef.current = { x: e.clientX, y: e.clientY }
      const { clientX, clientY } = e
      longPressRef.current = setTimeout(() => armCreate(clientX, clientY), LONG_PRESS_MS)
      return
    }
    armCreate(e.clientX, e.clientY)
  }

  function handleBlockPointerDown(e, occurrence) {
    if (e.target.closest('[data-resize]')) return
    if (e.pointerType === 'touch') {
      pressRef.current = { x: e.clientX, y: e.clientY }
      const { clientX, clientY } = e
      longPressRef.current = setTimeout(() => armMove(occurrence, clientX, clientY, 'move'), LONG_PRESS_MS)
      return
    }
    armMove(occurrence, e.clientX, e.clientY, 'move')
  }

  function handleResizeStart(e, occurrence, edge) {
    armMove(occurrence, e.clientX, e.clientY, edge === 'start' ? 'resize-start' : 'resize-end')
  }

  // ── Paging ───────────────────────────────────────────────────────────────

  function handlePanEnd(_e, info) {
    if (dragRef.current) return
    const { offset, velocity } = info
    if (Math.abs(offset.x) < Math.abs(offset.y) * 1.2) return
    if (Math.abs(offset.x) < PAGE_DISTANCE && Math.abs(velocity.x) < PAGE_VELOCITY) return
    onPage?.(offset.x < 0 ? 1 : -1)
  }

  // ── Render ───────────────────────────────────────────────────────────────

  const hours = Array.from({ length: 24 }, (_, i) => i)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}>

      {/* Day headers */}
      <div style={{ display: 'flex', paddingRight: 2, borderBottom: '0.5px solid var(--border)' }}>
        <div style={{ width: geo.gutter, flexShrink: 0 }} />
        {days.map(d => {
          const date = parseDayKey(d)
          const isToday = d === today
          return (
            <div key={d} style={{ flex: 1, textAlign: 'center', padding: '6px 0 7px' }}>
              <div style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.3, textTransform: 'uppercase' }}>
                {format(date, 'EEEEEE', { locale })}
              </div>
              <div style={{
                margin: '3px auto 0', width: 26, height: 26, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 14, fontWeight: isToday ? 700 : 600,
                background: isToday ? 'var(--accent)' : 'transparent',
                color: isToday ? '#fff' : 'var(--text-primary)',
              }}>
                {format(date, 'd')}
              </div>
            </div>
          )
        })}
      </div>

      {/* All-day strip — only takes space when something is in it */}
      {allDayRows > 0 && (
        <div style={{ display: 'flex', borderBottom: '0.5px solid var(--border)', background: 'var(--bg-secondary)' }}>
          <div style={{ width: geo.gutter, flexShrink: 0 }} />
          {days.map(d => (
            <div key={d} style={{ flex: 1, minWidth: 0, padding: '3px 2px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {(allDayByDay.get(d) ?? []).slice(0, 3).map(occ => {
                const color = colorOf(occ.event, calendarById)
                return (
                  <motion.button
                    key={occ.key}
                    whileTap={{ scale: 0.95 }}
                    transition={{ duration: 0.1, ease: [0.23, 1, 0.32, 1] }}
                    onClick={() => onOpenEvent?.(occ)}
                    style={{
                      border: 'none', textAlign: 'left', cursor: 'pointer',
                      background: withAlpha(color, 0.2), color: 'var(--text-primary)',
                      borderRadius: 5, padding: '2px 5px', fontSize: 10.5, fontWeight: 600,
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                    }}
                  >
                    {metaFor(occ.event.kind).icon} {occ.event.title || '—'}
                  </motion.button>
                )
              })}
            </div>
          ))}
        </div>
      )}

      {/* Scrolling grid */}
      <motion.div
        ref={scrollerRef}
        onPanEnd={handlePanEnd}
        style={{
          flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden',
          position: 'relative', WebkitOverflowScrolling: 'touch',
          touchAction: drag ? 'none' : 'pan-y',
        }}
      >
        <div style={{ display: 'flex', position: 'relative', height: geo.height }}>

          {/* Hour gutter */}
          <div style={{ width: geo.gutter, flexShrink: 0, position: 'relative' }}>
            {hours.map(h => (
              <div key={h} style={{
                position: 'absolute', top: geo.minutesToY(h * 60) - 6, right: 8,
                fontSize: 10.5, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums',
              }}>
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>

          {/* Day columns */}
          <div
            ref={bodyRef}
            onPointerDown={handleBackgroundPointerDown}
            style={{ flex: 1, position: 'relative' }}
          >
            {hours.map(h => (
              <div key={h} style={{
                position: 'absolute', left: 0, right: 0, top: geo.minutesToY(h * 60),
                borderTop: `0.5px solid ${h % 2 === 0 ? 'var(--border)' : 'var(--border)'}`,
                opacity: h % 2 === 0 ? 1 : 0.55, pointerEvents: 'none',
              }} />
            ))}

            {days.map((d, i) => (
              <div key={d} style={{
                position: 'absolute', top: 0, bottom: 0,
                left: `${(i / days.length) * 100}%`, width: `${100 / days.length}%`,
                borderLeft: i === 0 ? 'none' : '0.5px solid var(--border)',
                background: d === today ? 'var(--accent-muted)' : 'transparent',
                pointerEvents: 'none',
              }} />
            ))}

            {days.map((d, dayIndex) => (
              (timedByDay.get(d) ?? []).map(occ => {
                const hidden = drag && drag.occurrence?.key === occ.key
                const top = geo.minutesToY(occ.startMin)
                const height = Math.max(16, geo.minutesToY(occ.endMin - occ.startMin) - 2)
                const width = colWidth * occ.width - 3
                return (
                  <div
                    key={occ.key}
                    onPointerDown={e => handleBlockPointerDown(e, occ)}
                    style={{
                      position: 'absolute', top, height,
                      left: `calc(${((dayIndex + occ.left) / days.length) * 100}% + 1px)`,
                      width: `calc(${(occ.width / days.length) * 100}% - 3px)`,
                      opacity: hidden ? 0.25 : 1,
                      zIndex: 2,
                    }}
                  >
                    <EventBlock
                      occurrence={occ}
                      w={Math.max(0, width)}
                      h={height}
                      color={colorOf(occ.event, calendarById)}
                      progress={progressOf?.(occ.event.id) ?? null}
                      conflicting={conflicts?.has(occ.key)}
                      onOpen={onOpenEvent}
                      onResizeStart={handleResizeStart}
                    />
                  </div>
                )
              })
            ))}

            {/* Live drag ghost */}
            {drag && (
              <div style={{
                position: 'absolute',
                top: geo.minutesToY(drag.startMin),
                height: Math.max(16, geo.minutesToY(drag.endMin - drag.startMin) - 2),
                left: `calc(${(drag.dayIndex / days.length) * 100}% + 1px)`,
                width: `calc(${100 / days.length}% - 3px)`,
                borderRadius: 10, zIndex: 8, pointerEvents: 'none',
                background: 'var(--accent-light)',
                border: '1.5px solid var(--accent)',
                boxShadow: '0 10px 24px rgba(0,0,0,0.22)',
                display: 'flex', alignItems: 'flex-start', padding: '4px 8px',
                fontSize: 11.5, fontWeight: 650, color: 'var(--text-primary)',
                fontVariantNumeric: 'tabular-nums',
              }}>
                {`${timeOf(drag.startMin).slice(0, 5)} – ${timeOf(drag.endMin).slice(0, 5)}`}
              </div>
            )}

            {days.includes(today) && <NowIndicator geo={geo} leftOffset={0} />}
          </div>
        </div>
      </motion.div>
    </div>
  )
}

