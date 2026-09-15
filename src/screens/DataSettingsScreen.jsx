import { useState, useRef, useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { NavDirectionContext } from '../context/navDirection.js'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import { useData } from '../context/DataContext.jsx'
import { useWorkspace } from '../context/WorkspaceContext.jsx'
import {
  getTopics, getAllSessions, getAllExercises,
  getTodos, getWidgetConfigs, importData,
  getCalendars, getSemesters, getCalendarEvents, getExams,
} from '../services/dbInterface.js'
import {
  indexStats, downloadIndexFile, linkIndexFile, unlinkIndexFile,
  isIndexFileLinked, canLinkIndexFile,
} from '../services/localIndex.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { getLocale } from '../i18n/index.js'
import Switch from '../components/Common/Switch.jsx'
import { GlassCard } from '../components/Common/Glass.jsx'

const EXPORT_VERSION = '1.5'

function formatSyncTime(date, t, lang) {
  if (!date) return t('sync.never')
  const now = new Date()
  const diff = Math.floor((now - date) / 1000)
  if (diff < 60) return t('sync.justNow')
  if (diff < 3600) return t('sync.minAgo', { n: Math.floor(diff / 60) })
  const locale = getLocale(lang)
  const today = now.toDateString() === date.toDateString()
  const yesterday = new Date(now - 86400000).toDateString() === date.toDateString()
  const time = date.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' })
  if (today) return t('sync.today', { time })
  if (yesterday) return t('sync.yesterday', { time })
  return date.toLocaleDateString(locale, { day: '2-digit', month: '2-digit' }) + `, ${time}`
}

function toColumnar(arr) {
  if (!arr.length) return { cols: [], rows: [] }
  const cols = Object.keys(arr[0])
  return { cols, rows: arr.map(r => cols.map(c => r[c])) }
}

function fromColumnar({ cols, rows }) {
  return rows.map(r => Object.fromEntries(cols.map((c, i) => [c, r[i]])))
}

function stripUserId(arr) {
  return arr.map(({ user_id: _u, ...rest }) => rest)
}

function restoreUserId(arr, userId) {
  return arr.map(r => ({ ...r, user_id: userId }))
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 16px 6px' }}>
        {title}
      </p>
      <GlassCard cornerRadius={16} style={{ overflow: 'hidden' }}>{children}</GlassCard>
    </div>
  )
}

function Row({ label, value, onTap, destructive, right, divider = true, icon }) {
  return (
    <>
      <motion.div
        whileTap={onTap ? { scale: 0.98, backgroundColor: 'var(--bg-tertiary)' } : undefined}
        onClick={onTap}
        style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 12, cursor: onTap ? 'pointer' : 'default' }}
      >
        {icon && (
          <div style={{ width: 30, height: 30, borderRadius: 8, background: destructive ? 'rgba(239,68,68,0.15)' : 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {icon}
          </div>
        )}
        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: destructive ? '#ef4444' : 'var(--text-primary)' }}>{label}</span>
        {value && <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{value}</span>}
        {right}
        {onTap && !right && (
          <svg width="7" height="12" viewBox="0 0 7 12" fill="var(--text-tertiary)">
            <path d="M1 1l5 5-5 5" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        )}
      </motion.div>
      {divider && <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />}
    </>
  )
}

function ToggleRow({ label, checked, onToggle, divider = true }) {
  return (
    <>
      <div
        onClick={onToggle}
        style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 12, cursor: 'pointer' }}
      >
        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        <Switch checked={checked} onChange={() => onToggle && onToggle()} />
      </div>
      {divider && <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />}
    </>
  )
}

export default function DataSettingsScreen() {
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { user } = useAuth()
  const { syncing, lastSyncTime, isOnline, pendingChanges, syncNow } = useData()
  const { activeWorkspace } = useWorkspace()
  const { t, language } = useLanguage()
  const locale = getLocale(language)

  const [exporting, setExporting] = useState(false)
  const [exportDone, setExportDone] = useState(false)
  const [exportTopics, setExportTopics] = useState(true)
  const [exportWidgets, setExportWidgets] = useState(true)
  const [exportData, setExportData] = useState(true)
  const [exportCalendar, setExportCalendar] = useState(true)

  const [importing, setImporting] = useState(false)
  const [importPreview, setImportPreview] = useState(null)
  const [importError, setImportError] = useState(null)
  const [importDone, setImportDone] = useState(false)
  const [importPending, setImportPending] = useState(null)

  const fileRef = useRef()

  // Local search index: what it holds, and the file it can keep up to date.
  const [indexStatus, setIndexStatus] = useState(null)
  const [indexLinked, setIndexLinked] = useState(false)
  const [indexBusy, setIndexBusy] = useState(false)

  useEffect(() => {
    if (!user?.id || !activeWorkspace?.id) return
    let cancelled = false
    ;(async () => {
      const [stats, linked] = await Promise.all([
        indexStats(user.id, activeWorkspace.id).catch(() => null),
        isIndexFileLinked().catch(() => false),
      ])
      if (cancelled) return
      setIndexStatus(stats)
      setIndexLinked(linked)
    })()
    return () => { cancelled = true }
  }, [user?.id, activeWorkspace?.id])

  const wsSlug = (activeWorkspace?.name ?? 'workspace')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'workspace'

  async function handleIndexExport() {
    setIndexBusy(true)
    try {
      await downloadIndexFile(
        user.id,
        activeWorkspace.id,
        `medtracker-index-${wsSlug}-${new Date().toISOString().slice(0, 10)}.jsonl`,
      )
    } catch (e) {
      console.error('index export failed:', e)
    } finally { setIndexBusy(false) }
  }

  async function handleIndexLink() {
    setIndexBusy(true)
    try {
      if (indexLinked) {
        await unlinkIndexFile()
        setIndexLinked(false)
      } else {
        // Must run straight from the tap: the file picker needs the gesture.
        const ok = await linkIndexFile(
          user.id,
          activeWorkspace.id,
          `medtracker-index-${wsSlug}.jsonl`,
        )
        setIndexLinked(ok)
      }
    } catch (e) {
      // Cancelling the picker throws; that is not an error worth reporting.
      if (e?.name !== 'AbortError') console.error('index link failed:', e)
    } finally { setIndexBusy(false) }
  }

  const noneSelected = !exportTopics && !exportWidgets && !exportData && !exportCalendar

  async function handleExport() {
    setExporting(true)
    setExportDone(false)
    try {
      const [topics, sessions, exercises, todos, widgets, calendars, semesters, events, exams] = await Promise.all([
        exportTopics  ? getTopics(user.id)        : Promise.resolve([]),
        exportData    ? getAllSessions(user.id)    : Promise.resolve([]),
        exportData    ? getAllExercises(user.id)   : Promise.resolve([]),
        exportData    ? getTodos(user.id)          : Promise.resolve([]),
        exportWidgets ? getWidgetConfigs(user.id)  : Promise.resolve([]),
        exportCalendar ? getCalendars(user.id)       : Promise.resolve([]),
        exportCalendar ? getSemesters(user.id)       : Promise.resolve([]),
        exportCalendar ? getCalendarEvents(user.id)  : Promise.resolve([]),
        exportCalendar ? getExams(user.id)           : Promise.resolve([]),
      ])
      const cleanSessions = sessions.map(({ user_id: _u, topics: _t, ...rest }) => rest)
      const cleanExercises = stripUserId(exercises)
      const payload = {
        version: EXPORT_VERSION,
        app: 'MedTracker',
        exported_at: new Date().toISOString(),
        workspace: activeWorkspace ? { id: activeWorkspace.id, name: activeWorkspace.name } : null,
        data: {
          ...(exportTopics  && { topics: stripUserId(topics) }),
          ...(exportData    && {
            sessions:  toColumnar(cleanSessions),
            exercises: toColumnar(cleanExercises),
            todos:     stripUserId(todos),
          }),
          ...(exportWidgets && { widgets: stripUserId(widgets) }),
          ...(exportCalendar && {
            calendars: stripUserId(calendars),
            semesters: stripUserId(semesters),
            events:    stripUserId(events),
            exams:     stripUserId(exams),
          }),
        },
      }
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const wsSlug = (activeWorkspace?.name ?? 'workspace').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
      a.download = `medtracker-export-${wsSlug}-${new Date().toISOString().slice(0, 10)}.json`
      a.click()
      URL.revokeObjectURL(url)
      setExportDone(true)
      setTimeout(() => setExportDone(false), 3000)
    } catch (e) {
      console.error(e)
    } finally {
      setExporting(false)
    }
  }

  function handleFileChange(e) {
    const file = e.target.files?.[0]
    if (!file) return
    setImportError(null)
    setImportPreview(null)
    setImportPending(null)
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const parsed = JSON.parse(ev.target.result)
        if (parsed.app !== 'MedTracker' || !parsed.data) { setImportError(t('settings.err.invalidFile')); return }
        const d = parsed.data
        const normalised = {
          topics:    Array.isArray(d.topics)    ? d.topics    : [],
          sessions:  Array.isArray(d.sessions)  ? d.sessions  : (d.sessions?.cols ? fromColumnar(d.sessions)  : []),
          exercises: Array.isArray(d.exercises) ? d.exercises : (d.exercises?.cols ? fromColumnar(d.exercises) : []),
          todos:     Array.isArray(d.todos)     ? d.todos     : [],
          widgets:   Array.isArray(d.widgets)   ? d.widgets   : [],
          calendars: Array.isArray(d.calendars) ? d.calendars : [],
          semesters: Array.isArray(d.semesters) ? d.semesters : [],
          events:    Array.isArray(d.events)    ? d.events    : [],
          exams:     Array.isArray(d.exams)     ? d.exams     : [],
        }
        setImportPreview({
          topics: normalised.topics.length, sessions: normalised.sessions.length,
          exercises: normalised.exercises.length, todos: normalised.todos.length,
          widgets: normalised.widgets.length, exported_at: parsed.exported_at,
          sourceWorkspaceName: parsed.workspace?.name ?? null,
        })
        setImportPending(normalised)
      } catch { setImportError(t('settings.err.fileRead')) }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  async function handleImportConfirm() {
    if (!importPending) return
    setImporting(true)
    try {
      const uid = user.id
      await importData(uid, {
        topics:    restoreUserId(importPending.topics,    uid),
        sessions:  restoreUserId(importPending.sessions,  uid),
        exercises: restoreUserId(importPending.exercises, uid),
        todos:     restoreUserId(importPending.todos,     uid),
        widgets:   restoreUserId(importPending.widgets,   uid),
      })
      setImportPreview(null)
      setImportPending(null)
      setImportDone(true)
      setTimeout(() => setImportDone(false), 3000)
    } catch (e) {
      console.error(e)
      setImportError(t('settings.err.importFailed', { msg: e.message ?? '?' }))
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 60px' }}>

        {/* Back button */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => { setDirection(-1); navigate(-1) }}
          style={{
            background: 'rgba(0,0,0,0.18)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '0.5px solid rgba(255,255,255,0.22)',
            borderRadius: 10,
            padding: '7px 12px',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
          {t('btn.back')}
        </motion.button>

        <h1 style={{ margin: '0 0 30px', fontSize: 34, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          {t('settings.data')}
        </h1>

        {/* Cloud sync */}
        <Section title={t('settings.sync')}>
          <Row
            label={t('settings.status')}
            divider
            right={<span style={{ fontSize: 13, color: isOnline ? '#22c55e' : '#ef4444', fontWeight: 600 }}>{isOnline ? t('settings.online') : t('settings.offline')}</span>}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M6.5 20Q4.22 20 2.61 18.43 1 16.85 1 14.58q0-1.95 1.17-3.48 1.18-1.53 3.08-1.95.51-2.18 2.19-3.66Q9.13 4 11.38 4q2.57 0 4.34 1.77 1.78 1.78 1.78 4.35v.38q1.7.13 2.75 1.28Q21.3 12.93 21.3 14.6q0 1.77-1.28 2.89Q18.73 18.6 17 18.6"
                  stroke={isOnline ? '#22c55e' : '#ef4444'} strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
            }
          />
          <Row
            label={t('settings.lastSync')}
            divider
            right={<span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{formatSyncTime(lastSyncTime, t, language)}</span>}
            icon={
              <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-tertiary)">
                <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67V7z"/>
              </svg>
            }
          />
          {pendingChanges > 0 && (
            <Row
              label={pendingChanges === 1 ? t('settings.pending', { n: pendingChanges }) : t('settings.pendingPlural', { n: pendingChanges })}
              divider
              right={<span style={{ fontSize: 12, background: '#f59e0b', color: 'white', borderRadius: 8, padding: '2px 8px', fontWeight: 700 }}>{pendingChanges}</span>}
              icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>}
            />
          )}
          <Row
            label={isOnline ? t('settings.syncNow') : t('settings.syncOffline')}
            divider={false}
            onTap={syncing || !isOnline ? undefined : syncNow}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill={isOnline ? 'var(--accent)' : 'var(--text-tertiary)'}><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>}
            right={syncing ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)' }} /> : undefined}
          />
        </Section>

        {/* Export */}
        <Section title={t('settings.export')}>
          <ToggleRow
            label={t('settings.topics')}
            checked={exportTopics}
            onToggle={() => setExportTopics(v => !v)}
          />
          <ToggleRow
            label={t('settings.widgets')}
            checked={exportWidgets}
            onToggle={() => setExportWidgets(v => !v)}
          />
          <ToggleRow
            label={t('settings.exportData')}
            checked={exportData}
            onToggle={() => setExportData(v => !v)}
          />
          <ToggleRow
            label={t('settings.exportCalendar')}
            checked={exportCalendar}
            onToggle={() => setExportCalendar(v => !v)}
          />
          <Row
            label={t('settings.export')}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill={noneSelected ? 'var(--text-tertiary)' : 'var(--accent)'}><path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/></svg>}
            onTap={exporting || noneSelected ? undefined : handleExport}
            divider={false}
            right={
              exporting
                ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)' }} />
                : exportDone
                ? <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>{t('settings.exportSaved')}</span>
                : noneSelected
                ? <span style={{ fontSize: 13, color: 'var(--text-tertiary)' }}>{t('settings.exportNone')}</span>
                : <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>JSON</span>
            }
          />
        </Section>

        {/* Local search index */}
        <Section title={t('settings.index')}>
          <Row
            label={t('settings.indexDocs')}
            divider
            right={<span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{indexStatus?.count ?? '—'}</span>}
          />
          <Row
            label={t('settings.indexExport')}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M19 9h-4V3H9v6H5l7 7 7-7zm-8 2V5h2v6h1.17L12 13.17 9.83 11H11zm-6 7h14v2H5v-2z"/></svg>}
            onTap={indexBusy ? undefined : handleIndexExport}
            divider={canLinkIndexFile()}
            right={<span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>JSONL</span>}
          />
          {canLinkIndexFile() && (
            <Row
              label={indexLinked ? t('settings.indexUnlink') : t('settings.indexLink')}
              divider={false}
              onTap={indexBusy ? undefined : handleIndexLink}
              right={
                <span style={{ fontSize: 13, color: indexLinked ? '#22c55e' : 'var(--text-secondary)' }}>
                  {indexLinked ? t('settings.indexLinked') : ''}
                </span>
              }
            />
          )}
        </Section>

        {/* Import */}
        <Section title={t('settings.import')}>
          <input ref={fileRef} type="file" accept=".json,application/json" style={{ display: 'none' }} onChange={handleFileChange} />
          <Row
            label={t('settings.import')}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M19 18H5v2h14v-2zm-6-8v6h-2V10H8l4-4 4 4h-3z"/></svg>}
            onTap={() => fileRef.current?.click()}
            divider={false}
            right={importDone ? <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>{t('settings.importDone')}</span> : <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>JSON</span>}
          />

          <AnimatePresence>
            {importError && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ padding: '10px 16px', background: 'rgba(239,68,68,0.10)', borderTop: '0.5px solid rgba(239,68,68,0.25)' }}>
                <p style={{ margin: 0, fontSize: 13, color: '#ef4444' }}>{importError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <AnimatePresence>
            {importPreview && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', borderTop: '0.5px solid var(--border)' }}>
                  <p style={{ margin: '0 0 4px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
                    {t('settings.importFrom', { date: importPreview.exported_at ? new Date(importPreview.exported_at).toLocaleDateString(locale) : '?' })}
                    {importPreview.sourceWorkspaceName ? ` (${importPreview.sourceWorkspaceName})` : ''}
                  </p>
                  <p style={{ margin: '0 0 8px', fontSize: 12, color: 'var(--text-tertiary)' }}>
                    {t('settings.importInto', { name: activeWorkspace?.name ?? '?' })}
                  </p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12 }}>
                    {[
                      { label: t('settings.topics'),   count: importPreview.topics },
                      { label: t('settings.sessions'),  count: importPreview.sessions },
                      { label: t('settings.todos'),     count: importPreview.todos },
                      { label: t('settings.widgets'),   count: importPreview.widgets },
                    ].map(({ label, count }) => (
                      <div key={label} style={{ background: 'var(--accent-muted)', borderRadius: 8, padding: '4px 10px', fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}>
                        {count} {label}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={() => { setImportPreview(null); setImportPending(null) }} style={{ flex: 1, padding: '10px', borderRadius: 12, border: 'none', background: 'var(--bg-tertiary)', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>
                      {t('btn.cancel')}
                    </motion.button>
                    <motion.button whileTap={{ scale: 0.95 }} onClick={handleImportConfirm} disabled={importing} style={{ flex: 2, padding: '10px', borderRadius: 12, border: 'none', background: 'var(--accent)', fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer' }}>
                      {importing ? t('settings.importing') : t('settings.importBtn')}
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

      </div>
    </div>
  )
}
