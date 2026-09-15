// List view: every day in the range that has something on it, grouped under a
// sticky header. Overdue assignments are pinned to the top — a deadline that
// slipped past is the one thing a student must not have to scroll for.

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { format } from 'date-fns'
import {
  dayKey, parseDayKey, colorOf, metaFor, withAlpha, formatRange,
} from '../../utils/calendar/eventModel.js'
import { ProgressUnderline } from './ProgressOutline.jsx'

export default function AgendaView({
  occurrences, calendarById, progressOf, locale, t, onOpenEvent,
}) {
  const today = dayKey()

  const { overdue, groups } = useMemo(() => {
    const late = []
    const map = new Map()
    for (const occ of occurrences) {
      const isLate = occ.date < today && !occ.event.completed &&
        (occ.event.kind === 'assignment' || occ.event.kind === 'deadline')
      if (isLate) { late.push(occ); continue }
      if (occ.date < today) continue
      let list = map.get(occ.date)
      if (!list) { list = []; map.set(occ.date, list) }
      list.push(occ)
    }
    for (const list of map.values()) {
      list.sort((a, b) => (a.allDay === b.allDay ? a.startMin - b.startMin : a.allDay ? -1 : 1))
    }
    late.sort((a, b) => (a.date < b.date ? -1 : 1))
    return { overdue: late, groups: [...map.entries()].sort((a, b) => (a[0] < b[0] ? -1 : 1)) }
  }, [occurrences, today])

  if (!overdue.length && !groups.length) {
    return (
      <div style={{ padding: '48px 24px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
        {t('calendar.agendaEmpty')}
      </div>
    )
  }

  return (
    <div style={{ padding: '0 16px 12px' }}>
      {overdue.length > 0 && (
        <>
          <DayHeader label={t('calendar.overdue')} accent="#ef4444" />
          {overdue.map(occ => (
            <Row key={occ.key} occ={occ} calendarById={calendarById}
                 progressOf={progressOf} onOpenEvent={onOpenEvent} showDate locale={locale} />
          ))}
        </>
      )}

      {groups.map(([date, list]) => (
        <div key={date}>
          <DayHeader label={
            date === today
              ? t('calendar.today')
              : format(parseDayKey(date), 'EEEE, d. LLLL', { locale })
          } />
          {list.map(occ => (
            <Row key={occ.key} occ={occ} calendarById={calendarById}
                 progressOf={progressOf} onOpenEvent={onOpenEvent} locale={locale} />
          ))}
        </div>
      ))}
    </div>
  )
}

function DayHeader({ label, accent }) {
  return (
    <div style={{
      position: 'sticky', top: 0, zIndex: 2, padding: '10px 2px 6px',
      background: 'var(--bg-primary)', fontSize: 12, fontWeight: 700,
      letterSpacing: 0.3, textTransform: 'uppercase',
      color: accent ?? 'var(--text-secondary)',
    }}>
      {label}
    </div>
  )
}

function Row({ occ, calendarById, progressOf, onOpenEvent, showDate, locale }) {
  const { event } = occ
  const color = colorOf(event, calendarById)
  const meta = metaFor(event.kind)
  const progress = meta.ring ? progressOf?.(event.id) : null
  const time = event.all_day ? null : formatRange(event)

  return (
    <motion.button
      whileTap={{ scale: 0.98 }}
      transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
      onClick={() => onOpenEvent?.(occ)}
      style={{
        position: 'relative', display: 'flex', alignItems: 'center', gap: 10,
        width: '100%', textAlign: 'left', cursor: 'pointer', marginBottom: 6,
        padding: '10px 12px', borderRadius: 12,
        border: '0.5px solid var(--glass-card-stroke)',
        background: 'var(--glass-card-bg)',
        borderLeft: `3px solid ${color}`,
      }}
    >
      <span style={{ fontSize: 15 }}>{meta.icon}</span>
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 14, fontWeight: 650, color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          textDecoration: event.completed ? 'line-through' : 'none',
        }}>
          {event.title || '—'}
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 1 }}>
          {[
            showDate ? format(parseDayKey(occ.date), 'd. LLL', { locale }) : null,
            time,
            event.location,
            progress?.total ? `${progress.done}/${progress.total}` : null,
          ].filter(Boolean).join(' · ')}
        </span>
      </span>
      {progress && progress.total > 0 && (
        <span style={{
          width: 30, height: 30, borderRadius: '50%', flexShrink: 0,
          display: 'grid', placeItems: 'center', fontSize: 9.5, fontWeight: 700,
          color, background: withAlpha(color, 0.14),
        }}>
          {Math.round(progress.ratio * 100)}%
        </span>
      )}
      {progress && progress.total > 0 && (
        <ProgressUnderline progress={progress.ratio} color={color} />
      )}
    </motion.button>
  )
}
