import { createContext, useContext, useState, useEffect } from 'react'

const NotificationSettingsContext = createContext()

// Device-local cache of the push preferences. PushSync mirrors them to the
// `notification_prefs` table, which the server-side scheduler reads.
export function NotificationSettingsProvider({ children }) {
  const [settings, setSettings] = useState({
    enabled: false,
    scheduledSessions: true,
    todoDue: true,
    streak: true,
    activeSession: true,
    updates: true,
    calendarEvents: true,
    assignmentDue: true,
    examSoon: true,
    leadMinutes: 10,
    examLeadDays: 3,
  })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('mt_notification_settings')
    if (saved) {
      try {
        setSettings(prev => ({ ...prev, ...JSON.parse(saved) }))
      } catch (e) {
        console.error('Failed to parse notification settings:', e)
      }
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (loaded) {
      localStorage.setItem('mt_notification_settings', JSON.stringify(settings))
    }
  }, [settings, loaded])

  function setSetting(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  return (
    <NotificationSettingsContext.Provider value={{ ...settings, setSetting }}>
      {children}
    </NotificationSettingsContext.Provider>
  )
}

export function useNotificationSettings() {
  const ctx = useContext(NotificationSettingsContext)
  if (!ctx) {
    throw new Error('useNotificationSettings must be used within NotificationSettingsProvider')
  }
  return ctx
}
