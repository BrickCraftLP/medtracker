// Calendar settings: sharing across workspaces, and the sync providers.
//
// Shell and row helpers follow DataSettingsScreen — grouped glass cards rather
// than the pill rows the accordion panels use.

import { useContext, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { NavDirectionContext } from '../context/navDirection.js'
import { useData } from '../context/DataContext.jsx'
import { useWorkspace } from '../context/WorkspaceContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCalendarSettings } from '../context/CalendarSettingsContext.jsx'
import { useCalendarSync } from '../hooks/useCalendarSync.js'
import { isShared } from '../utils/calendar/calendarScope.js'
import Switch from '../components/Common/Switch.jsx'
import { GlassCard } from '../components/Common/Glass.jsx'

const GLASS = {
  background: 'var(--glass-card-bg)',
  backdropFilter: 'blur(60px) saturate(200%)',
  WebkitBackdropFilter: 'blur(60px) saturate(200%)',
  borderRadius: 16,
  border: '0.5px solid var(--glass-card-stroke)',
  boxShadow: 'var(--glass-card-shadow)',
  overflow: 'hidden',
}

export default function CalendarSettingsScreen() {
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  // All of them, not just the ones visible here: this screen is where a
  // calendar is granted to or revoked from a workspace.
  const { allCalendars: calendars, upsertCalendar } = useData()
  const { workspaces, activeWorkspaceId } = useWorkspace()
  const { t } = useLanguage()
  const settings = useCalendarSettings()
  const sync = useCalendarSync()

  const [remote, setRemote] = useState(null) // provider id → [{id,name}]
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(null) // calendar id

  // Once this device holds a token, load the account's calendars so the picker
  // is ready. Gated on the token, not the shared status: without one the list
  // call falls back to Google's popup, which is blocked outside a click.
  const hasToken = Object.values(sync.authorized).some(Boolean)
  useEffect(() => {
    if (!hasToken || remote) return
    let cancelled = false
    sync.listRemoteCalendars().then(list => { if (!cancelled) setRemote(list) })
    return () => { cancelled = true }
  }, [hasToken]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnect(providerId) {
    setBusy(true)
    try {
      const ok = await sync.connect(providerId)
      if (ok) setRemote(await sync.listRemoteCalendars(providerId))
    } finally { setBusy(false) }
  }

  async function toggleShareAll(calendar, value) {
    await upsertCalendar({ ...calendar, shared_all: value, shared_workspace_ids: value ? [] : calendar.shared_workspace_ids })
  }

  async function toggleWorkspace(calendar, workspaceId) {
    const current = calendar.shared_workspace_ids ?? []
    const next = current.includes(workspaceId)
      ? current.filter(id => id !== workspaceId)
      : [...current, workspaceId]
    await upsertCalendar({ ...calendar, shared_workspace_ids: next })
  }

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 60px' }}>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => { setDirection(-1); navigate(-1) }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 18,
            padding: '7px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(20px)',
            color: '#fff', fontSize: 14, fontWeight: 600,
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#fff"
               strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M15 5l-7 7 7 7" />
          </svg>
          {t('btn.back')}
        </motion.button>

        <h1 style={{ margin: '0 0 30px', fontSize: 34, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          {t('settings.calendarSection')}
        </h1>

        {/* Sharing */}
        <Section title={t('settings.calendar.sharing')}>
          <ToggleRow
            label={t('settings.calendar.shareAll')}
            description={t('settings.calendar.shareAll.desc')}
            checked={settings.shareAcrossWorkspaces}
            onToggle={() => settings.setSetting('shareAcrossWorkspaces', !settings.shareAcrossWorkspaces)}
            divider={false}
          />
        </Section>

        {settings.shareAcrossWorkspaces && (
          <Section title={t('settings.calendar.perCalendar')}>
            {calendars.length === 0 && <EmptyRow text={t('exams.noCalendar')} />}
            {calendars.map((cal, i) => (
              <div key={cal.id}>
                <div style={{ padding: '12px 16px 6px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 15 }}>{cal.icon ?? '🎓'}</span>
                    <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>
                      {cal.name}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)' }}>
                      {isShared(cal) ? t('settings.calendar.shared') : t('settings.calendar.private')}
                    </span>
                  </div>

                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '4px 0 8px', cursor: 'pointer' }}>
                    <Switch checked={!!cal.shared_all} onChange={v => toggleShareAll(cal, v)} />
                    <span style={{ fontSize: 13.5, color: 'var(--text-secondary)' }}>
                      {t('settings.calendar.inAllWorkspaces')}
                    </span>
                  </label>

                  {!cal.shared_all && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, paddingBottom: 10 }}>
                      {workspaces.map(w => {
                        const owner = w.id === cal.workspace_id
                        const on = owner || (cal.shared_workspace_ids ?? []).includes(w.id)
                        return (
                          <button
                            key={w.id}
                            // The owning workspace always sees its own calendar;
                            // there is nothing to toggle there.
                            onClick={owner ? undefined : () => toggleWorkspace(cal, w.id)}
                            className="pill"
                            style={{
                              padding: '5px 11px', fontSize: 12, fontWeight: 600,
                              cursor: owner ? 'default' : 'pointer',
                              opacity: owner ? 0.55 : 1,
                              border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                              background: on ? 'var(--accent)' : 'var(--bg-tertiary)',
                              color: on ? '#fff' : 'var(--text-secondary)',
                            }}
                          >
                            {w.name}{owner ? ' ·' : ''}
                          </button>
                        )
                      })}
                    </div>
                  )}
                </div>
                {i < calendars.length - 1 && <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />}
              </div>
            ))}
          </Section>
        )}

        {/* Sync */}
        <Section title={t('settings.calendar.sync')}>
          <ToggleRow
            label={t('settings.calendar.syncEnabled')}
            description={t('settings.calendar.syncEnabled.desc')}
            checked={settings.syncEnabled}
            onToggle={() => settings.setSetting('syncEnabled', !settings.syncEnabled)}
            divider={settings.syncEnabled}
          />

          {settings.syncEnabled && !sync.available && (
            <Row label={t('settings.calendar.syncNotConfigured')} divider={false} />
          )}

          {settings.syncEnabled && sync.providers.map(provider => (
            <Row
              key={provider.id}
              label={t(provider.labelKey)}
              value={sync.connected[provider.id] ? t('settings.calendar.connected') : undefined}
              // Connecting goes through the guided flow; this row stays the quick
              // way out.
              // Connected elsewhere but no token here: send the user back
              // through the flow rather than offering a Disconnect that would
              // also cut off their other devices.
              onTap={busy ? undefined : () => {
                if (sync.needsReconnect[provider.id]) { setDirection(1); navigate('/calendar/connect') }
                else if (sync.connected[provider.id]) sync.disconnect(provider.id)
                else if (provider.id === 'google') { setDirection(1); navigate('/calendar/connect') }
                else handleConnect(provider.id)
              }}
              right={
                <span style={{ fontSize: 13, color: sync.needsReconnect[provider.id] ? 'var(--accent)' : sync.connected[provider.id] ? '#22c55e' : 'var(--accent)', fontWeight: 600 }}>
                  {sync.needsReconnect[provider.id]
                    ? t('settings.calendar.reconnect')
                    : sync.connected[provider.id] ? t('settings.calendar.disconnect') : t('settings.calendar.connect')}
                </span>
              }
            />
          ))}

          {settings.syncEnabled && sync.anyConnected && (
            <Row
              label={sync.syncing ? t('settings.calendar.syncing') : t('settings.syncNow')}
              value={sync.lastResult
                ? t('settings.calendar.syncResult', {
                  pulled: String(sync.lastResult.pulled),
                  pushed: String(sync.lastResult.pushed),
                })
                : undefined}
              onTap={sync.syncing ? undefined : sync.syncNow}
              divider={false}
              right={sync.syncing
                ? <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                              style={{ width: 16, height: 16, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)' }} />
                : undefined}
            />
          )}
        </Section>

        {settings.syncEnabled && sync.anyConnected && (
          <Section title={t('settings.calendar.linked')}>
            {calendars.map((cal, i) => {
              const linked = cal.google_sync && cal.google_calendar_id
              const remoteName = remote?.find(r => r.id === cal.google_calendar_id)?.name
              return (
                <div key={cal.id}>
                  <Row
                    label={`${cal.icon ?? '🎓'}  ${cal.name}`}
                    value={linked ? (remoteName ?? cal.google_calendar_id) : t('settings.calendar.notLinked')}
                    onTap={() => setPicking(picking === cal.id ? null : cal.id)}
                    divider={i < calendars.length - 1 && picking !== cal.id}
                    right={linked
                      ? <button
                          onClick={e => { e.stopPropagation(); sync.unlinkCalendar(cal) }}
                          style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--wrong)' }}
                        >
                          {t('settings.calendar.unlink')}
                        </button>
                      : undefined}
                  />
                  <AnimatePresence initial={false}>
                    {picking === cal.id && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                        style={{ overflow: 'hidden' }}
                      >
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 14px' }}>
                          {(remote ?? []).map(r => (
                            <button
                              key={r.id}
                              onClick={async () => { await sync.linkCalendar(cal, r.id, 'google'); setPicking(null) }}
                              className="pill"
                              style={{
                                padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                border: `1.5px solid ${cal.google_calendar_id === r.id ? 'var(--accent)' : 'var(--border)'}`,
                                background: cal.google_calendar_id === r.id ? 'var(--accent)' : 'var(--bg-tertiary)',
                                color: cal.google_calendar_id === r.id ? '#fff' : 'var(--text-secondary)',
                              }}
                            >
                              {r.name}
                            </button>
                          ))}
                          {remote && remote.length === 0 && (
                            <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)' }}>
                              {t('settings.calendar.noRemote')}
                            </span>
                          )}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              )
            })}
          </Section>
        )}

        {sync.error && (
          <p style={{ margin: '0 16px', fontSize: 12.5, color: 'var(--wrong)' }}>{sync.error}</p>
        )}
      </div>
    </div>
  )
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

function Row({ label, value, onTap, right, divider = true }) {
  return (
    <>
      <motion.div
        whileTap={onTap ? { scale: 0.98, backgroundColor: 'var(--bg-tertiary)' } : undefined}
        onClick={onTap}
        style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 12, cursor: onTap ? 'pointer' : 'default' }}
      >
        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        {value && <span style={{ fontSize: 13.5, color: 'var(--text-secondary)', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>}
        {right}
      </motion.div>
      {divider && <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />}
    </>
  )
}

function ToggleRow({ label, description, checked, onToggle, divider = true }) {
  return (
    <>
      <div onClick={onToggle} style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 12, cursor: 'pointer' }}>
        <span style={{ flex: 1 }}>
          <span style={{ display: 'block', fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
          {description && (
            <span style={{ display: 'block', fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2 }}>{description}</span>
          )}
        </span>
        <Switch checked={checked} onChange={() => onToggle && onToggle()} />
      </div>
      {divider && <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />}
    </>
  )
}

function EmptyRow({ text }) {
  return (
    <div style={{ padding: '16px', fontSize: 13.5, color: 'var(--text-tertiary)' }}>{text}</div>
  )
}
