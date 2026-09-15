// Every exam of one study, grouped by semester: scores, weighted average,
// ECTS, countdown, and what is still needed to hit the semester's target.
//
// Not a tab — reached from the calendar toolbar — so the navbar cap stays put.

import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useData } from '../context/DataContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useWorkspace } from '../context/WorkspaceContext.jsx'
import {
  schemeOf, weightedAverage, ectsSummary, examCounts, neededGrade,
  currentSemester, daysUntil, formatGrade, isGraded, hasPassed, gradeValue,
} from '../utils/calculations/examCalcs.js'
import { progressByEvent } from '../utils/calculations/eventProgressCalcs.js'
import { dayKey } from '../utils/calendar/eventModel.js'
import { defaultCalendarFor } from '../utils/calendar/calendarScope.js'
import { wsKey } from '../services/workspaceScope.js'

const ExamEditorModal = lazy(() => import('../components/Modals/ExamEditorModal.jsx'))
const GradeChart = lazy(() => import('../components/Calendar/GradeChart.jsx'))

const CAL_KEY = 'mt_exams_cal'

export default function ExamsScreen() {
  const { calendars, semesters, exams, todos, dataLoading } = useData()
  const { t } = useLanguage()
  const { activeWorkspaceId } = useWorkspace()
  const navigate = useNavigate()
  const today = dayKey()

  const [calendarId, setCalendarId] = useState(() => {
    try { return localStorage.getItem(wsKey(CAL_KEY)) } catch { return null }
  })
  const [sheet, setSheet] = useState(null)

  const activeCalendar = useMemo(
    () => calendars.find(c => c.id === calendarId) ?? defaultCalendarFor(calendars, activeWorkspaceId),
    [calendars, calendarId, activeWorkspaceId],
  )

  useEffect(() => {
    if (activeCalendar?.id) {
      try { localStorage.setItem(wsKey(CAL_KEY), activeCalendar.id) } catch {}
    }
  }, [activeCalendar?.id])

  const scheme = schemeOf(activeCalendar)
  const progressMap = useMemo(() => progressByEvent(todos), [todos])

  const calendarSemesters = useMemo(
    () => semesters
      .filter(s => s.calendar_id === activeCalendar?.id)
      .sort((a, b) => (a.start_date < b.start_date ? 1 : -1)),
    [semesters, activeCalendar?.id],
  )

  const calendarExams = useMemo(
    () => exams.filter(x => x.calendar_id === activeCalendar?.id),
    [exams, activeCalendar?.id],
  )

  const [openSemester, setOpenSemester] = useState(null)
  const current = useMemo(() => currentSemester(calendarSemesters, today), [calendarSemesters, today])
  const expanded = openSemester ?? current?.id ?? 'none'

  // Exams with no semester still have to appear somewhere.
  const groups = useMemo(() => {
    const out = calendarSemesters.map(s => ({
      semester: s,
      exams: calendarExams.filter(x => x.semester_id === s.id),
    }))
    const loose = calendarExams.filter(x => !x.semester_id || !calendarSemesters.some(s => s.id === x.semester_id))
    if (loose.length) out.push({ semester: null, exams: loose })
    return out
  }, [calendarSemesters, calendarExams])

  const nextExam = useMemo(
    () => calendarExams
      .filter(x => x.exam_date && x.exam_date >= today && !isGraded(x))
      .sort((a, b) => (a.exam_date < b.exam_date ? -1 : 1))[0] ?? null,
    [calendarExams, today],
  )

  if (dataLoading) {
    return (
      <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
        <div style={{ padding: '20px 16px 0' }}>
          <div className="skeleton" style={{ width: 140, height: 28, borderRadius: 8, marginBottom: 18 }} />
          <div className="skeleton" style={{ width: '100%', height: 220, borderRadius: 18 }} />
        </div>
      </div>
    )
  }

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      {/* .scroll-container already pads for the navbar (bottom pill or side
          rail, see index.css), so this only adds breathing room. */}
      <div style={{ padding: '20px 16px 24px' }}>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
          <button
            onClick={() => navigate('/calendar')}
            aria-label={t('calendar.title')}
            style={{
              width: 30, height: 30, borderRadius: '50%', display: 'grid', placeItems: 'center',
              cursor: 'pointer', border: '0.5px solid var(--glass-card-stroke)', background: 'var(--glass-card-bg)',
            }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                 stroke="var(--text-secondary)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>
          <h1 style={{ margin: 0, flex: 1, fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
            {t('exams.title')}
          </h1>
        </div>

        {calendars.length > 1 && (
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 14 }}>
            {calendars.map(cal => (
              <button
                key={cal.id}
                onClick={() => setCalendarId(cal.id)}
                className="pill"
                style={{
                  padding: '5px 12px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                  border: `1.5px solid ${activeCalendar?.id === cal.id ? cal.color : 'var(--border)'}`,
                  background: activeCalendar?.id === cal.id ? cal.color : 'var(--bg-tertiary)',
                  color: activeCalendar?.id === cal.id ? '#fff' : 'var(--text-secondary)',
                }}
              >
                {cal.icon ?? '🎓'} {cal.name}
              </button>
            ))}
          </div>
        )}

        {nextExam && (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', marginBottom: 14,
            borderRadius: 14, background: 'var(--glass-card-bg)', border: '0.5px solid var(--glass-card-stroke)',
          }}>
            <span style={{ fontSize: 22 }}>⏳</span>
            <span style={{ flex: 1, minWidth: 0 }}>
              <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)', letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 600 }}>
                {t('exams.next')}
              </span>
              <span style={{ display: 'block', fontSize: 15, fontWeight: 700, color: 'var(--text-primary)' }}>
                {nextExam.title}
              </span>
            </span>
            <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
              {t('exams.inDays', { n: String(daysUntil(nextExam.exam_date, today)) })}
            </span>
          </div>
        )}

        {!activeCalendar && (
          <EmptyState text={t('exams.noCalendar')} />
        )}

        {activeCalendar && groups.length === 0 && (
          <EmptyState text={t('exams.empty')} />
        )}

        {groups.map(({ semester, exams: list }) => {
          const key = semester?.id ?? 'none'
          const open = expanded === key
          const average = weightedAverage(list, scheme)
          const ects = ectsSummary(list, scheme)
          const counts = examCounts(list, scheme)
          const need = neededGrade(list, semester?.target_grade, scheme)

          return (
            <div key={key} style={{ marginBottom: 12 }}>
              <button
                onClick={() => setOpenSemester(open ? 'none' : key)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10, width: '100%', cursor: 'pointer',
                  padding: '12px 14px', borderRadius: open ? '14px 14px 0 0' : 14, textAlign: 'left',
                  background: 'var(--glass-card-bg)', border: '0.5px solid var(--glass-card-stroke)',
                }}
              >
                <span style={{ flex: 1, minWidth: 0 }}>
                  <span style={{ display: 'block', fontSize: 15.5, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {semester?.name ?? t('exams.noSemester')}
                  </span>
                  {semester && (
                    <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 1 }}>
                      {semester.start_date} → {semester.end_date}
                    </span>
                  )}
                </span>
                {average != null && (
                  <span style={{ fontSize: 18, fontWeight: 800, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
                    {scheme.lowerIsBetter ? average.toFixed(2) : `${Math.round(average)}%`}
                  </span>
                )}
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
                     stroke="var(--text-tertiary)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"
                     style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
                  <path d="M9 5l7 7-7 7" />
                </svg>
              </button>

              <AnimatePresence initial={false}>
                {open && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div style={{
                      padding: '12px 14px 14px', borderRadius: '0 0 14px 14px',
                      background: 'var(--bg-secondary)', border: '0.5px solid var(--border)', borderTop: 'none',
                    }}>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 8, marginBottom: 12 }}>
                        <Stat label={t('exams.average')} value={average == null ? '—' : (scheme.lowerIsBetter ? average.toFixed(2) : `${Math.round(average)}%`)} />
                        <Stat label={t('exams.ects')} value={ects.planned ? `${ects.earned}/${ects.planned}` : '—'} />
                        <Stat label={t('exams.graded')} value={`${counts.graded}/${counts.total}`} />
                        <Stat label={t('exams.passed')} value={counts.graded ? `${counts.passed}/${counts.graded}` : '—'} />
                      </div>

                      {need && (
                        <div style={{
                          padding: '9px 12px', marginBottom: 12, borderRadius: 10,
                          background: need.impossible ? 'rgba(239, 68, 68, 0.12)' : 'var(--accent-light)',
                          fontSize: 12.5, color: 'var(--text-primary)', lineHeight: 1.4,
                        }}>
                          {need.impossible
                            ? t('exams.targetOutOfReach')
                            : t('exams.needed', {
                              grade: need.needed.toFixed(2),
                              n: String(need.openCount),
                              target: String(semester.target_grade),
                            })}
                        </div>
                      )}

                      {list.filter(x => gradeValue(x, scheme) != null).length >= 2 && (
                        <Suspense fallback={null}>
                          <GradeChart exams={list} scheme={scheme} target={semester?.target_grade} />
                        </Suspense>
                      )}

                      {list.map(exam => (
                        <ExamRow
                          key={exam.id}
                          exam={exam}
                          scheme={scheme}
                          today={today}
                          progress={exam.event_id ? progressMap.get(exam.event_id) : null}
                          onOpen={() => setSheet({ exam })}
                          t={t}
                        />
                      ))}

                      <motion.button
                        whileTap={{ scale: 0.97 }}
                        className="btn btn-secondary"
                        style={{ width: '100%', marginTop: 8 }}
                        onClick={() => setSheet({
                          exam: {
                            calendar_id: activeCalendar.id,
                            semester_id: semester?.id ?? null,
                            exam_date: today,
                          },
                        })}
                      >
                        {t('exams.newExam')}
                      </motion.button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )
        })}

        {activeCalendar && groups.length === 0 && (
          <motion.button
            whileTap={{ scale: 0.97 }}
            className="btn btn-primary"
            style={{ width: '100%' }}
            onClick={() => setSheet({ exam: { calendar_id: activeCalendar.id, exam_date: today } })}
          >
            {t('exams.newExam')}
          </motion.button>
        )}
      </div>

      <Suspense fallback={null}>
        <AnimatePresence>
          {sheet && (
            <ExamEditorModal
              key="exam"
              exam={sheet.exam}
              scheme={scheme}
              onClose={() => setSheet(null)}
            />
          )}
        </AnimatePresence>
      </Suspense>
    </div>
  )
}

function ExamRow({ exam, scheme, today, progress, onOpen, t }) {
  const grade = formatGrade(exam, scheme)
  const passed = hasPassed(exam, scheme)
  const days = daysUntil(exam.exam_date, today)
  const pct = exam.score != null && exam.max_score
    ? Math.max(0, Math.min(1, Number(exam.score) / Number(exam.max_score)))
    : null

  return (
    <button
      onClick={onOpen}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left',
        cursor: 'pointer', marginBottom: 6, padding: '10px 12px', borderRadius: 11,
        background: 'var(--card-bg)', border: '0.5px solid var(--border)',
      }}
    >
      <span style={{ flex: 1, minWidth: 0 }}>
        <span style={{
          display: 'block', fontSize: 14, fontWeight: 650, color: 'var(--text-primary)',
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {exam.title}
        </span>
        <span style={{ display: 'block', fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 1 }}>
          {[
            exam.exam_date,
            days != null && days >= 0 && !grade ? t('exams.inDays', { n: String(days) }) : null,
            exam.ects ? `${exam.ects} ECTS` : null,
            progress?.total ? `${progress.done}/${progress.total}` : null,
          ].filter(Boolean).join(' · ')}
        </span>
        {pct != null && (
          <span style={{
            display: 'block', height: 3, marginTop: 5, borderRadius: 3,
            background: 'var(--border)', overflow: 'hidden',
          }}>
            <span style={{
              display: 'block', height: '100%', width: `${pct * 100}%`,
              background: passed === false ? 'var(--wrong)' : 'var(--correct)',
            }} />
          </span>
        )}
      </span>

      {grade && (
        <span style={{
          minWidth: 40, textAlign: 'center', padding: '4px 8px', borderRadius: 8,
          fontSize: 13.5, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
          color: passed === false ? 'var(--wrong)' : 'var(--correct)',
          background: passed === false ? 'rgba(239,68,68,0.12)' : 'rgba(34,197,94,0.12)',
        }}>
          {grade}
        </span>
      )}
    </button>
  )
}

function Stat({ label, value }) {
  return (
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 15.5, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
        {value}
      </div>
      <div style={{ fontSize: 9.5, color: 'var(--text-tertiary)', letterSpacing: 0.3, textTransform: 'uppercase', fontWeight: 600 }}>
        {label}
      </div>
    </div>
  )
}

function EmptyState({ text }) {
  return (
    <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 14 }}>
      {text}
    </div>
  )
}
