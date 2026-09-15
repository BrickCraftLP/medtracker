import { useContext, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useLanguage } from '../context/LanguageContext.jsx'
import { NavDirectionContext } from '../context/navDirection.js'
import { useTour } from '../hooks/useTour.js'

const GLASS = {
  background: 'var(--glass-card-bg)',
  backdropFilter: 'blur(60px) saturate(200%)',
  WebkitBackdropFilter: 'blur(60px) saturate(200%)',
  borderRadius: 16,
  border: '0.5px solid var(--glass-card-stroke)',
  boxShadow: 'var(--glass-card-shadow)',
  overflow: 'hidden',
}

const ICON_HOME = <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)"><path d="M3 5a2 2 0 012-2h6a2 2 0 012 2v4a2 2 0 01-2 2H5a2 2 0 01-2-2V5zm12 0a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2h-2a2 2 0 01-2-2V5zM3 15a2 2 0 012-2h2a2 2 0 012 2v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4zm8 0a2 2 0 012-2h6a2 2 0 012 2v4a2 2 0 01-2 2h-6a2 2 0 01-2-2v-4z"/></svg>
const ICON_TOPICS = <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)"><path d="M4 4a2 2 0 012-2h9l5 5v13a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm10 1.5V8h2.5L14 5.5zM8 12h8v2H8v-2zm0 4h8v2H8v-2z"/></svg>
const ICON_SESSION = <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm.9-12.6h-1.8v5.2l4.4 2.7.9-1.5-3.5-2.1V7.4z"/></svg>
const ICON_STATS = <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)"><path d="M5 9.2h3V19H5zM10.6 5h2.8v14h-2.8zm5.6 8H19v6h-2.8z"/></svg>
const ICON_WORKSPACE = <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)"><path d="M10 4H4a2 2 0 00-2 2v12a2 2 0 002 2h16a2 2 0 002-2V8a2 2 0 00-2-2h-8l-2-2z"/></svg>
const ICON_SETTINGS = <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)"><path d="M19.14 12.94a7.5 7.5 0 000-1.88l2.03-1.58a.5.5 0 00.12-.64l-1.92-3.32a.5.5 0 00-.6-.22l-2.39.96a7.3 7.3 0 00-1.63-.94l-.36-2.54a.5.5 0 00-.5-.42h-3.84a.5.5 0 00-.5.42l-.36 2.54c-.58.24-1.13.55-1.63.94l-2.39-.96a.5.5 0 00-.6.22L2.65 8.84a.5.5 0 00.12.64l2.03 1.58a7.5 7.5 0 000 1.88l-2.03 1.58a.5.5 0 00-.12.64l1.92 3.32c.13.22.39.31.6.22l2.39-.96c.5.39 1.05.7 1.63.94l.36 2.54c.04.24.25.42.5.42h3.84c.25 0 .46-.18.5-.42l.36-2.54c.58-.24 1.13-.55 1.63-.94l2.39.96c.22.09.47 0 .6-.22l1.92-3.32a.5.5 0 00-.12-.64l-2.03-1.58zM12 15.5a3.5 3.5 0 110-7 3.5 3.5 0 010 7z"/></svg>

const SECTIONS = [
  { id: 'home',       icon: ICON_HOME },
  { id: 'topics',     icon: ICON_TOPICS },
  { id: 'sessions',   icon: ICON_SESSION },
  { id: 'statistics', icon: ICON_STATS },
  { id: 'workspaces', icon: ICON_WORKSPACE },
  { id: 'settings',   icon: ICON_SETTINGS },
]

function Section({ id, icon, index, t }) {
  const bullets = t(`tour.section.${id}.bullets`)
  const list = Array.isArray(bullets) ? bullets : []

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 + index * 0.05, ease: [0.23, 1, 0.32, 1] }}
      style={{ ...GLASS, marginBottom: 12, padding: '16px 18px' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 32, height: 32, borderRadius: 10, flexShrink: 0,
          background: 'var(--accent-muted)',
        }}>
          {icon}
        </span>
        <span style={{ fontSize: 17, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.2 }}>
          {t(`tour.section.${id}.title`)}
        </span>
      </div>

      <p style={{ margin: '0 0 10px', fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)' }}>
        {t(`tour.section.${id}.body`)}
      </p>

      <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 7 }}>
        {list.map((line, i) => (
          <li key={i} style={{ display: 'flex', gap: 9, alignItems: 'flex-start', fontSize: 13.5, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
            <span style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, marginTop: 7 }} />
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  )
}

export default function TourScreen() {
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { t } = useLanguage()
  const { markTourSeen } = useTour()

  // Opening the walkthrough counts as having seen it — this clears the Home
  // banner and the Settings badge even if the user leaves halfway through.
  useEffect(() => { markTourSeen() }, [markTourSeen])

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 60px' }}>

        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => { setDirection(-1); navigate(-1) }}
          style={{
            background: 'rgba(0,0,0,0.18)',
            backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)',
            border: '0.5px solid rgba(255,255,255,0.22)',
            borderRadius: 10, padding: '7px 12px', color: 'white',
            fontSize: 14, fontWeight: 600, cursor: 'pointer',
            marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
          {t('btn.back')}
        </motion.button>

        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.23, 1, 0.32, 1] }}
          style={{ ...GLASS, marginBottom: 18 }}
        >
          <div style={{
            background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
            padding: '28px 20px 24px', textAlign: 'center',
          }}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'white', letterSpacing: -0.5, lineHeight: 1.1 }}>
              {t('tour.title')}
            </div>
            <div style={{ marginTop: 6, fontSize: 15, color: 'rgba(255,255,255,0.8)', fontWeight: 500 }}>
              {t('tour.subtitle')}
            </div>
          </div>
        </motion.div>

        {SECTIONS.map((s, i) => (
          <Section key={s.id} id={s.id} icon={s.icon} index={i} t={t} />
        ))}

        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { setDirection(-1); navigate('/home') }}
          style={{
            width: '100%', marginTop: 10, padding: '14px 18px',
            background: 'var(--accent)', color: 'white', border: 'none',
            borderRadius: 14, fontSize: 15, fontWeight: 700, cursor: 'pointer',
          }}
        >
          {t('tour.finish')}
        </motion.button>
      </div>
    </div>
  )
}
