import { useState, useMemo } from 'react'
import { motion } from 'framer-motion'
import {
  BarChart, Bar, AreaChart, Area,
  ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid, ReferenceLine,
} from 'recharts'
import { useData } from '../context/DataContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useGraphSettings } from '../context/GraphSettingsContext.jsx'
import {
  TIMEFRAME_OPTIONS,
  getDateRange,
  filterSessionsByRange,
  calcDailyExerciseCounts,
} from '../utils/calculations/filterTimeframeCalcs.js'
import { calcTopicAccuracy, calcWeightedAccuracy, calcOverallAccuracy, calcRunningOverallAccuracy, calcRunningWeightedAccuracy, fmtPct } from '../utils/calculations/accuracyRatioCalcs.js'
import { calcCurrentStreak } from '../utils/calculations/streakTrackerCalcs.js'

const TOPIC_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#ef4444', '#14b8a6']

function HeroCard({ label, value, sub, color = 'var(--accent)', delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.22 }}
      style={{
        background: 'var(--card-bg)',
        borderRadius: 18,
        padding: '16px 14px',
        border: '1px solid var(--border)',
        flex: 1,
      }}
    >
      <div style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: 0.4, marginBottom: 6 }}>
        {label}
      </div>
      <div style={{ fontSize: 30, fontWeight: 800, color, lineHeight: 1, letterSpacing: -1 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>{sub}</div>}
    </motion.div>
  )
}

function SectionTitle({ children }) {
  return (
    <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.3, marginBottom: 10 }}>
      {children}
    </div>
  )
}

function ChartCard({ title, children, style }) {
  return (
    <div style={{
      background: 'var(--card-bg)',
      borderRadius: 18,
      padding: '14px 14px 10px',
      border: '1px solid var(--border)',
      marginBottom: 12,
      ...style,
    }}>
      {title && (
        <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 10 }}>{title}</div>
      )}
      {children}
    </div>
  )
}

const TOOLTIP_STYLE = {
  contentStyle: {
    background: 'var(--card-bg)',
    border: '1px solid var(--border)',
    borderRadius: 10,
    fontSize: 12,
    color: 'var(--text-primary)',
    boxShadow: 'var(--shadow)',
  },
  labelStyle: { color: 'var(--text-secondary)' },
  itemStyle: { color: 'var(--accent)' },
  cursor: { fill: 'var(--bg-tertiary)' },
}

export default function StatisticsScreen() {
  const { recentSessions, topics, dataLoading } = useData()
  const { t } = useLanguage()
  const { gridLines, smoothLines, showDots, carryForward, markInactive } = useGraphSettings()
  const [timeframe, setTimeframe] = useState('30d')

  const { from, to } = getDateRange(timeframe)

  const sessions = useMemo(
    () => filterSessionsByRange(recentSessions, from, to),
    [recentSessions, from, to]
  )

  const totalExercises = sessions.reduce((s, x) => s + (x.total_exercises ?? 0), 0)
  const accuracy         = useMemo(() => calcOverallAccuracy(sessions) ?? 0, [sessions])
  const weightedAccuracy = useMemo(() => calcWeightedAccuracy(sessions, topics) ?? 0, [sessions, topics])
  const streak           = useMemo(() => calcCurrentStreak(recentSessions), [recentSessions])
  const topicAccuracy  = useMemo(() => calcTopicAccuracy(sessions), [sessions])

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

  const accColor = accuracy >= 70 ? '#10b981' : accuracy >= 50 ? '#f59e0b' : '#ef4444'
  const weightedAccColor = weightedAccuracy >= 70 ? '#10b981' : weightedAccuracy >= 50 ? '#f59e0b' : '#ef4444'

  // Cumulative running averages so the chart line lands on the headline value.
  const combinedDisplayData = useMemo(() => {
    const acc = calcRunningOverallAccuracy(sessions, from, to)
    const wtd = calcRunningWeightedAccuracy(sessions, topics, from, to)
    const wtdByDate = Object.fromEntries(wtd.map(d => [d.date, d.value]))
    return acc
      .map(d => ({
        date: d.date,
        accuracy: d.value,
        weighted: wtdByDate[d.date] ?? null,
        inactive: d.inactive,
      }))
      .slice(-14)
  }, [sessions, topics, from, to])

  if (dataLoading) {
    return (
      <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
        <div style={{ padding: '20px 16px 0' }}>
          <div className="skeleton" style={{ width: 110, height: 28, borderRadius: 8, marginBottom: 20 }} />
          {/* Timeframe pills */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20 }}>
            {[80, 72, 80, 64, 88, 72].map((w, i) => (
              <div key={i} className="skeleton" style={{ width: w, height: 34, borderRadius: 20, flexShrink: 0 }} />
            ))}
          </div>
          {/* Stat cards */}
          <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
            <div className="skeleton" style={{ flex: 1, height: 82, borderRadius: 18 }} />
            <div className="skeleton" style={{ flex: 1, height: 82, borderRadius: 18 }} />
          </div>
          <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
            <div className="skeleton" style={{ flex: 1, height: 82, borderRadius: 18 }} />
            <div className="skeleton" style={{ flex: 1, height: 82, borderRadius: 18 }} />
          </div>
          {/* Chart placeholders */}
          <div className="skeleton" style={{ width: '100%', height: 170, borderRadius: 18, marginBottom: 12 }} />
          <div className="skeleton" style={{ width: '100%', height: 170, borderRadius: 18 }} />
        </div>
      </div>
    )
  }

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '20px 16px 0' }}>

        <h1 style={{ margin: '0 0 16px', fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          {t('stats.title')}
        </h1>

        {/* Timeframe pills */}
        <div style={{
          display: 'flex',
          gap: 6,
          overflowX: 'auto',
          paddingBottom: 4,
          marginBottom: 20,
          WebkitOverflowScrolling: 'touch',
        }}>
          {TIMEFRAME_OPTIONS.map(o => (
            <motion.button
              key={o.value}
              whileTap={{ scale: 0.92 }}
              onClick={() => setTimeframe(o.value)}
              style={{
                padding: '8px 14px',
                borderRadius: 20,
                border: 'none',
                background: timeframe === o.value ? 'var(--accent)' : 'var(--bg-tertiary)',
                color: timeframe === o.value ? 'white' : 'var(--text-secondary)',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                flexShrink: 0,
                whiteSpace: 'nowrap',
              }}
            >
              {t(`timeframe.${o.value}`)}
            </motion.button>
          ))}
        </div>

        {/* Hero stats row 1 */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
          <HeroCard label={t('stats.exercises')} value={totalExercises.toLocaleString()} sub={t('stats.total')} delay={0} />
          <HeroCard
            label={t('stats.accuracy')}
            value={fmtPct(accuracy)}
            sub={t('stats.accuracyAvg')}
            color={accColor}
            delay={0.04}
          />
        </div>
        {/* Hero stats row 2 */}
        <div style={{ display: 'flex', gap: 10, marginBottom: 20 }}>
          <HeroCard label={t('stats.sessions')} value={sessions.length} sub={t('stats.sessionsUnit')} delay={0.08} />
          <HeroCard label={t('stats.streak')} value={`🔥 ${streak}`} sub={t('stats.streakDays')} color="#f59e0b" delay={0.12} />
        </div>

        {/* Daily exercises bar chart */}
        <SectionTitle>{t('stats.perDay')}</SectionTitle>
        <ChartCard>
          <ResponsiveContainer width="100%" height={130}>
            <BarChart data={displayData} margin={{ top: 0, right: 0, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="statsBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--accent)" stopOpacity={1} />
                  <stop offset="100%" stopColor="var(--accent)" stopOpacity={0.45} />
                </linearGradient>
              </defs>
              <XAxis
                dataKey="date"
                tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }}
                axisLine={false}
                tickLine={false}
                interval={1}
              />
              <YAxis tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <Tooltip {...TOOLTIP_STYLE} formatter={(v) => [v, t('tooltip.exercises')]} />
              <Bar dataKey="exercises" fill="url(#statsBarGrad)" radius={[4, 4, 0, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Accuracy + weighted accuracy combined chart */}
        <SectionTitle style={{ marginTop: 4 }}>{t('stats.accuracyPct')}</SectionTitle>
        <ChartCard>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 12, marginBottom: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 2, borderRadius: 1, background: '#10b981' }} />
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>{t('stats.accuracyAvg')}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: accColor }}>{fmtPct(accuracy)}</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <div style={{ width: 10, height: 2, borderRadius: 1, background: '#8b5cf6', borderTop: '2px dashed #8b5cf6', boxSizing: 'border-box' }} />
              <span style={{ fontSize: 10, color: 'var(--text-tertiary)', fontWeight: 500 }}>{t('stats.weightedAvg')}</span>
              <span style={{ fontSize: 11, fontWeight: 800, color: weightedAccColor }}>{fmtPct(weightedAccuracy)}</span>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={130}>
            <AreaChart data={combinedDisplayData} margin={{ top: 4, right: 4, left: -28, bottom: 0 }}>
              <defs>
                <linearGradient id="statsAccGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10b981" stopOpacity={0.25} />
                  <stop offset="100%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="statsWtdGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.2} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              {gridLines && <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />}
              {markInactive && combinedDisplayData.filter(d => d.inactive).map(d => (
                <ReferenceLine key={d.date} x={d.date} stroke="rgba(239,100,30,0.35)" strokeWidth={16} ifOverflow="visible" />
              ))}
              <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} interval={1} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} axisLine={false} tickLine={false} />
              <Tooltip
                {...TOOLTIP_STYLE}
                formatter={(v, name) => {
                  const label = name === 'accuracy' ? t('stats.accuracyAvg') : t('stats.weightedAvg')
                  return v != null ? [fmtPct(v), label] : ['–', label]
                }}
              />
              <Area
                type={smoothLines ? 'monotone' : 'linear'}
                dataKey="accuracy"
                stroke="#10b981"
                strokeWidth={2}
                fill="url(#statsAccGrad)"
                dot={showDots ? { r: 3, fill: '#10b981' } : false}
                activeDot={{ r: 4, fill: '#10b981' }}
                isAnimationActive={false}
              />
              <Area
                type={smoothLines ? 'monotone' : 'linear'}
                dataKey="weighted"
                stroke="#8b5cf6"
                strokeWidth={2}
                strokeDasharray="5 3"
                fill="url(#statsWtdGrad)"
                dot={showDots ? { r: 3, fill: '#8b5cf6' } : false}
                activeDot={{ r: 4, fill: '#8b5cf6' }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartCard>

        {/* Per-topic accuracy */}
        {topicAccuracy.length > 0 && (
          <>
            <SectionTitle style={{ marginTop: 4 }}>{t('stats.perTopic')}</SectionTitle>
            <div style={{
              background: 'var(--card-bg)',
              borderRadius: 18,
              padding: '14px',
              border: '1px solid var(--border)',
              marginBottom: 12,
            }}>
              {topicAccuracy
                .sort((a, b) => b.accuracy - a.accuracy)
                .map((row, i) => {
                  const topic = topics.find(tp => tp.id === row.topicId)
                  const color = topic?.color_from ?? TOPIC_COLORS[i % TOPIC_COLORS.length]
                  return (
                    <div key={row.topicId} style={{ marginBottom: i < topicAccuracy.length - 1 ? 14 : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                          <span style={{ fontSize: 15 }}>{topic?.emoji ?? '📚'}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                            {topic?.name ?? t('stats.unknown')}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t('stats.exerciseCount', { n: row.total })}</span>
                          <span style={{ fontSize: 14, fontWeight: 800, color }}>{row.accuracy}%</span>
                        </div>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${row.accuracy}%` }}
                          transition={{ duration: 0.5, delay: i * 0.06, ease: 'easeOut' }}
                          style={{ height: '100%', borderRadius: 3, background: color }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          </>
        )}

        {/* Weighted accuracy breakdown */}
        {topicAccuracy.length > 0 && (
          <>
            <SectionTitle style={{ marginTop: 4 }}>{t('stats.weightedAvg')}</SectionTitle>
            <div style={{
              background: 'var(--card-bg)',
              borderRadius: 18,
              padding: '14px',
              border: '1px solid var(--border)',
              marginBottom: 12,
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14, paddingBottom: 12, borderBottom: '0.5px solid var(--border)' }}>
                <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.3 }}>{t('stats.weightedAvgHint')}</span>
                <span style={{ fontSize: 22, fontWeight: 800, color: weightedAccColor }}>{fmtPct(weightedAccuracy)}</span>
              </div>
              {topicAccuracy
                .sort((a, b) => b.accuracy - a.accuracy)
                .map((row, i) => {
                  const topic = topics.find(tp => tp.id === row.topicId)
                  const color = topic?.color_from ?? TOPIC_COLORS[i % TOPIC_COLORS.length]
                  const weight = topic?.weight ?? 50
                  return (
                    <div key={row.topicId} style={{ marginBottom: i < topicAccuracy.length - 1 ? 14 : 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, flex: 1 }}>
                          <span style={{ fontSize: 15 }}>{topic?.emoji ?? '📚'}</span>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {topic?.name ?? t('stats.unknown')}
                          </span>
                          <span style={{ fontSize: 10, fontWeight: 700, color, background: `${color}22`, borderRadius: 6, padding: '2px 6px', flexShrink: 0 }}>
                            {weight}%
                          </span>
                        </div>
                        <span style={{ fontSize: 14, fontWeight: 800, color, flexShrink: 0, marginLeft: 8 }}>{row.accuracy}%</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${row.accuracy}%` }}
                          transition={{ duration: 0.5, delay: i * 0.06, ease: 'easeOut' }}
                          style={{ height: '100%', borderRadius: 3, background: color, opacity: 0.75 }}
                        />
                      </div>
                    </div>
                  )
                })}
            </div>
          </>
        )}

        {sessions.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: 44, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{t('stats.noData')}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{t('stats.noDataHint')}</div>
          </div>
        )}

      </div>
    </div>
  )
}
