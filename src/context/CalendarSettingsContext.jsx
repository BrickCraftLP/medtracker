import { createContext, useContext, useEffect, useState } from 'react'

const CalendarSettingsContext = createContext()

// Device-local calendar preferences, same shape and storage idiom as
// NotificationSettingsContext. Only preferences live here — which workspaces a
// calendar is shared into is data and lives on the row.
const DEFAULTS = {
  // When on, a newly created calendar is shared into every workspace, and the
  // settings screen offers per-calendar workspace assignment.
  shareAcrossWorkspaces: false,
  // Master switch for the sync providers. Off hides them everywhere.
  syncEnabled: false,
  // The "connect Google Calendar" banner on the calendar screen was dismissed.
  connectPromptDismissed: false,
  // A synced event's todos are listed as a checklist in its Google description.
  eventTodosInGoogle: true,
}

export function CalendarSettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('mt_calendar_settings')
    if (saved) {
      try {
        setSettings(prev => ({ ...prev, ...JSON.parse(saved) }))
      } catch (e) {
        console.error('Failed to parse calendar settings:', e)
      }
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (loaded) localStorage.setItem('mt_calendar_settings', JSON.stringify(settings))
  }, [settings, loaded])

  function setSetting(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  return (
    <CalendarSettingsContext.Provider value={{ ...settings, setSetting }}>
      {children}
    </CalendarSettingsContext.Provider>
  )
}

export function useCalendarSettings() {
  const ctx = useContext(CalendarSettingsContext)
  if (!ctx) throw new Error('useCalendarSettings must be used within CalendarSettingsProvider')
  return ctx
}
