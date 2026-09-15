import { useState, useEffect, useRef } from 'react'
import { wsKey } from '../services/workspaceScope.js'
import { motion, AnimatePresence } from 'framer-motion'
import { useSession } from '../hooks/useSession.js'
import { useData } from '../context/DataContext.jsx'
import { useAuth } from '../context/AuthContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { saveSession } from '../services/dbInterface.js'

// ── localStorage helper ───────────────────────────────────────────────────────

function appendPlannerRun(run) {
  try {
    const prev = JSON.parse(localStorage.getItem(wsKey('mt_planner_history')) || '[]')
    localStorage.setItem(wsKey('mt_planner_history'), JSON.stringify([run, ...prev].slice(0, 30)))
  } catch {}
}

// ── Shared style tokens ───────────────────────────────────────────────────────

const GLASS = {
  background: 'var(--glass-card-bg)',
  backdropFilter: 'blur(60px) saturate(200%)',
  WebkitBackdropFilter: 'blur(60px) saturate(200%)',
  border: '0.5px solid var(--glass-card-stroke)',
  boxShadow: 'var(--glass-card-shadow)',
}

// ── Main screen ───────────────────────────────────────────────────────────────

// onBack    — user pressed back mid-session (save & keep data)
// onComplete — session fully done (summary → "Back to Planner")
// onSave     — called after each topic is completed with updated results
const BREAK_THRESHOLD_SECS = 45 * 60  // suggest a break after 45 min of study

export default function PlannerSessionScreen({ plan, initialResults, onBack, onComplete, onSave, onCancel }) {
  const { addRecentSession } = useData()
  const { user } = useAuth()
  const { t } = useLanguage()

  // topicId → { correct, total, sessionAccuracy, durationSeconds }
  const [results, setResults] = useState(initialResults ?? {})
  // mode: 'overview' | 'live' | 'manual' | 'break' | 'summary'
  const [mode, setMode] = useState('overview')
  const [activeItem, setActiveItem] = useState(null)
  const [sheetItem, setSheetItem] = useState(null)
  const [showCancelSheet, setShowCancelSheet] = useState(false)
  // accumulated study seconds since last break
  const studySinceBreak = useRef(0)

  if (!plan?.items?.length) return null

  const topicItems = plan.items.filter(x => x.type !== 'break')
  const doneCount = Object.keys(results).length
  const allDone = doneCount === topicItems.length

  async function handleTopicDone({ correct, total, durationSeconds, sessionData }, item) {
    const sessionAccuracy = total > 0 ? Math.round((correct / total) * 100) : 0

    if (sessionData) {
      try {
        const saved = await saveSession(user.id, {
          topic_id: item.topic.id,
          started_at: sessionData.startedAt,
          ended_at: sessionData.endedAt,
          duration_seconds: durationSeconds,
        }, sessionData.exercises)
        addRecentSession(saved)
      } catch (e) {
        console.error('Planner session save failed:', e)
      }
    }

    const newResults = { ...results, [item.topic.id]: { correct, total, sessionAccuracy, durationSeconds } }
    const isAllDone = Object.keys(newResults).length === topicItems.length
    setResults(newResults)
    onSave?.(newResults)
    setActiveItem(null)

    // Dynamic break only applies to plans without static break items
    if (!plan.autoBreaks) {
      studySinceBreak.current += durationSeconds
      if (!isAllDone && plan.totalPlanned > 45 && studySinceBreak.current >= BREAK_THRESHOLD_SECS) {
        studySinceBreak.current = 0
        setMode('break')
        return
      }
    }
    setMode('overview')
  }

  function handleFinish() {
    appendPlannerRun({
      id: Date.now(),
      date: new Date().toISOString(),
      requestedMinutes: plan.requestedMinutes,
      totalPlanned: plan.totalPlanned,
      topics: topicItems.map(item => ({
        topicId: item.topic.id,
        topicName: item.topic.name,
        topicEmoji: item.topic.emoji,
        colorFrom: item.topic.color_from,
        colorTo: item.topic.color_to,
        target: item.target,
        beforeAccuracy: item.accuracy,
        result: results[item.topic.id] ?? null,
      })),
    })
    setMode('summary')
  }

  if (mode === 'summary') {
    return (
      <SessionSummary
        plan={plan}
        results={results}
        onBack={onComplete}
        t={t}
      />
    )
  }

  if (mode === 'live' && activeItem) {
    return (
      <EmbeddedSession
        key={activeItem.topic.id}
        topicItem={activeItem}
        onDone={r => handleTopicDone(r, activeItem)}
        t={t}
      />
    )
  }

  if (mode === 'manual' && activeItem) {
    return (
      <ManualEntry
        topicItem={activeItem}
        onDone={r => handleTopicDone(r, activeItem)}
        onBack={() => { setMode('overview'); setActiveItem(null) }}
        t={t}
      />
    )
  }

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 100px' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22 }}>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onBack}
            style={{ ...GLASS, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 10, padding: '7px 12px', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
            {t('btn.back')}
          </motion.button>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-tertiary)' }}>
            {doneCount} / {topicItems.length}
          </div>
        </div>

        {/* Progress summary card */}
        <div style={{ ...GLASS, borderRadius: 20, padding: '14px 16px', marginBottom: 20, display: 'flex', alignItems: 'center', gap: 14 }}>
          {/* Ring */}
          <svg width="52" height="52" viewBox="0 0 52 52" style={{ flexShrink: 0 }}>
            <circle cx="26" cy="26" r="22" fill="none" stroke="var(--border)" strokeWidth="4" />
            <circle
              cx="26" cy="26" r="22" fill="none"
              stroke="var(--accent)" strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 22}`}
              strokeDashoffset={`${2 * Math.PI * 22 * (1 - doneCount / topicItems.length)}`}
              transform="rotate(-90 26 26)"
              style={{ transition: 'stroke-dashoffset 0.5s ease' }}
            />
            <text x="26" y="30" textAnchor="middle" fontSize="12" fontWeight="700" fill="var(--text-primary)">{doneCount}/{topicItems.length}</text>
          </svg>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
              {t('planner.sessionTitle')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {plan.items.length} {t('planner.topicsLabel')} · ~{plan.totalPlanned} min
            </div>
          </div>
        </div>

        {/* Topic / break cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          {/* Dynamic break card for non-autoBreaks plans */}
          <AnimatePresence>
            {mode === 'break' && !plan.autoBreaks && (
              <BreakCard key="dynamic-break" onDone={() => setMode('overview')} t={t} />
            )}
          </AnimatePresence>

          {plan.items.map((item, i) => {
            if (item.type === 'break') {
              return <BreakCard key={item.id} onDone={() => {}} t={t} />
            }
            const result = results[item.topic.id]
            return (
              <motion.div
                key={item.topic.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <TopicCard
                  item={item}
                  result={result}
                  onStart={() => setSheetItem(item)}
                  t={t}
                />
              </motion.div>
            )
          })}
        </div>

        {/* Finish button — appears when all done */}
        <AnimatePresence>
          {allDone && (
            <motion.button
              initial={{ opacity: 0, y: 16, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 320, damping: 26 }}
              whileTap={{ scale: 0.97 }}
              onClick={handleFinish}
              className="btn btn-primary"
              style={{ width: '100%', fontSize: 17, height: 56 }}
            >
              🎉 {t('planner.finishSession')}
            </motion.button>
          )}
        </AnimatePresence>

        {/* Cancel session */}
        {!allDone && (
          <motion.button
            whileTap={{ scale: 0.95 }}
            onClick={() => setShowCancelSheet(true)}
            style={{ width: '100%', marginTop: 8, padding: '10px', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
          >
            {t('planner.cancelSession')}
          </motion.button>
        )}
      </div>

      {/* Cancel confirmation sheet */}
      <AnimatePresence>
        {showCancelSheet && (
          <>
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setShowCancelSheet(false)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 110 }}
            />
            <motion.div
              initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                background: 'var(--bg-primary)',
                borderRadius: '24px 24px 0 0',
                padding: '20px 20px max(env(safe-area-inset-bottom, 24px), 24px)',
                zIndex: 111,
                border: '0.5px solid var(--glass-card-stroke)',
                borderBottom: 'none',
              }}
            >
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 20px' }} />
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 6 }}>
                {t('planner.cancelTitle')}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 24, lineHeight: 1.5 }}>
                {doneCount > 0
                  ? t('planner.cancelDesc').replace('{n}', doneCount)
                  : t('planner.cancelDescNone')}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setShowCancelSheet(false); onCancel?.() }}
                  style={{ width: '100%', height: 52, borderRadius: 14, border: 'none', background: '#FF453A18', color: '#FF453A', fontSize: 16, fontWeight: 700, cursor: 'pointer' }}
                >
                  {t('planner.cancelConfirm')}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => setShowCancelSheet(false)}
                  style={{ ...GLASS, width: '100%', height: 52, borderRadius: 14, color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, cursor: 'pointer' }}
                >
                  {t('planner.cancelKeepGoing')}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Action sheet */}
      <AnimatePresence>
        {sheetItem && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setSheetItem(null)}
              style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(4px)', WebkitBackdropFilter: 'blur(4px)', zIndex: 100 }}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', stiffness: 380, damping: 34 }}
              style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                background: 'var(--bg-primary)',
                borderRadius: '24px 24px 0 0',
                padding: '20px 20px max(env(safe-area-inset-bottom, 24px), 24px)',
                zIndex: 101,
                border: '0.5px solid var(--glass-card-stroke)',
                borderBottom: 'none',
              }}
            >
              {/* Drag handle */}
              <div style={{ width: 36, height: 4, borderRadius: 2, background: 'var(--border)', margin: '0 auto 18px' }} />

              {/* Topic header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
                <div style={{
                  width: 50, height: 50, borderRadius: 15,
                  background: `linear-gradient(135deg, ${sheetItem.topic.color_from}, ${sheetItem.topic.color_to})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 24, flexShrink: 0,
                  boxShadow: `0 4px 16px ${sheetItem.topic.color_from}55`,
                }}>
                  {sheetItem.topic.emoji}
                </div>
                <div>
                  <div style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
                    {sheetItem.topic.name}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                    ~{sheetItem.avgExercises} {t('planner.exercisesLabel')} · ~{sheetItem.avgMinutes} min
                  </div>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setSheetItem(null); setActiveItem(sheetItem); setMode('live') }}
                  className="btn btn-primary"
                  style={{ width: '100%', fontSize: 16, height: 52 }}
                >
                  {t('planner.liveSession')}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.97 }}
                  onClick={() => { setSheetItem(null); setActiveItem(sheetItem); setMode('manual') }}
                  style={{ ...GLASS, width: '100%', padding: '14px', borderRadius: 14, color: 'var(--text-primary)', fontSize: 16, fontWeight: 600, cursor: 'pointer', height: 52 }}
                >
                  {t('planner.enterManually')}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setSheetItem(null)}
                  style={{ width: '100%', padding: '10px', border: 'none', background: 'transparent', color: 'var(--text-tertiary)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}
                >
                  {t('btn.cancel')}
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Topic card ────────────────────────────────────────────────────────────────

function TopicCard({ item, result, onStart, t }) {
  const { topic, accuracy, target, gap, avgMinutes, avgExercises } = item
  const isDone = !!result
  const cf = topic.color_from
  const ct = topic.color_to
  const accColor = isDone
    ? (result.sessionAccuracy >= target ? '#30D158' : result.sessionAccuracy >= target * 0.85 ? '#FF9F0A' : '#FF453A')
    : (gap === 0 ? '#30D158' : gap <= 10 ? '#FF9F0A' : '#FF453A')

  return (
    <div style={{
      ...GLASS,
      backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
      WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
      border: isDone ? `0.5px solid ${accColor}45` : '0.5px solid var(--glass-card-stroke)',
      borderRadius: 18,
      overflow: 'hidden',
    }}>
      <div style={{ padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Topic icon */}
        <div style={{
          width: 44, height: 44, borderRadius: 13,
          background: `linear-gradient(135deg, ${cf}, ${ct})`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 20, flexShrink: 0,
          boxShadow: `0 3px 10px ${cf}40`,
          opacity: isDone ? 0.7 : 1,
        }}>
          {topic.emoji}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: isDone ? 'var(--text-secondary)' : 'var(--text-primary)', marginBottom: 2 }}>
            {topic.name}
          </div>
          {isDone ? (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {accuracy !== null ? `${accuracy}% → ` : t('planner.firstSession') + ' → '}
              <span style={{ color: accColor, fontWeight: 700 }}>{result.sessionAccuracy}%</span>
              {' · '}{result.total} {t('planner.exercisesLabel')} · {Math.round(result.durationSeconds / 60)} min
            </div>
          ) : (
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {accuracy !== null ? `${accuracy}%` : t('planner.noSessions')} → {target}% {t('planner.targetAcc')}
              {' · '}~{avgExercises} {t('planner.exercisesLabel')}
            </div>
          )}
        </div>

        {/* Right: done badge or start button */}
        {isDone ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 3, flexShrink: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: accColor, fontVariantNumeric: 'tabular-nums' }}>
              {result.sessionAccuracy}%
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: accColor, background: `${accColor}18`, border: `0.5px solid ${accColor}40`, borderRadius: 8, padding: '2px 8px' }}>
              ✓
            </div>
          </div>
        ) : (
          <motion.button
            whileTap={{ scale: 0.9 }}
            onClick={onStart}
            style={{
              padding: '9px 16px',
              borderRadius: 12,
              border: '0.5px solid var(--accent)',
              background: 'rgba(99,102,241,0.12)',
              color: 'var(--accent)',
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              flexShrink: 0,
            }}
          >
            {t('btn.start')}
          </motion.button>
        )}
      </div>

      {/* Bottom progress bar when done */}
      {isDone && (
        <div style={{ height: 3, background: 'var(--border)' }}>
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${Math.min(100, Math.round((result.sessionAccuracy / target) * 100))}%` }}
            transition={{ duration: 0.55, ease: [0.32, 0, 0.67, 0] }}
            style={{ height: '100%', background: `linear-gradient(90deg, ${cf}, ${ct})` }}
          />
        </div>
      )}
    </div>
  )
}

// ── Embedded live session ─────────────────────────────────────────────────────

function EmbeddedSession({ topicItem, onDone, t }) {
  const {
    startSession, recordExercise, endSession,
    elapsed, exercises, formatTime, pauseSession, resumeSession,
  } = useSession()

  const [manualPause, setManualPause] = useState(false)
  const endedRef = useRef(false)

  const targetEx = topicItem.avgExercises ?? 20
  const done = exercises.length
  const progressPct = Math.min(1, done / targetEx)
  const isTargetReached = done >= targetEx && done > 0

  const cf = topicItem.topic.color_from
  const ct = topicItem.topic.color_to

  useEffect(() => { startSession(topicItem.topic.id) }, [])

  useEffect(() => {
    if (isTargetReached && !endedRef.current) finish()
  }, [isTargetReached])

  function finish() {
    if (endedRef.current) return
    endedRef.current = true
    const sd = endSession()
    const correct = sd.exercises.filter(e => e.is_correct).length
    onDone({ correct, total: sd.exercises.length, durationSeconds: sd.durationSeconds, sessionData: sd })
  }

  function togglePause() {
    if (manualPause) { resumeSession(); setManualPause(false) }
    else { pauseSession(); setManualPause(true) }
  }

  const correctCount = exercises.filter(e => e.is_correct).length

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: 'var(--bg-primary)', position: 'relative', overflow: 'hidden' }}>

      {/* Exercise progress bar */}
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'var(--border)', zIndex: 10 }}>
        <motion.div
          animate={{ width: `${progressPct * 100}%` }}
          transition={{ duration: 0.2 }}
          style={{ height: '100%', background: `linear-gradient(90deg, ${cf}, ${ct})` }}
        />
      </div>

      {/* Background blobs */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0 }}>
        <div className="blob blob-1" style={{ width: 320, height: 320, background: cf, top: '-80px', left: '-80px', opacity: 0.12 }} />
        <div className="blob blob-2" style={{ width: 260, height: 260, background: ct, bottom: '80px', right: '-60px', opacity: 0.09 }} />
        <div className="blob blob-3" style={{ width: 200, height: 200, background: cf, bottom: '-40px', left: '25%', opacity: 0.07 }} />
      </div>

      {/* Stopwatch pill */}
      <div className="stopwatch-pill">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)">
          <path d="M15 1H9v2h6V1zm-4 13h2V8h-2v6zm8.03-6.61l1.42-1.42c-.43-.51-.9-.99-1.41-1.41l-1.42 1.42A7 7 0 0 0 5 16a7 7 0 0 0 14 0c0-1.93-.78-3.68-2.03-4.95l.06-.66zM12 21a5 5 0 0 1-5-5 5 5 0 0 1 5-5 5 5 0 0 1 5 5 5 5 0 0 1-5 5z"/>
        </svg>
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>{formatTime(elapsed)}</span>
      </div>

      {/* Top-right controls */}
      <div style={{ position: 'fixed', top: 12, right: 16, zIndex: 50, display: 'flex', gap: 8 }}>
        <motion.button whileTap={{ scale: 0.88 }} onClick={togglePause}
          style={{ ...GLASS, border: '0.75px solid var(--glass-card-stroke)', borderRadius: 9999, padding: '8px 16px', fontSize: 14, fontWeight: 600, color: manualPause ? 'var(--accent)' : 'var(--text-primary)', cursor: 'pointer' }}>
          {manualPause ? '▶️' : '⏸'}
        </motion.button>
        <motion.button whileTap={{ scale: 0.88 }} onClick={finish}
          style={{ ...GLASS, border: '0.75px solid var(--glass-card-stroke)', borderRadius: 9999, padding: '8px 16px', fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', cursor: 'pointer' }}>
          {t('planner.endEarly')}
        </motion.button>
      </div>

      {/* Center content */}
      <div style={{ flex: 1, position: 'relative', zIndex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 24px 160px', gap: 16 }}>

        {/* Topic chip */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: `linear-gradient(135deg, ${cf}, ${ct})`, borderRadius: 14, padding: '10px 20px', display: 'flex', alignItems: 'center', gap: 8, boxShadow: `0 4px 20px ${cf}50` }}>
          <span style={{ fontSize: 20 }}>{topicItem.topic.emoji}</span>
          <span style={{ color: 'white', fontWeight: 600, fontSize: 15 }}>{topicItem.topic.name}</span>
        </motion.div>

        {/* Exercise target pill */}
        <div style={{ ...GLASS, borderRadius: 9999, padding: '5px 14px', fontSize: 13, fontWeight: 600, color: done >= targetEx * 0.8 ? '#FF9F0A' : 'var(--text-secondary)', fontVariantNumeric: 'tabular-nums' }}>
          {done} / {targetEx} {t('planner.exercisesLabel')}
        </div>

        {/* Counter card */}
        <motion.div style={{ ...GLASS, backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)', WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)', border: '0.75px solid var(--glass-card-stroke)', borderRadius: 28, padding: '32px 48px', textAlign: 'center', minWidth: 180 }}>
          <motion.div key={done} initial={{ scale: 1.18, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <div style={{ fontSize: 72, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{done}</div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 6, display: 'flex', gap: 12, justifyContent: 'center' }}>
              <span>✅ {correctCount}</span>
              <span>❌ {done - correctCount}</span>
            </div>
          </motion.div>
        </motion.div>

        {/* Exercise dots */}
        {exercises.length > 0 && (
          <div style={{ ...GLASS, border: '0.75px solid var(--glass-card-stroke)', borderRadius: 20, padding: '12px 16px', display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'center', maxWidth: 260 }}>
            {exercises.slice(-20).map((ex, i) => (
              <motion.div key={i} initial={{ scale: 0 }} animate={{ scale: 1 }}
                style={{ width: 10, height: 10, borderRadius: '50%', background: ex.is_correct ? 'var(--correct)' : 'var(--wrong)' }} />
            ))}
          </div>
        )}
      </div>

      {/* Wrong / Correct buttons */}
      <div style={{ position: 'absolute', bottom: 'max(env(safe-area-inset-bottom, 24px), 24px)', left: 24, right: 24, display: 'flex', gap: 16, zIndex: 1 }}>
        <motion.button whileTap={{ scale: 0.91 }}
          onClick={() => { recordExercise(false); if (navigator.vibrate) navigator.vibrate([30, 30, 30]) }}
          style={{ flex: 1, height: 120, borderRadius: 26, border: '0.75px solid rgba(255,80,80,0.35)', background: 'var(--glass-card-bg)', backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)', WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)', boxShadow: '0 0 0 0.5px rgba(255,255,255,0.18) inset, 0 2px 0 rgba(255,255,255,0.28) inset, 0 8px 32px rgba(255,60,60,0.18)', cursor: 'pointer', fontSize: 28, fontWeight: 700, color: 'var(--wrong)', letterSpacing: -0.5 }}>
          {t('session.wrong')}
        </motion.button>
        <motion.button whileTap={{ scale: 0.91 }}
          onClick={() => { recordExercise(true); if (navigator.vibrate) navigator.vibrate(30) }}
          style={{ flex: 1, height: 120, borderRadius: 26, border: '0.75px solid rgba(50,200,100,0.35)', background: 'var(--glass-card-bg)', backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)', WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)', boxShadow: '0 0 0 0.5px rgba(255,255,255,0.18) inset, 0 2px 0 rgba(255,255,255,0.28) inset, 0 8px 32px rgba(50,200,100,0.18)', cursor: 'pointer', fontSize: 28, fontWeight: 700, color: 'var(--correct)', letterSpacing: -0.5 }}>
          {t('session.correct')}
        </motion.button>
      </div>
    </div>
  )
}

// ── Session summary ───────────────────────────────────────────────────────────

function SessionSummary({ plan, results, onBack, t }) {
  const totalEx   = Object.values(results).reduce((sum, r) => sum + (r.total || 0), 0)
  const totalSecs = Object.values(results).reduce((sum, r) => sum + (r.durationSeconds || 0), 0)
  const totalMins = Math.round(totalSecs / 60)

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '40px 16px 100px' }}>

        {/* Celebration header */}
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <motion.div
            initial={{ scale: 0.4, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 360, damping: 22 }}
            style={{ fontSize: 60, marginBottom: 14, lineHeight: 1 }}
          >
            🎉
          </motion.div>
          <h1 style={{ fontSize: 28, fontWeight: 800, margin: '0 0 8px', color: 'var(--text-primary)', letterSpacing: -0.6 }}>
            {t('planner.allDone')}
          </h1>
          <p style={{ fontSize: 14, color: 'var(--text-secondary)', margin: '0 0 6px' }}>
            {t('planner.allDoneSub')}
          </p>
          <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 12 }}>
            <div style={{ ...GLASS, borderRadius: 12, padding: '8px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{totalEx}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('planner.exercisesLabel')}</div>
            </div>
            <div style={{ ...GLASS, borderRadius: 12, padding: '8px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{totalMins} min</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('planner.planned')}</div>
            </div>
            <div style={{ ...GLASS, borderRadius: 12, padding: '8px 14px', textAlign: 'center' }}>
              <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>{plan.items.length}</div>
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.4 }}>{t('planner.topicsLabel')}</div>
            </div>
          </div>
        </div>

        {/* Per-topic cards */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 28 }}>
          {plan.items.map((item, i) => {
            const result  = results[item.topic.id]
            const before  = item.accuracy           // null if no prior sessions
            const after   = result?.sessionAccuracy ?? null
            const change  = (before !== null && after !== null) ? after - before : null
            const cf      = item.topic.color_from
            const ct      = item.topic.color_to
            const target  = item.target

            const afterColor = after === null ? 'var(--text-tertiary)'
              : after >= target          ? '#30D158'
              : after >= target * 0.85   ? '#FF9F0A'
              : '#FF453A'

            const changeColor = change === null ? 'var(--text-tertiary)'
              : change > 0  ? '#30D158'
              : change < 0  ? '#FF453A'
              : 'var(--text-secondary)'

            return (
              <motion.div
                key={item.topic.id}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.07, duration: 0.34 }}
                style={{
                  background: 'var(--card-bg)',
                  border: '0.5px solid var(--glass-card-stroke)',
                  borderRadius: 20,
                  overflow: 'hidden',
                }}
              >
                {/* Topic row */}
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 14px 12px' }}>
                  <div style={{
                    width: 44, height: 44, borderRadius: 13,
                    background: `linear-gradient(135deg, ${cf}, ${ct})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 20, flexShrink: 0,
                    boxShadow: `0 3px 10px ${cf}40`,
                  }}>
                    {item.topic.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 1 }}>
                      {item.topic.name}
                    </div>
                    {result && (
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        {result.total} {t('planner.exercisesLabel')} · {Math.round(result.durationSeconds / 60)} min
                      </div>
                    )}
                  </div>
                  {/* Change badge */}
                  {change !== null ? (
                    <div style={{
                      fontSize: 15, fontWeight: 800,
                      color: changeColor,
                      background: `${changeColor}18`,
                      border: `0.5px solid ${changeColor}40`,
                      borderRadius: 10, padding: '4px 10px',
                      fontVariantNumeric: 'tabular-nums', flexShrink: 0,
                    }}>
                      {change > 0 ? `+${change}%` : change === 0 ? '→ 0%' : `${change}%`}
                    </div>
                  ) : after !== null ? (
                    <div style={{ fontSize: 16, fontWeight: 800, color: afterColor, fontVariantNumeric: 'tabular-nums', flexShrink: 0 }}>
                      {after}%
                    </div>
                  ) : null}
                </div>

                {/* Progress bars */}
                <div style={{ padding: '0 14px 14px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  {/* Before */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                        {t('planner.before')}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                        {before !== null ? `${before}%` : '–'}
                      </span>
                    </div>
                    <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', position: 'relative', overflow: 'visible' }}>
                      <div style={{
                        position: 'absolute', top: -3, bottom: -3,
                        left: `${Math.min(99, target)}%`, width: 2,
                        background: 'var(--text-tertiary)',
                        borderRadius: 1, zIndex: 2,
                        transform: 'translateX(-50%)',
                        opacity: 0.4,
                      }} />
                      {before !== null && (
                        <div style={{
                          height: '100%', width: `${Math.min(100, before)}%`,
                          borderRadius: 3,
                          background: `linear-gradient(90deg, ${cf}70, ${ct}70)`,
                        }} />
                      )}
                    </div>
                  </div>

                  {/* After */}
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                        {t('planner.after')}
                      </span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: afterColor, fontVariantNumeric: 'tabular-nums' }}>
                        {after !== null ? `${after}%` : '–'}
                      </span>
                    </div>
                    <div style={{ height: 7, borderRadius: 4, background: 'var(--border)', position: 'relative', overflow: 'visible' }}>
                      <div style={{
                        position: 'absolute', top: -3, bottom: -3,
                        left: `${Math.min(99, target)}%`, width: 2,
                        background: 'var(--text-tertiary)',
                        borderRadius: 1, zIndex: 2,
                        transform: 'translateX(-50%)',
                        opacity: 0.6,
                      }} />
                      {after !== null && (
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${Math.min(100, after)}%` }}
                          transition={{ duration: 0.7, delay: i * 0.07 + 0.25, ease: [0.32, 0, 0.67, 0] }}
                          style={{
                            height: '100%', borderRadius: 4,
                            background: `linear-gradient(90deg, ${cf}, ${ct})`,
                          }}
                        />
                      )}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                      <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                        {t('planner.targetAcc')} {target}%
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>
            )
          })}
        </div>

        {/* Back to planner */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onBack}
          className="btn btn-primary"
          style={{ width: '100%', fontSize: 17, height: 54 }}
        >
          {t('planner.backToPlanner')}
        </motion.button>
      </div>
    </div>
  )
}

// ── Break card (inline) ───────────────────────────────────────────────────────

const BREAK_DURATION = 10 * 60

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const when = ctx.currentTime
    const notes = [523.25, 659.25, 783.99, 1046.5] // C5 E5 G5 C6
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const t0 = when + i * 0.18
      gain.gain.setValueAtTime(0, t0)
      gain.gain.linearRampToValueAtTime(0.28, t0 + 0.04)
      gain.gain.exponentialRampToValueAtTime(0.001, t0 + 1.1)
      osc.start(t0)
      osc.stop(t0 + 1.1)
    })
  } catch (_) {}
}

function BreakCard({ onDone, t }) {
  const [remaining, setRemaining] = useState(BREAK_DURATION)
  const [running, setRunning] = useState(false)
  const [sound, setSound] = useState(() => localStorage.getItem('mt_break_sound') !== 'false')
  const intervalRef = useRef(null)
  const chimeFiredRef = useRef(false)

  useEffect(() => {
    if (running && remaining > 0) {
      intervalRef.current = setInterval(() => {
        setRemaining(prev => {
          if (prev <= 1) { clearInterval(intervalRef.current); setRunning(false); return 0 }
          return prev - 1
        })
      }, 1000)
    } else {
      clearInterval(intervalRef.current)
    }
    return () => clearInterval(intervalRef.current)
  }, [running])

  useEffect(() => {
    if (remaining === 0 && !chimeFiredRef.current) {
      chimeFiredRef.current = true
      if (sound) playChime()
    }
  }, [remaining, sound])

  function toggleSound() {
    setSound(s => {
      localStorage.setItem('mt_break_sound', String(!s))
      return !s
    })
  }

  const R = 62
  const STROKE = 6
  const SIZE = (R + STROKE) * 2 + 4
  const CIRCUMFERENCE = 2 * Math.PI * R
  const dashOffset = CIRCUMFERENCE * (1 - remaining / BREAK_DURATION)
  const mm = Math.floor(remaining / 60).toString().padStart(2, '0')
  const ss = (remaining % 60).toString().padStart(2, '0')
  const isDone = remaining === 0
  const accentColor = isDone ? '#30D158' : '#FF9F0A'

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 340, damping: 28 }}
      style={{
        borderRadius: 20,
        background: 'linear-gradient(145deg, #1e1e30 0%, #141420 100%)',
        border: `1px solid ${accentColor}30`,
        overflow: 'hidden',
        boxShadow: `0 4px 24px ${accentColor}18`,
      }}
    >
      {/* Top bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ fontSize: 16 }}>☕</span>
          <span style={{ fontSize: 14, fontWeight: 700, color: 'rgba(255,255,255,0.88)', letterSpacing: 0.2 }}>{t('break.title')}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Sound toggle */}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={toggleSound}
            style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 10, width: 30, height: 30, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0 }}
          >
            {sound ? (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.55)">
                <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z"/>
              </svg>
            ) : (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.25)">
                <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/>
              </svg>
            )}
          </motion.button>

          {!isDone ? (
            <motion.button
              whileTap={{ scale: 0.9 }}
              onClick={onDone}
              style={{ background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 14, padding: '5px 12px', color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
            >
              {t('break.skip')}
            </motion.button>
          ) : (
            <span style={{ fontSize: 12, fontWeight: 700, color: '#30D158' }}>{t('break.done')}</span>
          )}
        </div>
      </div>

      {/* Timer row */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, padding: '16px 16px 16px' }}>
        {/* Ring */}
        <div style={{ position: 'relative', width: SIZE, height: SIZE, flexShrink: 0 }}>
          <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
            <defs>
              <filter id="bcGlow">
                <feGaussianBlur stdDeviation="3" result="b" />
                <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
              </filter>
            </defs>
            <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={STROKE} />
            <circle
              cx={SIZE / 2} cy={SIZE / 2} r={R}
              fill="none"
              stroke={accentColor}
              strokeWidth={STROKE}
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={dashOffset}
              transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
              style={{ transition: running ? 'stroke-dashoffset 1s linear, stroke 0.5s' : 'stroke 0.5s' }}
              filter="url(#bcGlow)"
            />
          </svg>
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontSize: 28, fontWeight: 100, color: 'rgba(255,255,255,0.92)', fontVariantNumeric: 'tabular-nums', letterSpacing: -0.5, lineHeight: 1 }}>
              {mm}:{ss}
            </span>
            <span style={{ fontSize: 9, color: 'rgba(255,255,255,0.28)', letterSpacing: 0.8, marginTop: 3, textTransform: 'uppercase' }}>
              10 min
            </span>
          </div>
        </div>

        {/* Right side */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.4 }}>
            {t('break.subtitle')}
          </div>
          {isDone ? (
            <motion.button
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              whileTap={{ scale: 0.96 }}
              onClick={onDone}
              style={{ height: 42, borderRadius: 13, background: '#30D158', border: 'none', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
            >
              {t('break.resumeSession')}
            </motion.button>
          ) : (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => setRunning(r => !r)}
              style={{
                height: 42, borderRadius: 13, border: 'none',
                background: running ? 'rgba(255,255,255,0.1)' : accentColor,
                color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7,
                transition: 'background 0.2s',
              }}
            >
              {running ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                  {t('break.pause')}
                </>
              ) : (
                <>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M8 5v14l11-7z"/></svg>
                  {t('break.start')}
                </>
              )}
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Manual entry ──────────────────────────────────────────────────────────────

function Stepper({ label, value, min, max, onChange }) {
  return (
    <div style={{ ...GLASS, borderRadius: 16, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
      <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
      <motion.button whileTap={{ scale: 0.88 }} onClick={() => onChange(Math.max(min, value - 1))}
        style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg-tertiary)', border: '0.5px solid var(--border)', color: 'var(--text-primary)', fontSize: 20, fontWeight: 300, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        −
      </motion.button>
      <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)', minWidth: 40, textAlign: 'center', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      <motion.button whileTap={{ scale: 0.88 }} onClick={() => onChange(Math.min(max, value + 1))}
        style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--bg-tertiary)', border: '0.5px solid var(--border)', color: 'var(--text-primary)', fontSize: 20, fontWeight: 300, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        +
      </motion.button>
    </div>
  )
}

function ManualEntry({ topicItem, onDone, onBack, t }) {
  const [total, setTotal] = useState(topicItem.avgExercises ?? 20)
  const [correct, setCorrect] = useState(Math.round((topicItem.avgExercises ?? 20) * 0.8))

  const safeCorrect = Math.min(correct, total)
  const accuracy = total > 0 ? Math.round((safeCorrect / total) * 100) : 0
  const accColor = accuracy >= topicItem.target ? '#30D158' : accuracy >= topicItem.target * 0.85 ? '#FF9F0A' : '#FF453A'

  const cf = topicItem.topic.color_from
  const ct = topicItem.topic.color_to

  function handleConfirm() {
    const now = new Date()
    const startedAt = new Date(now.getTime() - topicItem.avgMinutes * 60 * 1000)
    const exercises = [
      ...Array(safeCorrect).fill(null).map(() => ({ is_correct: true, duration_ms: 0 })),
      ...Array(total - safeCorrect).fill(null).map(() => ({ is_correct: false, duration_ms: 0 })),
    ]
    onDone({
      correct: safeCorrect,
      total,
      durationSeconds: topicItem.avgMinutes * 60,
      sessionData: {
        exercises,
        topicId: topicItem.topic.id,
        startedAt: startedAt.toISOString(),
        endedAt: now.toISOString(),
        durationSeconds: topicItem.avgMinutes * 60,
      },
    })
  }

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 40px' }}>

        <motion.button whileTap={{ scale: 0.88 }} onClick={onBack}
          style={{ ...GLASS, backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', borderRadius: 10, padding: '7px 12px', color: 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          {t('btn.back')}
        </motion.button>

        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <div style={{ background: `linear-gradient(135deg, ${cf}, ${ct})`, borderRadius: 14, padding: '10px 22px', display: 'inline-flex', alignItems: 'center', gap: 8, boxShadow: `0 4px 20px ${cf}40` }}>
            <span style={{ fontSize: 22 }}>{topicItem.topic.emoji}</span>
            <span style={{ color: 'white', fontWeight: 600, fontSize: 16 }}>{topicItem.topic.name}</span>
          </div>
        </div>

        <h2 style={{ margin: '0 0 20px', fontSize: 22, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.4 }}>
          {t('planner.enterResults')}
        </h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
          <Stepper label={t('planner.totalEx')} value={total} min={1} max={300}
            onChange={v => { setTotal(v); if (correct > v) setCorrect(v) }} />
          <Stepper label={t('planner.correctEx')} value={safeCorrect} min={0} max={total} onChange={setCorrect} />
        </div>

        {/* Accuracy preview */}
        <div style={{ ...GLASS, borderRadius: 16, padding: '16px', marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 3 }}>
              {t('planner.thisSession')}
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
              {safeCorrect} / {total} · {t('planner.targetAcc')} {topicItem.target}%
            </div>
          </div>
          <div style={{ fontSize: 36, fontWeight: 800, color: accColor, letterSpacing: -1, fontVariantNumeric: 'tabular-nums' }}>
            {accuracy}%
          </div>
        </div>

        <motion.button whileTap={{ scale: 0.97 }} onClick={handleConfirm}
          className="btn btn-primary" style={{ width: '100%', fontSize: 17, height: 54 }}>
          {t('btn.confirm')}
        </motion.button>
      </div>
    </div>
  )
}
