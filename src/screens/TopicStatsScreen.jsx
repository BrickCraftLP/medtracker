import { useState, useMemo, useContext } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion, useMotionValue, useTransform, animate, AnimatePresence } from 'framer-motion'
import { NavDirectionContext } from '../context/navDirection.js'
import { BarChart, Bar, AreaChart, Area, ResponsiveContainer, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts'
import { format as formatDate } from 'date-fns'
import { de as dateFnsDe, enUS as dateFnsEn } from 'date-fns/locale'
import { useData } from '../context/DataContext.jsx'
import { useSession } from '../hooks/useSession.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useGraphSettings } from '../context/GraphSettingsContext.jsx'
import GlassPanel from '../components/Glass/GlassPanel.jsx'
import GlassButton from '../components/Glass/GlassButton.jsx'
import { Pill } from '../components/Modals/WidgetConfig/controls.jsx'
import { getLocale } from '../i18n/index.js'
import {
  getDateRange,
  filterSessionsByRange,
  calcDailyExerciseCounts,
} from '../utils/calculations/filterTimeframeCalcs.js'
import {
  PRIORITY_COLORS, PRIORITY_KEYS, localDayKey, calcTopicUrgency,
  effectivePriority, dueStatus, sortTodos, buildTodo, shortTime,
} from '../utils/calculations/todoPriorityCalcs.js'
import { useAssistantScreen } from '../assistant/screenContext.js'

const TIMEFRAMES = ['7d', '14d', '30d', '90d']

const REVEAL = 76   // px — snaps open to show delete button
const FULL   = 230  // px — full swipe triggers auto-delete

function SwipeToDeleteRow({ children, onDelete, divider }) {
  const x = useMotionValue(0)
  const [isOpen, setIsOpen] = useState(false)
  const [visible, setVisible] = useState(true)

  // Delete zone visibility — hidden at rest, appears as soon as you start swiping
  const zoneOpacity = useTransform(x, [-REVEAL * 0.3, 0], [1, 0])
  // Red overlay on the content — grows as swipe goes past REVEAL toward FULL
  const redOverlay = useTransform(x, [-FULL, -REVEAL, 0], [1, 0, 0])
  // Trash icon fades in once the delete area is revealed
  const trashOpacity = useTransform(x, [-REVEAL, -(REVEAL * 0.65)], [1, 0])

  async function triggerDelete() {
    await animate(x, -600, { duration: 0.22, ease: [0.4, 0, 1, 1] })
    setVisible(false)
    setTimeout(onDelete, 160)
  }

  function handleDragEnd(_, info) {
    const cur = x.get()
    const vel = info.velocity.x
    if (cur < -FULL || vel < -700) {
      triggerDelete()
    } else if (cur < -(REVEAL * 0.5) || vel < -250) {
      setIsOpen(true)
      animate(x, -REVEAL, { type: 'spring', stiffness: 400, damping: 38 })
    } else {
      setIsOpen(false)
      animate(x, 0, { type: 'spring', stiffness: 400, damping: 38 })
    }
  }

  return (
    <AnimatePresence initial={false}>
      {visible && (
        <motion.div
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeInOut' }}
          style={{ position: 'relative', overflow: 'hidden' }}
        >
          {/* Static red delete zone — hidden at rest, revealed on swipe */}
          <motion.div style={{
            position: 'absolute', top: 0, bottom: 0, right: 0,
            width: REVEAL + 16,
            background: '#FF3B30',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            opacity: zoneOpacity,
          }}>
            <motion.div
              onTap={triggerDelete}
              style={{ opacity: trashOpacity, cursor: 'pointer', padding: 12, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="white">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
              </svg>
            </motion.div>
          </motion.div>

          {/* Full-swipe red overlay — floods the content area */}
          <motion.div style={{
            position: 'absolute', inset: 0,
            background: '#FF3B30',
            opacity: redOverlay,
            pointerEvents: 'none',
            zIndex: 2,
          }} />

          {/* Draggable content */}
          <motion.div
            drag="x"
            dragConstraints={{ left: -(FULL + 80), right: 0 }}
            dragElastic={{ left: 0.06, right: 0 }}
            style={{ x, position: 'relative', zIndex: 1 }}
            onDragEnd={handleDragEnd}
            onTap={() => {
              if (isOpen) {
                setIsOpen(false)
                animate(x, 0, { type: 'spring', stiffness: 400, damping: 38 })
              }
            }}
          >
            {children}
          </motion.div>

          {divider && <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />}
        </motion.div>
      )}
    </AnimatePresence>
  )
}

function StatPill({ label, value }) {
  return (
    <GlassPanel
      cornerRadius={16}
      displacementScale={24}
      aberrationIntensity={1}
      tint="rgba(0, 0, 0, 0.10)"
      style={{ flex: 1 }}
      bodyStyle={{ padding: '10px 12px', boxShadow: HEADER_GLASS_EDGE }}
    >
      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.80)', fontWeight: 700, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 3, textShadow: '0 1px 3px rgba(0,0,0,0.30)' }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: -0.5, textShadow: '0 1px 4px rgba(0,0,0,0.30)' }}>{value}</div>
    </GlassPanel>
  )
}

// Inner hairline + top highlight for glass sitting on the coloured header.
const HEADER_GLASS_EDGE = '0 0 0 0.5px rgba(255,255,255,0.22) inset, 0 1px 0 rgba(255,255,255,0.14) inset'
const CARD_GLASS_EDGE = '0 0 0 0.5px var(--glass-card-stroke) inset'

// Liquid-glass content card. Outer margins stay on the frame; everything else
// (padding, overflow, typography) styles the body above the glass.
function GlassCard({ children, style }) {
  const { marginBottom, marginTop, ...body } = style ?? {}
  return (
    <GlassPanel cornerRadius={18} style={{ marginBottom, marginTop }} bodyStyle={{ boxShadow: CARD_GLASS_EDGE, ...body }}>
      {children}
    </GlassPanel>
  )
}

const chevron = open => (
  <motion.svg
    animate={{ rotate: open ? 180 : 0 }}
    transition={{ type: 'spring', stiffness: 400, damping: 28 }}
    width="16" height="16" viewBox="0 0 24 24"
    fill="var(--text-tertiary)"
    style={{ marginLeft: 'auto', flexShrink: 0 }}
  >
    <path d="M7 10l5 5 5-5z"/>
  </motion.svg>
)

const accordionHeadStyle = {
  display: 'flex', alignItems: 'center', gap: 8,
  width: '100%',
  padding: '10px 14px',
  background: 'transparent',
  border: 'none',
  cursor: 'pointer',
}

// Minimal text + date/time composer for adding a todo already scoped to this
// topic — no topic picker needed, unlike the calendar's AddTodoRow.
function TopicTodoComposer({ topicId, onAdd, onDone, t }) {
  const [text, setText] = useState('')
  const [dueDate, setDueDate] = useState('')
  const [dueTime, setDueTime] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit() {
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      await onAdd(buildTodo({ id: crypto.randomUUID(), completed: false }, {
        text: value, topic_id: topicId, due_date: dueDate || null, due_time: dueTime || null,
      }))
      setText(''); setDueDate(''); setDueTime('')
      onDone()
    } catch (e) {
      console.error('TopicTodoComposer failed:', e)
    } finally {
      setBusy(false)
    }
  }

  return (
    <GlassCard style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        autoFocus
        className="input"
        type="text"
        value={text}
        placeholder={t('widget.todo.placeholder')}
        onChange={e => setText(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') submit() }}
      />
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" type="date" value={dueDate} onChange={e => setDueDate(e.target.value)} style={{ flex: 1 }} />
        <input className="input" type="time" value={dueTime} onChange={e => setDueTime(e.target.value)} style={{ width: 96, flex: 'none' }} />
        <motion.button
          whileTap={{ scale: 0.94 }}
          className="btn btn-secondary"
          style={{ width: 'auto', padding: '0 16px', flexShrink: 0 }}
          onClick={submit}
          disabled={busy || !text.trim()}
        >
          {t('calendar.addTodo')}
        </motion.button>
      </div>
    </GlassCard>
  )
}

export default function TopicStatsScreen() {
  const navigate = useNavigate()
  const { state } = useLocation()
  const { topics, recentSessions, scheduled, todos, upsertTodo, removeTodo, removeSession, upsertTopic } = useData()
  const { setDirection } = useContext(NavDirectionContext)
  const { startSession } = useSession()
  const { t, language } = useLanguage()
  const { gridLines, smoothLines, showDots, carryForward, markInactive } = useGraphSettings()
  const [timeframe, setTimeframe] = useState('30d')
  const [goalOpen, setGoalOpen] = useState(false)
  const [weightOpen, setWeightOpen] = useState(false)
  const [weightDraft, setWeightDraft] = useState('')
  const [weightSaving, setWeightSaving] = useState(false)
  const [weightSaved, setWeightSaved] = useState(true)

  const topic = topics.find(t => t.id === state?.topicId)
  const { from, to } = getDateRange(timeframe)
  useAssistantScreen('topic-stats', { screen: 'topic-stats', topicId: state?.topicId ?? null, timeframe })
  const goalTarget = topic?.target_accuracy ?? 80
  const topicWeight = parseFloat(topic?.weight ?? 50)
  const topicWeightDisplay = Number.isInteger(topicWeight)
    ? `${topicWeight}%`
    : `${topicWeight.toString().replace('.', ',')}%`

  function handleWeightOpen() {
    setWeightDraft(topicWeight.toString().replace('.', ','))
    setWeightSaved(true)
    setWeightOpen(v => !v)
  }

  async function saveWeight() {
    const parsed = parseFloat(weightDraft.replace(',', '.'))
    if (isNaN(parsed) || parsed <= 0 || weightSaving || weightSaved) return
    setWeightSaving(true)
    try {
      await upsertTopic({ ...topic, weight: Math.round(parsed * 100) / 100 })
      setWeightSaved(true)
    } finally {
      setWeightSaving(false)
    }
  }

  const sessions = useMemo(() => {
    if (!state?.topicId) return []
    return filterSessionsByRange(recentSessions, from, to)
      .filter(s => s.topic_id === state.topicId)
  }, [recentSessions, from, to, state?.topicId])

  // Calendar entries scheduled for this topic — soonest first, so the card
  // reads like a short agenda rather than an unsorted dump.
  const plannedSessions = useMemo(() => {
    if (!state?.topicId) return []
    return scheduled
      .filter(s => s.topic_id === state.topicId)
      .sort((a, b) => {
        const ka = `${a.scheduled_date} ${a.start_time ?? '99'}`
        const kb = `${b.scheduled_date} ${b.start_time ?? '99'}`
        return ka < kb ? -1 : 1
      })
  }, [scheduled, state?.topicId])
  // Local day key — never toISOString() here, it shifts across the UTC
  // boundary for anyone east/west of UTC (same rule CalendarScreen follows).
  const todayKey = formatDate(new Date(), 'yyyy-MM-dd')
  const dateFnsLocale = language === 'en' ? dateFnsEn : dateFnsDe

  // This topic's to-dos, ranked the same way as the to-do widget and the
  // calendar so the ordering is consistent everywhere in the app.
  const urgency = useMemo(() => calcTopicUrgency(topics, recentSessions), [topics, recentSessions])
  const topicTodos = useMemo(() => {
    if (!state?.topicId) return []
    return sortTodos(todos.filter(td => td.topic_id === state.topicId), { mode: 'smart', urgency, today: todayKey })
  }, [todos, state?.topicId, urgency, todayKey])
  const [addingTodo, setAddingTodo] = useState(false)

  const totalExercises = sessions.reduce((s, x) => s + (x.total_exercises ?? 0), 0)
  const totalCorrect   = sessions.reduce((s, x) => s + (x.correct ?? 0), 0)
  const accuracy = totalExercises > 0 ? Math.round((totalCorrect / totalExercises) * 100) : 0

  const displayData = useMemo(() => {
    let last = null
    return calcDailyExerciseCounts(sessions, from, to)
      .map(d => {
        const inactive = d.exercises === 0
        if (!inactive) last = Math.round((d.correct / d.exercises) * 100)
        const accuracy = inactive
          ? (carryForward && last !== null ? last : 0)
          : last
        return { date: d.date.slice(5), exercises: d.exercises, accuracy, inactive }
      })
      .slice(-14)
  }, [sessions, from, to, carryForward])

  if (!topic) return null

  function handleStart() {
    startSession(topic.id)
    navigate('/session', { state: { topicId: topic.id } })
  }

  const tooltipStyle = {
    background: 'var(--glass-card-bg)',
    border: '0.5px solid var(--glass-card-stroke)',
    borderRadius: 12,
    fontSize: 12,
    boxShadow: '0 4px 20px rgba(0,0,0,0.14)',
    backdropFilter: 'blur(40px)',
  }

  return (
    <motion.div
      className="scroll-container"
      style={{ background: `linear-gradient(180deg, ${topic.color_from}28 0px, ${topic.color_from}1c 220px, ${topic.color_from}10 440px, ${topic.color_from}06 660px, ${topic.color_from}02 880px, var(--bg-primary) 1100px)` }}
      onPanEnd={(_, info) => {
        if (info.offset.x > 60 && Math.abs(info.offset.x) > Math.abs(info.offset.y) * 1.5) {
          setDirection(-1)
          navigate(-1)
        }
      }}
    >
      {/* ── Header ── */}
      <div style={{
        background: `linear-gradient(145deg, ${topic.color_from}60 0%, ${topic.color_from}22 55%, ${topic.color_to}45 100%)`,
        backdropFilter: 'blur(60px) saturate(200%) brightness(1.08)',
        WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.08)',
        boxShadow: `0 0 0 0.5px rgba(255,255,255,0.18) inset,
                    0 2px 0 rgba(255,255,255,0.24) inset,
                    0 24px 32px -8px ${topic.color_from}28`,
        maskImage: 'linear-gradient(180deg, black 0%, black 88%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(180deg, black 0%, black 88%, transparent 100%)',
        padding: '16px 16px 22px',
      }}
      className="topic-stats-header">
        {/* Top row: back button left, start button right */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <GlassButton height={36} fontSize={14} tint="rgba(0,0,0,0.18)" ink="white"
            onClick={() => { setDirection(-1); navigate(-1) }}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
              <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
            </svg>
            {t('btn.back')}
          </GlassButton>
          <GlassButton height={36} fontSize={14} tint="rgba(255,255,255,0.26)" ink="white" onClick={handleStart}>
            ▶ {t('topicStats.start')}
          </GlassButton>
        </div>

        {/* Centered emoji + name */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', marginBottom: 18, gap: 10 }}>
          <div style={{ fontSize: 48, lineHeight: 1, filter: 'drop-shadow(0 4px 10px rgba(0,0,0,0.25))' }}>{topic.emoji}</div>
          <GlassPanel
            cornerRadius={14}
            displacementScale={30}
            tint="rgba(0, 0, 0, 0.12)"
            style={{ maxWidth: '100%' }}
            bodyStyle={{ padding: '4px 14px', boxShadow: HEADER_GLASS_EDGE }}
          >
            <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'white', letterSpacing: -0.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{topic.name}</h1>
          </GlassPanel>
          {topic.description && (
            <p style={{ margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.82)', lineHeight: 1.35, textShadow: '0 1px 4px rgba(0,0,0,0.40)' }}>{topic.description}</p>
          )}
        </div>

        <div style={{ display: 'flex', gap: 10 }}>
          <StatPill label={t('topicStats.exercises')} value={totalExercises.toLocaleString()} />
          <StatPill label={t('topicStats.accuracy')}  value={`${accuracy}%`} />
          <StatPill label={t('topicStats.sessions')}  value={sessions.length} />
        </div>

        {/* Timeframe selector */}
        <div style={{ display: 'flex', gap: 8, marginTop: 18 }}>
          {TIMEFRAMES.map(value => {
            const active = timeframe === value
            return (
              <GlassButton
                key={value}
                height={34}
                fontSize={13}
                tint={active ? 'rgba(255,255,255,0.34)' : 'rgba(0,0,0,0.12)'}
                ink="white"
                style={{ flex: 1, minWidth: 0 }}
                onClick={() => setTimeframe(value)}
              >
                {t(`topicStats.tf.${value}`)}
              </GlassButton>
            )
          })}
        </div>
      </div>

      <div style={{ padding: '20px 16px 0' }}>

        {/* Accuracy goal — collapsible */}
        <GlassCard style={{ marginBottom: 20 }}>
          <motion.button whileTap={{ scale: 0.98 }} onClick={() => setGoalOpen(v => !v)} style={accordionHeadStyle}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('topicStats.goal')}
            </span>
            {!goalOpen && (
              <span style={{ fontSize: 13, fontWeight: 700, color: topic.color_from }}>
                {goalTarget}%
              </span>
            )}
            {chevron(goalOpen)}
          </motion.button>

          <AnimatePresence initial={false}>
            {goalOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.32, 0, 0.67, 0] }}
                style={{ overflow: 'hidden' }}
              >
                <div className="wc-pills" style={{ gap: 6, padding: '2px 14px 12px' }}>
                  {[60, 70, 75, 80, 85, 90, 95].map(pct => (
                    <Pill key={pct} color={topic.color_from} active={goalTarget === pct}
                      onClick={() => upsertTopic({ ...topic, target_accuracy: pct })}>
                      {pct}%
                    </Pill>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>

        {/* Topic weight — collapsible */}
        <GlassCard style={{ marginBottom: 20 }}>
          <motion.button whileTap={{ scale: 0.98 }} onClick={handleWeightOpen} style={accordionHeadStyle}>
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {t('topicStats.weight')}
            </span>
            {!weightOpen && (
              <span style={{ fontSize: 13, fontWeight: 700, color: topic.color_from }}>
                {topicWeightDisplay}
              </span>
            )}
            {chevron(weightOpen)}
          </motion.button>

          <AnimatePresence initial={false}>
            {weightOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.22, ease: [0.32, 0, 0.67, 0] }}
                style={{ overflow: 'hidden' }}
              >
                <p style={{ margin: '2px 14px 6px', fontSize: 11, color: 'var(--text-tertiary)' }}>
                  {t('topicStats.weightHint')}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 14px 14px' }}>
                  {/* Input with rotating glow border while saving */}
                  {weightSaving && (
                    <style>{`
                      @keyframes weightGlowSpin {
                        from { transform: rotate(0deg); }
                        to   { transform: rotate(360deg); }
                      }
                    `}</style>
                  )}
                  <div style={{ flex: 1, position: 'relative' }}>
                    {/* Clip wrapper — keeps the oversized spinner inside the rounded rect */}
                    {weightSaving && (
                      <div style={{
                        position: 'absolute',
                        inset: -2,
                        borderRadius: 13,
                        overflow: 'hidden',
                        zIndex: 0,
                      }}>
                        <div style={{
                          position: 'absolute',
                          width: '200%',
                          height: '200%',
                          top: '-50%',
                          left: '-50%',
                          background: `conic-gradient(from 0deg, transparent 0%, ${topic.color_from} 35%, ${topic.color_from}99 55%, transparent 75%)`,
                          animation: 'weightGlowSpin 1.1s linear infinite',
                        }} />
                      </div>
                    )}
                    <div style={{
                      position: 'relative', zIndex: 1,
                      display: 'flex', alignItems: 'center',
                      background: 'var(--bg-secondary)',
                      border: weightSaving ? 'none' : `1px solid ${topic.color_from}55`,
                      borderRadius: 10,
                      padding: '0 12px',
                    }}>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={weightDraft}
                        onChange={e => { setWeightDraft(e.target.value); setWeightSaved(false) }}
                        onBlur={saveWeight}
                        onKeyDown={e => { if (e.key === 'Enter') { e.target.blur() } }}
                        placeholder="z.B. 26,5"
                        style={{
                          flex: 1,
                          background: 'transparent',
                          border: 'none',
                          outline: 'none',
                          fontSize: 22,
                          fontWeight: 700,
                          color: topic.color_from,
                          padding: '10px 0',
                          width: 0,
                          minWidth: 0,
                        }}
                      />
                      <span style={{ fontSize: 18, fontWeight: 700, color: topic.color_from, opacity: 0.7 }}>%</span>
                    </div>
                  </div>
                  <GlassButton
                    height={44}
                    fontSize={14}
                    variant="primary"
                    tint={weightSaving || weightSaved ? 'var(--border)' : topic.color_from}
                    ink={weightSaving || weightSaved ? 'var(--text-tertiary)' : 'white'}
                    onClick={saveWeight}
                    disabled={weightSaving || weightSaved}
                  >
                    {weightSaving ? '···' : t('btn.save')}
                  </GlassButton>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>

        {/* Planned sessions — this topic's entries from the calendar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.3 }}>
              {t('topicStats.planned')}
            </div>
            <GlassButton height={30} fontSize={12} tint="var(--glass-card-bg)" ink={topic.color_from}
              style={{ '--glass-pad': '0 10px' }}
              onClick={() => navigate('/calendar', { state: { date: plannedSessions[0]?.scheduled_date ?? todayKey } })}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill={topic.color_from}>
                <path d="M7 2v2h10V2h2v2h1.5A1.5 1.5 0 0122 5.5v15a1.5 1.5 0 01-1.5 1.5h-17A1.5 1.5 0 012 20.5v-15A1.5 1.5 0 013.5 4H5V2h2zm13 8H4v10h16V10z"/>
              </svg>
              {t('topicStats.openCalendar')}
            </GlassButton>
          </div>

          {plannedSessions.length === 0 ? (
            <GlassCard style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-tertiary)' }}>
              {t('topicStats.noPlanned')}
            </GlassCard>
          ) : (
            <GlassCard style={{ overflow: 'hidden' }}>
              {plannedSessions.slice(0, 5).map((entry, i) => {
                const isPast = entry.scheduled_date < todayKey
                const isLast = i === Math.min(plannedSessions.length, 5) - 1
                return (
                  <button
                    key={entry.id}
                    onClick={() => navigate('/calendar', { state: { date: entry.scheduled_date } })}
                    style={{
                      width: '100%',
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      padding: '12px 16px',
                      background: 'transparent',
                      border: 'none',
                      borderBottom: isLast ? 'none' : '0.5px solid var(--border)',
                      textAlign: 'left',
                      cursor: 'pointer',
                      opacity: isPast ? 0.55 : 1,
                    }}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                        {formatDate(new Date(`${entry.scheduled_date}T00:00:00`), 'EEE, d. MMM', { locale: dateFnsLocale })}
                        {entry.start_time ? ` · ${entry.start_time.slice(0, 5)}` : ''}
                      </div>
                      {(entry.planned_minutes || entry.note) && (
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                          {[entry.planned_minutes ? `${entry.planned_minutes} ${t('topicStats.min')}` : null, entry.note].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--text-tertiary)" style={{ flexShrink: 0 }}>
                      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
                    </svg>
                  </button>
                )
              })}
            </GlassCard>
          )}
        </div>

        {/* Todos assigned to this topic — same ranking as the todo widget */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
            <div style={{ flex: 1, fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.3 }}>
              {t('topicStats.todos')}
            </div>
            <GlassButton height={30} fontSize={12} ink={topic.color_from}
              tint={addingTodo ? `color-mix(in srgb, ${topic.color_from} 20%, var(--glass-card-bg))` : 'var(--glass-card-bg)'}
              style={{ '--glass-pad': '0 10px' }}
              onClick={() => setAddingTodo(v => !v)}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill={topic.color_from}><path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
              {t('topicStats.addTodo')}
            </GlassButton>
          </div>

          <AnimatePresence initial={false}>
            {addingTodo && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2 }}
                style={{ overflow: 'hidden', marginBottom: 8 }}
              >
                <TopicTodoComposer topicId={topic.id} onAdd={upsertTodo} onDone={() => setAddingTodo(false)} t={t} />
              </motion.div>
            )}
          </AnimatePresence>

          {topicTodos.length === 0 ? (
            <GlassCard style={{ padding: '12px 14px', fontSize: 13, color: 'var(--text-tertiary)' }}>
              {t('topicStats.noTodos')}
            </GlassCard>
          ) : (
            <GlassCard style={{ overflow: 'hidden' }}>
              {topicTodos.map((todo, i) => {
                const prio = effectivePriority(todo, urgency)
                const status = todo.completed ? null : dueStatus(todo, todayKey)
                const isLast = i === topicTodos.length - 1
                return (
                  <SwipeToDeleteRow key={todo.id} onDelete={() => removeTodo(todo.id)} divider={!isLast}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px 10px 20px', background: 'transparent' }}>
                      {prio.level > 0 && !todo.completed && (
                        <span
                          title={prio.derived ? t('widget.todo.derivedHint') : t(`widget.todo.priority.${PRIORITY_KEYS[prio.level]}`)}
                          style={{ position: 'absolute', left: 10, top: 10, bottom: 10, width: 3, borderRadius: 2, background: PRIORITY_COLORS[prio.level], opacity: prio.derived ? 0.4 : 1 }}
                        />
                      )}
                      <button
                        onClick={() => upsertTodo({ ...todo, completed: !todo.completed })}
                        style={{
                          width: 20, height: 20, borderRadius: 6, flexShrink: 0,
                          border: `1.5px solid ${todo.completed ? topic.color_from : 'var(--border-strong)'}`,
                          background: todo.completed ? topic.color_from : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                        }}
                      >
                        {todo.completed && (
                          <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                        )}
                      </button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{
                          fontSize: 13, color: 'var(--text-primary)',
                          textDecoration: todo.completed ? 'line-through' : 'none',
                          opacity: todo.completed ? 0.5 : 1,
                        }}>
                          {todo.text}
                        </div>
                        {status && (
                          <div style={{ fontSize: 11, fontWeight: 600, marginTop: 2, color: status === 'overdue' ? '#ef4444' : status === 'today' ? '#f59e0b' : 'var(--text-tertiary)' }}>
                            {['overdue', 'today', 'tomorrow'].includes(status) ? t(`widget.todo.due.${status}`) : formatDate(new Date(`${todo.due_date}T00:00:00`), 'd. MMM', { locale: dateFnsLocale })}
                            {todo.due_time && ` · ${shortTime(todo.due_time)}`}
                          </div>
                        )}
                      </div>
                    </div>
                  </SwipeToDeleteRow>
                )
              })}
            </GlassCard>
          )}
        </div>

        {sessions.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>{topic.emoji}</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{t('topicStats.noData')}</div>
            <div style={{ fontSize: 13, marginTop: 4, marginBottom: 20 }}>{t('topicStats.noDataHint')}</div>
            <GlassButton height={42} fontSize={14} variant="primary" tint={topic.color_from} ink="white"
              style={{ boxShadow: `0 4px 16px ${topic.color_from}40`, borderRadius: 21 }}
              onClick={handleStart}>
              ▶ {t('topicStats.start')}
            </GlassButton>
          </div>
        ) : (
          <>
            {/* Exercises per day */}
            <GlassCard style={{ padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.3, marginBottom: 12 }}>{t('topicStats.perDay')}</div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart data={displayData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="topicBarGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={topic.color_from} stopOpacity={1} />
                      <stop offset="100%" stopColor={topic.color_from} stopOpacity={0.3} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} interval={2} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: `${topic.color_from}12` }} />
                  <Bar dataKey="exercises" fill="url(#topicBarGrad)" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </GlassCard>

            {/* Accuracy over time */}
            <GlassCard style={{ padding: 16, marginBottom: 14 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.3, marginBottom: 12 }}>{t('topicStats.accPct')}</div>
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={displayData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="topicAccGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%"   stopColor={topic.color_to} stopOpacity={0.40} />
                      <stop offset="100%" stopColor={topic.color_to} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  {gridLines && <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />}
                  {markInactive && displayData.filter(d => d.inactive).map(d => (
                    <ReferenceLine key={d.date} x={d.date} stroke="rgba(239,100,30,0.35)" strokeWidth={16} ifOverflow="visible" />
                  ))}
                  <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} interval={2} axisLine={false} tickLine={false} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ stroke: `${topic.color_to}40`, strokeWidth: 1 }} />
                  <Area
                    type={smoothLines ? 'monotone' : 'linear'}
                    dataKey="accuracy"
                    stroke={topic.color_to}
                    strokeWidth={2}
                    fill="url(#topicAccGrad)"
                    dot={showDots ? { r: 3, fill: topic.color_to } : false}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </GlassCard>

            {/* Recent sessions — swipe to delete */}
            <div style={{ marginBottom: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.3, marginBottom: 10 }}>
                {t('topicStats.recent')}
              </div>
              <GlassCard style={{ overflow: 'hidden' }}>
                {sessions.slice(0, 15).map((s, i) => {
                  const acc = s.total_exercises > 0 ? Math.round((s.correct / s.total_exercises) * 100) : 0
                  const accColor = acc >= 70 ? '#30D158' : acc >= 50 ? '#FF9F0A' : '#FF453A'
                  const date = new Date(s.started_at)
                  const isLast = i === Math.min(sessions.length, 15) - 1
                  return (
                    <SwipeToDeleteRow
                      key={s.id}
                      onDelete={() => removeSession(s.id)}
                      divider={!isLast}
                    >
                      <div style={{ padding: '12px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'transparent' }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {s.total_exercises} {t('topicStats.exercises')} · {s.correct}✓ {s.wrong}✗
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>
                            {date.toLocaleDateString(getLocale(language), { day: '2-digit', month: '2-digit', year: '2-digit' })}
                            {s.duration_seconds ? ` · ${Math.round(s.duration_seconds / 60)} ${t('topicStats.min')}` : ''}
                          </div>
                        </div>
                        <div style={{
                          fontSize: 17, fontWeight: 800, color: accColor,
                          background: `${accColor}18`,
                          border: `0.5px solid ${accColor}50`,
                          borderRadius: 10,
                          padding: '4px 10px',
                          minWidth: 52,
                          textAlign: 'center',
                        }}>
                          {acc}%
                        </div>
                      </div>
                    </SwipeToDeleteRow>
                  )
                })}
              </GlassCard>
            </div>
          </>
        )}
      </div>
    </motion.div>
  )
}
