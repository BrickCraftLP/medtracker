import { useState, useRef, useMemo } from 'react'
import { wsKey } from '../services/workspaceScope.js'
import { motion, AnimatePresence } from 'framer-motion'
import { useData } from '../context/DataContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { calcOverallAccuracy, calcWeightedAccuracy, fmtPct } from '../utils/calculations/accuracyRatioCalcs.js'
import Switch from '../components/Common/Switch.jsx'

const BUFFER = 0.85

export default function PlannerScreen({ onDismiss, onStartSession }) {
  const { topics, recentSessions } = useData()
  const { t } = useLanguage()

  const [minutes, setMinutes] = useState(30)
  const [plan, setPlan] = useState(null)
  const [autoBreaks, setAutoBreaks] = useState(() => localStorage.getItem('mt_auto_breaks') === 'true')

  // Ranking + goal-average preferences (persisted, like auto-breaks)
  const [rankingBasis, setRankingBasis] = useState(() => localStorage.getItem(wsKey('mt_planner_ranking')) || 'normal')
  const [goalEnabled, setGoalEnabled]   = useState(() => localStorage.getItem(wsKey('mt_planner_goal_enabled')) === 'true')
  const [goalValue, setGoalValue]       = useState(() => Number(localStorage.getItem(wsKey('mt_planner_goal_value'))) || 80)
  const [goalType, setGoalType]         = useState(() => localStorage.getItem(wsKey('mt_planner_goal_type')) || 'weighted')

  function toggleAutoBreaks() {
    const next = !autoBreaks
    setAutoBreaks(next)
    localStorage.setItem('mt_auto_breaks', String(next))
  }

  function chooseRanking(v) { setRankingBasis(v); localStorage.setItem(wsKey('mt_planner_ranking'), v) }
  function toggleGoal() {
    const next = !goalEnabled
    setGoalEnabled(next); localStorage.setItem(wsKey('mt_planner_goal_enabled'), String(next))
  }
  function changeGoalValue(v) {
    const clamped = Math.max(1, Math.min(100, v))
    setGoalValue(clamped); localStorage.setItem(wsKey('mt_planner_goal_value'), String(clamped))
  }
  function chooseGoalType(v) { setGoalType(v); localStorage.setItem(wsKey('mt_planner_goal_type'), v) }

  const topicStats = useMemo(() => {
    return topics.map(topic => {
      const sessions = recentSessions.filter(s => s.topic_id === topic.id)
      const totalEx = sessions.reduce((sum, s) => sum + (s.total_exercises ?? 0), 0)
      const totalCorrect = sessions.reduce((sum, s) => sum + (s.correct ?? 0), 0)
      const accuracy = totalEx > 0 ? Math.round((totalCorrect / totalEx) * 100) : null
      // When a goal average is set, every topic is measured against that single
      // goal instead of its own per-topic target_accuracy.
      const target = goalEnabled ? goalValue : (topic.target_accuracy ?? 80)
      const gap = accuracy !== null ? Math.max(0, target - accuracy) : target
      const weight = Number(topic.weight ?? 50)

      const sessionsWithDuration = sessions.filter(s => s.duration_seconds > 0)
      const avgMinutes = sessionsWithDuration.length > 0
        ? Math.max(5, Math.round(
            sessionsWithDuration.reduce((sum, s) => sum + s.duration_seconds, 0)
            / sessionsWithDuration.length / 60
          ))
        : 15

      const sessionsWithExercises = sessions.filter(s => (s.total_exercises ?? 0) > 0)
      const avgExercises = sessionsWithExercises.length > 0
        ? Math.max(5, Math.round(
            sessionsWithExercises.reduce((sum, s) => sum + s.total_exercises, 0)
            / sessionsWithExercises.length
          ))
        : 20

      return { topic, accuracy, target, gap, weight, avgMinutes, avgExercises, sessionCount: sessions.length }
    })
  }, [topics, recentSessions, goalEnabled, goalValue])

  function generatePlan() {
    const budget = Math.floor(minutes * BUFFER)
    // Priority: 'weighted' favours topics that move the overall weighted average
    // most (gap × topic weight); 'normal' ranks purely by the accuracy gap.
    // Topics already on/above target have gap 0 → they sink to the bottom but are
    // still topped up if time remains (secondary to hitting the goal).
    const priorityOf = (s) => (rankingBasis === 'weighted' ? s.gap * s.weight : s.gap)
    const sorted = [...topicStats].sort((a, b) => {
      const pa = priorityOf(a), pb = priorityOf(b)
      if (pb !== pa) return pb - pa
      return a.sessionCount - b.sessionCount
    })
    const items = []
    let remaining = budget
    for (const stat of sorted) {
      if (remaining <= 0) break
      if (stat.avgMinutes <= remaining) {
        items.push({ ...stat, plannedMinutes: stat.avgMinutes })
        remaining -= stat.avgMinutes
      }
    }
    if (items.length === 0 && sorted.length > 0) {
      items.push({ ...sorted[0], plannedMinutes: sorted[0].avgMinutes })
    }
    const totalPlanned = items.reduce((sum, x) => sum + x.plannedMinutes, 0)

    // Inject break items directly into the list when autoBreaks is on
    let finalItems = items
    if (autoBreaks) {
      finalItems = []
      let cumulative = 0
      let breakIdx = 0
      for (let i = 0; i < items.length; i++) {
        cumulative += items[i].plannedMinutes
        finalItems.push(items[i])
        if (cumulative >= 40 && i < items.length - 1) {
          finalItems.push({ type: 'break', id: `break-${breakIdx++}` })
          cumulative = 0
        }
      }
    }

    const currentAvg = goalType === 'weighted'
      ? calcWeightedAccuracy(recentSessions, topics)
      : calcOverallAccuracy(recentSessions)

    setPlan({
      items: finalItems,
      totalPlanned,
      requestedMinutes: minutes,
      autoBreaks,
      goal: goalEnabled ? { value: goalValue, type: goalType, current: currentAvg } : null,
    })
  }

  return (
    <div className="modal-overlay" onClick={onDismiss}>
      <motion.div
        className="modal-sheet"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 340 }}
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 40 }}
      >
        {/* Header row — back arrow (when plan shown) + close button */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: plan ? 'space-between' : 'flex-end', paddingTop: 12, marginBottom: 16 }}>
          {plan && (
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => setPlan(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 4, padding: 0 }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
              </svg>
              {t('btn.back')}
            </motion.button>
          )}
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onDismiss}
            style={{
              width: 30, height: 30, borderRadius: '50%',
              background: 'rgba(120,120,128,0.18)',
              backdropFilter: 'blur(12px)', WebkitBackdropFilter: 'blur(12px)',
              border: '0.5px solid rgba(120,120,128,0.22)',
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
          >
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </motion.button>
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {plan ? (
            <motion.div
              key="plan"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
            >
              <PlanContent plan={plan} t={t} onStart={() => onStartSession?.(plan)} />
            </motion.div>
          ) : (
            <motion.div
              key="picker"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              transition={{ duration: 0.2 }}
            >
              <TimePickerContent
                minutes={minutes}
                setMinutes={setMinutes}
                topics={topics}
                onGenerate={generatePlan}
                autoBreaks={autoBreaks}
                onToggleAutoBreaks={toggleAutoBreaks}
                rankingBasis={rankingBasis}
                onChooseRanking={chooseRanking}
                goalEnabled={goalEnabled}
                onToggleGoal={toggleGoal}
                goalValue={goalValue}
                onChangeGoalValue={changeGoalValue}
                goalType={goalType}
                onChooseGoalType={chooseGoalType}
                t={t}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

    </div>
  )
}

// ── Time picker view ──────────────────────────────────────────────────────────

function TimePickerContent({
  minutes, setMinutes, topics, onGenerate,
  autoBreaks, onToggleAutoBreaks,
  rankingBasis, onChooseRanking,
  goalEnabled, onToggleGoal, goalValue, onChangeGoalValue, goalType, onChooseGoalType,
  t,
}) {
  return (
    <>
      <h2 style={{ margin: '0 0 20px', fontSize: 21, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.4 }}>
        {t('planner.title')}
      </h2>

      <div style={{ marginBottom: 28 }}>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 16, letterSpacing: 0.3, textTransform: 'uppercase' }}>
          {t('planner.howLong')}
        </div>

        {/* Animated value display */}
        <div style={{ textAlign: 'center', marginBottom: 16 }}>
          <div style={{ display: 'inline-flex', alignItems: 'baseline', gap: 6 }}>
            <AnimatePresence mode="popLayout">
              <motion.span
                key={minutes}
                initial={{ scale: 1.18, opacity: 0.3 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 480, damping: 26 }}
                style={{
                  display: 'inline-block',
                  fontSize: 64,
                  fontWeight: 800,
                  color: 'var(--accent)',
                  letterSpacing: -2,
                  lineHeight: 1,
                  fontVariantNumeric: 'tabular-nums',
                }}
              >
                {minutes}
              </motion.span>
            </AnimatePresence>
            <span style={{ fontSize: 18, fontWeight: 600, color: 'var(--text-tertiary)', paddingBottom: 4 }}>min</span>
          </div>
        </div>

        {/* Slider */}
        <TimeSlider value={minutes} onChange={setMinutes} min={5} max={180} step={5} />

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>5 min</span>
          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 500 }}>3 h</span>
        </div>
      </div>

      {/* Auto-breaks toggle */}
      <motion.div
        whileTap={{ scale: 0.98 }}
        onClick={onToggleAutoBreaks}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 14px', borderRadius: 12,
          background: 'var(--bg-tertiary)',
          cursor: 'pointer', marginBottom: 16,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('planner.autoBreaks')}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{t('planner.autoBreaksHint')}</div>
        </div>
        <div style={{ marginLeft: 12 }}>
          <Switch checked={autoBreaks} onChange={() => onToggleAutoBreaks && onToggleAutoBreaks()} />
        </div>
      </motion.div>

      {/* Ranking basis */}
      <div style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', marginBottom: 8 }}>
          {t('planner.ranking')}
        </div>
        <Segmented
          value={rankingBasis}
          onChange={onChooseRanking}
          options={[
            { value: 'normal',   label: t('planner.ranking.normal') },
            { value: 'weighted', label: t('planner.ranking.weighted') },
          ]}
        />
        <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 6 }}>{t('planner.rankingHint')}</div>
      </div>

      {/* Goal average toggle */}
      <motion.div
        whileTap={{ scale: 0.98 }}
        onClick={onToggleGoal}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '11px 14px', borderRadius: 12,
          background: 'var(--bg-tertiary)',
          cursor: 'pointer', marginBottom: goalEnabled ? 10 : 16,
        }}
      >
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>{t('planner.goalAvg')}</div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{t('planner.goalAvgHint')}</div>
        </div>
        <div style={{ marginLeft: 12 }}>
          <Switch checked={goalEnabled} onChange={() => onToggleGoal && onToggleGoal()} />
        </div>
      </motion.div>

      {/* Goal average value + type */}
      <AnimatePresence initial={false}>
        {goalEnabled && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden', marginBottom: 16 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 16, padding: '6px 0 14px' }}>
              <StepBtn label="−" onClick={() => onChangeGoalValue(goalValue - 1)} />
              <div style={{ minWidth: 86, textAlign: 'center', fontSize: 30, fontWeight: 800, color: 'var(--accent)', letterSpacing: -1, fontVariantNumeric: 'tabular-nums' }}>
                {goalValue}%
              </div>
              <StepBtn label="+" onClick={() => onChangeGoalValue(goalValue + 1)} />
            </div>
            <Segmented
              value={goalType}
              onChange={onChooseGoalType}
              options={[
                { value: 'normal',   label: t('planner.goalType.normal') },
                { value: 'weighted', label: t('planner.goalType.weighted') },
              ]}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {topics.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '24px 0' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>📋</div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>{t('planner.noTopics')}</div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-tertiary)' }}>{t('planner.noTopicsHint')}</div>
        </div>
      ) : (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={onGenerate}
          className="btn btn-primary"
          style={{ width: '100%' }}
        >
          {t('planner.generate')}
        </motion.button>
      )}
    </>
  )
}

// ── Segmented control + stepper ────────────────────────────────────────────────

function Segmented({ value, onChange, options }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--bg-tertiary)', padding: 4, borderRadius: 12 }}>
      {options.map(o => {
        const active = value === o.value
        return (
          <motion.button
            key={o.value}
            whileTap={{ scale: 0.96 }}
            onClick={() => onChange(o.value)}
            style={{
              flex: 1, padding: '9px 6px', borderRadius: 9, border: 'none', cursor: 'pointer',
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'white' : 'var(--text-secondary)',
              fontSize: 13, fontWeight: 600, transition: 'background 0.15s, color 0.15s',
            }}
          >
            {o.label}
          </motion.button>
        )
      })}
    </div>
  )
}

function StepBtn({ label, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.9 }}
      onClick={onClick}
      style={{
        width: 40, height: 40, borderRadius: '50%', flexShrink: 0,
        border: '1px solid var(--border)', background: 'var(--bg-secondary)',
        color: 'var(--text-primary)', fontSize: 22, fontWeight: 700, cursor: 'pointer',
        display: 'flex', alignItems: 'center', justifyContent: 'center', lineHeight: 1,
      }}
    >
      {label}
    </motion.button>
  )
}

// ── Slider ────────────────────────────────────────────────────────────────────

function TimeSlider({ value, onChange, min, max, step }) {
  const trackRef = useRef(null)
  const dragging = useRef(false)

  function getValueFromPointer(e) {
    if (!trackRef.current) return value
    const rect = trackRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min((e.clientX ?? 0) - rect.left, rect.width))
    const pct = x / rect.width
    const raw = min + pct * (max - min)
    return Math.max(min, Math.min(max, Math.round(raw / step) * step))
  }

  function handlePointerDown(e) {
    dragging.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    onChange(getValueFromPointer(e))
  }

  function handlePointerMove(e) {
    if (!dragging.current) return
    onChange(getValueFromPointer(e))
  }

  function handlePointerUp() {
    dragging.current = false
  }

  const pct = (value - min) / (max - min)

  return (
    <div
      ref={trackRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      style={{ position: 'relative', height: 44, display: 'flex', alignItems: 'center', cursor: 'pointer', touchAction: 'none', userSelect: 'none' }}
    >
      {/* Track */}
      <div style={{ width: '100%', height: 6, borderRadius: 3, background: 'var(--border)', position: 'relative' }}>
        {/* Fill */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct * 100}%`,
          background: 'var(--accent)',
          borderRadius: 3,
        }} />
      </div>
      {/* Thumb */}
      <motion.div
        style={{
          position: 'absolute',
          left: `${pct * 100}%`,
          transform: 'translateX(-50%)',
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'var(--accent)',
          border: '3px solid var(--bg-primary)',
          boxShadow: '0 2px 10px rgba(99,102,241,0.5)',
          pointerEvents: 'none',
        }}
        whileTap={{ scale: 1.25 }}
        animate={{ scale: dragging.current ? 1.15 : 1 }}
      />
    </div>
  )
}

// ── Plan content view ─────────────────────────────────────────────────────────

function PlanContent({ plan, t, onStart }) {
  return (
    <>
      <h2 style={{ margin: '0 0 16px', fontSize: 21, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.4 }}>
        {t('planner.result.title')}
      </h2>

      {/* Summary chips */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
        <div style={{ flex: 1, padding: '10px 12px', borderRadius: 12, background: 'var(--bg-tertiary)', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
            {plan.totalPlanned}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, marginTop: 2 }}>min</div>
        </div>
        <div style={{ flex: 1, padding: '10px 12px', borderRadius: 12, background: 'var(--bg-tertiary)', textAlign: 'center' }}>
          <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums', lineHeight: 1.2 }}>
            {plan.items.length}
          </div>
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', fontWeight: 600, marginTop: 2 }}>{t('planner.topicsLabel')}</div>
        </div>
        <div style={{ flex: 2, padding: '10px 12px', borderRadius: 12, background: 'var(--bg-tertiary)', display: 'flex', alignItems: 'center' }}>
          <div style={{ fontSize: 11, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
            {t('planner.result.buffer')}
          </div>
        </div>
      </div>

      {/* Goal-average readout: current overall average → goal */}
      {plan.goal && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
          padding: '11px 12px', borderRadius: 12, marginBottom: 20,
          background: 'var(--accent-muted)', border: '0.5px solid var(--border)',
        }}>
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
            {plan.goal.type === 'weighted' ? t('planner.goalType.weighted') : t('planner.goalType.normal')}
          </span>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
            {plan.goal.current != null ? fmtPct(plan.goal.current) : '–'}
          </span>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
          <span style={{ fontSize: 15, fontWeight: 800, color: 'var(--accent)', fontVariantNumeric: 'tabular-nums' }}>
            {plan.goal.value}%
          </span>
        </div>
      )}

      {plan.items.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '32px 0 16px' }}>
          <div style={{ fontSize: 36, marginBottom: 10 }}>✨</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-secondary)' }}>{t('planner.allOnTarget')}</div>
          <div style={{ fontSize: 12, marginTop: 4, color: 'var(--text-tertiary)' }}>{t('planner.allOnTargetHint')}</div>
        </div>
      ) : (
        <>
          {/* Topic / break list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 7, marginBottom: 20 }}>
            {plan.items.map((item, i) => {
              if (item.type === 'break') {
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 14px', borderRadius: 12,
                      background: 'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.06) 100%)',
                      border: '1px solid rgba(245,158,11,0.22)',
                    }}
                  >
                    <div style={{
                      width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                      background: 'rgba(245,158,11,0.18)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    }}>
                      ☕
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: '#f59e0b' }}>{t('planner.breakItem')}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 1 }}>10 min</div>
                    </div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: '#f59e0b', fontVariantNumeric: 'tabular-nums' }}>
                      10 min
                    </div>
                  </motion.div>
                )
              }
              const { topic, accuracy, target, gap, plannedMinutes, avgExercises } = item
              const topicIdx = plan.items.slice(0, i).filter(x => x.type !== 'break').length + 1
              const accColor = gap === 0 ? '#30D158' : gap <= 10 ? '#FF9F0A' : '#FF453A'
              return (
                <motion.div
                  key={topic.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04 }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'var(--bg-tertiary)' }}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: accColor, width: 14, textAlign: 'right', flexShrink: 0 }}>
                    {topicIdx}
                  </span>
                  <div style={{
                    width: 34, height: 34, borderRadius: 10, flexShrink: 0,
                    background: `linear-gradient(135deg, ${topic.color_from}, ${topic.color_to})`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16,
                    boxShadow: `0 2px 8px ${topic.color_from}40`,
                  }}>
                    {topic.emoji}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {topic.name}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-secondary)', marginTop: 1 }}>
                      {accuracy !== null ? `${accuracy}% → ${target}%` : `→ ${target}%`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', fontVariantNumeric: 'tabular-nums' }}>
                      ~{plannedMinutes} min
                    </div>
                    <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 1 }}>
                      ~{avgExercises} {t('planner.exercisesLabel')}
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>

          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={onStart}
            className="btn btn-primary"
            style={{ width: '100%' }}
          >
            {t('planner.startSession')}
          </motion.button>
        </>
      )}
    </>
  )
}
