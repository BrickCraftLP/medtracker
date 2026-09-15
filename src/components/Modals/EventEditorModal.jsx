// Create / edit a calendar event. Replaces ScheduleSessionModal — a study
// block is now just kind='study' with a topic.
//
// Opened either empty (the + button), or pre-filled from a drag on the grid:
// Apple-style, the block is already drawn and the sheet only asks for a name.

import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../context/DataContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useWorkspace } from '../../context/WorkspaceContext.jsx'
import SubtaskList from '../Calendar/SubtaskList.jsx'
import LinkChips from '../Calendar/LinkChips.jsx'
import LiquidSheet from '../Glass/LiquidSheet.jsx'
import GlassButton from '../Glass/GlassButton.jsx'
import SheetHeader from './WidgetConfig/SheetHeader.jsx'
import { Field, Pill, ToggleRow } from './WidgetConfig/controls.jsx'
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

  // The sheet takes the colour of the calendar the event lands in, so the
  // accent (active pills, switch, primary button) previews where it goes.
  const calendarColor = calendars.find(c => c.id === form.calendar_id)?.color

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

  const accentVars = calendarColor ? { '--accent': calendarColor, '--pill-accent': calendarColor } : undefined

  return (
    <LiquidSheet onClose={onClose}>
      <div style={accentVars}>
        <SheetHeader
          eyebrow={`${metaFor(form.kind).icon} ${t(metaFor(form.kind).labelKey)}`}
          title={isEdit ? t('calendar.editEvent') : t('calendar.newEvent')}
          onClose={onClose}
        />

        <input
          className="te-input"
          autoFocus={!isEdit}
          value={form.title}
          placeholder={t('calendar.titlePlaceholder')}
          onChange={e => patch({ title: e.target.value })}
          style={{ height: 48, marginBottom: 20, fontSize: 17, fontWeight: 600 }}
        />

        <Field label={t('calendar.kindLabel')}>
          <div className="wc-pills">
            {KINDS.map(kind => (
              <Pill key={kind} active={form.kind === kind} onClick={() => patch({ kind })}>
                {metaFor(kind).icon} {t(metaFor(kind).labelKey)}
              </Pill>
            ))}
          </div>
        </Field>

        <Field label={t('calendar.calendarLabel')}>
          <div className="wc-pills">
            {calendars.map(cal => (
              <Pill key={cal.id} active={form.calendar_id === cal.id} color={cal.color}
                    onClick={() => patch({ calendar_id: cal.id, semester_id: null })}>
                {cal.icon ?? '🎓'} {cal.name}
              </Pill>
            ))}
          </div>
        </Field>

        <ToggleRow label={t('calendar.allDay')} value={form.all_day} onChange={all_day => patch({ all_day })} />

        <div className="ee-when">
          <Field label={t('calendar.date')}>
            <input
              className="te-input" type="date" value={form.start_date}
              onChange={e => patch({ start_date: e.target.value, end_date: e.target.value })}
            />
          </Field>
          {!form.all_day && (
            <>
              <Field label={t('calendar.from')}>
                <input className="te-input" type="time" value={hhmm(form.start_time)}
                       onChange={e => setStartTime(e.target.value)} />
              </Field>
              <Field label={t('calendar.to')}>
                <input className="te-input" type="time" value={hhmm(form.end_time)}
                       onChange={e => patch({ end_time: `${e.target.value}:00` })} />
              </Field>
            </>
          )}
        </div>

        <Field label={t('calendar.repeat')}>
          <div className="wc-pills">
            {REPEATS.map(r => (
              <Pill key={r.key} active={repeatKey === r.key} onClick={() => setRepeat(r.key)}>
                {t(`calendar.repeat.${r.key}`)}
              </Pill>
            ))}
          </div>
        </Field>

        {form.rrule && (
          <Field label={t('calendar.repeatUntil')}>
            <input className="te-input" type="date" value={form.rrule_until ?? ''}
                   onChange={e => patch({ rrule_until: e.target.value || null })} />
          </Field>
        )}

        <Field label={t('calendar.reminders')}>
          <div className="wc-pills">
            {REMINDER_CHOICES.map(min => {
              const active = form.reminders.includes(min)
              return (
                <Pill
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
                </Pill>
              )
            })}
          </div>
        </Field>

        {(form.kind === 'study' || form.kind === 'exam') && topics.length > 0 && (
          <Field label={t('calendar.topic')}>
            <div className="wc-pills">
              {topics.map(tp => (
                <Pill key={tp.id} active={form.topic_id === tp.id} color={tp.color_from}
                      onClick={() => patch({ topic_id: form.topic_id === tp.id ? null : tp.id })}>
                  <span className="wc-pill__emoji">{tp.emoji}</span>{tp.name}
                </Pill>
              ))}
            </div>
          </Field>
        )}

        {calendarSemesters.length > 0 && (
          <Field label={t('calendar.semester')}>
            <div className="wc-pills">
              {calendarSemesters.map(s => (
                <Pill key={s.id} active={form.semester_id === s.id}
                      onClick={() => patch({ semester_id: form.semester_id === s.id ? null : s.id })}>
                  {s.name}
                </Pill>
              ))}
            </div>
          </Field>
        )}

        <Field label={t('calendar.location')}>
          <input
            className="te-input" value={form.location ?? ''} placeholder={t('calendar.locationPlaceholder')}
            onChange={e => patch({ location: e.target.value })}
          />
        </Field>

        <Field label={t('calendar.links')}>
          <LinkChips links={form.links} onChange={links => patch({ links })} t={t} />
        </Field>

        <Field label={t('calendar.note')}>
          <input
            className="te-input" value={form.notes ?? ''} placeholder={t('calendar.notePlaceholder')}
            onChange={e => patch({ notes: e.target.value })}
          />
        </Field>

        {isEdit && (
          <div className="wc-sub" style={{ marginBottom: 20 }}>
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

        {!form.calendar_id && (
          <div className="wc-hint" style={{ marginBottom: 10, color: 'var(--wrong)', textAlign: 'center' }}>
            {t('calendar.noCalendars')}
          </div>
        )}

        {isEdit && form.kind === 'study' && form.topic_id && (
          <GlassButton height={46} width="100%" style={{ marginBottom: 10 }} onClick={startSession}>
            ▶ {t('calendar.start')}
          </GlassButton>
        )}

        <div className="wc-actions">
          {isEdit && (
            <GlassButton height={48} style={{ flex: 1 }} variant="danger" disabled={saving} onClick={handleDelete}>
              {t('calendar.delete')}
            </GlassButton>
          )}
          <GlassButton height={48} style={{ flex: 1 }} variant="primary"
                       disabled={saving || !form.calendar_id} onClick={handleSave}>
            {t('calendar.save')}
          </GlassButton>
        </div>
      </div>
    </LiquidSheet>
  )
}
