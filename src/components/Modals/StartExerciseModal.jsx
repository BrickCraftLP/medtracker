import { useState } from 'react'
import { motion } from 'framer-motion'
import { useData } from '../../context/DataContext.jsx'
import { useSession } from '../../hooks/useSession.js'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useNavigate } from 'react-router-dom'
import Switch from '../Common/Switch.jsx'

export default function StartExerciseModal({ onClose }) {
  const { topics } = useData()
  const { startSession } = useSession()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const [selectedTopic, setSelectedTopic] = useState('')
  const [starting, setStarting] = useState(false)
  const [pauseBetweenExercises, setPauseBetweenExercises] = useState(false)

  const selectedTopicData = topics.find(tp => tp.id === selectedTopic)

  async function handleStart() {
    if (!selectedTopic) return
    setStarting(true)
    try {
      startSession(selectedTopic, pauseBetweenExercises)
      onClose()
      navigate('/session', { state: { topicId: selectedTopic, pauseBetweenExercises } })
    } catch (e) {
      console.error(e)
      setStarting(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-sheet"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 340 }}
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 40 }}
      >
        {/* Close button */}
        <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 12, marginBottom: 16 }}>
          <motion.button
            whileTap={{ scale: 0.88 }}
            onClick={onClose}
            style={{
              width: 30,
              height: 30,
              borderRadius: '50%',
              background: 'rgba(120,120,128,0.18)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '0.5px solid rgba(120,120,128,0.22)',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <svg width="11" height="11" viewBox="0 0 14 14" fill="none">
              <path d="M1 1l12 12M13 1L1 13" stroke="var(--text-secondary)" strokeWidth="2" strokeLinecap="round" />
            </svg>
          </motion.button>
        </div>

        {/* Title */}
        <h2 style={{ margin: '0 0 20px', fontSize: 21, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.4 }}>
          {t('start.title')}
        </h2>

        {/* Topic section */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, letterSpacing: 0.3 }}>
            {t('start.topic')}
          </div>
          <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap' }}>
            {topics.map(topic => (
              <motion.button
                key={topic.id}
                whileTap={{ scale: 0.94 }}
                onClick={(e) => { e.stopPropagation(); setSelectedTopic(topic.id) }}
                style={{
                  padding: '4px 8px',
                  borderRadius: 20,
                  border: `1.5px solid ${selectedTopic === topic.id ? topic.color_from : 'var(--border)'}`,
                  background: selectedTopic === topic.id ? `${topic.color_from}18` : 'var(--bg-tertiary)',
                  cursor: 'pointer',
                  fontSize: 11,
                  fontWeight: selectedTopic === topic.id ? 600 : 400,
                  color: 'var(--text-primary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                  transition: 'all 0.15s',
                }}
              >
                <span style={{ fontSize: 12 }}>{topic.emoji}</span>
                <span>{topic.name}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Settings section */}
        {selectedTopicData && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, letterSpacing: 0.3 }}>
              {t('start.settings')}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 12, background: 'var(--bg-tertiary)' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 14, fontWeight: 500, color: 'var(--text-primary)', marginBottom: 2 }}>{t('start.pauseBetween')}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{t('start.pauseHint')}</div>
              </div>
              <Switch
                size="lg"
                checked={pauseBetweenExercises}
                onChange={setPauseBetweenExercises}
              />
            </div>
          </div>
        )}

        {/* Start button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={(e) => { e.stopPropagation(); handleStart() }}
          disabled={starting || !selectedTopic}
        >
          {starting ? t('state.starting') : t('btn.start')}
        </motion.button>
      </motion.div>
    </div>
  )
}
