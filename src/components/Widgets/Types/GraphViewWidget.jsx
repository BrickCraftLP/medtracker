import { useMemo } from 'react'
import { AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, CartesianGrid, ReferenceLine } from 'recharts'
import { useData } from '../../../context/DataContext.jsx'
import { calcDailyExerciseCounts, getDateRange, filterSessionsByRange } from '../../../utils/calculations/filterTimeframeCalcs.js'
import { calcTopicAccuracy, calcWeightedAccuracy, calcOverallAccuracy, calcRunningOverallAccuracy, calcRunningWeightedAccuracy, fmtPct } from '../../../utils/calculations/accuracyRatioCalcs.js'
import { motion } from 'framer-motion'
import { useLanguage } from '../../../context/LanguageContext.jsx'
import { useGraphSettings } from '../../../context/GraphSettingsContext.jsx'

export default function GraphViewWidget({ config = {}, size }) {
  const { recentSessions, topics } = useData()
  const { t } = useLanguage()
  const { gridLines, smoothLines, showDots, carryForward, markInactive, accLineColor, wtdLineColor } = useGraphSettings()
  const mode = config.graph_mode ?? 'accuracy_all'
  const topicId = config.topic_id ?? null
  const showWeights = config.show_weights ?? false

  // accuracy_all per-line config
  const showAccuracy = config.show_accuracy ?? true
  const showWeighted = config.show_weighted ?? false
  const accColor     = accLineColor
  const wtdColor     = wtdLineColor

  const { from, to } = getDateRange(config.timeframe ?? '30d')

  const filteredSessions = useMemo(
    () => filterSessionsByRange(recentSessions, from, to),
    [recentSessions, from, to]
  )

  const data = useMemo(() => {
    function mapAccuracy(daily) {
      let last = null
      return daily.map(d => {
        const inactive = d.exercises === 0
        if (!inactive) last = Math.round((d.correct / d.exercises) * 100)
        const value = inactive ? (carryForward && last !== null ? last : 0) : last
        return { date: d.date.slice(5), value, inactive }
      })
    }

    if (mode === 'accuracy_all') {
      // Cumulative running averages so the line lands on the headline number.
      const acc = calcRunningOverallAccuracy(filteredSessions, from, to)
      const wtd = calcRunningWeightedAccuracy(filteredSessions, topics, from, to)
      const wtdByDate = Object.fromEntries(wtd.map(d => [d.date, d.value]))
      return acc.map(d => ({
        date: d.date,
        accuracy: d.value,
        weighted: wtdByDate[d.date] ?? null,
        inactive: d.inactive,
      }))
    }
    if (mode === 'exercises_all') {
      return calcDailyExerciseCounts(filteredSessions, from, to).map(d => ({
        date: d.date.slice(5),
        value: d.exercises,
        inactive: d.exercises === 0,
      }))
    }
    if (mode === 'accuracy_per_topic') {
      if (topicId) {
        const topicSessions = filteredSessions.filter(s => s.topic_id === topicId)
        return mapAccuracy(calcDailyExerciseCounts(topicSessions, from, to))
      }
      return calcTopicAccuracy(filteredSessions).map(t => ({
        date: topics.find(tp => tp.id === t.topicId)?.name ?? t.topicId,
        value: t.accuracy,
        inactive: false,
      }))
    }
    return []
  }, [filteredSessions, mode, topicId, from, to, topics, carryForward])

  const selectedTopic = topicId ? topics.find(t => t.id === topicId) : null
  const label = mode === 'accuracy_all'
    ? t('widget.pctCorrect')
    : mode === 'exercises_all'
    ? t('widget.exercisesLabel')
    : selectedTopic
    ? `% ${selectedTopic.name}`
    : t('widget.perTopic')

  const weightedListData = useMemo(() => {
    if (mode !== 'accuracy_per_topic' || topicId || !showWeights) return []
    return calcTopicAccuracy(filteredSessions).sort((a, b) => b.accuracy - a.accuracy)
  }, [mode, topicId, showWeights, filteredSessions])

  // Headline numbers use the canonical pooled/weighted calcs so they always
  // match the StatNumber widget and the Statistics screen.
  const accuracyAvg = useMemo(
    () => (mode === 'accuracy_all' ? calcOverallAccuracy(filteredSessions) : null),
    [mode, filteredSessions]
  )

  const weightedAvg = useMemo(
    () => (mode === 'accuracy_all' ? calcWeightedAccuracy(filteredSessions, topics) : null),
    [mode, filteredSessions, topics]
  )

  const singleAvg = useMemo(() => {
    if (mode === 'accuracy_all') return null
    if (mode === 'accuracy_per_topic' && !topicId && showWeights) {
      return calcWeightedAccuracy(filteredSessions, topics)
    }
    if (mode === 'accuracy_per_topic' && topicId) {
      return calcOverallAccuracy(filteredSessions.filter(s => s.topic_id === topicId))
    }
    const nonZero = data.filter(d => d.value > 0)
    return nonZero.length > 0 ? Math.round(nonZero.reduce((s, d) => s + d.value, 0) / nonZero.length) : 0
  }, [mode, filteredSessions, topics, data, topicId, showWeights])

  // ── weighted list view (accuracy_per_topic + show_weights) ──────────────────
  if (mode === 'accuracy_per_topic' && !topicId && showWeights) {
    return (
      <div style={{ padding: 12, height: '100%', display: 'flex', flexDirection: 'column' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 8 }}>
          <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label.toUpperCase()}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700, color: accLineColor, flexShrink: 0 }}>{fmtPct(singleAvg)}</span>
        </div>
        <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 7 }}>
          {weightedListData.map((row) => {
            const topic = topics.find(t => t.id === row.topicId)
            const color = topic?.color_from ?? accLineColor
            const weight = Number(topic?.weight ?? 50)
            return (
              <div key={row.topicId}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
                    <span style={{ fontSize: 11, flexShrink: 0 }}>{topic?.emoji ?? '📚'}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {topic?.name ?? t('widget.unknown')}
                    </span>
                    <span style={{ fontSize: 8, fontWeight: 700, color, background: `${color}22`, borderRadius: 4, padding: '1px 4px', flexShrink: 0 }}>
                      {weight}%
                    </span>
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 800, color, flexShrink: 0, marginLeft: 4 }}>{row.accuracy}%</span>
                </div>
                <div style={{ height: 3, borderRadius: 2, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${row.accuracy}%` }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                    style={{ height: '100%', borderRadius: 2, background: color, opacity: 0.75 }}
                  />
                </div>
              </div>
            )
          })}
          {weightedListData.length === 0 && (
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-tertiary)', fontSize: 11 }}>
              {t('widget.noData')}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── main chart view ─────────────────────────────────────────────────────────
  const isAccAll = mode === 'accuracy_all'
  const isSmall = size === 'small'

  // Tighter spacing/typography on small (square, ~half-width) widgets so the
  // header label and the avg numbers don't overlap on narrow screens (iOS).
  const pad         = isSmall ? 10 : 14
  const labelSize   = isSmall ? 9 : 10
  const numSize     = isSmall ? 11 : 13
  const capSize     = isSmall ? 6 : 7
  const numGroupGap = isSmall ? 5 : 8

  return (
    <div style={{ padding: pad, height: '100%', display: 'flex', flexDirection: 'column' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6, marginBottom: 4 }}>
        <span style={{ fontSize: labelSize, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.5, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label.toUpperCase()}
        </span>
        {isAccAll ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: numGroupGap, flexShrink: 0 }}>
            {showAccuracy && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1 }}>
                <span style={{ fontSize: capSize, fontWeight: 600, color: accColor, opacity: 0.75, letterSpacing: 0.3 }}>
                  {t('widget.avgShort')}
                </span>
                <span style={{ fontSize: numSize, fontWeight: 700, color: accColor }}>{fmtPct(accuracyAvg)}</span>
              </div>
            )}
            {showAccuracy && showWeighted && (
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)' }}>·</span>
            )}
            {showWeighted && (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1 }}>
                <span style={{ fontSize: capSize, fontWeight: 600, color: wtdColor, opacity: 0.75, letterSpacing: 0.3 }}>
                  {t('widget.wtdShort')}
                </span>
                <span style={{ fontSize: numSize, fontWeight: 700, color: wtdColor }}>{fmtPct(weightedAvg)}</span>
              </div>
            )}
          </div>
        ) : (
          <span style={{ fontSize: isSmall ? 13 : 15, fontWeight: 700, color: accLineColor, flexShrink: 0 }}>
            {mode.includes('accuracy') ? fmtPct(singleAvg) : singleAvg}
          </span>
        )}
      </div>

      {/* Chart */}
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
            <defs>
              <linearGradient id="widgetAccGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={isAccAll ? accColor : accLineColor} stopOpacity={0.35} />
                <stop offset="100%" stopColor={isAccAll ? accColor : accLineColor} stopOpacity={0} />
              </linearGradient>
              {isAccAll && (
                <linearGradient id="widgetWtdGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={wtdColor} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={wtdColor} stopOpacity={0} />
                </linearGradient>
              )}
            </defs>
            {gridLines && <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />}
            {markInactive && data.filter(d => d.inactive).map(d => (
              <ReferenceLine key={d.date} x={d.date} stroke="rgba(239,100,30,0.35)" strokeWidth={14} ifOverflow="visible" />
            ))}
            <XAxis dataKey="date" height={isSmall ? 14 : 18} tickMargin={isSmall ? 2 : 4} minTickGap={isSmall ? 24 : 12} tick={{ fontSize: isSmall ? 8 : 9, fill: 'var(--text-tertiary)' }} interval="preserveStartEnd" />
            <Tooltip
              contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 12 }}
              labelStyle={{ color: 'var(--text-secondary)' }}
              formatter={(v, name) => {
                if (isAccAll) {
                  const label = name === 'accuracy' ? t('stats.accuracyAvg') : t('stats.weightedAvg')
                  return v != null ? [fmtPct(v), label] : ['–', label]
                }
                return [mode.includes('accuracy') ? fmtPct(v) : v, '']
              }}
            />
            {/* Normal accuracy line */}
            {(!isAccAll || showAccuracy) && (
              <Area
                type={smoothLines ? 'monotone' : 'linear'}
                dataKey={isAccAll ? 'accuracy' : 'value'}
                stroke={isAccAll ? accColor : accLineColor}
                strokeWidth={2}
                fill="url(#widgetAccGrad)"
                dot={showDots ? { r: 3, fill: isAccAll ? accColor : accLineColor } : false}
                activeDot={{ r: 4, fill: isAccAll ? accColor : accLineColor }}
                isAnimationActive={false}
              />
            )}
            {/* Weighted accuracy line (accuracy_all only) */}
            {isAccAll && showWeighted && (
              <Area
                type={smoothLines ? 'monotone' : 'linear'}
                dataKey="weighted"
                stroke={wtdColor}
                strokeWidth={2}
                strokeDasharray="5 3"
                fill="url(#widgetWtdGrad)"
                dot={showDots ? { r: 3, fill: wtdColor } : false}
                activeDot={{ r: 4, fill: wtdColor }}
                isAnimationActive={false}
              />
            )}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
