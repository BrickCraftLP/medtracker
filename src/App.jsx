import { useState, useEffect, useContext, useRef, useCallback, createContext, lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { useData } from './context/DataContext.jsx'
import { AnimatePresence, motion } from 'framer-motion'
import { AuthProvider, useAuth } from './context/AuthContext.jsx'
import { DataProvider } from './context/DataContext.jsx'
import { WorkspaceProvider } from './context/WorkspaceContext.jsx'
import { NavDirectionContext, TABS } from './context/navDirection.js'
import { CircleRevealContext } from './context/circleReveal.js'
import Navbar from './components/Navigation/Navbar.jsx'
import CircleRevealOverlay from './components/Navigation/CircleRevealOverlay.jsx'
import { todoSwipeActive } from './utils/gestureState.js'
import { PinProvider, usePin, hasPinHint } from './context/PinContext.jsx'
import LoadingPlate from './components/Common/Spinner.jsx'
import { hideBootLoader } from './utils/bootLoader.js'
import { LanguageProvider } from './context/LanguageContext.jsx'
import { GraphSettingsProvider } from './context/GraphSettingsContext.jsx'
import { NotificationSettingsProvider } from './context/NotificationSettingsContext.jsx'
import { NavLayoutProvider, useNavLayout } from './context/NavLayoutContext.jsx'
import { CalendarSettingsProvider } from './context/CalendarSettingsContext.jsx'
import { GoogleSyncProvider } from './context/GoogleSyncContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { UpdateProvider } from './context/UpdateContext.jsx'
import UpdateToast from './components/Common/UpdateToast.jsx'
import UpdateOverlay from './components/Common/UpdateOverlay.jsx'
import PushSync from './components/Common/PushSync.jsx'
import LoginScreen from './screens/LoginScreen.jsx'
import FirstLoadScreen from './screens/FirstLoadScreen.jsx'
import HomeScreen from './screens/HomeScreen.jsx'
import { AssistantProvider } from './assistant/AssistantProvider.jsx'
import AssistantOverlay from './assistant/ui/AssistantOverlay.jsx'
import ErrorBoundary, { isChunkError } from './components/Common/ErrorBoundary.jsx'
import { useLanguage } from './context/LanguageContext.jsx'

// Reloading once is the whole recovery: after a deploy an installed PWA can
// still be running an old index.html whose chunk filenames no longer exist, so
// import() rejects and the screen never renders. The session flag keeps a
// genuinely missing chunk from reloading in a loop.
const RELOAD_KEY = 'mt_chunk_reloaded'

function lazyRoute(loader) {
  return lazy(() => loader().catch(err => {
    if (!isChunkError(err)) throw err
    let already = false
    try {
      already = sessionStorage.getItem(RELOAD_KEY) === '1'
      if (!already) sessionStorage.setItem(RELOAD_KEY, '1')
    } catch { /* private mode: fall through and surface the error */ }
    if (already) throw err
    window.location.reload()
    return new Promise(() => {}) // never settles; the reload replaces this document
  }))
}

// Route-level code splitting: only the login / first-load / home path is in the
// initial bundle. Every other screen (and the recharts + colour-picker deps they
// pull in) is fetched on demand and warmed up during idle time below.
const PinLockScreen = lazyRoute(() => import('./screens/PinLockScreen.jsx'))
const TopicsScreen = lazyRoute(() => import('./screens/TopicsScreen.jsx'))
const CalendarScreen = lazyRoute(() => import('./screens/CalendarScreen.jsx'))
const ExamsScreen = lazyRoute(() => import('./screens/ExamsScreen.jsx'))
const CalendarSettingsScreen = lazyRoute(() => import('./screens/CalendarSettingsScreen.jsx'))
const CalendarConnectScreen = lazyRoute(() => import('./screens/CalendarConnectScreen.jsx'))
const StatisticsScreen = lazyRoute(() => import('./screens/StatisticsScreen.jsx'))
const ActiveSessionScreen = lazyRoute(() => import('./screens/ActiveSessionScreen.jsx'))
const SessionSummaryScreen = lazyRoute(() => import('./screens/SessionSummaryScreen.jsx'))
const TopicStatsScreen = lazyRoute(() => import('./screens/TopicStatsScreen.jsx'))
const DatenschutzScreen = lazyRoute(() => import('./screens/DatenschutzScreen.jsx'))
const SettingsScreen = lazyRoute(() => import('./screens/SettingsScreen.jsx'))
const DataSettingsScreen = lazyRoute(() => import('./screens/DataSettingsScreen.jsx'))
const StorageSettingsScreen = lazyRoute(() => import('./screens/StorageSettingsScreen.jsx'))
const LanguageSettingsScreen = lazyRoute(() => import('./screens/LanguageSettingsScreen.jsx'))
const AccountSettingsScreen = lazyRoute(() => import('./screens/AccountSettingsScreen.jsx'))
const GraphsCustomisationScreen = lazyRoute(() => import('./screens/GraphsCustomisationScreen.jsx'))
const HeatmapCustomisationScreen = lazyRoute(() => import('./screens/HeatmapCustomisationScreen.jsx'))
const AppearanceScreen = lazyRoute(() => import('./screens/AppearanceScreen.jsx'))
const PrideCollectionScreen = lazyRoute(() => import('./screens/PrideCollectionScreen.jsx'))
const CustomThemeScreen = lazyRoute(() => import('./screens/CustomThemeScreen.jsx'))
const ChangelogScreen = lazyRoute(() => import('./screens/ChangelogScreen.jsx'))
const TourScreen = lazyRoute(() => import('./screens/TourScreen.jsx'))
const CreateWorkspaceScreen = lazyRoute(() => import('./screens/CreateWorkspaceScreen.jsx'))
const AssistantSettingsScreen = lazyRoute(() => import('./screens/AssistantSettingsScreen.jsx'))

// Directional slide variants — custom value is the direction (-1 | 0 | 1)
const pageVariants = {
  initial: d => ({ opacity: 0, x: d * 60, y: d === 0 ? 6 : 0 }),
  animate: { opacity: 1, x: 0, y: 0, pointerEvents: 'auto' },
  exit:    d => ({ opacity: 0, x: d * -60, pointerEvents: 'none' }),
}

function PageWrapper({ children }) {
  const { direction } = useContext(NavDirectionContext)
  const { t } = useLanguage()
  const location = useLocation()
  const DIRECTIONAL = [...TABS, '/topic-stats']
  const d = DIRECTIONAL.includes(location.pathname) ? direction : 0
  return (
    <motion.div
      custom={d}
      variants={pageVariants}
      initial="initial"
      animate="animate"
      exit="exit"
      transition={{ duration: 0.26, ease: [0.32, 0, 0.67, 0] }}
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Per screen, so one failing route leaves the rest of the app usable.
          Suspense only covers a pending import — a rejected one is an error. */}
      <ErrorBoundary labels={{ title: t('error.title'), chunk: t('error.chunk'), action: t('error.action') }}>
        <Suspense fallback={<div style={{ flex: 1, background: 'var(--bg-primary)' }} />}>
          {children}
        </Suspense>
      </ErrorBoundary>
    </motion.div>
  )
}

// Warm the chunks for the screens a user reaches most often, once the app is
// idle. Navigation then resolves from cache instead of hitting the network.
const PREFETCHES = [
  () => import('./screens/TopicsScreen.jsx'),
  () => import('./screens/CalendarScreen.jsx'),
  () => import('./screens/StatisticsScreen.jsx'),
  () => import('./screens/SettingsScreen.jsx'),
  () => import('./screens/ActiveSessionScreen.jsx'),
]

function useIdlePrefetch() {
  useEffect(() => {
    const idle = window.requestIdleCallback ?? (cb => setTimeout(cb, 1500))
    const cancel = window.cancelIdleCallback ?? clearTimeout
    const handles = PREFETCHES.map(load => idle(() => { load() }))
    return () => handles.forEach(h => cancel(h))
  }, [])
}

function AppRoutes() {
  const { user, loading } = useAuth()

  // While auth resolves with no cached hint, render nothing and let the inline
  // #boot-loader (index.html) keep spinning underneath — an opaque plate here
  // would just hide it. Only first-ever installs reach this; returning users
  // have a cached user id and go straight to LoggedInApp.
  if (loading && !user) return null

  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<LoginScreen />} />
        <Route path="/datenschutz" element={<Suspense fallback={null}><DatenschutzScreen /></Suspense>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    )
  }

  return <LoggedInApp />
}

function PinLockOverlay() {
  const { isLocked, configLoading } = usePin()
  if (configLoading) {
    // No PIN on this device last time the config resolved → nothing to hide,
    // so don't cover the app (or the boot loader) while the round-trip runs.
    if (!hasPinHint()) return null
    // A PIN may exist: keep content hidden, but show the spinner rather than a
    // blank plate, since this wait includes a network round-trip.
    return <LoadingPlate zIndex={500} />
  }
  if (!isLocked) return null
  return (
    <AnimatePresence>
      <motion.div
        key="pin-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        style={{ position: 'fixed', inset: 0, zIndex: 500 }}
      >
        <Suspense fallback={null}><PinLockScreen /></Suspense>
      </motion.div>
    </AnimatePresence>
  )
}

function LoggedInApp() {
  const [direction, setDirection] = useState(0)
  useIdlePrefetch()

  // Full-screen "white circle" reveal transition — see circleReveal.js /
  // CircleRevealOverlay.jsx. `triggerReveal` is exposed via context so any
  // nested component can kick it off without knowing where the overlay lives.
  const [revealActive, setRevealActive] = useState(false)
  const [revealReverse, setRevealReverse] = useState(false)
  const revealCallbackRef = useRef(null)
  const triggerReveal = useCallback((onCovered, opts) => {
    revealCallbackRef.current = onCovered
    setRevealReverse(!!opts?.reverse)
    setRevealActive(true)
  }, [])

  return (
    <NavDirectionContext.Provider value={{ direction, setDirection }}>
      <CircleRevealContext.Provider value={{ triggerReveal }}>
        <PinProvider>
          {/* Above DataProvider: the active workspace scope must be resolved
              before DataProvider's synchronous first-paint seed runs. */}
          <WorkspaceProvider>
            <DataProvider>
              <AppShell
                direction={direction}
                setDirection={setDirection}
                revealActive={revealActive}
                revealReverse={revealReverse}
                onRevealCovered={() => revealCallbackRef.current?.()}
                onRevealDone={() => setRevealActive(false)}
              />
            </DataProvider>
          </WorkspaceProvider>
          <PinLockOverlay />
        </PinProvider>
      </CircleRevealContext.Provider>
    </NavDirectionContext.Provider>
  )
}

// Gates the app behind the first-ever data load on this device. `dataLoading`
// is only true on a genuine cold start (no cached snapshot, no local
// IndexedDB data yet) — every other reopen resolves it before this ever
// renders, so the small SyncIndicator pill remains the indicator for
// ordinary background syncs.
function AppShell({ direction, setDirection, revealActive, revealReverse, onRevealCovered, onRevealDone }) {
  const { dataLoading } = useData()
  // Real content is on screen — hand off from the inline boot loader.
  useEffect(() => { if (!dataLoading) hideBootLoader() }, [dataLoading])
  if (dataLoading) return <FirstLoadScreen />
  return (
    // Google sync lives above every screen, so it runs wherever the user is —
    // not only while a calendar settings screen happens to be open.
    <GoogleSyncProvider>
      <AssistantProvider>
        <SyncIndicator />
        <SwipeContainer direction={direction} setDirection={setDirection} />
        <AssistantOverlay />
        <CircleRevealOverlay active={revealActive} reverse={revealReverse} onCovered={onRevealCovered} onDone={onRevealDone} />
      </AssistantProvider>
    </GoogleSyncProvider>
  )
}

function SwipeContainer({ direction, setDirection }) {
  const location = useLocation()
  const navigate = useNavigate()
  const { widgetModalOpen } = useData()
  const { tabOrder } = useNavLayout()

  const tabIdx = tabOrder.indexOf(location.pathname)
  const isSettings = location.pathname.startsWith('/settings')

  function handlePanEnd(_, info) {
    if (todoSwipeActive.current) return
    if (widgetModalOpen) return
    const { offset, velocity } = info
    if (Math.abs(offset.x) < Math.abs(offset.y) * 1.2) return
    if (Math.abs(offset.x) < 45 && Math.abs(velocity.x) < 450) return

    if (isSettings) {
      if (offset.x > 45 || velocity.x > 450) {
        setDirection(-1)
        location.pathname === '/settings' ? navigate('/home') : navigate(-1)
      }
      return
    }

    if (tabIdx === -1) return
    if ((offset.x < -45 || velocity.x < -450) && tabIdx < tabOrder.length - 1) {
      setDirection(1)
      navigate(tabOrder[tabIdx + 1])
    } else if ((offset.x > 45 || velocity.x > 450) && tabIdx > 0) {
      setDirection(-1)
      navigate(tabOrder[tabIdx - 1])
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', overflow: 'hidden' }}>
      <motion.div
        style={{ flex: 1, minHeight: 0, position: 'relative', display: 'flex', flexDirection: 'column', touchAction: 'pan-y' }}
        onPanEnd={tabIdx !== -1 || isSettings ? handlePanEnd : undefined}
      >
        <AnimatePresence initial={false} mode="sync" custom={direction}>
          <Routes location={location} key={location.key}>
            <Route path="/" element={<Navigate to="/home" replace />} />
            <Route path="/home"        element={<PageWrapper><HomeScreen /></PageWrapper>} />
            <Route path="/topics"      element={<PageWrapper><TopicsScreen /></PageWrapper>} />
            <Route path="/calendar"    element={<PageWrapper><CalendarScreen /></PageWrapper>} />
            <Route path="/calendar/connect" element={<PageWrapper><CalendarConnectScreen /></PageWrapper>} />
            <Route path="/exams"       element={<PageWrapper><ExamsScreen /></PageWrapper>} />
            <Route path="/statistics"  element={<PageWrapper><StatisticsScreen /></PageWrapper>} />
            <Route path="/datenschutz" element={<Suspense fallback={null}><DatenschutzScreen /></Suspense>} />
            <Route path="/topic-stats" element={<PageWrapper><TopicStatsScreen /></PageWrapper>} />
            <Route path="/session"     element={<PageWrapper><ActiveSessionScreen /></PageWrapper>} />
            <Route path="/summary"     element={<PageWrapper><SessionSummaryScreen /></PageWrapper>} />
            <Route path="/settings"                    element={<PageWrapper><SettingsScreen /></PageWrapper>} />
            <Route path="/settings/data"               element={<PageWrapper><DataSettingsScreen /></PageWrapper>} />
            <Route path="/settings/google/:section"    element={<PageWrapper><CalendarSettingsScreen /></PageWrapper>} />
            <Route path="/settings/storage"            element={<PageWrapper><StorageSettingsScreen /></PageWrapper>} />
            <Route path="/settings/assistant"          element={<PageWrapper><AssistantSettingsScreen /></PageWrapper>} />
            <Route path="/settings/language"           element={<PageWrapper><LanguageSettingsScreen /></PageWrapper>} />
            <Route path="/settings/appearance"         element={<PageWrapper><AppearanceScreen /></PageWrapper>} />
            <Route path="/settings/appearance/pride"   element={<PageWrapper><PrideCollectionScreen /></PageWrapper>} />
            <Route path="/settings/appearance/custom"  element={<PageWrapper><CustomThemeScreen /></PageWrapper>} />
            <Route path="/settings/customisation/graphs"  element={<PageWrapper><GraphsCustomisationScreen /></PageWrapper>} />
            <Route path="/settings/customisation/heatmap" element={<PageWrapper><HeatmapCustomisationScreen /></PageWrapper>} />
            <Route path="/settings/account"            element={<PageWrapper><AccountSettingsScreen /></PageWrapper>} />
            <Route path="/settings/changelog"          element={<PageWrapper><ChangelogScreen /></PageWrapper>} />
            <Route path="/settings/tour"               element={<PageWrapper><TourScreen /></PageWrapper>} />
            <Route path="/workspaces/new"               element={<PageWrapper><CreateWorkspaceScreen /></PageWrapper>} />
            <Route path="/workspaces/:id/edit"          element={<PageWrapper><CreateWorkspaceScreen /></PageWrapper>} />
            <Route path="*"            element={<Navigate to="/home" replace />} />
          </Routes>
        </AnimatePresence>
      </motion.div>
      <NavbarWrapper />
    </div>
  )
}

function NavbarWrapper() {
  const location = useLocation()
  const { widgetModalOpen } = useData()
  const { position, scale } = useNavLayout()
  const hideNav = location.pathname === '/' ||
    location.pathname.startsWith('/session') ||
    location.pathname.startsWith('/summary') ||
    location.pathname.startsWith('/datenschutz') ||
    location.pathname.startsWith('/settings') ||
    location.pathname.startsWith('/workspaces')
  // Drives the content clearance in index.css: a vertical rail needs side
  // padding instead of the bottom padding a horizontal bar needs. Routes that
  // hide the nav get neither — but a widget modal only hides the bar for a
  // moment, so the layout underneath must not reflow while it's open.
  useEffect(() => {
    const el = document.documentElement
    el.dataset.navPos = hideNav ? 'none' : position
    el.dataset.navScale = hideNav ? 'medium' : scale
    return () => { delete el.dataset.navPos; delete el.dataset.navScale }
  }, [hideNav, position, scale])

  // Routes like Settings need the bar gone for good, not fading out — an
  // in-flight AnimatePresence exit (interrupted by a fast route change, or a
  // stuck animation) can otherwise leave it at opacity 0 while still mounted
  // and still receiving taps. Only the transient widgetModalOpen toggle gets
  // the fade, since that one really does return to the same screen.
  if (hideNav) return null

  return (
    <AnimatePresence>
      {!widgetModalOpen && <Navbar key="navbar" />}
    </AnimatePresence>
  )
}

function SyncIndicator() {
  const { syncing } = useData()
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    if (syncing) {
      const t = setTimeout(() => setVisible(true), 350)
      return () => clearTimeout(t)
    } else {
      setVisible(false)
    }
  }, [syncing])

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', paddingTop: 'max(calc(env(safe-area-inset-top, 0px) + 10px), 10px)', zIndex: 300, pointerEvents: 'none' }}>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.82 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.88 }}
            transition={{ type: 'spring', damping: 20, stiffness: 340 }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px 5px 9px', borderRadius: 9999, background: 'var(--glass-card-bg)', backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)', WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)', border: '0.5px solid var(--glass-card-stroke)', boxShadow: 'var(--glass-card-shadow)', fontSize: 12, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: -0.1 }}
          >
            <motion.div
              animate={{ rotate: 360 }}
              transition={{ repeat: Infinity, duration: 1.1, ease: 'linear' }}
              style={{ width: 13, height: 13, borderRadius: '50%', border: '1.5px solid var(--border-strong)', borderTopColor: 'var(--accent)', flexShrink: 0 }}
            />
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M6.5 20Q4.22 20 2.61 18.43 1 16.85 1 14.58q0-1.95 1.17-3.48 1.18-1.53 3.08-1.95.51-2.18 2.19-3.66Q9.13 4 11.38 4q2.57 0 4.34 1.77 1.78 1.78 1.78 4.35v.38q1.7.13 2.75 1.28Q21.3 12.93 21.3 14.6q0 1.77-1.28 2.89Q18.73 18.6 17 18.6" stroke="var(--text-secondary)" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M12 13v7M9.5 17.5 12 20l2.5-2.5" stroke="var(--accent)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function App() {
  return (
    <ThemeProvider>
      <GraphSettingsProvider>
      <NotificationSettingsProvider>
       <CalendarSettingsProvider>
       <NavLayoutProvider>
        <LanguageProvider>
          {/* Outside AuthProvider: the update prompt must work on the login
              screen too. The toast sits below the PIN lock plate by z-index,
              so a locked app stays covered. */}
          <UpdateProvider>
            <BrowserRouter>
              <AuthProvider>
                <AppRoutes />
                <PushSync />
              </AuthProvider>
            </BrowserRouter>
            <UpdateToast />
            <UpdateOverlay />
          </UpdateProvider>
        </LanguageProvider>
       </NavLayoutProvider>
       </CalendarSettingsProvider>
      </NotificationSettingsProvider>
      </GraphSettingsProvider>
    </ThemeProvider>
  )
}
