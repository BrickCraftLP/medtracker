import { useEffect } from 'react'
import { useAuth } from '../../context/AuthContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useNotificationSettings } from '../../context/NotificationSettingsContext.jsx'
import { refreshSubscription } from '../../services/pushService.js'
import { upsertNotificationPrefs, touchActiveSession, deleteActiveSession } from '../../services/dbInterface.js'
import { loadActiveSession } from '../../utils/plannerSessionDB.js'

const HEARTBEAT_MS = 5 * 60 * 1000

// Renders nothing. Keeps what the server-side push scheduler reads in sync:
// this device's subscription, the notification prefs and the active-session
// heartbeat. Lives inside AuthProvider because NotificationSettingsProvider
// sits above it.
export default function PushSync() {
  const { user } = useAuth()
  const { language } = useLanguage()
  const notif = useNotificationSettings()
  const userId = user && !user._stub ? user.id : null
  const {
    enabled, scheduledSessions, todoDue, streak, activeSession, updates,
    calendarEvents, assignmentDue, examSoon, leadMinutes, examLeadDays,
  } = notif

  // Re-register the device once per login.
  useEffect(() => {
    if (!userId || !enabled) return
    refreshSubscription()
      .then((status) => { if (status === 'denied') notif.setSetting('enabled', false) })
      .catch(() => {})
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId])

  // Prefs → Supabase, debounced so flicking toggles is one write.
  useEffect(() => {
    if (!userId) return
    const id = setTimeout(() => {
      upsertNotificationPrefs(userId, {
        enabled,
        scheduled_sessions: scheduledSessions,
        todo_due: todoDue,
        streak,
        active_session: activeSession,
        updates,
        calendar_events: calendarEvents,
        assignment_due: assignmentDue,
        exam_reminder: examSoon,
        lead_minutes: leadMinutes,
        exam_lead_days: examLeadDays,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        language,
      }).catch(() => {})
    }, 800)
    return () => clearTimeout(id)
  }, [
    userId, enabled, scheduledSessions, todoDue, streak, activeSession, updates,
    calendarEvents, assignmentDue, examSoon, leadMinutes, examLeadDays, language,
  ])

  // A planner session survives reloads (IndexedDB); a timer session doesn't.
  // Clear a leftover server row from an app that was killed mid-session.
  useEffect(() => {
    if (!userId) return
    loadActiveSession()
      .then((saved) => { if (!saved?.plan?.items?.length) return deleteActiveSession(userId) })
      .catch(() => {})
  }, [userId])

  // Heartbeat while the app is in the foreground. iOS suspends timers in the
  // background, so the heartbeat stopping is exactly "running in background".
  useEffect(() => {
    if (!userId || !enabled || !activeSession) return
    const beat = () => {
      if (document.visibilityState === 'visible') touchActiveSession(userId).catch(() => {})
    }
    const id = setInterval(beat, HEARTBEAT_MS)
    document.addEventListener('visibilitychange', beat)
    return () => {
      clearInterval(id)
      document.removeEventListener('visibilitychange', beat)
    }
  }, [userId, enabled, activeSession])

  return null
}
