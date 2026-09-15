import { useMemo } from 'react'
import { useData } from '../../../context/DataContext.jsx'
import { calcTopicAccuracy } from '../../../utils/calculations/accuracyRatioCalcs.js'
import { getDateRange, filterSessionsByRange } from '../../../utils/calculations/filterTimeframeCalcs.js'
import { useLanguage } from '../../../context/LanguageContext.jsx'

const FALLBACK_COLORS = ['#6366f1', '#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ec4899', '#ef4444', '#14b8a6']
const MAX_TOPICS = { small: 3, medium: 3, large: 6 }

export default function TopicAccuracyWidget({ config = {}, size = 'medium' }) {
  const { recentSessions, topics } = useData()
  const { t } = useLanguage()
  const { from, to } = getDateRange('30d')
  const max = MAX_TOPICS[size] ?? 4
  const showWeights = config.show_weights ?? false

  const sessions = useMemo(
    () => filterSessionsByRange(recentSessions, from, to),
    [recentSessions, from, to]
  )

  const sorted = useMemo(() => {
    const all = [...calcTopicAccuracy(sessions)].sort((a, b) => b.accuracy - a.accuracy)
    if (config.topic_ids?.length > 0) {
      return all.filter(t => config.topic_ids.includes(t.topicId))
    }
    return all
  }, [sessions, config.topic_ids])

  if (sorted.length === 0) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 6, padding: 16 }}>
        <span style={{ fontSize: 24 }}>🎯</span>
        <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{t('widget.noData')}</span>
      </div>
    )
  }

  const maxVisible = max

  return (
    <div style={{ padding: 14, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.4, marginBottom: 10 }}>
        {t('widget.accuracyPerTopic')}
      </div>
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column', justifyContent: 'space-around' }}>
        {sorted.slice(0, maxVisible).map((t, i) => {
          const topic = topics.find(tp => tp.id === t.topicId)
          const color = topic?.color_from ?? FALLBACK_COLORS[i % FALLBACK_COLORS.length]
          return (
            <div key={t.topicId}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0, flex: 1 }}>
                  <span style={{ fontSize: 11, flexShrink: 0 }}>{topic?.emoji ?? '📚'}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600, color: 'var(--text-primary)',
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {topic?.name ?? t('widget.unknown')}
                  </span>
                  {showWeights && topic?.weight != null && (
                    <span style={{
                      fontSize: 8, fontWeight: 700, color, background: `${color}22`,
                      borderRadius: 4, padding: '1px 4px', flexShrink: 0,
                    }}>
                      {Number(topic.weight)}%
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 11, fontWeight: 800, color, flexShrink: 0, marginLeft: 6 }}>
                  {t.accuracy}%
                </span>
              </div>
              <div style={{ height: 5, borderRadius: 3, background: 'var(--bg-tertiary)', overflow: 'hidden' }}>
                <div style={{ width: `${t.accuracy}%`, height: '100%', borderRadius: 3, background: color }} />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
