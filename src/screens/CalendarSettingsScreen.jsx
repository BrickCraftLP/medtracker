// Google settings, split into three screens reached from the "Connect with
// third party" accordion in Settings:
//   connect  — the provider grant itself: connect/reconnect/disconnect, the
//              sync master switch, and Sync now;
//   calendar — sharing calendars across workspaces and linking them to
//              Google calendars;
//   todos    — linking each workspace to a Google task list, merging lists,
//              and the event-todos-in-Google-Calendar toggle.
//
// One file, one `section` route param: the three screens share their header,
// back button and every row/section helper, and only their content differs.

import { useContext, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { NavDirectionContext } from '../context/navDirection.js'
import { useData } from '../context/DataContext.jsx'
import { useWorkspace } from '../context/WorkspaceContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useCalendarSettings } from '../context/CalendarSettingsContext.jsx'
import { useCalendarSync } from '../hooks/useCalendarSync.js'
import { NEW_TASK_LIST } from '../context/GoogleSyncContext.jsx'
import { isShared } from '../utils/calendar/calendarScope.js'
import Switch from '../components/Common/Switch.jsx'
import { GlassCard } from '../components/Common/Glass.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { STORES, getAllByUser } from '../services/offlineDB.js'
import { findDuplicates, findCompleted } from '../utils/todoCleanup.js'

const GLASS = {
  background: 'var(--glass-card-bg)',
  backdropFilter: 'blur(60px) saturate(200%)',
  WebkitBackdropFilter: 'blur(60px) saturate(200%)',
  borderRadius: 16,
  border: '0.5px solid var(--glass-card-stroke)',
  boxShadow: 'var(--glass-card-shadow)',
  overflow: 'hidden',
}

const TITLE_KEY = {
  connect: 'settings.providers.google',
  calendar: 'settings.google.calendarSection',
  todos: 'settings.tasks.section',
}

export default function CalendarSettingsScreen() {
  const navigate = useNavigate()
  const { section = 'connect' } = useParams()
  const { setDirection } = useContext(NavDirectionContext)
  // All of them, not just the ones visible here: this screen is where a
  // calendar is granted to or revoked from a workspace.
  const { allCalendars: calendars, upsertCalendar, removeTodos } = useData()
  const { user } = useAuth()
  const { workspaces } = useWorkspace()
  const { t } = useLanguage()
  const settings = useCalendarSettings()
  const sync = useCalendarSync()

  const [remote, setRemote] = useState(null) // provider id → [{id,name}]
  const [busy, setBusy] = useState(false)
  const [picking, setPicking] = useState(null) // calendar id
  const [taskLists, setTaskLists] = useState(null) // [{id,name}]
  const [pickingList, setPickingList] = useState(null) // workspace id
  // Two taps: the first counts what would go, the second deletes it.
  const [cleanup, setCleanup] = useState(null)             // { kind, rows }
  const [cleanupResult, setCleanupResult] = useState(null) // { kind, count }

  async function prepareCleanup(kind) {
    setBusy(true)
    setCleanupResult(null)
    try {
      // Every workspace, from the mirror: React state only holds the active one.
      const rows = await getAllByUser(STORES.todos, user.id)
      setCleanup({ kind, rows: kind === 'duplicates' ? findDuplicates(rows) : findCompleted(rows) })
    } catch (e) {
      console.error('todo cleanup: scan failed', e)
    } finally { setBusy(false) }
  }

  async function runCleanup() {
    if (!cleanup?.rows.length) return
    const { kind, rows } = cleanup
    setBusy(true)
    try {
      setCleanupResult({ kind, count: await removeTodos(rows) })
      setCleanup(null)
    } catch (e) {
      console.error('todo cleanup: delete failed', e)
    } finally { setBusy(false) }
  }

  // Same rule as the calendar list above: only once this device holds a Tasks
  // token, so loading the lists can never fall back to a blocked popup.
  useEffect(() => {
    if (!sync.tasks.authorized || taskLists) return
    let cancelled = false
    sync.tasks.listLists().then(list => { if (!cancelled) setTaskLists(list) })
    return () => { cancelled = true }
  }, [sync.tasks.authorized]) // eslint-disable-line react-hooks/exhaustive-deps

  async function handleConnectTasks() {
    setBusy(true)
    try {
      await sync.tasks.connect()
      setTaskLists(await sync.tasks.listLists())
    } catch { /* reason is in sync.error, rendered below */ }
    finally { setBusy(false) }
  }

  async function handleLinkList(workspace, listId) {
    setBusy(true)
    try {
      const id = await sync.tasks.link(workspace, listId)
      if (id && listId === NEW_TASK_LIST) setTaskLists(await sync.tasks.listLists())
      if (id) setPickingList(null)
    } finally { setBusy(false) }
  }

  // Connect and reconnect both open Google's sign-in popup straight off the
  // tap; calendars and task lists are linked on their own screens afterwards.
  function handleProviderTap(provider) {
    if (sync.connected[provider.id] && !sync.needsReconnect[provider.id]) sync.disconnect(provider.id)
    else handleConnect(provider.id)
  }

  const errorText = sync.error === 'retry_consent' ? t('settings.google.retryConsent') : sync.error

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
      await sync.connect(providerId)
      setRemote(await sync.listRemoteCalendars(providerId))
    } catch { /* reason is in sync.error, rendered below */ }
    finally { setBusy(false) }
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
          onClick={() => {
            setDirection(-1)
            // Opened fresh (reload, PWA relaunch): there is no entry to go back
            // to, and navigate(-1) would silently do nothing.
            if ((window.history.state?.idx ?? 0) > 0) navigate(-1)
            else navigate('/settings', { replace: true })
          }}
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
          {t(TITLE_KEY[section] ?? TITLE_KEY.connect)}
        </h1>

        {section === 'connect' && (
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
                onTap={busy ? undefined : () => handleProviderTap(provider)}
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
        )}

        {section === 'calendar' && (
          <>
            {settings.syncEnabled && sync.anyConnected && (
              <Section title={t('settings.calendar.sync')}>
                <ToggleRow
                  label={t('settings.calendar.eventTodos')}
                  description={t('settings.calendar.eventTodos.desc')}
                  checked={settings.eventTodosInGoogle}
                  onToggle={() => settings.setSetting('eventTodosInGoogle', !settings.eventTodosInGoogle)}
                  divider={false}
                />
              </Section>
            )}

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

            {!settings.syncEnabled && (
              <p style={{ margin: '0 2px', fontSize: 13, color: 'var(--text-tertiary)' }}>
                {t('settings.google.syncOffHint')}
              </p>
            )}
          </>
        )}

        {/* Google Tasks — each workspace picks a list; the same list for several merges them */}
        {section === 'todos' && (
          settings.syncEnabled && sync.available && workspaces.length > 0 ? (
            <Section title={t('settings.tasks.section')}>
              {!sync.tasks.authorized ? (
                <Row
                  label={sync.tasks.needsReconnect ? t('settings.tasks.reconnect') : t('settings.tasks.connect')}
                  onTap={busy ? undefined : handleConnectTasks}
                  right={
                    <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600 }}>
                      {sync.tasks.needsReconnect ? t('settings.calendar.reconnect') : t('settings.calendar.connect')}
                    </span>
                  }
                />
              ) : workspaces.map((ws, i) => {
                const linked = !!(ws.google_tasks_sync && ws.google_tasklist_id)
                const group = sync.tasks.groups.find(g => g.workspaces.some(w => w.id === ws.id))
                const others = group?.workspaces.filter(w => w.id !== ws.id) ?? []
                const open = pickingList === ws.id
                // Which other workspaces already use a list, so picking it reads
                // as the merge it is.
                const usersOf = listId => workspaces
                  .filter(w => w.id !== ws.id && w.google_tasks_sync && w.google_tasklist_id === listId)
                  .map(w => w.name)
                return (
                  <div key={ws.id}>
                    <Row
                      label={ws.name}
                      value={linked
                        ? (taskLists?.find(l => l.id === ws.google_tasklist_id)?.name ?? ws.google_tasklist_id)
                        : t('settings.calendar.notLinked')}
                      onTap={() => setPickingList(open ? null : ws.id)}
                      divider={false}
                      right={linked
                        ? <button
                            disabled={busy}
                            onClick={e => { e.stopPropagation(); sync.tasks.unlink(ws) }}
                            style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--wrong)' }}
                          >
                            {t('settings.calendar.unlink')}
                          </button>
                        : undefined}
                    />

                    {linked && others.length > 0 && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 16px 12px', fontSize: 12, color: 'var(--text-tertiary)' }}>
                        <span style={{ flex: 1 }}>
                          {t('settings.tasks.merged', { names: others.map(w => w.name).join(', ') })}
                        </span>
                        {group.primaryId === ws.id
                          ? <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{t('settings.tasks.primary')}</span>
                          : <button
                              disabled={busy}
                              onClick={() => sync.tasks.setPrimary(ws)}
                              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0, fontSize: 12, fontWeight: 600, color: 'var(--accent)' }}
                            >
                              {t('settings.tasks.makePrimary')}
                            </button>}
                      </div>
                    )}

                    <AnimatePresence initial={false}>
                      {open && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2, ease: [0.32, 0.72, 0, 1] }}
                          style={{ overflow: 'hidden' }}
                        >
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 14px' }}>
                            {(taskLists ?? []).map(l => {
                              const on = linked && ws.google_tasklist_id === l.id
                              const users = usersOf(l.id)
                              return (
                                <button
                                  key={l.id}
                                  disabled={busy}
                                  onClick={() => handleLinkList(ws, l.id)}
                                  className="pill"
                                  style={{
                                    padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                    border: `1.5px solid ${on ? 'var(--accent)' : 'var(--border)'}`,
                                    background: on ? 'var(--accent)' : 'var(--bg-tertiary)',
                                    color: on ? '#fff' : 'var(--text-secondary)',
                                  }}
                                >
                                  {l.name}{users.length ? ` · ${users.join(', ')}` : ''}
                                </button>
                              )
                            })}
                            <button
                              disabled={busy}
                              onClick={() => handleLinkList(ws, NEW_TASK_LIST)}
                              className="pill"
                              style={{
                                padding: '5px 11px', fontSize: 12, fontWeight: 600, cursor: 'pointer',
                                border: '1.5px dashed var(--border)', background: 'transparent', color: 'var(--accent)',
                              }}
                            >
                              {t('settings.tasks.newList')}
                            </button>
                            {taskLists && taskLists.length === 0 && (
                              <span style={{ fontSize: 12.5, color: 'var(--text-tertiary)', alignSelf: 'center' }}>
                                {t('settings.tasks.noLists')}
                              </span>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {i < workspaces.length - 1 && <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />}
                  </div>
                )
              })}
              <div style={{ padding: '10px 16px 13px', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.45 }}>
                {t('settings.tasks.hint')}
              </div>
            </Section>
          ) : (
            <p style={{ margin: '0 2px', fontSize: 13, color: 'var(--text-tertiary)' }}>
              {t('settings.google.syncOffHint')}
            </p>
          )
        )}

        {/* Maintenance — available whether or not Google sync is on */}
        {section === 'todos' && (
          <Section title={t('settings.tasks.cleanup')}>
            {['duplicates', 'completed'].map(kind => {
              const pending = cleanup?.kind === kind ? cleanup.rows.length : null
              const done = cleanupResult?.kind === kind ? cleanupResult.count : null
              return (
                <Row
                  key={kind}
                  label={t(`settings.tasks.cleanup.${kind}`)}
                  value={pending === 0
                    ? t('settings.tasks.cleanup.none')
                    : done != null ? t('settings.tasks.cleanup.done', { count: String(done) }) : undefined}
                  onTap={busy ? undefined : () => (pending ? setCleanup(null) : prepareCleanup(kind))}
                  right={pending
                    ? <button
                        disabled={busy}
                        onClick={e => { e.stopPropagation(); runCleanup() }}
                        style={{ border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 12.5, fontWeight: 600, color: 'var(--wrong)' }}
                      >
                        {t('settings.tasks.cleanup.confirm', { count: String(pending) })}
                      </button>
                    : undefined}
                />
              )
            })}
            <div style={{ padding: '10px 16px 13px', fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.45 }}>
              {t('settings.tasks.cleanup.hint')}
            </div>
          </Section>
        )}

        {errorText && (
          <p style={{ margin: '0 16px', fontSize: 12.5, color: 'var(--wrong)' }}>{errorText}</p>
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
