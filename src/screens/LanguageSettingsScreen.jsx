import { useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useLanguage } from '../context/LanguageContext.jsx'
import { NavDirectionContext } from '../context/navDirection.js'
import { LANGUAGES } from '../i18n/index.js'
import { GlassCard } from '../components/Common/Glass.jsx'

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 16px 6px' }}>
        {title}
      </p>
      <GlassCard cornerRadius={16} style={{ overflow: 'hidden' }}>{children}</GlassCard>
    </div>
  )
}

function Row({ label, onTap, right, divider = true, icon }) {
  return (
    <>
      <motion.div
        whileTap={onTap ? { scale: 0.98, backgroundColor: 'var(--bg-tertiary)' } : undefined}
        onClick={onTap}
        style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 12, cursor: onTap ? 'pointer' : 'default' }}
      >
        {icon && (
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {icon}
          </div>
        )}
        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        {right}
      </motion.div>
      {divider && <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />}
    </>
  )
}

export default function LanguageSettingsScreen() {
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { t, language, setLanguage } = useLanguage()

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 60px' }}>

        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => { setDirection(-1); navigate(-1) }}
          style={{
            background: 'rgba(0,0,0,0.18)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '0.5px solid rgba(255,255,255,0.22)',
            borderRadius: 10,
            padding: '7px 12px',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
          {t('btn.back')}
        </motion.button>

        <h1 style={{ margin: '0 0 30px', fontSize: 34, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          {t('settings.languageSection')}
        </h1>

        <Section title={t('settings.languageSection')}>
          {LANGUAGES.map((lang, i) => (
            <Row
              key={lang.code}
              label={lang.label}
              divider={i < LANGUAGES.length - 1}
              onTap={() => setLanguage(lang.code)}
              icon={<span style={{ fontSize: 18, lineHeight: 1 }}>{lang.flag}</span>}
              right={
                language === lang.code
                  ? <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                  : <div style={{ width: 16 }} />
              }
            />
          ))}
        </Section>

      </div>
    </div>
  )
}
