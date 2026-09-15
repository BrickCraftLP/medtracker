import { createContext, useContext, useState, useEffect } from 'react'
import { TABS } from './navDirection.js'

const NavLayoutContext = createContext()

// Everything that can sit in the navbar. 'plus' is the action button,
// 'workspace' the workspace switcher, 'settings' a shortcut into Settings;
// the rest are tab routes, so `id.startsWith('/')` means "is a tab".
export const PLUS_ID = 'plus'
export const WORKSPACE_ID = 'workspace'
export const SETTINGS_ID = 'settings-shortcut'
export const ASSISTANT_ID = 'assistant-shortcut'
export const NAV_ITEM_IDS = [PLUS_ID, ...TABS, WORKSPACE_ID, SETTINGS_ID, ASSISTANT_ID]

// New items default into the bar UNLESS listed here — the settings shortcut
// starts parked in the tray so existing bars don't suddenly grow one.
const DEFAULT_HIDDEN_IDS = [SETTINGS_ID, ASSISTANT_ID]

const DEFAULTS = {
  // 'bottom' = original horizontal pill · 'left' / 'right' = vertical rail
  position: 'bottom',
  order: NAV_ITEM_IDS.filter(id => !DEFAULT_HIDDEN_IDS.includes(id)),
  hidden: [...DEFAULT_HIDDEN_IDS],
  scale: 'medium',
  v: 2,
}

export const NAV_SCALES = ['small', 'medium', 'large']

export const isTabId = id => id.startsWith('/')
const isTab = isTabId

// How many items the bar can hold — a horizontal pill runs out of width
// sooner than a vertical rail runs out of height.
export const NAV_CAPS = { bottom: 6, left: 7, right: 7 }
export const capFor = position => NAV_CAPS[position] ?? NAV_CAPS.bottom

// Every known id must appear exactly once across order + hidden, the bar must
// keep at least one tab, and it must not exceed that position's cap —
// otherwise a stale or hand-edited localStorage value could leave the user
// with no way to navigate, or an overflowing bar.
function sanitize(saved) {
  const rawOrder = Array.isArray(saved?.order) ? saved.order : DEFAULTS.order
  const rawHidden = Array.isArray(saved?.hidden) ? saved.hidden : DEFAULTS.hidden
  const position = ['bottom', 'left', 'right'].includes(saved?.position) ? saved.position : DEFAULTS.position
  const scale = NAV_SCALES.includes(saved?.scale) ? saved.scale : DEFAULTS.scale

  const seen = new Set()
  const take = (list) => list.filter(id => {
    if (!NAV_ITEM_IDS.includes(id) || seen.has(id)) return false
    seen.add(id)
    return true
  })

  const order = take(rawOrder)
  const hidden = take(rawHidden)
  // An id shipped after this value was saved shows up in the bar by default,
  // unless it opted into starting hidden (see DEFAULT_HIDDEN_IDS).
  for (const id of NAV_ITEM_IDS) {
    if (seen.has(id)) continue
    (DEFAULT_HIDDEN_IDS.includes(id) ? hidden : order).push(id)
  }

  const cap = capFor(position)
  if (order.length > cap) hidden.unshift(...order.splice(cap))

  if (!order.some(isTab)) return { order: DEFAULTS.order, hidden: [], scale }
  return { order, hidden, scale }
}

// Pre-editor values stored the plus button as a separate `plusSide` flag; it is
// now just an item in `order`.
function migrate(parsed) {
  if (!parsed || parsed.hidden || !parsed.plusSide) return parsed
  const tabs = Array.isArray(parsed.order) ? parsed.order.filter(isTab) : TABS
  const { plusSide, ...rest } = parsed
  return {
    ...rest,
    order: plusSide === 'end' ? [...tabs, PLUS_ID] : [PLUS_ID, ...tabs],
    hidden: [],
  }
}

// v2: the calendar tab came back. sanitize() would append it to the end of
// `order` and then splice it straight into the tray for anyone already at the
// cap — so the tab would ship invisible to exactly the users most likely to
// want it. Slot it next to /topics instead, and evict a non-tab if the bar is
// full.
const LAYOUT_VERSION = 2

function migrateCalendarTab(parsed) {
  if (!parsed || (parsed.v ?? 1) >= LAYOUT_VERSION) return parsed
  const order = [...(parsed.order ?? DEFAULTS.order)]
  const hidden = (parsed.hidden ?? []).filter(id => id !== '/calendar')

  if (!order.includes('/calendar')) {
    const at = order.indexOf('/topics')
    order.splice(at >= 0 ? at + 1 : order.length, 0, '/calendar')
  }

  const cap = capFor(parsed.position ?? DEFAULTS.position)
  while (order.length > cap) {
    // Never evict a tab: losing a route is worse than losing a shortcut.
    const victim = [...order].reverse().find(id => !isTab(id) && id !== PLUS_ID)
      ?? order[order.length - 1]
    order.splice(order.indexOf(victim), 1)
    hidden.unshift(victim)
  }

  return { ...parsed, order, hidden, v: LAYOUT_VERSION }
}

export function NavLayoutProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem('mt_nav_layout')
    if (saved) {
      try {
        const parsed = migrateCalendarTab(migrate(JSON.parse(saved)))
        setSettings(prev => ({ ...prev, ...parsed, ...sanitize(parsed) }))
      } catch (e) {
        console.error('Failed to parse nav layout:', e)
      }
    }
    setLoaded(true)
  }, [])

  useEffect(() => {
    if (loaded) {
      localStorage.setItem('mt_nav_layout', JSON.stringify(settings))
    }
  }, [settings, loaded])

  function setSetting(key, value) {
    setSettings(prev => ({ ...prev, [key]: value }))
  }

  return (
    <NavLayoutContext.Provider
      value={{
        ...settings,
        isVertical: settings.position !== 'bottom',
        // Swipe / slide-direction order — the plus button is not a route.
        tabOrder: settings.order.filter(isTab),
        setSetting,
      }}
    >
      {children}
    </NavLayoutContext.Provider>
  )
}

export function useNavLayout() {
  const ctx = useContext(NavLayoutContext)
  if (!ctx) {
    throw new Error('useNavLayout must be used within NavLayoutProvider')
  }
  return ctx
}
