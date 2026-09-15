import { useContext, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useGraphSettings } from '../context/GraphSettingsContext.jsx'
import { NavDirectionContext } from '../context/navDirection.js'
import BouncyAccordion from '../components/Common/BouncyAccordion.jsx'
import { getHeatmapColors } from '../utils/calculations/heatmapIntensityCalcs.js'

const THEME_COLORS = {
  blue: '#3b82f6',
  green: '#22c55e',
  purple: '#8b5cf6',
}

const ICON_GRID = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)">
    <rect x="3" y="3" width="5" height="5" rx="1.2" /><rect x="10" y="3" width="5" height="5" rx="1.2" opacity="0.6" /><rect x="17" y="3" width="4" height="5" rx="1.2" opacity="0.3" />
    <rect x="3" y="10" width="5" height="5" rx="1.2" opacity="0.4" /><rect x="10" y="10" width="5" height="5" rx="1.2" /><rect x="17" y="10" width="4" height="5" rx="1.2" opacity="0.7" />
    <rect x="3" y="17" width="5" height="4" rx="1.2" opacity="0.8" /><rect x="10" y="17" width="5" height="4" rx="1.2" opacity="0.3" /><rect x="17" y="17" width="4" height="4" rx="1.2" />
  </svg>
)

const ICON_PALETTE = (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 3a9 9 0 1 0 0 18c1.1 0 2-.9 2-2 0-.5-.2-1-.5-1.3-.3-.4-.5-.8-.5-1.3 0-1.1.9-2 2-2h2.4A4.6 4.6 0 0 0 21 9.8C21 6 17 3 12 3z" />
    <circle cx="7.5" cy="11" r="1" fill="var(--accent)" /><circle cx="10" cy="7" r="1" fill="var(--accent)" /><circle cx="15" cy="7" r="1" fill="var(--accent)" />
  </svg>
)

function ColorSwatch({ background, label, selected, onClick }) {
  return (
    <motion.button
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 8,
        background: 'none',
        border: 'none',
        cursor: 'pointer',
        padding: 8,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          background,
          border: selected ? `2px solid var(--accent)` : '2px solid transparent',
          boxShadow: selected ? '0 0 0 2px var(--bg-primary), 0 0 0 4px var(--accent)' : 'none',
          transition: 'all 0.15s',
        }}
      />
      <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
    </motion.button>
  )
}

function RampPreview({ colors }) {
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {colors.map((c, i) => (
        <div key={i} style={{ flex: 1, height: 22, borderRadius: 5, background: c }} />
      ))}
    </div>
  )
}

export default function HeatmapCustomisationScreen() {
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { t } = useLanguage()
  const { heatmapTheme, heatmapCustomColor, setSetting } = useGraphSettings()
  const isDark = window.matchMedia('(prefers-color-scheme: dark)').matches
  const [openId, setOpenId] = useState('theme')

  const customColor = heatmapCustomColor ?? '#3b82f6'

  function updateCustomColor(hex) {
    setSetting('heatmapCustomColor', hex)
    if (heatmapTheme !== 'custom') setSetting('heatmapTheme', 'custom')
  }

  const items = useMemo(() => [
    {
      id: 'theme',
      title: t('settings.heatmapTheme'),
      summary: t(`settings.theme.${heatmapTheme}`),
      icon: ICON_GRID,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, paddingTop: 8 }}>
          <div style={{ display: 'flex', justifyContent: 'space-around', alignItems: 'flex-end' }}>
            {['blue', 'green', 'purple'].map(name => (
              <ColorSwatch
                key={name}
                background={THEME_COLORS[name]}
                label={t(`settings.theme.${name}`)}
                selected={heatmapTheme === name}
                onClick={() => setSetting('heatmapTheme', name)}
              />
            ))}
            <ColorSwatch
              background={customColor}
              label={t('settings.theme.custom')}
              selected={heatmapTheme === 'custom'}
              onClick={() => { setSetting('heatmapTheme', 'custom'); setOpenId('custom') }}
            />
          </div>
          <RampPreview colors={getHeatmapColors(heatmapTheme, customColor, isDark)} />
        </div>
      ),
    },
    {
      id: 'custom',
      title: t('settings.heatmapCustomColor'),
      summary: customColor.toUpperCase(),
      icon: ICON_PALETTE,
      content: (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14, paddingTop: 12 }}>
          <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>{t('settings.heatmapCustomHint')}</p>
          <HexColorPicker
            color={customColor}
            onChange={updateCustomColor}
            style={{ width: '100%', height: 220 }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 38, height: 38, borderRadius: 10, flexShrink: 0,
              background: customColor,
              border: '0.5px solid var(--border-strong)',
            }} />
            <div style={{
              flex: 1, height: 40, borderRadius: 10,
              background: 'var(--bg-tertiary)', border: '0.5px solid var(--border)',
              display: 'flex', alignItems: 'center', paddingLeft: 10, gap: 2,
            }}>
              <span style={{ fontSize: 15, fontFamily: 'monospace', color: 'var(--text-tertiary)', userSelect: 'none' }}>#</span>
              <HexColorInput
                color={customColor}
                onChange={updateCustomColor}
                style={{
                  background: 'transparent', border: 'none', outline: 'none',
                  fontSize: 15, fontFamily: 'monospace', color: 'var(--text-primary)',
                  width: '100%', letterSpacing: 1,
                }}
              />
            </div>
          </div>
          <RampPreview colors={getHeatmapColors('custom', customColor, isDark)} />
        </div>
      ),
    },
  ], [t, heatmapTheme, customColor, isDark])

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
          {t('settings.heatmap')}
        </h1>

        <BouncyAccordion items={items} value={openId} onValueChange={setOpenId} />

      </div>
    </div>
  )
}
