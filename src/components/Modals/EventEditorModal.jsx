// Create / edit a calendar event. Replaces ScheduleSessionModal — a study
// block is now just kind='study' with a topic.
//
// Opened either empty (the + button), or pre-filled from a drag on the grid:
// Apple-style, the block is already drawn and the sheet only asks for a name.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useWorkspace } from '../../context/WorkspaceContext.jsx'
import SubtaskList from '../Calendar/SubtaskList.jsx'
import LinkChips from '../Calendar/LinkChips.jsx'
import {
  KINDS, metaFor, buildEvent, hhmm, dayKey, minutesOf, timeOf, DEFAULT_EVENT_MINUTES,
} from '../../utils/calendar/eventModel.js'
import { buildRrule, parseRrule } from '../../utils/calendar/recurrence.js'
import { defaultCalendarFor } from '../../utils/calendar/calendarScope.js'

const REPEATS = [
  { key: 'none', freq: null, interval: 1 },
  { key: 'daily', freq: 'DAILY', interval: 1 },
  { key: 'weekly', freq: 'WEEKLY', interval: 1 },
  { key: 'biweekly', freq: 'WEEKLY', interval: 2 },
  { key: 'monthly', freq: 'MONTHLY', interval: 1 },
]

const REMINDER_CHOICES = [0, 5, 10, 30, 60, 24 * 60]

export default function EventEditorModal({ draft, occurrence, onClose }) {
  const {
    calendars, semesters, topics, todos,
    upsertEvent, removeEvent, upsertTodo, upsertTodos, removeTodo,
  } = useData()
  const { t } = useLanguage()
  const { activeWorkspaceId } = useWorkspace()
  const navigate = useNavigate()

  const existing = occurrence?.event ?? null
  const isEdit = !!existing?.id
  const base = existing ?? draft ?? {}

  const [form, setForm] = useState(() => ({
    ...base,
    kind: base.kind ?? 'event',
    title: base.title ?? '',
    calendar_id: base.calendar_id ?? defaultCalendarFor(calendars, activeWorkspaceId)?.id ?? null,
    start_date: base.start_date ?? dayKey(),
    start_time: base.start_time ?? '09:00:00',
    end_time: base.end_time ?? '10:00:00',
    end_date: base.end_date ?? base.start_date ?? dayKey(),
    all_day: !!base.all_day,
    location: base.location ?? '',
    notes: base.notes ?? '',
    topic_id: base.topic_id ?? null,
    semester_id: base.semester_id ?? null,
    links: base.links ?? [],
    reminders: base.reminders ?? [],
    rrule: base.rrule ?? null,
    rrule_until: base.rrule_until ?? null,
  }))
  const [saving, setSaving] = useState(false)

  const patch = p => setForm(prev => ({ ...prev, ...p }))

  const calendarSemesters = useMemo(
    () => semesters.filter(s => s.calendar_id === form.calendar_id),
    [semesters, form.calendar_id],
  )

  const repeatKey = useMemo(() => {
    const rule = parseRrule(form.rrule)
    if (!rule) return 'none'
    const match = REPEATS.find(r => r.freq === rule.freq && r.interval === rule.interval)
    return match?.key ?? 'custom'
  }, [form.rrule])

  function setRepeat(key) {
    const choice = REPEATS.find(r => r.key === key)
    if (!choice?.freq) { patch({ rrule: null, rrule_until: null }); return }
    patch({ rrule: buildRrule({ freq: choice.freq, interval: choice.interval }) })
  }

  // Keep the end after the start: nudging the start time drags the end along
  // by the same amount rather than producing a negative-length block.
  function setStartTime(value) {
    const oldStart = minutesOf(form.start_time) ?? 0
    const oldEnd = minutesOf(form.end_time) ?? oldStart + DEFAULT_EVENT_MINUTES
    const next = minutesOf(`${value}:00`) ?? oldStart
    patch({ start_time: `${value}:00`, end_time: timeOf(next + Math.max(5, oldEnd - oldStart)) })
  }

  async function handleSave() {
    if (saving) return
    setSaving(true)
    try {
      const row = buildEvent(existing ?? {}, {
        ...form,
        title: form.title.trim() || t(metaFor(form.kind).labelKey),
      })
      await upsertEvent(row)
      onClose()
    } catch (e) {
      console.error('EventEditorModal save failed:', e)
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (saving) return
    setSaving(true)
    try {
      await removeEvent(existing.id)
      onClose()
    } catch (e) {
      console.error('EventEditorModal delete failed:', e)
      setSaving(false)
    }
  }

  function startSession() {
    // Same hand-off ScheduleSessionModal used: the session screen starts from
    // the route state.
    navigate('/session', { state: { topicId: form.topic_id, pauseBetweenExercises: false } })
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-sheet"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 340 }}
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 40 }}
      >
        <CloseButton onClose={onClose} />
        <h2 style={{ margin: '0 0 18px', fontSize: 21, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.4 }}>
          {isEdit ? t('calendar.editEvent') : t('calendar.newEvent')}
        </h2>

        <input
          className="input"
          autoFocus={!isEdit}
          value={form.title}
          placeholder={t('calendar.titlePlaceholder')}
          onChange={e => patch({ title: e.target.value })}
          style={{ marginBottom: 14, fontSize: 16, fontWeight: 600 }}
        />

        <FieldLabel>{t('calendar.kindLabel')}</FieldLabel>
        <ChipRow style={{ marginBottom: 14 }}>
          {KINDS.map(kind => (
            <Chip key={kind} active={form.kind === kind} onClick={() => patch({ kind })}>
              {metaFor(kind).icon} {t(metaFor(kind).labelKey)}
            </Chip>
          ))}
        </ChipRow>

        <FieldLabel>{t('calendar.calendarLabel')}</FieldLabel>
        <ChipRow style={{ marginBottom: 14 }}>
          {calendars.map(cal => (
            <Chip key={cal.id} active={form.calendar_id === cal.id} color={cal.color}
                  onClick={() => patch({ calendar_id: cal.id, semester_id: null })}>
              {cal.icon ?? '🎓'} {cal.name}
            </Chip>
          ))}
        </ChipRow>

        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
          <FieldLabel style={{ margin: 0, flex: 1 }}>{t('calendar.allDay')}</FieldLabel>
          <button
            onClick={() => patch({ all_day: !form.all_day })}
            style={{
              width: 44, height: 26, borderRadius: 9999, cursor: 'pointer', border: 'none',
              background: form.all_day ? 'var(--accent)' : 'var(--bg-tertiary)',
              position: 'relative', transition: 'background 0.2s',
            }}
          >
            <span style={{
              position: 'absolute', top: 3, left: form.all_day ? 21 : 3,
              width: 20, height: 20, borderRadius: '50%', background: '#fff',
              transition: 'left 0.18s cubic-bezier(0.32,0.72,0,1)', boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
            }} />
          </button>
        </div>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>{t('calendar.date')}</FieldLabel>
            <input
              className="input" type="date" value={form.start_date}
              onChange={e => patch({ start_date: e.target.value, end_date: e.target.value })}
            />
          </div>
          {!form.all_day && (
            <>
              <div style={{ width: 96 }}>
                <FieldLabel>{t('calendar.from')}</FieldLabel>
                <input className="input" type="time" value={hhmm(form.start_time)}
                       onChange={e => setStartTime(e.target.value)} />
              </div>
              <div style={{ width: 96 }}>
                <FieldLabel>{t('calendar.to')}</FieldLabel>
                <input className="input" type="time" value={hhmm(form.end_time)}
                       onChange={e => patch({ end_time: `${e.target.value}:00` })} />
              </div>
            </>
          )}
        </div>

        <FieldLabel>{t('calendar.repeat')}</FieldLabel>
        <ChipRow style={{ marginBottom: 14 }}>
          {REPEATS.map(r => (
            <Chip key={r.key} active={repeatKey === r.key} onClick={() => setRepeat(r.key)}>
              {t(`calendar.repeat.${r.key}`)}
            </Chip>
          ))}
        </ChipRow>

        {form.rrule && (
          <div style={{ marginBottom: 14 }}>
            <FieldLabel>{t('calendar.repeatUntil')}</FieldLabel>
            <input className="input" type="date" value={form.rrule_until ?? ''}
                   onChange={e => patch({ rrule_until: e.target.value || null })} />
          </div>
        )}

        <FieldLabel>{t('calendar.reminders')}</FieldLabel>
        <ChipRow style={{ marginBottom: 14 }}>
          {REMINDER_CHOICES.map(min => {
            const active = form.reminders.includes(min)
            return (
              <Chip
                key={min}
                active={active}
                onClick={() => patch({
                  reminders: active
                    ? form.reminders.filter(m => m !== min)
                    : [...form.reminders, min].sort((a, b) => a - b),
                })}
              >
                {min === 0 ? t('calendar.reminderAtStart')
                  : min >= 60 ? t('calendar.reminderHours', { n: String(min / 60) })
                  : t('calendar.reminderMinutes', { n: String(min) })}
              </Chip>
            )
          })}
        </ChipRow>

        {(form.kind === 'study' || form.kind === 'exam') && topics.length > 0 && (
          <>
            <FieldLabel>{t('calendar.topic')}</FieldLabel>
            <ChipRow style={{ marginBottom: 14 }}>
              {topics.map(tp => (
                <Chip key={tp.id} active={form.topic_id === tp.id} color={tp.color_from}
                      onClick={() => patch({ topic_id: form.topic_id === tp.id ? null : tp.id })}>
                  {tp.emoji} {tp.name}
                </Chip>
              ))}
            </ChipRow>
          </>
        )}

        {calendarSemesters.length > 0 && (
          <>
            <FieldLabel>{t('calendar.semester')}</FieldLabel>
            <ChipRow style={{ marginBottom: 14 }}>
              {calendarSemesters.map(s => (
                <Chip key={s.id} active={form.semester_id === s.id}
                      onClick={() => patch({ semester_id: form.semester_id === s.id ? null : s.id })}>
                  {s.name}
                </Chip>
              ))}
            </ChipRow>
          </>
        )}

        <FieldLabel>{t('calendar.location')}</FieldLabel>
        <input
          className="input" value={form.location ?? ''} placeholder={t('calendar.locationPlaceholder')}
          onChange={e => patch({ location: e.target.value })} style={{ marginBottom: 14 }}
        />

        <FieldLabel>{t('calendar.links')}</FieldLabel>
        <div style={{ marginBottom: 14 }}>
          <LinkChips links={form.links} onChange={links => patch({ links })} t={t} />
        </div>

        <FieldLabel>{t('calendar.note')}</FieldLabel>
        <input
          className="input" value={form.notes ?? ''} placeholder={t('calendar.notePlaceholder')}
          onChange={e => patch({ notes: e.target.value })} style={{ marginBottom: 16 }}
        />

        {isEdit && (
          <div style={{ marginBottom: 16 }}>
            <SubtaskList
              todos={todos}
              eventId={existing.id}
              topicId={form.topic_id}
              dueDate={form.start_date}
              onUpsert={upsertTodo}
              onUpsertMany={upsertTodos}
              onRemove={removeTodo}
              t={t}
            />
          </div>
        )}

        <motion.button
          whileTap={{ scale: 0.97 }} className="btn btn-primary"
          style={{ width: '100%' }} disabled={saving || !form.calendar_id} onClick={handleSave}
        >
          {t('calendar.save')}
        </motion.button>

        {isEdit && form.kind === 'study' && form.topic_id && (
          <motion.button whileTap={{ scale: 0.97 }} className="btn btn-secondary"
                         style={{ width: '100%', marginTop: 8 }} onClick={startSession}>
            {t('calendar.start')}
          </motion.button>
        )}

        {isEdit && (
          <motion.button whileTap={{ scale: 0.97 }} className="btn btn-danger"
                         style={{ width: '100%', marginTop: 8 }} disabled={saving} onClick={handleDelete}>
            {t('calendar.delete')}
          </motion.button>
        )}

        {!form.calendar_id && (
          <div style={{ marginTop: 10, fontSize: 12.5, color: 'var(--wrong)', textAlign: 'center' }}>
            {t('calendar.noCalendars')}
          </div>
        )}
      </motion.div>
    </div>
  )
}

function ChipRow({ children, style }) {
  return <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', ...style }}>{children}</div>
}

function Chip({ children, active, color, onClick }) {
  const accent = color ?? 'var(--accent)'
  return (
    <button
      onClick={onClick}
      className="pill"
      style={{
        padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        border: `1.5px solid ${active ? accent : 'var(--border)'}`,
        background: active ? accent : 'var(--bg-tertiary)',
        color: active ? '#fff' : 'var(--text-secondary)',
        whiteSpace: 'nowrap',
      }}
    >
      {children}
    </button>
  )
}

function FieldLabel({ children, style }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
      letterSpacing: 0.3, marginBottom: 6, ...style,
    }}>{children}</div>
  )
}

function CloseButton({ onClose }) {
  return (
    <button
      onClick={onClose} aria-label="close"
      style={{
        position: 'absolute', top: 16, right: 16, width: 30, height: 30, borderRadius: '50%',
        display: 'grid', placeItems: 'center', cursor: 'pointer', border: 'none',
        background: 'var(--bg-tertiary)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="var(--text-secondary)" strokeWidth="2.4" strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
  )
}
