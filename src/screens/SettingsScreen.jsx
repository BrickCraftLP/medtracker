import { useState, useMemo, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import { NavDirectionContext } from '../context/navDirection.js'
import { useCircleReveal } from '../context/circleReveal.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { useGraphSettings } from '../context/GraphSettingsContext.jsx'
import { useNavLayout } from '../context/NavLayoutContext.jsx'
import { useNotificationSettings } from '../context/NotificationSettingsContext.jsx'
import { useCalendarSettings } from '../context/CalendarSettingsContext.jsx'
import NavbarEditor from '../components/Navigation/NavbarEditor.jsx'
import { useData } from '../context/DataContext.jsx'
import { useGoogleSync } from '../context/GoogleSyncContext.jsx'
import { usePin } from '../context/PinContext.jsx'
import { useUpdate } from '../context/UpdateContext.jsx'
import { useChangelog } from '../hooks/useChangelog.js'
import { useTour } from '../hooks/useTour.js'
import { MODES } from '../themes/index.js'
import { LANGUAGES, getLocale } from '../i18n/index.js'
import Switch from '../components/Common/Switch.jsx'
import BouncyAccordion from '../components/Common/BouncyAccordion.jsx'
import { getPushStatus, enablePush, disablePush } from '../services/pushService.js'
import {
  runBenchmark, downloadBenchmark, saveBenchmark, loadBenchmark, clearBenchmark,
  loadHistory, appendHistory,
} from '../utils/benchmark.js'

const EXPORT_VERSION = '1.8.2'
const BUILD_VERSION = '26I13.5F'
const LEAD_MINUTES = [0, 5, 10, 15, 30]
// Must match the check constraint on notification_prefs.exam_lead_days.
const EXAM_LEAD_DAYS = [1, 2, 3, 7]

const GLASS = { background: 'var(--glass-card-bg)', backdropFilter: 'blur(60px) saturate(200%)', WebkitBackdropFilter: 'blur(60px) saturate(200%)', borderRadius: 16, border: '0.5px solid var(--glass-card-stroke)', boxShadow: 'var(--glass-card-shadow)', overflow: 'hidden' }

// ── Entrance "unstacking" cascade — sections fall smoothly into place from
// above, staggered, instead of the page sliding in from the side. ──────────
const STACK_CONTAINER = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.04 } },
}
const STACK_ITEM = {
  hidden: { opacity: 0, y: -22 },
  show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 30 } },
}

function formatSyncTime(date, t, lang) {
  if (!date) return t('sync.never')
  const now = new Date()
  const diff = Math.floor((now - date) / 1000)
  if (diff < 60) return t('sync.justNow')
  if (diff < 3600) return t('sync.minAgo', { n: Math.floor(diff / 60) })
  const today = now.toDateString() === date.toDateString()
  const yesterday = new Date(now - 86400000).toDateString() === date.toDateString()
  const time = date.toLocaleTimeString(getLocale(lang), { hour: '2-digit', minute: '2-digit' })
  if (today) return t('sync.today', { time })
  if (yesterday) return t('sync.yesterday', { time })
  return time
}

// ── Icons — same inline-SVG convention as every other settings screen ──────
const ICON_LOCK = <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M12 1a5 5 0 00-5 5v3H6a2 2 0 00-2 2v9a2 2 0 002 2h12a2 2 0 002-2v-9a2 2 0 00-2-2h-1V6a5 5 0 00-5-5zm-3 8V6a3 3 0 116 0v3H9zm3 4a2 2 0 012 2c0 .74-.4 1.38-1 1.72V19h-2v-2.28c-.6-.34-1-.98-1-1.72a2 2 0 012-2z"/></svg>
const ICON_APPEARANCE = <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M12 22C6.49 22 2 17.51 2 12S6.49 2 12 2s10 4.04 10 9c0 3.31-2.69 6-6 6h-1.77c-.28 0-.5.22-.5.5 0 .12.05.23.13.33.41.47.64 1.06.64 1.67 0 1.38-1.12 2.5-2.5 2.5zm0-18c-4.41 0-8 3.59-8 8s3.59 8 8 8c.28 0 .5-.22.5-.5a.54.54 0 0 0-.14-.35c-.41-.46-.63-1.05-.63-1.65 0-1.38 1.12-2.5 2.5-2.5H16c2.21 0 4-1.79 4-4 0-3.86-3.59-7-8-7z"/><circle cx="6.5" cy="11.5" r="1.5"/><circle cx="9.5" cy="7.5" r="1.5"/><circle cx="14.5" cy="7.5" r="1.5"/><circle cx="17.5" cy="11.5" r="1.5"/></svg>
const ICON_CHART = <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/></svg>
const ICON_CLOUD = <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46A7.93 7.93 0 0020 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74A7.93 7.93 0 004 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
const ICON_GLOBE = <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zm6.93 6h-2.95c-.32-1.25-.78-2.45-1.38-3.56 1.84.63 3.37 1.91 4.33 3.56zM12 4.04c.83 1.2 1.48 2.53 1.91 3.96h-3.82c.43-1.43 1.08-2.76 1.91-3.96zM4.26 14C4.1 13.36 4 12.69 4 12s.1-1.36.26-2h3.38c-.08.66-.14 1.32-.14 2s.06 1.34.14 2H4.26zm.82 2h2.95c.32 1.25.78 2.45 1.38 3.56-1.84-.63-3.37-1.9-4.33-3.56zm2.95-8H5.08c.96-1.66 2.49-2.93 4.33-3.56C8.81 5.55 8.35 6.75 8.03 8zM12 19.96c-.83-1.2-1.48-2.53-1.91-3.96h3.82c-.43 1.43-1.08 2.76-1.91 3.96zM14.34 14H9.66c-.09-.66-.16-1.32-.16-2s.07-1.35.16-2h4.68c.09.65.16 1.32.16 2s-.07 1.34-.16 2zm.25 5.56c.6-1.11 1.06-2.31 1.38-3.56h2.95c-.96 1.65-2.49 2.93-4.33 3.56zM16.36 14c.08-.66.14-1.32.14-2s-.06-1.34-.14-2h3.38c.16.64.26 1.31.26 2s-.1 1.36-.26 2h-3.38z"/></svg>
const ICON_DOC = <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>
const ICON_NAV = <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M4 4h5v16H4a2 2 0 01-2-2V6a2 2 0 012-2zm7 0h9a2 2 0 012 2v12a2 2 0 01-2 2h-9V4z" opacity="0.9"/></svg>
const ICON_CALENDAR = <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10zM5 8V6h14v2H5z"/></svg>
const ICON_BELL = <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M12 22c1.1 0 2-.9 2-2h-4a2 2 0 002 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4a1.5 1.5 0 00-3 0v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
const ICON_ASSISTANT = <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M12 2a1 1 0 011 1v1.06A8.004 8.004 0 0120 12h1a1 1 0 010 2h-1a8.004 8.004 0 01-7 7.94V22a1 1 0 01-2 0v-1.06A8.004 8.004 0 014 14H3a1 1 0 010-2h1a8.004 8.004 0 017-7.94V3a1 1 0 011-1zm0 4a6 6 0 100 12 6 6 0 000-12zm-2.5 4.5h5v3h-5z"/></svg>
const ICON_CHEVRON_RIGHT =<svg width="7" height="12" viewBox="0 0 7 12" fill="none"><path d="M1 1l5 5-5 5" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg>

// A tappable row inside an accordion panel that pushes to an existing full
// settings page — this IS "opens in a new window" in this app: a route push
// through PageWrapper's slide transition, same as every settings sub-screen.
// Always shows a chevron since it always navigates.
function LinkOutRow({ label, value, icon, onTap }) {
  return (
    <motion.div
      whileTap={{ scale: 0.97, backgroundColor: 'var(--bg-tertiary)' }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      onClick={onTap}
      style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', gap: 10, borderRadius: 12, cursor: 'pointer', background: 'var(--bg-tertiary)' }}
    >
      {icon && <span style={{ display: 'flex', flexShrink: 0 }}>{icon}</span>}
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
      {value && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{value}</span>}
      {ICON_CHEVRON_RIGHT}
    </motion.div>
  )
}

// An inline action row (e.g. "Sync now") — no chevron, since it doesn't
// navigate anywhere; optional `right` overrides the value slot (e.g. a spinner).
function ActionRow({ label, value, right, onTap }) {
  return (
    <motion.div
      whileTap={onTap ? { scale: 0.98, backgroundColor: 'var(--bg-tertiary)' } : undefined}
      onClick={onTap}
      style={{ display: 'flex', alignItems: 'center', padding: '11px 14px', gap: 10, borderRadius: 12, cursor: onTap ? 'pointer' : 'default', background: 'var(--bg-tertiary)', opacity: onTap ? 1 : 0.6 }}
    >
      <span style={{ flex: 1, fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
      {right ?? (value && <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{value}</span>)}
    </motion.div>
  )
}

function InlineToggleRow({ label, description, checked, onChange }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', padding: '8px 2px', gap: 12 }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ display: 'block', fontSize: 14, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        {description && <span style={{ display: 'block', marginTop: 2, fontSize: 12, color: 'var(--text-tertiary)' }}>{description}</span>}
      </div>
      <Switch checked={checked} onChange={onChange} />
    </div>
  )
}

const SUBTEST_LABEL = {
  hashSerialize: 'settings.benchmark.hashSerialize',
  arrayReconcile: 'settings.benchmark.arrayReconcile',
  objectChurn: 'settings.benchmark.objectChurn',
  stringSearch: 'settings.benchmark.stringSearch',
  domLayout: 'settings.benchmark.domLayout',
  indexedDb: 'settings.benchmark.indexedDb',
  frameRate: 'settings.benchmark.frameRate',
}

function BenchmarkTrend({ history, t }) {
  if (history.length < 2) return null
  const max = Math.max(...history.map(entry => entry.score))
  const delta = history.at(-1).score - history.at(-2).score
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 7, borderTop: '0.5px solid var(--border)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
          {t('settings.benchmark.trend')}
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: delta > 0 ? '#22c55e' : delta < 0 ? '#ef4444' : 'var(--text-tertiary)' }}>
          {delta > 0 ? '+' : ''}{delta} {t('settings.benchmark.vsLast')}
        </span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 28 }}>
        {history.map((entry, index) => (
          <div
            key={entry.at + index}
            title={`${entry.score} · ${new Date(entry.at).toLocaleString()}`}
            style={{
              flex: 1, minWidth: 4, borderRadius: 2,
              height: `${Math.max(8, (entry.score / max) * 100)}%`,
              background: index === history.length - 1 ? 'var(--accent)' : 'var(--border)',
            }}
          />
        ))}
      </div>
    </div>
  )
}

function deviceSummary(device) {
  if (!device) return ''
  const parts = []
  if (device.model) parts.push(device.model)
  if (device.os?.name) parts.push([device.os.name, device.os.version].filter(Boolean).join(' '))
  if (device.browser?.name) parts.push([device.browser.name, device.browser.version].filter(Boolean).join(' '))
  return parts.join(' · ')
}

function BenchmarkResults({ result, history, onDownload, onClear, t }) {
  const compatibleHistory = history.filter(entry => (entry.suiteVersion ?? 1) === (result.suiteVersion ?? 1))
  const environmentRows = [
    result.environment?.storage && [t('settings.benchmark.storage'), `${result.environment.storage.usageMB ?? '?'} / ${result.environment.storage.quotaMB ?? '?'} MB`],
    result.environment?.network && [t('settings.benchmark.network'), [
      result.environment.network.effectiveType,
      result.environment.network.downlinkMbps != null ? `${result.environment.network.downlinkMbps} Mbps` : null,
      result.environment.network.rttMs != null ? `${result.environment.network.rttMs} ms RTT` : null,
    ].filter(Boolean).join(', ')],
    result.environment?.battery && [t('settings.benchmark.battery'), `${result.environment.battery.level}%${result.environment.battery.charging ? ' ⚡' : ''}`],
    result.environment?.viewport && [t('settings.benchmark.viewport'), `${result.environment.viewport.width}×${result.environment.viewport.height} @${result.environment.viewport.dpr}x`],
    result.environment?.timezone && [t('settings.benchmark.timezone'), result.environment.timezone],
  ].filter(Boolean)
  const liveRows = [
    ...Object.entries(result.live?.timings ?? {}).map(([key, value]) => [
      key,
      value.error ? `${t('settings.benchmark.failed')}: ${value.error}` : `${value.ms} ms${value.rows != null ? ` (${value.rows})` : ''}`,
      !!value.error,
    ]),
    ...Object.entries(result.live?.counts ?? {}).map(([key, value]) => [key, String(value), false]),
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4, padding: '12px 14px', borderRadius: 12, background: 'var(--bg-tertiary)' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 10 }}>
        <div>
          <span style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {t('settings.benchmark.score')} · v{result.suiteVersion ?? 1}
          </span>
          <span style={{ fontSize: 30, fontWeight: 800, color: 'var(--accent)', letterSpacing: -0.5, lineHeight: 1.1 }}>
            {result.score ?? '—'}
          </span>
          {result.durationMs != null && (
            <span style={{ display: 'block', marginTop: 2, fontSize: 11, color: 'var(--text-tertiary)' }}>
              {(result.durationMs / 1000).toFixed(1)} s · ±{result.variabilityPct ?? '?'}%
            </span>
          )}
        </div>
        <div style={{ textAlign: 'right', minWidth: 0 }}>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)' }}>
            {new Date(result.at).toLocaleString()}{result.buildVersion ? ` · ${result.buildVersion}` : ''}
          </span>
          <span style={{ display: 'block', fontSize: 11, color: 'var(--text-tertiary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {deviceSummary(result.device)}
          </span>
        </div>
      </div>

      {result.subtests && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 7, borderTop: '0.5px solid var(--border)' }}>
          {Object.entries(result.subtests).map(([key, value]) => (
            <div key={key} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{t(SUBTEST_LABEL[key] ?? key)}</span>
              <span style={{ color: value.error ? '#ef4444' : 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>
                {value.error
                  ? t('settings.benchmark.failed')
                  : key === 'frameRate'
                    ? `${value.fps} fps · ${value.score}`
                    : `${value.score}${value.variabilityPct != null ? ` · ±${value.variabilityPct}%` : ''}`}
              </span>
            </div>
          ))}
        </div>
      )}

      <BenchmarkTrend history={compatibleHistory} t={t} />

      {environmentRows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 7, borderTop: '0.5px solid var(--border)' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('settings.benchmark.environment')}</span>
          {environmentRows.map(([label, value]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      {liveRows.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3, paddingTop: 7, borderTop: '0.5px solid var(--border)' }}>
          <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>{t('settings.benchmark.live')}</span>
          {liveRows.map(([label, value, bad]) => (
            <div key={label} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12 }}>
              <span style={{ color: 'var(--text-secondary)' }}>{label}</span>
              <span style={{ color: bad ? '#ef4444' : 'var(--text-primary)', fontWeight: 600, textAlign: 'right' }}>{value}</span>
            </div>
          ))}
        </div>
      )}

      <div style={{ display: 'flex', gap: 16, paddingTop: 2 }}>
        <span onClick={onDownload} style={{ fontSize: 12, fontWeight: 600, color: 'var(--accent)', cursor: 'pointer' }}>{t('settings.benchmark.download')}</span>
        <span onClick={onClear} style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', cursor: 'pointer' }}>{t('settings.benchmark.clear')}</span>
      </div>
    </div>
  )
}

function SegmentedControl({ options, value, onChange }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: 3, background: 'var(--bg-tertiary)', borderRadius: 12 }}>
      {options.map((opt) => {
        const active = value === opt.key
        return (
          <button
            key={opt.key}
            type="button"
            onClick={() => onChange(opt.key)}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'white' : 'var(--text-secondary)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}

export default function SettingsScreen() {
  const { user, logout, avatarUrl } = useAuth()
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { triggerReveal } = useCircleReveal()
  const { t, language, setLanguage } = useLanguage()
  const { mode, setMode, collection } = useTheme()
  const { hasUnread } = useChangelog()
  const { needRefresh, checking, applyUpdate, checkForUpdate } = useUpdate()
  const { hasSeenTour } = useTour()
  const { smoothLines, showDots, setSetting } = useGraphSettings()
  const { position, order, hidden } = useNavLayout()
  const data = useData()
  const { isOnline, lastSyncTime, pendingChanges, syncing, syncNow, calendars } = data
  const linkedCount = calendars.filter(c => c.google_sync && c.google_calendar_id).length
  const googleSync = useGoogleSync()
  const { pinConfig } = usePin()
  const notif = useNotificationSettings()
  const calSettings = useCalendarSettings()

  const displayName = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? ''
  const email = user?.email ?? ''
  const initial = displayName[0]?.toUpperCase() ?? '?'

  const [confirmLogout, setConfirmLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)
  const [openId, setOpenId] = useState(null)
  const [avatarError, setAvatarError] = useState(false)
  const [pushStatus, setPushStatus] = useState(() => getPushStatus())
  const [pushBusy, setPushBusy] = useState(false)
  const [pushError, setPushError] = useState(false)
  const [benchmarking, setBenchmarking] = useState(false)
  const [benchmarkProgress, setBenchmarkProgress] = useState(0)
  const [benchmarkError, setBenchmarkError] = useState(false)
  const [benchmarkResult, setBenchmarkResult] = useState(() => loadBenchmark())
  const [benchmarkHistory, setBenchmarkHistory] = useState(() => loadHistory())

  async function handleBenchmark() {
    if (benchmarking) return
    setBenchmarking(true)
    setBenchmarkProgress(0)
    setBenchmarkError(false)
    try {
      const result = await runBenchmark({
        data,
        sync: googleSync,
        userId: user?.id,
        buildVersion: BUILD_VERSION,
        onProgress: ({ percent }) => setBenchmarkProgress(percent),
      })
      saveBenchmark(result)
      setBenchmarkResult(result)
      setBenchmarkHistory(appendHistory(result))
    } catch (error) {
      console.error('Benchmark failed:', error)
      setBenchmarkError(true)
    } finally {
      setBenchmarking(false)
    }
  }

  // Runs straight from the switch tap — iOS only shows the permission prompt
  // for a user gesture.
  async function handlePushToggle(on) {
    if (pushBusy) return
    setPushBusy(true)
    setPushError(false)
    try {
      if (on) {
        const status = await enablePush()
        setPushStatus(status)
        notif.setSetting('enabled', status === 'granted')
      } else {
        notif.setSetting('enabled', false)
        await disablePush()
      }
    } catch (e) {
      console.error('Push toggle failed:', e)
      setPushError(true)
      if (on) notif.setSetting('enabled', false)
    } finally {
      setPushBusy(false)
    }
  }

  const pushHint = pushError ? 'settings.notifications.error'
    : pushStatus === 'needsInstall' ? 'settings.notifications.hintInstall'
    : pushStatus === 'denied' ? 'settings.notifications.hintDenied'
    : pushStatus === 'unsupported' ? 'settings.notifications.hintUnsupported'
    : pushStatus === 'notConfigured' ? 'settings.notifications.hintNotConfigured'
    : 'settings.notifications.hint'

  async function handleLogout() {
    if (!confirmLogout) { setConfirmLogout(true); return }
    setLoggingOut(true)
    try {
      await logout()
    } catch (e) {
      console.error(e)
      setLoggingOut(false)
    }
  }

  function goTo(path) {
    setDirection(1)
    navigate(path)
  }

  const pinEnabled = !!pinConfig
  const currentLanguage = LANGUAGES.find((l) => l.code === language)

  const items = useMemo(() => [
    {
      id: 'security',
      title: t('settings.security'),
      summary: pinEnabled ? t('settings.pinEnabledSummary') : t('settings.pinDisabledSummary'),
      icon: ICON_LOCK,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <LinkOutRow
            label={t('settings.pin')}
            value={pinEnabled ? t('settings.pinEnabledSummary') : t('settings.pinDisabledSummary')}
            onTap={() => goTo('/settings/account')}
          />
        </div>
      ),
    },
    {
      id: 'appearance',
      title: t('settings.appearance'),
      summary: t(mode === 'dark' ? 'settings.appearance.dark' : 'settings.appearance.light'),
      icon: ICON_APPEARANCE,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 4 }}>
          <SegmentedControl
            options={MODES.map((m) => ({ key: m.key, label: t(m.labelKey) }))}
            value={mode}
            onChange={setMode}
          />
          <LinkOutRow
            label={t('settings.appearance.themes')}
            value={t(`settings.appearance.${collection}`)}
            onTap={() => goTo('/settings/appearance')}
          />
        </div>
      ),
    },
    {
      id: 'navigation',
      title: t('settings.navigationSection'),
      summary: t(position === 'bottom' ? 'settings.nav.original' : position === 'left' ? 'settings.nav.left' : 'settings.nav.right'),
      icon: ICON_NAV,
      content: <NavbarEditor />,
    },
    {
      id: 'customisation',
      title: t('settings.customisationSection'),
      summary: `${t('settings.graphs')} • ${t('settings.heatmap')}`,
      icon: ICON_CHART,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
          <InlineToggleRow label={t('settings.smoothLines')} checked={smoothLines} onChange={(v) => setSetting('smoothLines', v)} />
          <InlineToggleRow label={t('settings.showDots')} checked={showDots} onChange={(v) => setSetting('showDots', v)} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            <LinkOutRow label={t('settings.graphs')} onTap={() => goTo('/settings/customisation/graphs')} />
            <LinkOutRow label={t('settings.heatmap')} onTap={() => goTo('/settings/customisation/heatmap')} />
          </div>
        </div>
      ),
    },
    {
      id: 'data',
      title: t('settings.data'),
      summary: `${isOnline ? t('settings.online') : t('settings.offline')} • ${formatSyncTime(lastSyncTime, t, language)}`,
      icon: ICON_CLOUD,
      badge: pendingChanges > 0 ? (
        <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, padding: '0 4px', borderRadius: 8, background: '#f59e0b', color: 'white', fontSize: 10, fontWeight: 700 }}>
          {pendingChanges}
        </span>
      ) : undefined,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <ActionRow
            label={t('settings.status')}
            right={<span style={{ fontSize: 13, fontWeight: 600, color: isOnline ? '#22c55e' : '#ef4444' }}>{isOnline ? t('settings.online') : t('settings.offline')}</span>}
          />
          {pendingChanges > 0 && (
            <ActionRow
              label={pendingChanges === 1 ? t('settings.pending', { n: pendingChanges }) : t('settings.pendingPlural', { n: pendingChanges })}
              right={<span style={{ fontSize: 12, background: '#f59e0b', color: 'white', borderRadius: 8, padding: '2px 8px', fontWeight: 700 }}>{pendingChanges}</span>}
            />
          )}
          <ActionRow
            label={isOnline ? t('settings.syncNow') : t('settings.syncOffline')}
            value={formatSyncTime(lastSyncTime, t, language)}
            right={syncing ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)' }} /> : undefined}
            onTap={syncing || !isOnline ? undefined : syncNow}
          />
          <LinkOutRow label={t('settings.data')} onTap={() => goTo('/settings/data')} />
          <LinkOutRow label={t('settings.storage')} onTap={() => goTo('/settings/storage')} />
          <ActionRow
            label={benchmarkError ? t('settings.benchmark.error') : benchmarking ? t('settings.benchmark.running') : t('settings.benchmark')}
            value={!benchmarking && !benchmarkError && benchmarkResult ? t('settings.benchmark.lastScore', { n: benchmarkResult.score }) : undefined}
            right={benchmarking ? (
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, color: 'var(--accent)', fontSize: 12, fontWeight: 700 }}>
                <motion.span animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)' }} />
                {benchmarkProgress}%
              </span>
            ) : undefined}
            onTap={benchmarking ? undefined : handleBenchmark}
          />
          {benchmarkResult && (
            <BenchmarkResults
              result={benchmarkResult}
              history={benchmarkHistory}
              t={t}
              onDownload={() => downloadBenchmark(benchmarkResult)}
              onClear={() => { clearBenchmark(); setBenchmarkResult(null) }}
            />
          )}
        </div>
      ),
    },
    {
      id: 'assistant',
      title: t('settings.assistant'),
      icon: ICON_ASSISTANT,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <LinkOutRow label={t('settings.assistant')} onTap={() => goTo('/settings/assistant')} />
        </div>
      ),
    },
    {
      id: 'calendar',
      title: t('settings.calendarSection'),
      summary: calSettings.syncEnabled
        ? t('settings.calendar.summaryOn', { n: String(linkedCount) })
        : t('settings.calendar.summaryOff'),
      icon: ICON_CALENDAR,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <p style={{ margin: '0 2px 2px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {t('settings.providers.google')}
          </p>
          <LinkOutRow label={t('settings.providers.google')} onTap={() => goTo('/settings/google/connect')} />
          <LinkOutRow label={t('settings.google.calendarSection')} onTap={() => goTo('/settings/google/calendar')} />
          <LinkOutRow label={t('settings.tasks.section')} onTap={() => goTo('/settings/google/todos')} />

          <p style={{ margin: '14px 2px 2px', fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase' }}>
            {t('settings.providers.more')}
          </p>
          <div style={{
            display: 'flex', alignItems: 'center', padding: '13px 14px', borderRadius: 12,
            background: 'var(--bg-tertiary)', opacity: 0.5,
          }}>
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-secondary)' }}>
              {t('settings.providers.comingSoon')}
            </span>
          </div>
        </div>
      ),
    },
    {
      id: 'language',
      title: t('settings.languageSection'),
      summary: currentLanguage?.label ?? '',
      icon: ICON_GLOBE,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, paddingTop: 4 }}>
          <SegmentedControl
            options={LANGUAGES.map((l) => ({ key: l.code, label: `${l.flag} ${l.label}` }))}
            value={language}
            onChange={setLanguage}
          />
        </div>
      ),
    },
    {
      id: 'notifications',
      title: t('settings.notificationsSection'),
      summary: notif.enabled ? t('settings.notifications.on') : t('settings.notifications.off'),
      icon: ICON_BELL,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, paddingTop: 4 }}>
          <InlineToggleRow label={t('settings.notifications.enabled')} checked={notif.enabled} onChange={handlePushToggle} />
          <p style={{ margin: '0 2px 4px', fontSize: 12, color: pushError || pushStatus === 'denied' || pushStatus === 'notConfigured' ? '#ef4444' : 'var(--text-tertiary)' }}>{t(pushHint)}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, opacity: notif.enabled ? 1 : 0.45, pointerEvents: notif.enabled ? 'auto' : 'none', transition: 'opacity 0.15s' }}>
            {['calendarEvents', 'assignmentDue', 'examSoon', 'scheduledSessions', 'todoDue', 'streak', 'activeSession', 'updates'].map((key) => (
              <div key={key}>
                <InlineToggleRow label={t(`settings.notifications.${key}`)} description={t(`settings.notifications.${key}.desc`)} checked={notif[key]} onChange={(v) => notif.setSetting(key, v)} />
                {key === 'examSoon' && notif.examSoon && (
                  <div style={{ padding: '0 2px 8px' }}>
                    <span style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>{t('settings.notifications.examLeadDays')}</span>
                    <SegmentedControl
                      options={EXAM_LEAD_DAYS.map((d) => ({ key: d, label: String(d) }))}
                      value={notif.examLeadDays}
                      onChange={(v) => notif.setSetting('examLeadDays', v)}
                    />
                  </div>
                )}
                {key === 'scheduledSessions' && notif.scheduledSessions && (
                  <div style={{ padding: '0 2px 8px' }}>
                    <span style={{ display: 'block', marginBottom: 6, fontSize: 12, color: 'var(--text-tertiary)' }}>{t('settings.notifications.leadTime')}</span>
                    <SegmentedControl
                      options={LEAD_MINUTES.map((m) => ({ key: m, label: String(m) }))}
                      value={notif.leadMinutes}
                      onChange={(v) => notif.setSetting('leadMinutes', v)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      ),
    },
    {
      id: 'about',
      title: t('settings.aboutSection'),
      summary: `MedTracker • v${EXPORT_VERSION}`,
      icon: ICON_DOC,
      badge: (hasUnread || !hasSeenTour || needRefresh) ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444', boxShadow: '0 0 0 3px rgba(239,68,68,0.18)', flexShrink: 0 }} /> : undefined,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>
            Export v{EXPORT_VERSION} · Build {BUILD_VERSION}
          </p>
          <ActionRow
            label={needRefresh ? t('update.updateNow') : t('update.check')}
            value={needRefresh ? undefined : t('update.upToDate')}
            right={checking ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)' }} /> : undefined}
            onTap={checking ? undefined : (needRefresh ? applyUpdate : checkForUpdate)}
          />
          <LinkOutRow label={t('settings.tour')} onTap={() => goTo('/settings/tour')} />
          <LinkOutRow label={t('settings.changelog')} onTap={() => goTo('/settings/changelog')} />
        </div>
      ),
    },
  ], [
    t, pinEnabled, mode, collection, smoothLines, showDots,
    position, order, hidden,
    isOnline, lastSyncTime, pendingChanges, syncing, language, currentLanguage, hasUnread, hasSeenTour,
    needRefresh, checking, applyUpdate, checkForUpdate,
    calSettings.shareAcrossWorkspaces, calSettings.syncEnabled, linkedCount,
    notif.enabled, notif.scheduledSessions, notif.todoDue, notif.streak, notif.activeSession, notif.updates,
    notif.calendarEvents, notif.assignmentDue, notif.examSoon, notif.examLeadDays,
    notif.leadMinutes, pushStatus, pushBusy, pushError,
    benchmarking, benchmarkProgress, benchmarkError, benchmarkResult, benchmarkHistory,
  ])

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <motion.div
        variants={STACK_CONTAINER}
        initial="hidden"
        animate="show"
        style={{ padding: '16px 16px 100px' }}
      >

        {/* Nav */}
        <motion.div variants={STACK_ITEM} style={{ marginBottom: 24 }}>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={() => { triggerReveal(() => { setDirection(-1); navigate('/home') }, { reverse: true }) }}
            style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '0.5px solid rgba(255,255,255,0.22)', borderRadius: 10, padding: '7px 12px', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            {t('btn.back')}
          </motion.button>
          <h1 style={{ margin: 0, fontSize: 34, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>{t('settings.title')}</h1>
        </motion.div>

        {/* Account card — always visible with all necessary info, not part of the collapsible list.
            The whole card opens the full account/edit-profile screen; the chevron is the only
            affordance for that, so there's no separate button competing for attention. */}
        <motion.div
          variants={STACK_ITEM}
          whileTap={{ scale: 0.99, backgroundColor: 'var(--bg-tertiary)' }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
          onClick={() => goTo('/settings/account')}
          style={{ ...GLASS, marginBottom: 20, padding: '18px 16px 14px', cursor: 'pointer' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            {avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt=""
                onError={() => setAvatarError(true)}
                style={{ width: 52, height: 52, borderRadius: '50%', flexShrink: 0, objectFit: 'cover', boxShadow: '0 4px 14px rgba(99,102,241,0.35)' }}
              />
            ) : (
              <div
                style={{
                  width: 52, height: 52, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 700, fontSize: 20,
                  boxShadow: '0 4px 14px rgba(99,102,241,0.35)',
                }}
              >
                {initial}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ margin: 0, fontSize: 18, fontWeight: 700, letterSpacing: -0.2, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</p>
              <p style={{ margin: '3px 0 0', fontSize: 13, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{email}</p>
            </div>
            {ICON_CHEVRON_RIGHT}
          </div>

          {/* Sync status — kept visible here too since it's core "at a glance" account info */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 2px 0' }}>
            <span
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                padding: '4px 10px 4px 8px', borderRadius: 999,
                background: isOnline ? 'rgba(34,197,94,0.12)' : 'rgba(239,68,68,0.12)',
              }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: isOnline ? '#22c55e' : '#ef4444', flexShrink: 0 }} />
              <span style={{ fontSize: 12, fontWeight: 600, color: isOnline ? '#22c55e' : '#ef4444' }}>
                {isOnline ? t('settings.online') : t('settings.offline')}
              </span>
            </span>
            <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{formatSyncTime(lastSyncTime, t, language)}</span>
          </div>
        </motion.div>

        {/* Bouncy accordion of the remaining real settings */}
        <motion.div variants={STACK_ITEM} style={{ marginBottom: 28 }}>
          <BouncyAccordion items={items} value={openId} onValueChange={setOpenId} />
        </motion.div>

        {/* Logout button */}
        <motion.button
          variants={STACK_ITEM}
          whileTap={{ scale: 0.97 }}
          onClick={handleLogout}
          style={{ width: '100%', padding: '14px', borderRadius: 14, border: 'none', background: 'rgba(239,68,68,0.12)', color: '#ef4444', fontSize: 15, fontWeight: 600, cursor: 'pointer', marginBottom: 28 }}
        >
          {loggingOut ? t('settings.loggingOut') : confirmLogout ? t('settings.logoutConfirm') : t('settings.logout')}
        </motion.button>

        {/* App info */}
        <motion.div variants={STACK_ITEM} style={{ textAlign: 'center', paddingBottom: 8 }}>
          <p style={{ fontSize: 13, color: 'var(--text-tertiary)', margin: '0 0 3px', fontWeight: 500 }}>MedTracker</p>
          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', margin: 0, opacity: 0.7 }}>Export v{EXPORT_VERSION} · Build {BUILD_VERSION}</p>
        </motion.div>

      </motion.div>
    </div>
  )
}
