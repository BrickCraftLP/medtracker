import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef, lazy, Suspense } from 'react'
const LogExerciseModal = lazy(() => import('../Modals/LogExerciseModal.jsx'))
const StartExerciseModal = lazy(() => import('../Modals/StartExerciseModal.jsx'))
const PlannerScreen = lazy(() => import('../../screens/PlannerScreen.jsx'))
const PlannerSessionScreen = lazy(() => import('../../screens/PlannerSessionScreen.jsx'))
import { saveActiveSession, loadActiveSession, clearActiveSession } from '../../utils/plannerSessionDB.js'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useNavLayout } from '../../context/NavLayoutContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { upsertActiveSession, touchActiveSession, deleteActiveSession } from '../../services/dbInterface.js'
import { useAssistant } from '../../assistant/AssistantProvider.jsx'

export default function FloatingActionPopup({ onClose }) {
  const { t } = useLanguage()
  const { user } = useAuth()
  const { position, isVertical } = useNavLayout()
  const assistant = useAssistant()
  const [showLog, setShowLog] = useState(false)
  const [showStart, setShowStart] = useState(false)
  const [showPlanner, setShowPlanner] = useState(false)
  const [showSession, setShowSession] = useState(false)
  // { plan, results } — persisted in IndexedDB
  const [plannerSession, setPlannerSession] = useState(null)
  const [dbChecked, setDbChecked] = useState(false)
  // Prevent action-buttons flash when closing after session complete/cancel
  const closingRef = useRef(false)

  // Restore active session from IndexedDB on mount
  useEffect(() => {
    loadActiveSession()
      .then(saved => { if (saved?.plan?.items?.length) setPlannerSession(saved) })
      .catch(() => {})
      .finally(() => setDbChecked(true))
  }, [])

  function handleStartSession(plan) {
    const session = { plan, results: {} }
    setPlannerSession(session)
    setShowPlanner(false)
    setShowSession(true)
    saveActiveSession(session).catch(() => {})
    // Server-side mirror for the "session still running" push.
    if (user?.id) upsertActiveSession(user.id).catch(() => {})
  }

  function handleSaveProgress(results) {
    setPlannerSession(prev => {
      const updated = { ...prev, results }
      saveActiveSession(updated).catch(() => {})
      return updated
    })
    if (user?.id) touchActiveSession(user.id).catch(() => {})
  }

  function handleSessionBack() {
    onClose()
  }

  function handleSessionComplete() {
    closingRef.current = true
    clearActiveSession().catch(() => {})
    if (user?.id) deleteActiveSession(user.id).catch(() => {})
    setPlannerSession(null)
    onClose()
  }

  // ── Active planner session — only shown when user explicitly taps the card ──
  if (showSession && plannerSession) {
    return (
      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', stiffness: 340, damping: 32 }}
        style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column' }}
      >
        <Suspense fallback={null}>
          <PlannerSessionScreen
            plan={plannerSession.plan}
            initialResults={plannerSession.results}
            onBack={handleSessionBack}
            onComplete={handleSessionComplete}
            onSave={handleSaveProgress}
            onCancel={handleSessionComplete}
          />
        </Suspense>
      </motion.div>
    )
  }

  // Wait for IndexedDB check before showing anything (avoids FAP flash)
  if (!dbChecked) return null

  // During session-complete/cancel exit animation, render nothing
  // so the action-buttons menu doesn't flash while the backdrop fades out
  if (closingRef.current) return null

  if (showLog)   return <Suspense fallback={null}><LogExerciseModal onClose={onClose} /></Suspense>
  if (showStart) return <Suspense fallback={null}><StartExerciseModal onClose={() => { setShowStart(false); onClose() }} /></Suspense>

  if (showPlanner) {
    return (
      <Suspense fallback={null}>
        <PlannerScreen
          onDismiss={() => { setShowPlanner(false); onClose() }}
          onStartSession={handleStartSession}
        />
      </Suspense>
    )
  }

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)',
          zIndex: 40,
        }}
      />

      <div style={{
        position: 'fixed',
        // Vertical rail: the bar no longer sits under the card, so anchor
        // lower — but keep clear of the rail on its side.
        bottom: isVertical
          ? 'calc(max(env(safe-area-inset-bottom, 16px), 16px) + 16px)'
          : 'calc(max(env(safe-area-inset-bottom, 16px), 16px) + 72px)',
        left: 0, right: 0, zIndex: 60,
        display: 'flex', justifyContent: 'center',
        padding: '0 24px', pointerEvents: 'none',
        ...(isVertical
          ? (position === 'left' ? { paddingLeft: 100 } : { paddingRight: 100 })
          : null),
      }}>
        <motion.div
          initial={{ opacity: 0, y: 24, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.95 }}
          transition={{ type: 'spring', damping: 24, stiffness: 320 }}
          style={{ display: 'flex', flexDirection: 'column', gap: 12, width: '100%', maxWidth: 360, pointerEvents: 'auto' }}
        >
          <ActionButton
            icon="📋"
            label={t('fap.logLabel')}
            description={t('fap.logDesc')}
            onClick={() => setShowLog(true)}
            color="#007AFF"
          />
          <ActionButton
            icon="▶️"
            label={t('fap.startLabel')}
            description={t('fap.startDesc')}
            onClick={() => setShowStart(true)}
            color="#34C759"
          />
          <ActionButton
            icon="🗓️"
            label={t('fap.plannerLabel')}
            description={plannerSession ? t('fap.plannerResume') : t('fap.plannerDesc')}
            onClick={() => plannerSession ? setShowSession(true) : setShowPlanner(true)}
            color="#FF9F0A"
            badge={!!plannerSession}
            badgeColor="#FF453A"
          />
          {assistant && (
            <ActionButton
              icon="✨"
              label={t('fap.assistantLabel')}
              description={t('fap.assistantDesc')}
              onClick={() => { onClose(); assistant.openAssistant() }}
              color="#AF52DE"
            />
          )}
        </motion.div>
      </div>
    </>
  )
}

function ActionButton({ icon, label, description, onClick, color, badge, badgeColor }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={(e) => { e.stopPropagation(); onClick(e) }}
      className="glass-card"
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '15px 18px', borderRadius: 20, cursor: 'pointer', textAlign: 'left', width: '100%', border: 'none', position: 'relative' }}
    >
      <div style={{ width: 44, height: 44, borderRadius: 12, background: `${color}20`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 21, flexShrink: 0, position: 'relative' }}>
        {icon}
        {badge && (
          <div style={{ position: 'absolute', top: -3, right: -3, width: 9, height: 9, borderRadius: '50%', background: badgeColor ?? color, border: '1.5px solid var(--bg-primary)', opacity: 0.85 }} />
        )}
      </div>
      <div>
        <div style={{ color: 'var(--text-primary)', fontWeight: 600, fontSize: 17, letterSpacing: -0.3 }}>{label}</div>
        <div style={{ color: 'var(--text-secondary)', fontSize: 13, marginTop: 1 }}>{description}</div>
      </div>
    </motion.button>
  )
}
