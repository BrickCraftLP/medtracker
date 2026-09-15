import { createContext, useContext, useState, useEffect } from 'react'

const GraphSettingsContext = createContext()

export function GraphSettingsProvider({ children }) {
  const [settings, setSettings] = useState({
    gridLines: false,
    smoothLines: true,
    showDots: false,
    carryForward: false,
    markInactive: false,
    heatmapTheme: 'blue',
    heatmapCustomColor: '#3b82f6',
    chartColor: '#007AFF',
    accLineColor: '#10b981',
    wtdLineColor: '#8b5cf6',
  })
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('mt_graph_settings')
    if (saved) {
      try {
        setSettings(prev => ({ ...prev, ...JSON.parse(saved) }))
      } catch (e) {
        console.error('Failed to parse graph settings:', e)
      }
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (loaded) {
      localStorage.setItem('mt_graph_settings', JSON.stringify(settings))
    }
  }, [settings, loaded])

  function setSetting(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  return (
    <GraphSettingsContext.Provider value={{ ...settings, setSetting }}>
      {children}
    </GraphSettingsContext.Provider>
  )
}

export function useGraphSettings() {
  const ctx = useContext(GraphSettingsContext)
  if (!ctx) {
    throw new Error('useGraphSettings must be used within GraphSettingsProvider')
  }
  return ctx
}
