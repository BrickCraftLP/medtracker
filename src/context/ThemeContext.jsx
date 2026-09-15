import { createContext, useContext, useEffect, useState } from 'react'
import { THEMES, resolveTheme } from '../themes/index.js'

const ThemeContext = createContext(null)

const MODE_KEY          = 'medtracker-mode'
const COLLECTION_KEY    = 'medtracker-collection'
const LEGACY_KEY        = 'medtracker-theme'
const CUSTOM_COLORS_KEY = 'medtracker-custom-colors'

const DEFAULT_CUSTOM_COLORS = ['#FF6B6B', '#4ECDC4']

function getSystemDark() {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function migrateLegacy() {
  const legacy = localStorage.getItem(LEGACY_KEY)
  if (legacy == null) return
  if (localStorage.getItem(MODE_KEY) == null) {
    if (legacy === 'light' || legacy === 'dark') {
      localStorage.setItem(MODE_KEY, legacy)
      localStorage.setItem(COLLECTION_KEY, 'none')
    } else if (legacy === 'system') {
      localStorage.setItem(MODE_KEY, 'light')
      localStorage.setItem(COLLECTION_KEY, 'none')
    } else {
      localStorage.setItem(MODE_KEY, 'light')
      localStorage.setItem(COLLECTION_KEY, legacy)
    }
  }
  localStorage.removeItem(LEGACY_KEY)
}

function applyTheme(vars, isDark) {
  const root = document.documentElement
  for (const [key, val] of Object.entries(vars)) {
    root.style.setProperty(key, val)
  }
  root.setAttribute('data-theme', isDark ? 'dark' : 'light')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta && vars['--bg-primary']) meta.setAttribute('content', vars['--bg-primary'])
}

function hexToRgba(hex, alpha) {
  const h = hex.replace('#', '')
  const r = parseInt(h.slice(0, 2), 16)
  const g = parseInt(h.slice(2, 4), 16)
  const b = parseInt(h.slice(4, 6), 16)
  return `rgba(${r},${g},${b},${alpha})`
}

export function buildCustomNavbarBg(colors, isDark) {
  const opacity = isDark ? 0.70 : 0.22
  const base    = isDark ? 'rgba(28,28,30,0.85)' : 'rgba(255,255,255,0.72)'
  const n       = colors.length
  const stops   = colors.map((c, i) => {
    const pct = n === 1 ? '50%' : `${Math.round(i * 100 / (n - 1))}%`
    return `${hexToRgba(c, opacity)} ${pct}`
  }).join(', ')
  return `linear-gradient(90deg, ${stops}), ${base}`
}

export function ThemeProvider({ children }) {
  const [mode, setModeState] = useState(() => {
    migrateLegacy()
    const saved = localStorage.getItem(MODE_KEY)
    return (saved === 'light' || saved === 'dark') ? saved : 'light'
  })
  const [collection, setCollectionState] = useState(
    () => localStorage.getItem(COLLECTION_KEY) || 'none'
  )
  const [customColors, setCustomColorsState] = useState(() => {
    try {
      const stored = localStorage.getItem(CUSTOM_COLORS_KEY)
      if (stored) return JSON.parse(stored)
    } catch {}
    return DEFAULT_CUSTOM_COLORS
  })

  useEffect(() => {
    if (collection === 'custom') {
      const dark = mode === 'dark'
      const { vars: base } = resolveTheme(mode, 'none', false)
      applyTheme({ ...base, '--navbar-bg': buildCustomNavbarBg(customColors, dark) }, dark)
    } else {
      const { vars, isDark } = resolveTheme(mode, collection, false)
      applyTheme(vars, isDark)
    }
  }, [mode, collection, customColors])

  function setMode(m) { localStorage.setItem(MODE_KEY, m); setModeState(m) }
  function setCollection(c) { localStorage.setItem(COLLECTION_KEY, c); setCollectionState(c) }
  function setCustomColors(cols) { localStorage.setItem(CUSTOM_COLORS_KEY, JSON.stringify(cols)); setCustomColorsState(cols) }

  const isDark = mode === 'dark'

  return (
    <ThemeContext.Provider value={{
      mode, setMode,
      collection, setCollection,
      customColors, setCustomColors,
      isDark,
    }}>
      {children}
    </ThemeContext.Provider>
  )
}

export function useTheme() {
  return useContext(ThemeContext)
}

export { THEMES }
