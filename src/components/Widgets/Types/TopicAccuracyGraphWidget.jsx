import { useMemo } from 'react'
import { LineChart, Line, ResponsiveContainer, Tooltip, XAxis, CartesianGrid } from 'recharts'
import { useData } from '../../../context/DataContext.jsx'
import { getDateRange, calcDailyExerciseCounts, filterSessionsByRange } from '../../../utils/calculations/filterTimeframeCalcs.js'
import { useLanguage } from '../../../context/LanguageContext.jsx'
import { useGraphSettings } from '../../../context/GraphSettingsContext.jsx'

const MAX_TOPICS = { small: 5, medium: 10, large: 15 }

export default function TopicAccuracyGraphWidget({ config = {}, size }) {
  const { recentSessions, topics } = useData()
  const { t } = useLanguage()
  const { gridLines, smoothLines, showDots } = useGraphSettings()
  const { from, to } = getDateRange(config.timeframe ?? '30d')
  const max = MAX_TOPICS[size] ?? 3

  const sessions = useMemo(
    () => filterSessionsByRange(recentSessions, from, to),
    [recentSessions, from, to]
  )

  const selectedTopics = useMemo(() => {
    const sorted = [...topics].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
    if (config.topic_ids?.length > 0) {
      return sorted.filter(t => config.topic_ids.includes(t.id)).slice(0, max)
    }
    return sorted.slice(0, max)
  }, [topics, config.topic_ids, max])

  const chartData = useMemo(() => {
    const base = calcDailyExerciseCounts([], from, to).map(d => ({ date: d.date.slice(5) }))
    for (const topic of selectedTopics) {
      const days = calcDailyExerciseCounts(sessions.filter(s => s.topic_id === topic.id), from, to)
      days.forEach((d, i) => {
        base[i][topic.id] = d.exercises > 0 ? Math.round((d.correct / d.exercises) * 100) : 0
      })
    }
    return base
  }, [sessions, selectedTopics, from, to])

  if (selectedTopics.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6 }}>
        <span style={{ fontSize: 24 }}>📈</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t('widget.noData')}</span>
      </div>
    )
  }

  return (
    <div style={{ padding: 14, height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.4, marginBottom: 6 }}>
        {t('widget.accuracyTrend')}
      </div>
      <div style={{ display: 'flex', gap: size === 'small' ? 6 : 10, flexWrap: 'wrap', marginBottom: 8 }}>
        {selectedTopics.map(t => (
          <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
            <div style={{ width: 6, height: 6, borderRadius: '50%', background: t.color_from, flexShrink: 0 }} />
            <span style={{ fontSize: 9, color: 'var(--text-secondary)', fontWeight: 500 }}>
              {t.emoji}{size !== 'small' ? ` ${t.name}` : ''}
            </span>
          </div>
        ))}
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 4, right: 4, left: -32, bottom: 0 }}>
            {gridLines && <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />}
            <XAxis dataKey="date" tick={{ fontSize: 9, fill: 'var(--text-tertiary)' }} interval="preserveStartEnd" />
            <Tooltip
              contentStyle={{ background: 'var(--card-bg)', border: '1px solid var(--border)', borderRadius: 10, fontSize: 11 }}
              labelStyle={{ color: 'var(--text-secondary)' }}
              formatter={(val, name) => {
                const topic = selectedTopics.find(t => t.id === name)
                return [val != null ? `${val}%` : '—', topic ? `${topic.emoji} ${topic.name}` : name]
              }}
            />
            {selectedTopics.map(t => (
              <Line
                key={t.id}
                type={smoothLines ? 'monotone' : 'linear'}
                dataKey={t.id}
                stroke={t.color_from}
                strokeWidth={2}
                dot={showDots ? { r: 3, fill: t.color_from } : false}
                activeDot={{ r: 3, fill: t.color_from }}
                connectNulls={true}
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
