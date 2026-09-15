import { useState, useContext, useEffect, useRef, useCallback, lazy, Suspense } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
// The action popup drags in the log/start modals and both planner screens.
// Split it out and warm it while idle so the first tap still feels instant.
const loadPopup = () => import('./FloatingActionPopup.jsx')
const FloatingActionPopup = lazy(loadPopup)
import { NavDirectionContext } from '../../context/navDirection.js'
import { useNavLayout, PLUS_ID, WORKSPACE_ID, SETTINGS_ID, ASSISTANT_ID } from '../../context/NavLayoutContext.jsx'
import WorkspaceSwitcher from './WorkspaceSwitcher.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useCircleReveal } from '../../context/circleReveal.js'
import { useAssistant } from '../../assistant/AssistantProvider.jsx'

// Looked up by path — the visible order comes from the user's nav layout.
export const NAV_ICONS = {
  '/home': HomeIcon,
  '/topics': TopicsIcon,
  '/calendar': CalendarIcon,
  '/statistics': StatsIcon,
}

function HomeIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? 'var(--accent)' : 'var(--text-secondary)'}>
      <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
    </svg>
  )
}

function TopicsIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? 'var(--accent)' : 'var(--text-secondary)'}>
      <path d="M4 6h16v2H4zm0 5h16v2H4zm0 5h16v2H4z"/>
    </svg>
  )
}

function CalendarIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? 'var(--accent)' : 'var(--text-secondary)'}>
      <path d="M7 2v2h10V2h2v2h1.5A1.5 1.5 0 0122 5.5v15a1.5 1.5 0 01-1.5 1.5h-17A1.5 1.5 0 012 20.5v-15A1.5 1.5 0 013.5 4H5V2h2zm13 8H4v10h16V10zM8 12v2H6v-2h2zm5 0v2h-2v-2h2zm5 0v2h-2v-2h2zM8 16v2H6v-2h2zm5 0v2h-2v-2h2zm5 0v2h-2v-2h2z"/>
    </svg>
  )
}

function StatsIcon({ active }) {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill={active ? 'var(--accent)' : 'var(--text-secondary)'}>
      <path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/>
    </svg>
  )
}

// A shortcut into Settings — never "active" (the bar is hidden on that
// route), so it stays in the same neutral color the other icons rest at.
export function SettingsIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--text-secondary)">
      <path d="M19.14 12.94a7.99 7.99 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.97 7.97 0 00-1.62-.94l-.36-2.54A.5.5 0 0014 2h-4a.5.5 0 00-.5.42l-.36 2.54c-.59.24-1.13.56-1.62.94l-2.39-.96a.5.5 0 00-.6.22L2.61 8.48a.5.5 0 00.12.64l2.03 1.58c-.05.31-.08.62-.08.94s.03.63.08.94L2.73 14.16a.5.5 0 00-.12.64l1.92 3.32c.14.24.42.32.6.22l2.39-.96c.49.38 1.03.7 1.62.94l.36 2.54c.05.28.28.42.5.42h4c.22 0 .45-.14.5-.42l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.24.1.46.02.6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"/>
    </svg>
  )
}

// A shortcut into the assistant pill — same neutral color as the other
// icons, since it isn't tied to a route (never "active").
export function AssistantIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="var(--text-secondary)">
      <path d="M12 2l2.2 6.3L20.5 10.5 14.2 12.7 12 19l-2.2-6.3L3.5 10.5l6.3-2.2L12 2z" />
    </svg>
  )
}

export default function Navbar() {
  const navigate = useNavigate()
  const location = useLocation()
  const { setDirection } = useContext(NavDirectionContext)
  const { triggerReveal } = useCircleReveal()
  const { position, order, tabOrder, isVertical } = useNavLayout()
  const { t } = useLanguage()
  const assistant = useAssistant()
  const [showPopup, setShowPopup] = useState(false)
  const plusRef = useRef(null)
  const closePopup = useCallback(() => setShowPopup(false), [])

  useEffect(() => {
    const idle = window.requestIdleCallback ?? (cb => setTimeout(cb, 1500))
    const cancel = window.cancelIdleCallback ?? clearTimeout
    const h = idle(() => { loadPopup() })
    return () => cancel(h)
  }, [])

  function navTo(path) {
    const from = tabOrder.indexOf(location.pathname)
    const to   = tabOrder.indexOf(path)
    if (from !== -1 && to !== -1) {
      setDirection(to > from ? 1 : to < from ? -1 : 0)
    } else {
      setDirection(0)
    }
    navigate(path)
  }

  // The dot sits on the free edge: below the icon when horizontal, on the
  // inner edge (facing the content) when the bar is a vertical rail. It has
  // a `layoutId`, so it must never carry a manual `transform` itself — that
  // fights framer-motion's own transform during the layout animation and
  // throws the dot off to one side. Centering along the other axis is done
  // by a plain flex wrapper around it instead.
  const indicatorWrap = !isVertical
    ? { left: 0, right: 0, bottom: 2, justifyContent: 'center' }
    : position === 'left'
      ? { top: 0, bottom: 0, right: 2, alignItems: 'center' }
      : { top: 0, bottom: 0, left: 2, alignItems: 'center' }

  function renderPlus() {
    return (
      <motion.button
        key={PLUS_ID}
        ref={plusRef}
        whileTap={{ scale: 0.88 }}
        onClick={() => setShowPopup(v => !v)}
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: 'var(--accent)',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
          boxShadow: '0 4px 12px rgba(99,102,241,0.4)',
        }}
        aria-label="Add"
      >
        <motion.svg
          width="20" height="20" viewBox="0 0 24 24" fill="white"
          animate={{ rotate: showPopup ? 45 : 0 }}
          transition={{ type: 'spring', stiffness: 360, damping: 28 }}
        >
          <path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
        </motion.svg>
      </motion.button>
    )
  }

  function renderTab(path) {
    const Icon = NAV_ICONS[path]
    if (!Icon) return null
    const active = location.pathname === path
    return (
      <motion.button
        key={path}
        whileTap={{ scale: 0.88 }}
        onClick={() => navTo(path)}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: isVertical ? '14px 8px' : '8px 14px',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 2,
          position: 'relative',
        }}
        aria-label={t(`nav.${path.slice(1)}`)}
      >
        <Icon active={active} />
        {active && (
          <div style={{ position: 'absolute', display: 'flex', ...indicatorWrap }}>
            <motion.div
              layoutId="nav-indicator"
              style={{
                width: 4,
                height: 4,
                borderRadius: '50%',
                background: 'var(--accent)',
              }}
            />
          </div>
        )}
      </motion.button>
    )
  }

  function renderSettings() {
    return (
      <motion.button
        key={SETTINGS_ID}
        whileTap={{ scale: 0.88 }}
        onClick={() => { triggerReveal(() => { setDirection(1); navigate('/settings') }) }}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: isVertical ? '14px 8px' : '8px 14px',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
        aria-label={t('settings.title')}
      >
        <SettingsIcon />
      </motion.button>
    )
  }

  function renderAssistant() {
    if (!assistant) return null
    return (
      <motion.button
        key={ASSISTANT_ID}
        whileTap={{ scale: 0.88 }}
        onClick={() => assistant.openAssistant()}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: isVertical ? '14px 8px' : '8px 14px',
          borderRadius: 12,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
        aria-label={t('nav.assistant')}
      >
        <AssistantIcon />
      </motion.button>
    )
  }

  return (
    <>
      <Suspense fallback={null}>
        <AnimatePresence>
          {showPopup && (
            <FloatingActionPopup onClose={closePopup} anchorRef={plusRef} />
          )}
        </AnimatePresence>
      </Suspense>

      <motion.nav
        className={isVertical ? 'navbar navbar--vertical' : 'navbar'}
        data-nav-pos={position}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.22, ease: [0.4, 0, 0.2, 1] }}
      >
        {order.map(id => (
          id === PLUS_ID ? renderPlus()
            : id === WORKSPACE_ID ? <WorkspaceSwitcher key={WORKSPACE_ID} />
              : id === SETTINGS_ID ? renderSettings()
                : id === ASSISTANT_ID ? renderAssistant()
                  : renderTab(id)
        ))}
      </motion.nav>
    </>
  )
}
