import { useState, useMemo } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useLanguage } from '../context/LanguageContext.jsx'
import {
  LineChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis,
  AreaChart, Area,
} from 'recharts'
import { useAuth } from '../context/AuthContext.jsx'
import { useData } from '../context/DataContext.jsx'
import { saveSession } from '../services/dbInterface.js'
import { calcSessionMetrics, formatMs, formatDuration } from '../utils/calculations/sessionMetricCalcs.js'
import { calcSpeedTimeline } from '../utils/calculations/speedTimelineCalcs.js'
import { calcAccuracyTimeline } from '../utils/calculations/accuracyRatioCalcs.js'

const EASE_OUT = [0.23, 1, 0.32, 1]

// Page-level cascade: each section fades/slides in ~60ms after the previous one.
const pageVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.02 } },
}
const sectionVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.28, ease: EASE_OUT } },
}

// Metric grid: tighter, faster stagger since these are small, numerous items.
const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04, delayChildren: 0.04 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.24, ease: EASE_OUT } },
}

function GlassCard({ children, style, as: Component = 'div', ...rest }) {
  return (
    <Component
      style={{
        background: 'var(--glass-card-bg)',
        backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
        WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
        border: '0.5px solid var(--glass-card-stroke)',
        boxShadow: 'var(--glass-card-shadow)',
        borderRadius: 18,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Component>
  )
}

function MetricCard({ label, value, sub, color = 'var(--text-primary)' }) {
  return (
    <motion.div variants={cardVariants}>
      <GlassCard style={{ padding: 16, textAlign: 'center' }}>
        <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: 0.5, marginBottom: 4 }}>
          {label.toUpperCase()}
        </div>
        <div style={{ fontSize: 26, fontWeight: 800, color }}>{value}</div>
        {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>{sub}</div>}
      </GlassCard>
    </motion.div>
  )
}

export default function SessionSummaryScreen() {
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()
  const { topics, recentSessions, addRecentSession } = useData()
  const { t } = useLanguage()
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [savedOffline, setSavedOffline] = useState(false)

  const { exercises = [], topicId, startedAt, endedAt, durationSeconds } = location.state ?? {}
  const topic = topics.find(t => t.id === topicId)

  const metrics = useMemo(() => calcSessionMetrics(exercises), [exercises])
  const speedData = useMemo(() => calcSpeedTimeline(exercises), [exercises])
  const accuracyData = useMemo(() => calcAccuracyTimeline(exercises), [exercises])

  const beforeAccuracy = useMemo(() => {
    const prior = recentSessions.filter(s => s.topic_id === topicId)
    const totalEx = prior.reduce((s, x) => s + (x.total_exercises ?? 0), 0)
    const totalCorrect = prior.reduce((s, x) => s + (x.correct ?? 0), 0)
    return totalEx > 0 ? Math.round((totalCorrect / totalEx) * 100) : null
  }, [recentSessions, topicId])

  const target = topic?.target_accuracy ?? 80
  const afterAccuracy = metrics.total > 0 ? metrics.accuracy : null
  const cf = topic?.color_from ?? '#6366f1'
  const ct = topic?.color_to ?? '#8b5cf6'
  const afterColor = afterAccuracy === null ? 'var(--text-secondary)'
    : afterAccuracy >= target ? '#30D158'
    : afterAccuracy >= target * 0.85 ? '#FF9F0A'
    : '#FF453A'

  async function handleSave() {
    if (saved || saving) return
    setSaving(true)
    try {
      const session = await saveSession(user.id, {
        topic_id: topicId,
        started_at: startedAt,
        ended_at: endedAt,
        duration_seconds: durationSeconds,
      }, exercises)
      addRecentSession(session)
      setSavedOffline(!!session?._pendingSync)
      setSaved(true)
      setTimeout(() => navigate('/home'), 1200)
    } catch (e) {
      console.error(e)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div
      className="scroll-container"
      style={{ background: topic ? `linear-gradient(180deg, ${cf}28 0px, ${cf}1c 220px, ${cf}10 440px, ${cf}06 660px, ${cf}02 880px, var(--bg-primary) 1100px)` : 'var(--bg-primary)' }}
    >
      <motion.div
        variants={pageVariants}
        initial="hidden"
        animate="visible"
        style={{ padding: '20px 16px 0' }}
      >
        {/* Header */}
        <motion.div
          variants={sectionVariants}
          style={{ marginBottom: 24 }}
        >
          {topic && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              background: `linear-gradient(135deg, ${topic.color_from}, ${topic.color_to})`,
              boxShadow: `0 0 0 0.5px rgba(255,255,255,0.28) inset, 0 4px 14px ${topic.color_from}40`,
              borderRadius: 10,
              padding: '6px 14px',
              marginBottom: 12,
            }}>
              <span>{topic.emoji}</span>
              <span style={{ color: 'white', fontWeight: 600, fontSize: 14 }}>{topic.name}</span>
            </div>
          )}
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
            {t('summary.title')}
          </h1>
          {durationSeconds && (
            <p style={{ margin: '4px 0 0', color: 'var(--text-secondary)', fontSize: 14 }}>
              {t('summary.duration')} {formatDuration(durationSeconds)}
            </p>
          )}
        </motion.div>

        {/* Metric cards */}
        <motion.div
          variants={containerVariants}
          initial="hidden"
          animate="visible"
          style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 10, marginBottom: 20 }}
        >
          <MetricCard label={t('summary.total')} value={metrics.total} />
          <MetricCard
            label={t('summary.accuracy')}
            value={`${metrics.accuracy}%`}
            color={metrics.accuracy >= 70 ? '#10b981' : metrics.accuracy >= 50 ? '#f59e0b' : '#ef4444'}
          />
          <MetricCard label={t('summary.correct')} value={metrics.correct} color="#10b981" />
          <MetricCard label={t('summary.wrong')} value={metrics.wrong} color="#ef4444" />
          <MetricCard label={t('summary.avgTime')} value={formatMs(metrics.avgMs)} sub={t('summary.perTask')} />
          <MetricCard label={t('summary.fastest')} value={formatMs(metrics.minMs)} color="#06b6d4" />
          <MetricCard label={t('summary.slowest')} value={formatMs(metrics.maxMs)} color="#f59e0b" />
        </motion.div>

        {/* Speed over session */}
        {speedData.length > 1 && (
          <motion.div variants={sectionVariants} style={{ marginBottom: 16 }}>
            <GlassCard style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                {t('summary.speedChart')}
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={speedData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="speedGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="var(--accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="index" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} />
                  <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--glass-card-bg)', border: '0.5px solid var(--glass-card-stroke)', borderRadius: 12, fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.14)', backdropFilter: 'blur(40px)' }}
                    formatter={v => [`${v}s`, t('tooltip.time')]}
                  />
                  <Area type="monotone" dataKey="seconds" stroke="var(--accent)" fill="url(#speedGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </GlassCard>
          </motion.div>
        )}

        {/* Accuracy over session */}
        {accuracyData.length > 1 && (
          <motion.div variants={sectionVariants} style={{ marginBottom: 24 }}>
            <GlassCard style={{ padding: 16 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
                {t('summary.accuracyChart')}
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={accuracyData} margin={{ top: 0, right: 0, left: -24, bottom: 0 }}>
                  <defs>
                    <linearGradient id="accGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="index" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} />
                  <Tooltip
                    contentStyle={{ background: 'var(--glass-card-bg)', border: '0.5px solid var(--glass-card-stroke)', borderRadius: 12, fontSize: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.14)', backdropFilter: 'blur(40px)' }}
                    formatter={v => [`${v}%`, t('tooltip.accuracy')]}
                  />
                  <Area type="monotone" dataKey="accuracy" stroke="#10b981" fill="url(#accGrad)" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </GlassCard>
          </motion.div>
        )}

        {/* Before / After accuracy card */}
        {afterAccuracy !== null && (
          <motion.div variants={sectionVariants} style={{ marginBottom: 20 }}>
            <GlassCard style={{ padding: 16 }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
                {t('summary.accuracyProgress')}
              </div>
              {beforeAccuracy !== null && afterAccuracy !== null && (
                <div style={{
                  fontSize: 14, fontWeight: 800,
                  color: afterColor,
                  background: `${afterColor}18`,
                  border: `0.5px solid ${afterColor}40`,
                  borderRadius: 9, padding: '3px 10px',
                  fontVariantNumeric: 'tabular-nums',
                }}>
                  {afterAccuracy - beforeAccuracy > 0
                    ? `+${afterAccuracy - beforeAccuracy}%`
                    : afterAccuracy - beforeAccuracy === 0
                    ? '→ 0%'
                    : `${afterAccuracy - beforeAccuracy}%`}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Before bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    {t('planner.before')}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                    {beforeAccuracy !== null ? `${beforeAccuracy}%` : '–'}
                  </span>
                </div>
                <div style={{ height: 5, borderRadius: 3, background: 'var(--border)', position: 'relative', overflow: 'visible' }}>
                  <div style={{
                    position: 'absolute', top: -3, bottom: -3,
                    left: `${Math.min(99, target)}%`, width: 2,
                    background: 'var(--text-tertiary)', borderRadius: 1,
                    zIndex: 2, transform: 'translateX(-50%)', opacity: 0.4,
                  }} />
                  {beforeAccuracy !== null && (
                    <div style={{
                      height: '100%', width: `${Math.min(100, beforeAccuracy)}%`,
                      borderRadius: 3,
                      background: `linear-gradient(90deg, ${cf}70, ${ct}70)`,
                    }} />
                  )}
                </div>
              </div>

              {/* After bar */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.4, textTransform: 'uppercase' }}>
                    {t('planner.after')}
                  </span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: afterColor, fontVariantNumeric: 'tabular-nums' }}>
                    {afterAccuracy}%
                  </span>
                </div>
                <div style={{ height: 7, borderRadius: 4, background: 'var(--border)', position: 'relative', overflow: 'visible' }}>
                  <div style={{
                    position: 'absolute', top: -3, bottom: -3,
                    left: `${Math.min(99, target)}%`, width: 2,
                    background: 'var(--text-tertiary)', borderRadius: 1,
                    zIndex: 2, transform: 'translateX(-50%)', opacity: 0.6,
                  }} />
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, afterAccuracy)}%` }}
                    transition={{ duration: 0.5, delay: 0.3, ease: EASE_OUT }}
                    style={{
                      height: '100%', borderRadius: 4,
                      background: `linear-gradient(90deg, ${cf}, ${ct})`,
                    }}
                  />
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 4 }}>
                  <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
                    {t('planner.targetAcc')} {target}%
                  </span>
                </div>
              </div>
            </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Save button */}
        <motion.button
          variants={sectionVariants}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.12, ease: EASE_OUT }}
          className="btn btn-primary"
          style={{ width: '100%', marginBottom: 12, fontSize: 17, height: 56, boxShadow: `0 4px 16px ${cf}40` }}
          onClick={handleSave}
          disabled={saving || saved}
        >
          {saved ? t('summary.saved') : saving ? t('summary.saving') : t('summary.save')}
        </motion.button>

        {savedOffline && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18, ease: EASE_OUT }}
            style={{
              textAlign: 'center',
              fontSize: 13,
              color: 'var(--text-secondary)',
              marginBottom: 12,
            }}
          >
            {t('summary.savedOffline')}
          </motion.div>
        )}

        <motion.button
          variants={sectionVariants}
          whileTap={{ scale: 0.97 }}
          transition={{ duration: 0.12, ease: EASE_OUT }}
          className="btn"
          style={{
            width: '100%', marginBottom: 32,
            background: 'var(--glass-card-bg)',
            backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
            WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
            border: '0.5px solid var(--glass-card-stroke)',
            boxShadow: 'var(--glass-card-shadow)',
            color: 'var(--text-primary)',
          }}
          onClick={() => navigate('/home')}
        >
          {t('summary.discard')}
        </motion.button>
      </motion.div>
    </div>
  )
}
