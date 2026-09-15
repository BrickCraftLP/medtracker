// One positioned event in the time grid.
//
// Pure and px-driven: the grid computes w/h from the layout and hands them
// over, so the progress outline can draw a correctly-rounded perimeter without
// measuring anything itself.

import { motion } from 'framer-motion'
import ProgressOutline from './ProgressOutline.jsx'
import { metaFor, withAlpha, hhmm } from '../../utils/calendar/eventModel.js'

// Below this height there is only room for one line, so the time moves onto
// the title row and the resize handles disappear.
const COMPACT_HEIGHT = 34
const HANDLE_HEIGHT = 10

export default function EventBlock({
  occurrence, w, h, color, progress = null, conflicting = false,
  dragging = false, onOpen, onResizeStart,
}) {
  const { event, startMin, continuesBefore, continuesAfter } = occurrence
  const meta = metaFor(event.kind)
  const compact = h < COMPACT_HEIGHT
  const showRing = meta.ring && progress != null
  const done = event.completed || progress === 1

  const radius = 10
  const timeLabel = event.all_day ? null : hhmm(event.start_time)

  return (
    <motion.div
      data-event-block={event.id}
      whileTap={dragging ? undefined : { scale: 0.97 }}
      onClick={e => { e.stopPropagation(); onOpen?.(occurrence) }}
      style={{
        position: 'absolute',
        inset: 0,
        borderRadius: radius,
        overflow: 'hidden',
        cursor: 'pointer',
        // The ring replaces the border, otherwise the two stack and the block
        // looks double-outlined at 0% progress.
        border: showRing ? 'none' : `0.5px solid ${withAlpha(color, 0.5)}`,
        background: withAlpha(color, done ? 0.1 : 0.18),
        boxShadow: dragging
          ? '0 12px 28px rgba(0, 0, 0, 0.28)'
          : '-1px 0 0 var(--bg-primary)',
        opacity: done ? 0.62 : 1,
        transition: dragging ? 'none' : 'opacity 0.2s ease, background 0.2s ease',
        // Rounded top/bottom only where the event actually begins and ends.
        borderTopLeftRadius: continuesBefore ? 2 : radius,
        borderTopRightRadius: continuesBefore ? 2 : radius,
        borderBottomLeftRadius: continuesAfter ? 2 : radius,
        borderBottomRightRadius: continuesAfter ? 2 : radius,
      }}
    >
      {/* Kind identity bar — survives even when the ring owns the outline. */}
      <span style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 3,
        background: color, borderRadius: '3px 0 0 3px',
      }} />

      <div style={{
        position: 'relative', height: '100%', padding: compact ? '2px 6px 2px 9px' : '4px 8px 4px 10px',
        display: 'flex', flexDirection: compact ? 'row' : 'column',
        alignItems: compact ? 'center' : 'stretch', gap: compact ? 5 : 1, minWidth: 0,
      }}>
        <span style={{
          fontSize: compact ? 11 : 12, fontWeight: 650, color: 'var(--text-primary)',
          letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          textDecoration: done ? 'line-through' : 'none', flex: compact ? 1 : 'none', minWidth: 0,
        }}>
          {meta.icon} {event.title || '—'}
        </span>

        {timeLabel && (
          <span style={{
            fontSize: 10.5, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
            fontVariantNumeric: 'tabular-nums',
          }}>
            {timeLabel}
          </span>
        )}

        {!compact && event.location && (
          <span style={{
            fontSize: 10.5, color: 'var(--text-tertiary)', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            📍 {event.location}
          </span>
        )}

        {!compact && progress != null && progress.total > 0 && (
          <span style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 'auto' }}>
            {progress.done}/{progress.total}
          </span>
        )}
      </div>

      {conflicting && (
        <span
          title="overlap"
          style={{ position: 'absolute', top: 2, right: 4, fontSize: 10, lineHeight: 1 }}
        >⚠️</span>
      )}

      {showRing && (
        <ProgressOutline w={w} h={h} radius={radius} progress={progress.ratio} color={color} />
      )}

      {/* Resize handles. Only on blocks tall enough that grabbing one can't be
          mistaken for grabbing the whole block, and never on a continuation. */}
      {!compact && onResizeStart && !continuesBefore && (
        <span
          data-resize="start"
          onPointerDown={e => { e.stopPropagation(); onResizeStart(e, occurrence, 'start') }}
          style={{ position: 'absolute', left: 0, right: 0, top: 0, height: HANDLE_HEIGHT, cursor: 'ns-resize' }}
        />
      )}
      {!compact && onResizeStart && !continuesAfter && (
        <span
          data-resize="end"
          onPointerDown={e => { e.stopPropagation(); onResizeStart(e, occurrence, 'end') }}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: HANDLE_HEIGHT, cursor: 'ns-resize' }}
        />
      )}
      {/* startMin is read by the drag handler through the DOM dataset when a
          move begins from a long-press on the block itself. */}
      <span hidden data-start-min={startMin} />
    </motion.div>
  )
}
