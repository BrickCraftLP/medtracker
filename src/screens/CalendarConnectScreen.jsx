// The guided way to switch Google Calendar sync on.
//
// Everything here is presentation: the OAuth grant, the calendar list and the
// reconciliation all live in services/sync and hooks/useCalendarSync. The
// settings screen keeps its bare Connect row as the power-user path; this one
// explains first, links one calendar, runs the first sync in front of the user
// and then hands them to the calendar.

import { useContext, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { NavDirectionContext } from '../context/navDirection.js'
import { useData } from '../context/DataContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCalendarSettings } from '../context/CalendarSettingsContext.jsx'
import { useCalendarSync } from '../hooks/useCalendarSync.js'
import SyncFlowDiagram from '../components/Calendar/SyncFlowDiagram.jsx'
import { GlassCard } from '../components/Common/Glass.jsx'

const EASE = [0.23, 1, 0.32, 1]

// How long the success screen is allowed to be read before the user is moved
// on. Short enough not to feel stuck, long enough to see the counts.
const SUCCESS_DWELL_MS = 1800

export default function CalendarConnectScreen() {
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { t } = useLanguage()
  const { allCalendars: calendars, dataLoading } = useData()
  const settings = useCalendarSettings()
  const sync = useCalendarSync()

  const [step, setStep] = useState('overview') // overview | pick | syncing | done | failed
  const [remotes, setRemotes] = useState(null)
  const [localId, setLocalId] = useState(null)
  const [remoteId, setRemoteId] = useState(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState(null)
  const [totals, setTotals] = useState(null)
  // Which step to come back to when the error screen's retry is tapped.
  const [retryTo, setRetryTo] = useState('overview')
  const syncFired = useRef(false)
  const syncStartedAt = useRef(0)

  const localCal = calendars.find(c => c.id === localId) ?? null

  function goToCalendar() {
    setDirection(-1)
    navigate('/calendar')
  }

  function fail(message, back) {
    setFailure(message || t('calsetup.error.body'))
    setRetryTo(back)
    setStep('failed')
  }

  // Already connected: the explainer has nothing left to ask for, so go
  // straight to picking calendars. Once, so Back can still reach it.
  const skippedOverview = useRef(false)
  useEffect(() => {
    if (skippedOverview.current || step !== 'overview' || sync.authorized.google !== true) return
    skippedOverview.current = true
    handleStart()
  }, [step, sync.authorized.google]) // eslint-disable-line react-hooks/exhaustive-deps

  // Preselect once the lists are known: with a single local calendar there is
  // nothing to decide, and the primary Google calendar is the expected default.
  useEffect(() => {
    if (step !== 'pick') return
    setLocalId(prev => prev ?? (calendars.length === 1 ? calendars[0].id : null))
    setRemoteId(prev => prev ?? (remotes?.find(r => r.primary)?.id ?? remotes?.[0]?.id ?? null))
  }, [step, calendars, remotes])

  async function loadRemotes() {
    const list = await sync.listRemoteCalendars('google')
    setRemotes(list)
    return list
  }

  // Must run straight off the click: the grant opens a popup, and a popup
  // outside a user gesture is blocked.
  async function handleStart() {
    if (busy) return
    setBusy(true)
    try {
      // Connected on another device isn't enough — this one needs its own
      // token, and only a click may open Google's popup for it.
      if (!sync.authorized.google) {
        const ok = await sync.connect('google')
        if (!ok) {
          fail(sync.error, 'overview')
          return
        }
      }
      await loadRemotes()
      setStep('pick')
    } catch (e) {
      fail(e?.message ?? String(e), 'overview')
    } finally {
      setBusy(false)
    }
  }

  async function handleLink() {
    if (busy || !localCal || !remoteId) return
    setBusy(true)
    try {
      // The master switch gates the whole sync section in settings — linking
      // without flipping it would leave the user with no visible sync at all.
      if (!settings.syncEnabled) settings.setSetting('syncEnabled', true)
      await sync.linkCalendar(localCal, remoteId, 'google')
      syncFired.current = false
      setStep('syncing')
    } catch (e) {
      fail(e?.message ?? String(e), 'pick')
    } finally {
      setBusy(false)
    }
  }

  // The first sync cannot be fired on the line after linkCalendar: useCalendarSync
  // reads `calendars` from its own closure and bails out when no row is linked
  // yet, so it would no-op and the success screen would report nothing. Wait for
  // the linked row to actually show up instead.
  //
  // The result is read from `lastResult` rather than syncNow's return value:
  // linking also wakes the hook's own launch sync, and whichever starts second
  // gets `null` back from the re-entrancy guard even though a run is underway.
  useEffect(() => {
    if (step !== 'syncing' || syncFired.current) return
    if (dataLoading || !sync.linkedCalendars.length) return

    syncFired.current = true
    syncStartedAt.current = Date.now()
    sync.syncNow().catch(e => fail(e?.message ?? String(e), 'pick'))
  }, [step, dataLoading, sync.linkedCalendars.length]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (step !== 'syncing' || !syncFired.current || sync.syncing) return
    const result = sync.lastResult
    if (!result || new Date(result.at).getTime() < syncStartedAt.current) return
    if (result.failed) {
      fail(sync.error, 'pick')
      return
    }
    setTotals(result)
    setStep('done')
  }, [step, sync.syncing, sync.lastResult]) // eslint-disable-line react-hooks/exhaustive-deps

  // Success moves the user along on its own; the button is for the impatient.
  useEffect(() => {
    if (step !== 'done') return
    const id = setTimeout(goToCalendar, SUCCESS_DWELL_MS)
    return () => clearTimeout(id)
  }, [step]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleBack() {
    if (step === 'pick') { setStep('overview'); return }
    setDirection(-1)
    // Opened fresh (reload, PWA relaunch): nothing to go back to.
    if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
    else navigate('/settings/google/calendar', { replace: true })
  }

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 60px' }}>

        {step !== 'syncing' && step !== 'done' && (
          <BackButton label={t('btn.back')} onTap={handleBack} />
        )}

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={step}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.28, ease: EASE }}
          >
            {!sync.available
              ? <Unavailable t={t} onClose={goToCalendar} />
              : step === 'overview' ? <Overview t={t} busy={busy} onStart={handleStart} connected={!!sync.authorized.google} />
              : step === 'pick'     ? (
                  <Pick
                    t={t}
                    calendars={calendars}
                    remotes={remotes}
                    localId={localId} setLocalId={setLocalId}
                    remoteId={remoteId} setRemoteId={setRemoteId}
                    busy={busy}
                    onLink={handleLink}
                    onCancel={goToCalendar}
                  />
                )
              : step === 'syncing'  ? <Syncing t={t} />
              : step === 'done'     ? <Done t={t} totals={totals} onOpen={goToCalendar} />
              : <Failed t={t} message={failure} onRetry={() => setStep(retryTo)} onClose={goToCalendar} />}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ── Steps ─────────────────────────────────────────────────────────────── */

function Overview({ t, busy, onStart, connected }) {
  const bullets = t('calsetup.overview.bullets')
  const list = Array.isArray(bullets) ? bullets : []

  return (
    <>
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35, ease: EASE }}
        style={{ ...GLASS, marginBottom: 18 }}
      >
        <div style={{ background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', padding: '26px 20px 22px', textAlign: 'center' }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: 'white', letterSpacing: -0.5, lineHeight: 1.15 }}>
            {t('calsetup.title')}
          </div>
          <div style={{ marginTop: 6, fontSize: 14.5, color: 'rgba(255,255,255,0.82)', fontWeight: 500 }}>
            {t('calsetup.subtitle')}
          </div>
        </div>
        <SyncFlowDiagram />
      </motion.div>

      <div style={{ ...GLASS, padding: '16px 18px', marginBottom: 18 }}>
        <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 11 }}>
          {list.map((line, i) => (
            <motion.li
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.35, delay: 0.12 + i * 0.07, ease: EASE }}
              style={{ display: 'flex', gap: 10, alignItems: 'flex-start', fontSize: 14, lineHeight: 1.5, color: 'var(--text-secondary)' }}
            >
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 7 }} />
              <span>{line}</span>
            </motion.li>
          ))}
        </ul>
      </div>

      <PrimaryButton onTap={onStart} disabled={busy}>
        {busy ? t('calsetup.step.grant') : (connected ? t('calsetup.cta.continue') : t('calsetup.cta.start'))}
      </PrimaryButton>
    </>
  )
}

function Pick({ t, calendars, remotes, localId, setLocalId, remoteId, setRemoteId, busy, onLink, onCancel }) {
  if (!calendars.length) {
    return (
      <>
        <Title>{t('calsetup.pick.title')}</Title>
        <div style={{ ...GLASS, padding: 18, marginBottom: 18, fontSize: 13.5, color: 'var(--text-tertiary)', lineHeight: 1.5 }}>
          {t('calsetup.empty.noLocal')}
        </div>
        <PrimaryButton onTap={onCancel}>{t('calsetup.cta.openCalendar')}</PrimaryButton>
      </>
    )
  }

  const noRemote = remotes && remotes.length === 0

  return (
    <>
      <Title>{t('calsetup.pick.title')}</Title>

      <Section title={t('calsetup.step.pick.local')}>
        <PillRow
          items={calendars.map(c => ({ id: c.id, label: `${c.icon ?? '🎓'}  ${c.name}` }))}
          selected={localId}
          onSelect={setLocalId}
        />
      </Section>

      <Section title={t('calsetup.step.pick.remote')}>
        {remotes === null && (
          <div style={{ padding: 16, display: 'flex', alignItems: 'center', gap: 10 }}>
            <Ring />
            <span style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>{t('calsetup.step.loading')}</span>
          </div>
        )}
        {noRemote && (
          <div style={{ padding: 16, fontSize: 13.5, color: 'var(--text-tertiary)' }}>
            {t('calsetup.empty.noRemote')}
          </div>
        )}
        {remotes && remotes.length > 0 && (
          <PillRow
            items={remotes.map(r => ({ id: r.id, label: r.name }))}
            selected={remoteId}
            onSelect={setRemoteId}
          />
        )}
      </Section>

      <PrimaryButton onTap={onLink} disabled={busy || !localId || !remoteId}>
        {t('calsetup.cta.link')}
      </PrimaryButton>
    </>
  )
}

function Syncing({ t }) {
  return (
    <div style={{ ...GLASS, padding: '40px 24px', textAlign: 'center', marginTop: 40 }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
        style={{
          width: 34, height: 34, borderRadius: '50%', margin: '0 auto 18px',
          border: '3px solid var(--border)', borderTopColor: 'var(--accent)',
        }}
      />
      <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.2 }}>
        {t('calsetup.step.syncing')}
      </div>
      <p style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--text-secondary)', lineHeight: 1.5 }}>
        {t('calsetup.step.syncing.body')}
      </p>
    </div>
  )
}

function Done({ t, totals, onOpen }) {
  return (
    <ResultCard
      tint="rgba(34,197,94,0.12)"
      stroke="var(--correct)"
      icon={<path d="M20 6L9 17l-5-5" />}
      title={t('calsetup.success.title')}
      body={t('calsetup.success.body', {
        pulled: String(totals?.pulled ?? 0),
        pushed: String(totals?.pushed ?? 0),
      })}
    >
      <PrimaryButton onTap={onOpen}>{t('calsetup.cta.openCalendar')}</PrimaryButton>
    </ResultCard>
  )
}

function Failed({ t, message, onRetry, onClose }) {
  return (
    <ResultCard
      tint="rgba(239,68,68,0.12)"
      stroke="#ef4444"
      icon={<><path d="M12 9v4M12 17h.01" /><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" /></>}
      title={t('calsetup.error.title')}
      body={message ?? t('calsetup.error.body')}
    >
      <PrimaryButton onTap={onRetry}>{t('calsetup.cta.retry')}</PrimaryButton>
      <motion.button whileTap={{ scale: 0.97 }} className="btn btn-secondary"
        style={{ width: '100%', marginTop: 10 }} onClick={onClose}>
        {t('calsetup.cta.notNow')}
      </motion.button>
    </ResultCard>
  )
}

function Unavailable({ t, onClose }) {
  return (
    <ResultCard
      tint="var(--accent-muted)"
      stroke="var(--accent)"
      icon={<><circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16h.01" /></>}
      title={t('calsetup.title')}
      body={t('calsetup.unavailable')}
    >
      <PrimaryButton onTap={onClose}>{t('calsetup.cta.openCalendar')}</PrimaryButton>
    </ResultCard>
  )
}

/* ── Pieces ────────────────────────────────────────────────────────────── */

function ResultCard({ tint, stroke, icon, title, body, children }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ type: 'spring', damping: 26, stiffness: 340 }}
      style={{ ...GLASS, padding: '28px 22px', textAlign: 'center', marginTop: 24 }}
    >
      <motion.div
        initial={{ scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', damping: 14, stiffness: 320, delay: 0.08 }}
        style={{
          width: 52, height: 52, borderRadius: '50%', margin: '0 auto 14px',
          background: tint, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke={stroke}
             strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          {icon}
        </svg>
      </motion.div>
      <h2 style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.3 }}>
        {title}
      </h2>
      <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.45, wordBreak: 'break-word' }}>
        {body}
      </p>
      {children}
    </motion.div>
  )
}

function Title({ children }) {
  return (
    <h1 style={{ margin: '0 0 22px', fontSize: 30, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
      {children}
    </h1>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 26 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 16px 6px' }}>
        {title}
      </p>
      <GlassCard cornerRadius={16} style={{ overflow: 'hidden' }}>{children}</GlassCard>
    </div>
  )
}

function PillRow({ items, selected, onSelect }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7, padding: 14 }}>
      {items.map(item => {
        const on = item.id === selected
        return (
          <motion.button
            key={item.id}
            whileTap={{ scale: 0.95 }}
            onClick={() => onSelect(item.id)}
            className="pill"
            style={{
              padding: '6px 12px', fontSize: 12.5, fontWeight: 600, cursor: 'pointer',
              border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
              background: on ? 'var(--accent)' : 'var(--bg-tertiary)',
              color: on ? '#fff' : 'var(--text-secondary)',
            }}
          >
            {item.label}
          </motion.button>
        )
      })}
    </div>
  )
}

function PrimaryButton({ onTap, disabled, children }) {
  return (
    <motion.button
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={disabled ? undefined : onTap}
      disabled={disabled}
      style={{
        width: '100%', padding: '14px 18px',
        background: 'var(--accent)', color: 'white', border: 'none',
        borderRadius: 14, fontSize: 15, fontWeight: 700,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.55 : 1,
      }}
    >
      {children}
    </motion.button>
  )
}

function BackButton({ label, onTap }) {
  return (
    <motion.button
      whileTap={{ scale: 0.88 }}
      onClick={onTap}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 18,
        padding: '7px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
        background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(20px)',
        WebkitBackdropFilter: 'blur(20px)',
        color: '#fff', fontSize: 14, fontWeight: 600,
      }}
    >
      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff"
           strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M15 5l-7 7 7 7" />
      </svg>
      {label}
    </motion.button>
  )
}

function Ring() {
  return (
    <motion.div
      animate={{ rotate: 360 }}
      transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
      style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)' }}
    />
  )
}
