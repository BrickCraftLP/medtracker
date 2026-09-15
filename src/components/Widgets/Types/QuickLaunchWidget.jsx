import { motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../../context/DataContext.jsx'
import { useSession } from '../../../hooks/useSession.js'
import { useLanguage } from '../../../context/LanguageContext.jsx'

export default function QuickLaunchWidget({ config = {} }) {
  const { topics } = useData()
  const { startSession } = useSession()
  const navigate = useNavigate()
  const { t } = useLanguage()

  const topic = topics.find(t => t.id === config.topic_id) ?? topics[0]

  function handleLaunch() {
    if (!topic) return
    startSession(topic.id)
    navigate('/session', { state: { topicId: topic.id } })
  }

  if (!topic) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--text-tertiary)', fontSize: 13 }}>
        {t('widget.noTopic')}
      </div>
    )
  }

  return (
    <motion.div
      whileTap={{ scale: 0.96 }}
      onClick={handleLaunch}
      style={{
        height: '100%',
        background: `linear-gradient(135deg, ${topic.color_from}, ${topic.color_to})`,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        cursor: 'pointer',
        borderRadius: 20,
        padding: 16,
      }}
    >
      <span style={{ fontSize: 30 }}>{topic.emoji}</span>
      <span style={{ fontSize: 14, fontWeight: 700, color: 'white', textAlign: 'center' }}>{topic.name}</span>
      <div style={{
        background: 'rgba(255,255,255,0.25)',
        borderRadius: 10,
        padding: '5px 14px',
        marginTop: 4,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'white' }}>{t('widget.quickLaunch.start')}</span>
      </div>
    </motion.div>
  )
}
