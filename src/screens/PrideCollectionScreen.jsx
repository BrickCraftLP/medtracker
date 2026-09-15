import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useTheme } from '../context/ThemeContext.jsx'
import { THEMES } from '../themes/index.js'
import { THEME_ICONS } from './AppearanceScreen.jsx'
import { NavDirectionContext } from '../context/navDirection.js'
import GlassCard from '../components/Glass/GlassCard.jsx'

const PRIDE_THEMES = THEMES.filter(t => t.group === 'pride')

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 16px 6px' }}>
        {title}
      </p>
      <GlassCard radius={16} style={{ overflow: 'hidden' }}>{children}</GlassCard>
    </div>
  )
}

function ThemeRow({ opt, active, onTap, divider, label, desc }) {
  return (
    <>
      <motion.div
        whileTap={{ scale: 0.98, backgroundColor: 'var(--bg-tertiary)' }}
        onClick={onTap}
        style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 14, cursor: 'pointer' }}
      >
        <div style={{
          width: 36, height: 36, borderRadius: 10, flexShrink: 0,
          background: active ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          transition: 'background 0.15s',
        }}>
          {THEME_ICONS[opt.key]}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <span style={{ fontSize: 16, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
          {desc && <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)', marginTop: 1 }}>{desc}</p>}
        </div>
        {active && (
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M5 12.5l4.5 4.5L19 7" stroke="var(--accent)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        )}
      </motion.div>
      {divider && <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px 0 66px' }} />}
    </>
  )
}

export default function PrideCollectionScreen() {
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { t } = useLanguage()
  const { collection, setCollection } = useTheme()

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 60px' }}>

        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => { setDirection(-1); navigate(-1) }}
          style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '0.5px solid rgba(255,255,255,0.22)', borderRadius: 10, padding: '7px 12px', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          {t('btn.back')}
        </motion.button>

        <h1 style={{ margin: '0 0 30px', fontSize: 34, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          {t('settings.appearance.pride-collection')}
        </h1>

        <Section title={t('settings.appearance.theme')}>
          {PRIDE_THEMES.map((opt, i) => (
            <ThemeRow
              key={opt.key}
              opt={opt}
              label={t(opt.labelKey)}
              desc={t(opt.labelKey + '.desc')}
              active={collection === opt.key}
              onTap={() => setCollection(opt.key)}
              divider={i < PRIDE_THEMES.length - 1}
            />
          ))}
        </Section>

      </div>
    </div>
  )
}
