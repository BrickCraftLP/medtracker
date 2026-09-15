import { useState, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useGraphSettings } from '../context/GraphSettingsContext.jsx'
import { NavDirectionContext } from '../context/navDirection.js'
import Switch from '../components/Common/Switch.jsx'
import GlassCard from '../components/Glass/GlassCard.jsx'

const COLOR_PALETTES = {
  'Klassisch': [
    '#6366f1','#8b5cf6','#a855f7','#ec4899','#ef4444',
    '#f97316','#eab308','#84cc16','#22c55e','#14b8a6',
    '#0ea5e9','#3b82f6','#64748b','#78716c','#f43f5e',
  ],
  'Pastell': [
    '#a5b4fc','#c4b5fd','#d8b4fe','#f9a8d4','#fca5a5',
    '#fdba74','#fde68a','#bef264','#86efac','#5eead4',
    '#7dd3fc','#93c5fd','#cbd5e1','#d6d3d1','#fda4af',
  ],
  'Satt': [
    '#4f46e5','#7c3aed','#9333ea','#db2777','#dc2626',
    '#ea580c','#ca8a04','#65a30d','#16a34a','#0d9488',
    '#0284c7','#2563eb','#475569','#57534e','#e11d48',
  ],
  'Dunkel': [
    '#312e81','#4c1d95','#581c87','#831843','#7f1d1d',
    '#7c2d12','#713f12','#3f6212','#14532d','#134e4a',
    '#0c4a6e','#1e3a5f','#1e293b','#292524','#881337',
  ],
}

const PALETTE_PREVIEWS = {
  'Klassisch': ['#6366f1','#ec4899','#22c55e','#f97316'],
  'Pastell':   ['#a5b4fc','#f9a8d4','#86efac','#fdba74'],
  'Satt':      ['#4f46e5','#db2777','#16a34a','#ea580c'],
  'Dunkel':    ['#312e81','#831843','#14532d','#0c4a6e'],
}

const PAL_KEY = {
  'Klassisch': 'topicEdit.pal.classic',
  'Pastell':   'topicEdit.pal.pastel',
  'Satt':      'topicEdit.pal.vivid',
  'Dunkel':    'topicEdit.pal.dark',
}

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

function Row({ label, right, divider = true }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 12 }}>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        {right}
      </div>
      {divider && <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />}
    </>
  )
}

export default function GraphsCustomisationScreen() {
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { t } = useLanguage()
  const { gridLines, smoothLines, showDots, carryForward, markInactive, accLineColor, wtdLineColor, setSetting } = useGraphSettings()
  const [colorPalette, setColorPalette] = useState('Klassisch')

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
          {t('settings.graphs')}
        </h1>

        {/* Graphs section */}
        <Section title={t('settings.chartsSection')}>
          <Row
            label={t('settings.gridLines')}
            right={<Switch checked={gridLines} onChange={(v) => setSetting('gridLines', v)} />}
            divider={true}
          />
          <Row
            label={t('settings.smoothLines')}
            right={<Switch checked={smoothLines} onChange={(v) => setSetting('smoothLines', v)} />}
            divider={true}
          />
          <Row
            label={t('settings.showDots')}
            right={<Switch checked={showDots} onChange={(v) => setSetting('showDots', v)} />}
            divider={true}
          />
          <Row
            label={t('settings.carryForward')}
            right={<Switch checked={carryForward} onChange={(v) => setSetting('carryForward', v)} />}
            divider={true}
          />
          <Row
            label={t('settings.markInactive')}
            right={<Switch checked={markInactive} onChange={(v) => setSetting('markInactive', v)} />}
            divider={false}
          />
        </Section>

        {/* Chart colours */}
        <Section title={t('settings.chartColor')}>
          <div style={{ padding: '16px 16px 14px' }}>
            {/* Palette tabs — shared between both pickers */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 18 }}>
              {Object.keys(COLOR_PALETTES).map(pal => (
                <motion.button
                  key={pal}
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setColorPalette(pal)}
                  style={{
                    flex: 1,
                    padding: '7px 4px',
                    borderRadius: 12,
                    border: `1.5px solid ${colorPalette === pal ? 'var(--accent)' : 'var(--border)'}`,
                    background: colorPalette === pal ? 'var(--accent-muted)' : 'var(--bg-tertiary)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <div style={{ display: 'flex', gap: 2 }}>
                    {PALETTE_PREVIEWS[pal].map(c => (
                      <div key={c} style={{ width: 8, height: 8, borderRadius: '50%', background: c }} />
                    ))}
                  </div>
                  <span style={{
                    fontSize: 11,
                    fontWeight: colorPalette === pal ? 700 : 500,
                    color: colorPalette === pal ? 'var(--accent)' : 'var(--text-secondary)',
                  }}>
                    {t(PAL_KEY[pal])}
                  </span>
                </motion.button>
              ))}
            </div>

            {/* Accuracy colour */}
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('settings.accLineColor')}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20, justifyContent: 'center' }}>
              {COLOR_PALETTES[colorPalette].map(c => (
                <motion.button
                  key={c}
                  whileTap={{ scale: 0.85 }}
                  onClick={() => setSetting('accLineColor', c)}
                  style={{
                    width: 40, height: 40, borderRadius: 12, background: c,
                    border: accLineColor === c ? '2px solid var(--text-primary)' : '2px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    boxShadow: accLineColor === c ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${c}` : 'none',
                    transition: 'all 0.15s',
                  }}
                />
              ))}
            </div>

            {/* Weighted colour */}
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
              {t('settings.wtdLineColor')}
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center' }}>
              {COLOR_PALETTES[colorPalette].map(c => (
                <motion.button
                  key={c}
                  whileTap={{ scale: 0.85 }}
                  onClick={() => setSetting('wtdLineColor', c)}
                  style={{
                    width: 40, height: 40, borderRadius: 12, background: c,
                    border: wtdLineColor === c ? '2px solid var(--text-primary)' : '2px solid rgba(255,255,255,0.1)',
                    cursor: 'pointer',
                    boxShadow: wtdLineColor === c ? `0 0 0 2px var(--bg-primary), 0 0 0 4px ${c}` : 'none',
                    transition: 'all 0.15s',
                  }}
                />
              ))}
            </div>
          </div>
        </Section>

      </div>
    </div>
  )
}
