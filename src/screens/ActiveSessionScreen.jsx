import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useNavigate, useLocation } from 'react-router-dom'
import { useSession } from '../hooks/useSession.js'
import { useData } from '../context/DataContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { upsertActiveSession, deleteActiveSession } from '../services/dbInterface.js'
import { useAssistantScreen } from '../assistant/screenContext.js'

export default function ActiveSessionScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { topics } = useData()
  const { t } = useLanguage()
  const { user } = useAuth()
  const {
    isRunning,
    elapsed,
    exercises,
    pauseBetweenExercises,
    isPaused,
    startSession,
    recordExercise,
    endSession,
    resetSession,
    pauseSession,
    resumeSession,
    formatTime,
  } = useSession()

  const topicId = location.state?.topicId
  const pauseEnabled = location.state?.pauseBetweenExercises ?? false
  const topic = topics.find(t => t.id === topicId)
  useAssistantScreen('session', { screen: 'session', topicId: topicId ?? null })

  const [showPauseDialog, setShowPauseDialog] = useState(false)
  const [manualPause, setManualPause] = useState(false)

  useEffect(() => {
    const userId = user?.id
    if (!isRunning && topicId) {
      startSession(topicId, pauseEnabled)
      // Server-side mirror for the "session still running" push.
      if (userId) upsertActiveSession(userId).catch(() => {})
    }
    // The timer lives in this screen's state, so leaving it ends the session.
    return () => { if (userId) deleteActiveSession(userId).catch(() => {}) }
  }, [])

  function handleCorrect() {
    recordExercise(true)
    triggerFeedback('correct')
    if (pauseEnabled) {
      pauseSession()
      setShowPauseDialog(true)
    }
  }

  function handleWrong() {
    recordExercise(false)
    triggerFeedback('wrong')
    if (pauseEnabled) {
      pauseSession()
      setShowPauseDialog(true)
    }
  }

  function triggerFeedback(type) {
    if (navigator.vibrate) navigator.vibrate(type === 'correct' ? 30 : [30, 30, 30])
  }

  function handleEnd() {
    const sessionData = endSession()
    navigate('/summary', { state: sessionData })
  }

  function handleResume() {
    setShowPauseDialog(false)
    resumeSession()
  }

  function handleManualPause() {
    if (manualPause) {
      resumeSession()
      setManualPause(false)
    } else {
      pauseSession()
      setManualPause(true)
    }
  }

  const totalEx = exercises.length
  const correctCount = exercises.filter(e => e.is_correct).length

  const cf = topic?.color_from ?? 'var(--accent)'
  const ct = topic?.color_to   ?? '#8b5cf6'

  return (
    <div style={{
      flex: 1,
      display: 'flex',
      flexDirection: 'column',
      background: 'var(--bg-primary)',
      position: 'relative',
      overflow: 'hidden',
      paddingTop: 'env(safe-area-inset-top, 0px)',
    }}>
      {/* Topic-coloured background blobs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div className="blob blob-1" style={{ width: 320, height: 320, background: cf,   top: '-80px',  left: '-80px',  opacity: 0.12 }} />
        <div className="blob blob-2" style={{ width: 260, height: 260, background: ct,   bottom: '80px', right: '-60px', opacity: 0.09 }} />
        <div className="blob blob-3" style={{ width: 200, height: 200, background: cf,   bottom: '-40px', left: '25%',  opacity: 0.07 }} />
      </div>

      {/* Stopwatch pill */}
      <motion.div
        className="stopwatch-pill"
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)">
          <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A7 7 0 0 0 5 16a7 7 0 0 0 14 0c0-1.93-.78-3.68-2.03-4.95l.06-.66zM12 21a5 5 0 0 1-5-5 5 5 0 0 1 5-5 5 5 0 0 1 5 5 5 5 0 0 1-5 5z"/>
        </svg>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatTime(elapsed)}</span>
      </motion.div>

      {/* End and pause buttons */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1], delay: 0.03 }}
        style={{
          position: 'fixed',
          top: 12,
          right: 16,
          zIndex: 50,
          display: 'flex',
          gap: 8,
        }}>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={handleManualPause}
          style={{
            background: 'var(--glass-card-bg)',
            backdropFilter: 'blur(60px) saturate(200%)',
            WebkitBackdropFilter: 'blur(60px) saturate(200%)',
            border: '0.75px solid var(--glass-card-stroke)',
            boxShadow: 'var(--glass-card-shadow)',
            borderRadius: 9999,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 600,
            color: manualPause ? 'var(--accent)' : 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          {manualPause ? '▶️' : '⏸'}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={handleEnd}
          style={{
            background: 'var(--glass-card-bg)',
            backdropFilter: 'blur(60px) saturate(200%)',
            WebkitBackdropFilter: 'blur(60px) saturate(200%)',
            border: '0.75px solid var(--glass-card-stroke)',
            boxShadow: 'var(--glass-card-shadow)',
            borderRadius: 9999,
            padding: '8px 16px',
            fontSize: 14,
            fontWeight: 600,
            color: 'var(--text-primary)',
            cursor: 'pointer',
          }}
        >
          {t('session.end')}
        </motion.button>
      </motion.div>

      {/* Center content */}
      <div style={{
        flex: 1,
        position: 'relative',
        zIndex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '64px 24px 160px',
        gap: 20,
      }}>
        {/* Topic chip */}
        {topic && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1] }}
            style={{
              background: `linear-gradient(135deg, ${cf}, ${ct})`,
              borderRadius: 14,
              padding: '10px 20px',
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              boxShadow: `0 4px 20px ${cf}50`,
            }}
          >
            <span style={{ fontSize: 20 }}>{topic.emoji}</span>
            <span style={{ color: 'white', fontWeight: 600, fontSize: 15 }}>{topic.name}</span>
          </motion.div>
        )}

        {/* Glass counter card */}
        <motion.div
          initial={{ opacity: 0, y: -6, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.25, ease: [0.23, 1, 0.32, 1], delay: 0.04 }}
          style={{
            background: 'var(--glass-card-bg)',
            backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
            WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
            border: '0.75px solid var(--glass-card-stroke)',
            boxShadow: 'var(--glass-card-shadow)',
            borderRadius: 28,
            padding: '32px 48px',
            textAlign: 'center',
            minWidth: 180,
          }}
        >
          <motion.div
            key={totalEx}
            initial={{ scale: 1.1, opacity: 0.4 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
          >
            <div style={{ fontSize: 72, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>
              {totalEx}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', gap: 12, justifyContent: 'center' }}>
              <span>✅ {correctCount}</span>
              <span>❌ {totalEx - correctCount}</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Exercise dots — glass pill */}
        <AnimatePresence>
          {exercises.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }}
              style={{
                background: 'var(--glass-card-bg)',
                backdropFilter: 'blur(60px) saturate(200%)',
                WebkitBackdropFilter: 'blur(60px) saturate(200%)',
                border: '0.75px solid var(--glass-card-stroke)',
                boxShadow: 'var(--glass-card-shadow)',
                borderRadius: 20,
                padding: '12px 16px',
                display: 'flex',
                gap: 5,
                flexWrap: 'wrap',
                justifyContent: 'center',
                maxWidth: 260,
              }}
            >
              {exercises.slice(-20).map((ex, i, arr) => (
                <motion.div
                  key={ex.id ?? i}
                  initial={i === arr.length - 1 ? { scale: 0.5, opacity: 0 } : false}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: 'spring', duration: 0.3, bounce: 0.35 }}
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: '50%',
                    background: ex.is_correct ? 'var(--correct)' : 'var(--wrong)',
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Pause dialog overlay */}
      <AnimatePresence>
        {showPauseDialog && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={handleResume}
              style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0,0,0,0.4)',
                backdropFilter: 'blur(4px)',
                WebkitBackdropFilter: 'blur(4px)',
                zIndex: 40,
              }}
            />
            <div style={{
              position: 'fixed',
              inset: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 50,
              padding: '0 24px',
            }}>
              <motion.div
                initial={{ opacity: 0, scale: 0.96, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.96, y: 12 }}
                transition={{ type: 'spring', duration: 0.35, bounce: 0.2 }}
                style={{
                  background: 'var(--glass-card-bg)',
                  backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
                  WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
                  border: '0.75px solid var(--glass-card-stroke)',
                  boxShadow: 'var(--glass-card-shadow)',
                  borderRadius: 28,
                  padding: '32px 24px',
                  textAlign: 'center',
                  maxWidth: 320,
                }}
              >
                <div style={{ fontSize: 48, marginBottom: 16 }}>✨</div>
                <h2 style={{ margin: '0 0 12px', fontSize: 21, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.4 }}>
                  {t('session.pauseTitle')}
                </h2>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={handleResume}
                  style={{
                    width: '100%',
                    padding: '14px 16px',
                    marginTop: 20,
                    borderRadius: 14,
                    border: '0.75px solid rgba(99,102,241,0.35)',
                    background: 'var(--glass-card-bg)',
                    backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
                    WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
                    boxShadow: '0 0 0 0.5px rgba(255,255,255,0.18) inset, 0 2px 0 rgba(255,255,255,0.28) inset, 0 8px 32px rgba(99,102,241,0.18)',
                    color: 'var(--accent)',
                    fontSize: 16,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {t('session.resume')}
                </motion.button>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom buttons */}
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.23, 1, 0.32, 1], delay: 0.06 }}
        style={{
          position: 'absolute',
          bottom: 'max(env(safe-area-inset-bottom, 24px), 24px)',
          left: 24,
          right: 24,
          display: 'flex',
          gap: 16,
          zIndex: 1,
        }}>
        <motion.button
          whileTap={{ scale: 0.91 }}
          transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
          onClick={handleWrong}
          style={{
            flex: 1, height: 120, borderRadius: 26, border: '0.75px solid rgba(255,80,80,0.35)',
            background: 'var(--glass-card-bg)',
            backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
            WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
            boxShadow: '0 0 0 0.5px rgba(255,255,255,0.18) inset, 0 2px 0 rgba(255,255,255,0.28) inset, 0 8px 32px rgba(255,60,60,0.18)',
            cursor: 'pointer', fontSize: 28, fontWeight: 700,
            color: 'var(--wrong)', letterSpacing: -0.5,
          }}
        >
          {t('session.wrong')}
        </motion.button>
        <motion.button
          whileTap={{ scale: 0.91 }}
          transition={{ duration: 0.12, ease: [0.23, 1, 0.32, 1] }}
          onClick={handleCorrect}
          style={{
            flex: 1, height: 120, borderRadius: 26, border: '0.75px solid rgba(50,200,100,0.35)',
            background: 'var(--glass-card-bg)',
            backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
            WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
            boxShadow: '0 0 0 0.5px rgba(255,255,255,0.18) inset, 0 2px 0 rgba(255,255,255,0.28) inset, 0 8px 32px rgba(50,200,100,0.18)',
            cursor: 'pointer', fontSize: 28, fontWeight: 700,
            color: 'var(--correct)', letterSpacing: -0.5,
          }}
        >
          {t('session.correct')}
        </motion.button>
      </motion.div>
    </div>
  )
}
