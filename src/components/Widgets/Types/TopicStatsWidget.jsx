import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { BarChart, Bar, ResponsiveContainer } from 'recharts'
import { useData } from '../../../context/DataContext.jsx'
import {
  getDateRange,
  filterSessionsByRange,
  calcDailyExerciseCounts,
} from '../../../utils/calculations/filterTimeframeCalcs.js'
import { useLanguage } from '../../../context/LanguageContext.jsx'

export default function TopicStatsWidget({ config = {}, size }) {
  const navigate = useNavigate()
  const { topics, recentSessions } = useData()
  const { t } = useLanguage()
  const topic = topics.find(t => t.id === config.topic_id)
  const { from, to } = getDateRange('30d')

  const sessions = useMemo(() => {
    if (!config.topic_id) return []
    return filterSessionsByRange(recentSessions, from, to)
      .filter(s => s.topic_id === config.topic_id)
  }, [recentSessions, from, to, config.topic_id])

  const totalExercises = sessions.reduce((s, x) => s + (x.total_exercises ?? 0), 0)
  const totalCorrect = sessions.reduce((s, x) => s + (x.correct ?? 0), 0)
  const accuracy = totalExercises > 0 ? Math.round((totalCorrect / totalExercises) * 100) : 0

  const barData = useMemo(() =>
    calcDailyExerciseCounts(sessions, from, to).slice(-14),
    [sessions, from, to]
  )

  if (!topic) {
    return (
      <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
        <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 12 }}>{t('widget.topicStats.noTopic')}</div>
      </div>
    )
  }

  function handleTap() {
    navigate('/topic-stats', { state: { topicId: topic.id } })
  }

  if (size === 'small') {
    return (
      <div
        onClick={handleTap}
        style={{
          height: '100%',
          background: `linear-gradient(135deg, ${topic.color_from}, ${topic.color_to})`,
          padding: 14,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 22 }}>{topic.emoji}</div>
        <div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', fontWeight: 700, letterSpacing: 0.3 }}>{t('widget.accuracyUpper')}</div>
          <div style={{ fontSize: 24, fontWeight: 800, color: 'white', lineHeight: 1 }}>{accuracy}%</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)', marginTop: 3 }}>{t('widget.exercisesCount', { n: totalExercises })}</div>
        </div>
      </div>
    )
  }

  return (
    <div
      onClick={handleTap}
      style={{ height: '100%', display: 'flex', flexDirection: 'column', cursor: 'pointer' }}
    >
      {/* Gradient band */}
      <div style={{
        background: `linear-gradient(135deg, ${topic.color_from}, ${topic.color_to})`,
        padding: '10px 14px',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 17, flexShrink: 0 }}>{topic.emoji}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{
            fontSize: 12, fontWeight: 700, color: 'white',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {topic.name}
          </div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)' }}>{t('timeframe.30d')}</div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: 19, fontWeight: 800, color: 'white', lineHeight: 1 }}>{accuracy}%</div>
          <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.75)' }}>{t('widget.accuracyLabel')}</div>
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'flex', padding: '8px 14px', gap: 20, flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{totalExercises}</div>
          <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 2 }}>{t('widget.exercisesLabel')}</div>
        </div>
        <div>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--text-primary)', lineHeight: 1 }}>{sessions.length}</div>
          <div style={{ fontSize: 9, color: 'var(--text-secondary)', marginTop: 2 }}>{t('widget.sessions')}</div>
        </div>
      </div>

      {/* Mini bar chart fills remaining space */}
      <div style={{ flex: 1, minHeight: 0, padding: '0 8px 8px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={barData} margin={{ top: 0, right: 0, left: -40, bottom: 0 }}>
            <defs>
              <linearGradient id={`tsBarGrad_${topic.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={topic.color_from} stopOpacity={1} />
                <stop offset="100%" stopColor={topic.color_from} stopOpacity={0.4} />
              </linearGradient>
            </defs>
            <Bar dataKey="exercises" fill={`url(#tsBarGrad_${topic.id})`} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
