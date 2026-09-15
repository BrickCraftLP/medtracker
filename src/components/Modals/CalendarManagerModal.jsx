// Calendars sheet: which calendars are visible, plus create / edit / delete
// for the calendars themselves and their semesters.
//
// Visibility is deliberately device-local (localStorage, workspace-scoped):
// hiding a calendar is a viewing preference, not data. Syncing it would churn
// updated_at and have the phone and the laptop fight over it.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { useData } from '../../context/DataContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useCalendarSettings } from '../../context/CalendarSettingsContext.jsx'
import { dayKey } from '../../utils/calendar/eventModel.js'

const SWATCHES = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b']
const ICONS = ['🎓', '📚', '🧪', '🩺', '⚖️', '💻', '🎨', '🏛️']

export default function CalendarManagerModal({ hidden, onToggle, onClose }) {
  const { calendars, semesters, events, upsertCalendar, removeCalendar, upsertSemester, removeSemester } = useData()
  const { t } = useLanguage()
  const { shareAcrossWorkspaces } = useCalendarSettings()
  const [editing, setEditing] = useState(null) // calendar id | 'new'
  const [busy, setBusy] = useState(false)

  async function saveCalendar(draft) {
    if (!draft.name.trim() || busy) return
    setBusy(true)
    try {
      await upsertCalendar({
        ...draft,
        name: draft.name.trim(),
        display_order: draft.display_order ?? calendars.length,
        // With sharing switched on, a new calendar is expected to show up
        // everywhere; the settings screen can narrow it afterwards.
        shared_all: draft.id ? draft.shared_all : shareAcrossWorkspaces,
      })
      setEditing(null)
    } catch (e) {
      console.error('CalendarManagerModal save failed:', e)
    } finally { setBusy(false) }
  }

  async function deleteCalendar(cal) {
    const count = events.filter(e => e.calendar_id === cal.id).length
    if (!confirm(t('calendar.deleteCalendarConfirm', { count: String(count) }))) return
    setBusy(true)
    try {
      await removeCalendar(cal.id)
      setEditing(null)
    } catch (e) {
      console.error('CalendarManagerModal delete failed:', e)
    } finally { setBusy(false) }
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
          {t('calendar.calendars')}
        </h2>

        {calendars.map(cal => (
          <div key={cal.id} style={{ marginBottom: 8 }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              borderRadius: 12, background: 'var(--bg-tertiary)',
            }}>
              <button
                onClick={() => onToggle(cal.id)}
                aria-label={t('calendar.toggleVisible')}
                style={{
                  width: 20, height: 20, borderRadius: 6, cursor: 'pointer', flexShrink: 0,
                  border: `2px solid ${cal.color}`,
                  background: hidden.includes(cal.id) ? 'transparent' : cal.color,
                }}
              />
              <span style={{ fontSize: 15 }}>{cal.icon ?? '🎓'}</span>
              <span style={{
                flex: 1, minWidth: 0, fontSize: 14.5, fontWeight: 600, color: 'var(--text-primary)',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {cal.name}
              </span>
              <button
                onClick={() => setEditing(editing === cal.id ? null : cal.id)}
                style={{
                  border: 'none', background: 'transparent', cursor: 'pointer',
                  fontSize: 12.5, fontWeight: 600, color: 'var(--accent)',
                }}
              >
                {editing === cal.id ? t('calendar.done') : t('calendar.editShort')}
              </button>
            </div>

            {editing === cal.id && (
              <CalendarEditor
                calendar={cal}
                semesters={semesters.filter(s => s.calendar_id === cal.id)}
                onSave={saveCalendar}
                onDelete={() => deleteCalendar(cal)}
                onSaveSemester={upsertSemester}
                onDeleteSemester={removeSemester}
                canDelete={calendars.length > 1}
                busy={busy}
                t={t}
              />
            )}
          </div>
        ))}

        {editing === 'new' ? (
          <CalendarEditor
            calendar={{ name: '', color: SWATCHES[0], icon: ICONS[0], kind: 'study', grade_scheme: 'at-de' }}
            semesters={[]}
            onSave={saveCalendar}
            onCancel={() => setEditing(null)}
            busy={busy}
            t={t}
          />
        ) : (
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="btn btn-secondary"
            style={{ width: '100%', marginTop: 10 }}
            onClick={() => setEditing('new')}
          >
            {t('calendar.newCalendar')}
          </motion.button>
        )}
      </motion.div>
    </div>
  )
}

function CalendarEditor({
  calendar, semesters, onSave, onDelete, onCancel, onSaveSemester, onDeleteSemester, canDelete, busy, t,
}) {
  const [draft, setDraft] = useState(calendar)
  const patch = p => setDraft(prev => ({ ...prev, ...p }))

  return (
    <div style={{
      padding: '12px 12px 14px', marginTop: 4, borderRadius: 12,
      background: 'var(--bg-secondary)', border: '0.5px solid var(--border)',
    }}>
      <FieldLabel>{t('calendar.calendarName')}</FieldLabel>
      <input
        className="input"
        value={draft.name}
        onChange={e => patch({ name: e.target.value })}
        placeholder={t('calendar.calendarNamePlaceholder')}
        style={{ marginBottom: 10 }}
      />

      <FieldLabel>{t('calendar.color')}</FieldLabel>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {SWATCHES.map(c => (
          <button
            key={c}
            onClick={() => patch({ color: c })}
            aria-label={c}
            style={{
              width: 26, height: 26, borderRadius: '50%', background: c, cursor: 'pointer',
              border: draft.color === c ? '2.5px solid var(--text-primary)' : '2.5px solid transparent',
            }}
          />
        ))}
      </div>

      <FieldLabel>{t('calendar.icon')}</FieldLabel>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 10 }}>
        {ICONS.map(ic => (
          <button
            key={ic}
            onClick={() => patch({ icon: ic })}
            style={{
              width: 30, height: 30, borderRadius: 8, fontSize: 15, cursor: 'pointer',
              background: draft.icon === ic ? 'var(--accent-light)' : 'var(--bg-tertiary)',
              border: draft.icon === ic ? '1.5px solid var(--accent)' : '1.5px solid transparent',
            }}
          >{ic}</button>
        ))}
      </div>

      <FieldLabel>{t('calendar.gradeScheme')}</FieldLabel>
      <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
        {[['at-de', t('calendar.gradeScheme.atde')], ['pct', t('calendar.gradeScheme.pct')]].map(([key, label]) => (
          <button
            key={key}
            onClick={() => patch({ grade_scheme: key })}
            className="pill"
            style={{
              flex: 1, padding: '6px 0', fontSize: 12, fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${draft.grade_scheme === key ? 'var(--accent)' : 'var(--border)'}`,
              background: draft.grade_scheme === key ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: draft.grade_scheme === key ? '#fff' : 'var(--text-secondary)',
            }}
          >{label}</button>
        ))}
      </div>

      {calendar.id && (
        <SemesterList
          calendarId={calendar.id}
          semesters={semesters}
          onSave={onSaveSemester}
          onDelete={onDeleteSemester}
          t={t}
        />
      )}

      <motion.button
        whileTap={{ scale: 0.97 }}
        className="btn btn-primary"
        style={{ width: '100%', marginTop: 12 }}
        disabled={busy || !draft.name.trim()}
        onClick={() => onSave(draft)}
      >
        {t('calendar.save')}
      </motion.button>

      {onCancel && (
        <motion.button whileTap={{ scale: 0.97 }} className="btn btn-secondary"
                       style={{ width: '100%', marginTop: 8 }} onClick={onCancel}>
          {t('calendar.cancel')}
        </motion.button>
      )}
      {onDelete && canDelete && (
        <motion.button whileTap={{ scale: 0.97 }} className="btn btn-danger"
                       style={{ width: '100%', marginTop: 8 }} disabled={busy} onClick={onDelete}>
          {t('calendar.deleteCalendar')}
        </motion.button>
      )}
    </div>
  )
}

function SemesterList({ calendarId, semesters, onSave, onDelete, t }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', start_date: dayKey(), end_date: dayKey() })

  async function save() {
    if (!draft.name.trim() || draft.end_date < draft.start_date) return
    await onSave({ ...draft, name: draft.name.trim(), calendar_id: calendarId, display_order: semesters.length })
    setDraft({ name: '', start_date: dayKey(), end_date: dayKey() })
    setAdding(false)
  }

  return (
    <div style={{ marginTop: 6 }}>
      <FieldLabel>{t('calendar.semesters')}</FieldLabel>
      {semesters.map(s => (
        <div key={s.id} style={{
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', marginBottom: 4,
          borderRadius: 9, background: 'var(--bg-tertiary)', fontSize: 12.5,
        }}>
          <span style={{ flex: 1, fontWeight: 600, color: 'var(--text-primary)' }}>{s.name}</span>
          <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>
            {s.start_date} → {s.end_date}
          </span>
          <button
            onClick={() => onDelete(s.id)}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--wrong)', fontSize: 15 }}
            aria-label={t('calendar.delete')}
          >×</button>
        </div>
      ))}

      {adding ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 6 }}>
          <input className="input" value={draft.name} placeholder={t('calendar.semesterPlaceholder')}
                 onChange={e => setDraft({ ...draft, name: e.target.value })} />
          <div style={{ display: 'flex', gap: 6 }}>
            <input className="input" type="date" value={draft.start_date}
                   onChange={e => setDraft({ ...draft, start_date: e.target.value })} />
            <input className="input" type="date" value={draft.end_date}
                   onChange={e => setDraft({ ...draft, end_date: e.target.value })} />
          </div>
          <button className="btn btn-secondary" onClick={save}>{t('calendar.save')}</button>
        </div>
      ) : (
        <button
          onClick={() => setAdding(true)}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 0',
            fontSize: 12.5, fontWeight: 600, color: 'var(--accent)',
          }}
        >
          + {t('calendar.newSemester')}
        </button>
      )}
    </div>
  )
}

function CloseButton({ onClose }) {
  return (
    <button
      onClick={onClose}
      aria-label="close"
      style={{
        position: 'absolute', top: 16, right: 16, width: 30, height: 30, borderRadius: '50%',
        display: 'grid', placeItems: 'center', cursor: 'pointer',
        border: 'none', background: 'var(--bg-tertiary)',
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
           stroke="var(--text-secondary)" strokeWidth="2.4" strokeLinecap="round">
        <path d="M6 6l12 12M18 6L6 18" />
      </svg>
    </button>
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
