import { motion, AnimatePresence } from 'framer-motion'
import { useState, useEffect, useRef, lazy, Suspense } from 'react'
const LogExerciseModal = lazy(() => import('../Modals/LogExerciseModal.jsx'))
const StartExerciseModal = lazy(() => import('../Modals/StartExerciseModal.jsx'))
const PlannerScreen = lazy(() => import('../../screens/PlannerScreen.jsx'))
const PlannerSessionScreen = lazy(() => import('../../screens/PlannerSessionScreen.jsx'))
import { saveActiveSession, loadActiveSession, clearActiveSession } from '../../utils/plannerSessionDB.js'
import { useLanguage } from '../../context/LanguageContext.jsx'
import NavPopover, { PopoverRow } from './NavPopover.jsx'
import { ItemIcon } from './WorkspaceSwitcher.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { upsertActiveSession, touchActiveSession, deleteActiveSession } from '../../services/dbInterface.js'
import { useAssistant } from '../../assistant/AssistantProvider.jsx'

export default function FloatingActionPopup({ onClose, anchorRef }) {
  const { t } = useLanguage()
  const { user } = useAuth()
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
    <NavPopover anchorRef={anchorRef} rowCount={assistant ? 4 : 3} onClose={onClose}>
      <PopoverRow
        icon={<ItemIcon icon="check" color="#007AFF" />}
        color="#007AFF"
        label={t('fap.logLabel')}
        detail={t('fap.logDesc')}
        onClick={() => setShowLog(true)}
      />
      <PopoverRow
        icon={<ItemIcon icon="zap" color="#34C759" />}
        color="#34C759"
        label={t('fap.startLabel')}
        detail={t('fap.startDesc')}
        onClick={() => setShowStart(true)}
      />
      <PopoverRow
        icon={<>
          <ItemIcon icon="calendar" color="#FF9F0A" />
          {plannerSession && (
            <span style={{ position: 'absolute', top: -3, right: -3, width: 8, height: 8, borderRadius: '50%', background: '#FF453A' }} />
          )}
        </>}
        color="#FF9F0A"
        label={t('fap.plannerLabel')}
        detail={plannerSession ? t('fap.plannerResume') : t('fap.plannerDesc')}
        onClick={() => plannerSession ? setShowSession(true) : setShowPlanner(true)}
      />
      {assistant && (
        <PopoverRow
          icon={<ItemIcon icon="spark" color="#AF52DE" />}
          color="#AF52DE"
          label={t('fap.assistantLabel')}
          detail={t('fap.assistantDesc')}
          onClick={() => { onClose(); assistant.openAssistant() }}
        />
      )}
    </NavPopover>
  )
}
