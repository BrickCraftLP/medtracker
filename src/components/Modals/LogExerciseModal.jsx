import { useState } from 'react'
import { motion } from 'framer-motion'
import { useData } from '../../context/DataContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import { saveSession } from '../../services/dbInterface.js'
import { useLanguage } from '../../context/LanguageContext.jsx'

export default function LogExerciseModal({ onClose }) {
  const { topics, addRecentSession } = useData()
  const { user } = useAuth()
  const { t } = useLanguage()
  const [selectedTopic, setSelectedTopic] = useState('')
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [minutes, setMinutes] = useState('')
  const [correct, setCorrect] = useState('')
  const [wrong, setWrong] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const selectedTopicData = topics.find(tp => tp.id === selectedTopic)

  async function handleSave() {
    if (!selectedTopic) { setError(t('log.err.noTopic')); return }
    if (!minutes && !correct && !wrong) { setError(t('log.err.noData')); return }
    setSaving(true)
    setError('')

    try {
      const today = new Date().toISOString().slice(0, 10)
      const now = date === today ? new Date() : new Date(`${date}T12:00:00`)
      const durationSec = Math.round((parseFloat(minutes) || 0) * 60)
      const startedAt = new Date(now.getTime() - durationSec * 1000).toISOString()
      const correctCount = parseInt(correct) || 0
      const wrongCount = parseInt(wrong) || 0
      const total = correctCount + wrongCount

      const exercises = []
      for (let i = 0; i < correctCount; i++) {
        exercises.push({
          is_correct: true,
          duration_ms: total > 0 ? Math.round((durationSec * 1000) / total) : 0,
          created_at: new Date(now.getTime() - ((total - i) * (durationSec * 1000) / (total || 1))).toISOString(),
        })
      }
      for (let i = 0; i < wrongCount; i++) {
        exercises.push({
          is_correct: false,
          duration_ms: total > 0 ? Math.round((durationSec * 1000) / total) : 0,
          created_at: new Date(now.getTime() - ((wrongCount - i) * (durationSec * 1000) / (total || 1))).toISOString(),
        })
      }

      const session = await saveSession(user.id, {
        topic_id: selectedTopic,
        started_at: startedAt,
        ended_at: now.toISOString(),
        duration_seconds: durationSec,
      }, exercises)

      addRecentSession(session)
      setSaving(false)
      onClose()
    } catch (e) {
      setError(t('log.err.save'))
      setSaving(false)
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
          {t('log.title')}
        </h2>

        {/* Topic section */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, letterSpacing: 0.3 }}>
            {t('log.topic')}
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
                <span style={{ fontSize: 12, pointerEvents: 'none' }}>{topic.emoji}</span>
                <span style={{ pointerEvents: 'none' }}>{topic.name}</span>
              </motion.button>
            ))}
          </div>
        </div>

        {/* Date section */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, display: 'block', letterSpacing: 0.3 }}>
            {t('log.date')}
          </label>
          <input
            className="input"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            style={{ fontSize: 14, colorScheme: 'dark' }}
          />
        </div>

        {/* Duration section */}
        <div style={{ marginBottom: 16 }}>
          <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, display: 'block', letterSpacing: 0.3 }}>
            {t('log.duration')}
          </label>
          <input
            className="input"
            type="number"
            inputMode="decimal"
            min="0"
            placeholder={t('log.durationEx')}
            value={minutes}
            onChange={(e) => setMinutes(e.target.value)}
            style={{
              fontSize: 14,
              appearance: 'textfield',
              WebkitAppearance: 'none',
              MozAppearance: 'textfield',
            }}
          />
        </div>

        {/* Correct / Wrong section */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
          {/* Correct */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, display: 'block', letterSpacing: 0.3 }}>
              {t('log.correct')}
            </label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              placeholder="0"
              value={correct}
              onChange={(e) => setCorrect(e.target.value)}
              style={{
                fontSize: 13,
                background: '#22c55e1a',
                borderColor: '#22c55e40',
                appearance: 'textfield',
                WebkitAppearance: 'none',
                MozAppearance: 'textfield',
              }}
            />
          </div>

          {/* Wrong */}
          <div>
            <label style={{ fontSize: 12, color: 'var(--text-secondary)', fontWeight: 600, marginBottom: 8, display: 'block', letterSpacing: 0.3 }}>
              {t('log.wrong')}
            </label>
            <input
              className="input"
              type="number"
              inputMode="numeric"
              pattern="[0-9]*"
              min="0"
              placeholder="0"
              value={wrong}
              onChange={(e) => setWrong(e.target.value)}
              style={{
                fontSize: 13,
                background: '#ef44441a',
                borderColor: '#ef444440',
                appearance: 'textfield',
                WebkitAppearance: 'none',
                MozAppearance: 'textfield',
              }}
            />
          </div>
        </div>

        {/* Error message */}
        {error && (
          <p style={{ color: 'var(--wrong)', fontSize: 13, marginBottom: 16, padding: '10px 12px', background: 'var(--wrong-muted)', borderRadius: 10 }}>
            {error}
          </p>
        )}

        {/* Save button */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          className="btn btn-primary"
          style={{ width: '100%' }}
          onClick={(e) => { e.stopPropagation(); handleSave() }}
          disabled={saving}
        >
          {saving ? t('state.saving') : t('btn.save')}
        </motion.button>
      </motion.div>
    </div>
  )
}
