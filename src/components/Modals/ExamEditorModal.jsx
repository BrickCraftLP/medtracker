// Create / edit an exam and its result.
//
// An exam is its own row rather than a flag on the calendar event: the grade
// outlives the slot in the timetable, and the exams page has to be able to
// list it without loading the calendar at all. `event_id` links the two when
// the exam does have a slot.

import { useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { useData } from '../../context/DataContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { dayKey } from '../../utils/calendar/eventModel.js'
import { gradeValue } from '../../utils/calculations/examCalcs.js'

const KINDS = ['exam', 'midterm', 'final', 'quiz', 'oral', 'paper', 'lab']
const STATUSES = ['planned', 'studying', 'written', 'graded']

export default function ExamEditorModal({ exam, scheme, onClose }) {
  const { semesters, topics, events, upsertExam, removeExam, upsertEvent } = useData()
  const { t } = useLanguage()
  const isEdit = !!exam?.id

  const [form, setForm] = useState(() => ({
    title: '',
    kind: 'exam',
    status: 'planned',
    exam_date: dayKey(),
    weight: 1,
    attempt: 1,
    ...exam,
  }))
  const [saving, setSaving] = useState(false)
  const [alsoOnCalendar, setAlsoOnCalendar] = useState(false)

  const patch = p => setForm(prev => ({ ...prev, ...p }))

  const calendarSemesters = useMemo(
    () => semesters.filter(s => s.calendar_id === form.calendar_id),
    [semesters, form.calendar_id],
  )

  const linkedEvent = useMemo(
    () => events.find(e => e.id === form.event_id) ?? null,
    [events, form.event_id],
  )

  async function handleSave() {
    if (saving || !form.title.trim()) return
    setSaving(true)
    try {
      const numeric = gradeValue(form, scheme)
      let eventId = form.event_id ?? null

      // Putting the exam on the calendar is a checkbox, not a second flow:
      // most exams want a block, and the block is what carries the checklist
      // that drives its progress ring.
      if (alsoOnCalendar && !eventId && form.exam_date) {
        const created = await upsertEvent({
          calendar_id: form.calendar_id,
          semester_id: form.semester_id ?? null,
          topic_id: form.topic_id ?? null,
          kind: 'exam',
          title: form.title.trim(),
          start_date: form.exam_date,
          start_time: '09:00:00',
          end_date: form.exam_date,
          end_time: '10:00:00',
          all_day: false,
          links: [],
          reminders: [],
        })
        eventId = created.id
      }

      await upsertExam({
        ...form,
        title: form.title.trim(),
        event_id: eventId,
        weight: Number(form.weight) || 1,
        ects: form.ects === '' || form.ects == null ? null : Number(form.ects),
        score: form.score === '' || form.score == null ? null : Number(form.score),
        max_score: form.max_score === '' || form.max_score == null ? null : Number(form.max_score),
        grade_numeric: numeric,
        notes: form.notes?.trim() || null,
      })
      onClose()
    } catch (e) {
      console.error('ExamEditorModal save failed:', e)
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (saving) return
    setSaving(true)
    try {
      await removeExam(exam.id)
      onClose()
    } catch (e) {
      console.error('ExamEditorModal delete failed:', e)
      setSaving(false)
    }
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
        <button
          onClick={onClose} aria-label="close"
          style={{
            position: 'absolute', top: 16, right: 16, width: 30, height: 30, borderRadius: '50%',
            display: 'grid', placeItems: 'center', cursor: 'pointer', border: 'none', background: 'var(--bg-tertiary)',
          }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
               stroke="var(--text-secondary)" strokeWidth="2.4" strokeLinecap="round">
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <h2 style={{ margin: '0 0 18px', fontSize: 21, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.4 }}>
          {isEdit ? t('exams.editExam') : t('exams.newExam')}
        </h2>

        <input
          className="input" autoFocus={!isEdit} value={form.title}
          placeholder={t('exams.titlePlaceholder')}
          onChange={e => patch({ title: e.target.value })}
          style={{ marginBottom: 14, fontSize: 16, fontWeight: 600 }}
        />

        <FieldLabel>{t('exams.kind')}</FieldLabel>
        <ChipRow style={{ marginBottom: 14 }}>
          {KINDS.map(k => (
            <Chip key={k} active={form.kind === k} onClick={() => patch({ kind: k })}>
              {t(`exams.kind.${k}`)}
            </Chip>
          ))}
        </ChipRow>

        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <div style={{ flex: 1 }}>
            <FieldLabel>{t('exams.date')}</FieldLabel>
            <input className="input" type="date" value={form.exam_date ?? ''}
                   onChange={e => patch({ exam_date: e.target.value })} />
          </div>
          <div style={{ width: 92 }}>
            <FieldLabel>{t('exams.ects')}</FieldLabel>
            <input className="input" type="number" inputMode="decimal" step="0.5" min="0"
                   value={form.ects ?? ''} onChange={e => patch({ ects: e.target.value })} />
          </div>
        </div>

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

        {topics.length > 0 && (
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

        <FieldLabel>{t('exams.status')}</FieldLabel>
        <ChipRow style={{ marginBottom: 14 }}>
          {STATUSES.map(s => (
            <Chip key={s} active={form.status === s} onClick={() => patch({ status: s })}>
              {t(`exams.status.${s}`)}
            </Chip>
          ))}
        </ChipRow>

        <FieldLabel>{t('exams.result')}</FieldLabel>
        <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
          <input
            className="input" type="number" inputMode="decimal" placeholder={t('exams.score')}
            value={form.score ?? ''} onChange={e => patch({ score: e.target.value })} style={{ flex: 1 }}
          />
          <input
            className="input" type="number" inputMode="decimal" placeholder={t('exams.maxScore')}
            value={form.max_score ?? ''} onChange={e => patch({ max_score: e.target.value })} style={{ flex: 1 }}
          />
          <input
            className="input" placeholder={t('exams.grade')}
            value={form.grade ?? ''} onChange={e => patch({ grade: e.target.value })} style={{ width: 84 }}
          />
        </div>

        <FieldLabel>{t('exams.weight')}</FieldLabel>
        <input
          className="input" type="number" inputMode="decimal" step="0.5" min="0"
          value={form.weight ?? 1} onChange={e => patch({ weight: e.target.value })}
          style={{ marginBottom: 14 }}
        />

        <FieldLabel>{t('calendar.note')}</FieldLabel>
        <input
          className="input" value={form.notes ?? ''} placeholder={t('exams.notesPlaceholder')}
          onChange={e => patch({ notes: e.target.value })} style={{ marginBottom: 16 }}
        />

        {!form.event_id && (
          <label style={{
            display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16,
            fontSize: 13.5, color: 'var(--text-secondary)', cursor: 'pointer',
          }}>
            <input
              type="checkbox" checked={alsoOnCalendar}
              onChange={e => setAlsoOnCalendar(e.target.checked)}
              style={{ width: 17, height: 17, accentColor: 'var(--accent)' }}
            />
            {t('exams.addToCalendar')}
          </label>
        )}

        {linkedEvent && (
          <div style={{ marginBottom: 16, fontSize: 12.5, color: 'var(--text-tertiary)' }}>
            {t('exams.linkedTo', { title: linkedEvent.title })}
          </div>
        )}

        <motion.button
          whileTap={{ scale: 0.97 }} className="btn btn-primary" style={{ width: '100%' }}
          disabled={saving || !form.title.trim()} onClick={handleSave}
        >
          {t('calendar.save')}
        </motion.button>

        {isEdit && (
          <motion.button whileTap={{ scale: 0.97 }} className="btn btn-danger"
                         style={{ width: '100%', marginTop: 8 }} disabled={saving} onClick={handleDelete}>
            {t('calendar.delete')}
          </motion.button>
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
      onClick={onClick} className="pill"
      style={{
        padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
        border: `1.5px solid ${active ? accent : 'var(--border)'}`,
        background: active ? accent : 'var(--bg-tertiary)',
        color: active ? '#fff' : 'var(--text-secondary)', whiteSpace: 'nowrap',
      }}
    >{children}</button>
  )
}

function FieldLabel({ children }) {
  return (
    <div style={{
      fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)',
      letterSpacing: 0.3, marginBottom: 6,
    }}>{children}</div>
  )
}
