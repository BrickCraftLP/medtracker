// Calendars sheet: which calendars are visible, plus create / edit / delete
// for the calendars themselves and their semesters.
//
// Visibility is deliberately device-local (localStorage, workspace-scoped):
// hiding a calendar is a viewing preference, not data. Syncing it would churn
// updated_at and have the phone and the laptop fight over it.

import { useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useData } from '../../context/DataContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useCalendarSettings } from '../../context/CalendarSettingsContext.jsx'
import { dayKey } from '../../utils/calendar/eventModel.js'
import LiquidSheet from '../Glass/LiquidSheet.jsx'
import GlassButton from '../Glass/GlassButton.jsx'
import SheetHeader from './WidgetConfig/SheetHeader.jsx'
import { Field, ChipGrid } from './WidgetConfig/controls.jsx'

const SWATCHES = ['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#8b5cf6', '#64748b']
const ICONS = ['🎓', '📚', '🧪', '🩺', '⚖️', '💻', '🎨', '🏛️']

const EXPAND = {
  initial: { height: 0, opacity: 0 },
  animate: { height: 'auto', opacity: 1 },
  exit: { height: 0, opacity: 0 },
  transition: { duration: 0.22, ease: [0.32, 0.72, 0, 1] },
  style: { overflow: 'hidden' },
}

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
    <LiquidSheet onClose={onClose}>
      <SheetHeader title={t('calendar.calendars')} onClose={onClose} />

      {calendars.map(cal => {
        const visible = !hidden.includes(cal.id)
        const isOpen = editing === cal.id
        return (
          <div key={cal.id} className="cm-item" style={{ '--pill-accent': cal.color }}>
            <div className="cm-row">
              <motion.button
                type="button"
                whileTap={{ scale: 0.85 }}
                className={`cm-check${visible ? ' is-on' : ''}`}
                onClick={() => onToggle(cal.id)}
                aria-label={t('calendar.toggleVisible')}
                aria-pressed={visible}
              >
                {visible && (
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round">
                    <path d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </motion.button>
              <span className="cm-row__icon">{cal.icon ?? '🎓'}</span>
              <span className="cm-row__name" style={{ opacity: visible ? 1 : 0.55 }}>{cal.name}</span>
              <button type="button" className="cm-link" onClick={() => setEditing(isOpen ? null : cal.id)}>
                {isOpen ? t('calendar.done') : t('calendar.editShort')}
              </button>
            </div>

            <AnimatePresence initial={false}>
              {isOpen && (
                <motion.div key="editor" {...EXPAND}>
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
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )
      })}

      <AnimatePresence initial={false} mode="wait">
        {editing === 'new' ? (
          <motion.div key="new" {...EXPAND}>
            <div className="cm-item">
              <CalendarEditor
                calendar={{ name: '', color: SWATCHES[0], icon: ICONS[0], kind: 'study', grade_scheme: 'at-de' }}
                semesters={[]}
                onSave={saveCalendar}
                onCancel={() => setEditing(null)}
                busy={busy}
                t={t}
              />
            </div>
          </motion.div>
        ) : (
          <motion.div key="add" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ marginTop: 6 }}>
            <GlassButton height={48} width="100%" onClick={() => setEditing('new')}>
              + {t('calendar.newCalendar')}
            </GlassButton>
          </motion.div>
        )}
      </AnimatePresence>
    </LiquidSheet>
  )
}

function CalendarEditor({
  calendar, semesters, onSave, onDelete, onCancel, onSaveSemester, onDeleteSemester, canDelete, busy, t,
}) {
  const [draft, setDraft] = useState(calendar)
  const patch = p => setDraft(prev => ({ ...prev, ...p }))

  return (
    <div className="cm-editor" style={{ '--pill-accent': draft.color, '--accent': draft.color }}>
      <Field label={t('calendar.calendarName')}>
        <input
          className="te-input"
          value={draft.name}
          onChange={e => patch({ name: e.target.value })}
          placeholder={t('calendar.calendarNamePlaceholder')}
        />
      </Field>

      <Field label={t('calendar.color')}>
        <div className="te-colors">
          {SWATCHES.map(c => (
            <motion.button
              key={c}
              type="button"
              whileTap={{ scale: 0.85 }}
              aria-label={c}
              className={`te-color cm-swatch${draft.color === c ? ' is-active' : ''}`}
              style={{ background: c, '--pill-accent': c }}
              onClick={() => patch({ color: c })}
            />
          ))}
        </div>
      </Field>

      <Field label={t('calendar.icon')}>
        <div className="te-emojis" style={{ minHeight: 0 }}>
          {ICONS.map(ic => (
            <motion.button
              key={ic}
              type="button"
              whileTap={{ scale: 0.8 }}
              className={`te-emoji${draft.icon === ic ? ' is-active' : ''}`}
              onClick={() => patch({ icon: ic })}
            >{ic}</motion.button>
          ))}
        </div>
      </Field>

      <Field label={t('calendar.gradeScheme')}>
        <ChipGrid
          columns={2}
          value={draft.grade_scheme}
          onChange={grade_scheme => patch({ grade_scheme })}
          options={[
            { value: 'at-de', label: t('calendar.gradeScheme.atde') },
            { value: 'pct', label: t('calendar.gradeScheme.pct') },
          ]}
        />
      </Field>

      {calendar.id && (
        <SemesterList
          calendarId={calendar.id}
          semesters={semesters}
          onSave={onSaveSemester}
          onDelete={onDeleteSemester}
          t={t}
        />
      )}

      <div className="wc-actions">
        {onCancel && (
          <GlassButton height={46} style={{ flex: 1 }} onClick={onCancel}>
            {t('calendar.cancel')}
          </GlassButton>
        )}
        {onDelete && canDelete && (
          <GlassButton height={46} style={{ flex: 1 }} variant="danger" disabled={busy} onClick={onDelete}>
            {t('calendar.deleteCalendar')}
          </GlassButton>
        )}
        <GlassButton height={46} style={{ flex: 1 }} variant="primary"
                     disabled={busy || !draft.name.trim()} onClick={() => onSave(draft)}>
          {t('calendar.save')}
        </GlassButton>
      </div>
    </div>
  )
}

function SemesterList({ calendarId, semesters, onSave, onDelete, t }) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState({ name: '', start_date: dayKey(), end_date: dayKey() })
  const invalid = !draft.name.trim() || draft.end_date < draft.start_date

  async function save() {
    if (invalid) return
    await onSave({ ...draft, name: draft.name.trim(), calendar_id: calendarId, display_order: semesters.length })
    setDraft({ name: '', start_date: dayKey(), end_date: dayKey() })
    setAdding(false)
  }

  return (
    <div className="wc-field">
      <div className="wc-field__head">
        <div className="wc-label">{t('calendar.semesters')}</div>
        {!adding && (
          <button type="button" className="cm-link" onClick={() => setAdding(true)}>
            + {t('calendar.newSemester')}
          </button>
        )}
      </div>

      {semesters.map(s => (
        <div key={s.id} className="cm-semester">
          <span className="cm-semester__name">{s.name}</span>
          <span className="cm-semester__dates">{s.start_date} → {s.end_date}</span>
          <button type="button" className="cm-semester__remove" onClick={() => onDelete(s.id)}
                  aria-label={t('calendar.delete')}>×</button>
        </div>
      ))}

      <AnimatePresence initial={false}>
        {adding && (
          <motion.div key="add-semester" {...EXPAND}>
            <div className="cm-semester-form">
              <input className="te-input" autoFocus value={draft.name} placeholder={t('calendar.semesterPlaceholder')}
                     onChange={e => setDraft({ ...draft, name: e.target.value })} />
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="te-input" type="date" value={draft.start_date}
                       onChange={e => setDraft({ ...draft, start_date: e.target.value })} />
                <input className="te-input" type="date" value={draft.end_date}
                       onChange={e => setDraft({ ...draft, end_date: e.target.value })} />
              </div>
              <div className="wc-actions" style={{ marginTop: 0 }}>
                <GlassButton height={40} fontSize={14} style={{ flex: 1 }} onClick={() => setAdding(false)}>
                  {t('calendar.cancel')}
                </GlassButton>
                <GlassButton height={40} fontSize={14} style={{ flex: 1 }} variant="primary" disabled={invalid} onClick={save}>
                  {t('calendar.save')}
                </GlassButton>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
