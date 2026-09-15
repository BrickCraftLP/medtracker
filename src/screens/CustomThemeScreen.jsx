import { useState, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { HexColorPicker, HexColorInput } from 'react-colorful'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useTheme, buildCustomNavbarBg } from '../context/ThemeContext.jsx'
import { NavDirectionContext } from '../context/navDirection.js'

const GLASS = {
  background: 'var(--glass-card-bg)',
  backdropFilter: 'blur(60px) saturate(200%)',
  WebkitBackdropFilter: 'blur(60px) saturate(200%)',
  borderRadius: 16,
  border: '0.5px solid var(--glass-card-stroke)',
  boxShadow: 'var(--glass-card-shadow)',
  overflow: 'hidden',
}

function SectionLabel({ title }) {
  return (
    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 16px 6px' }}>
      {title}
    </p>
  )
}

export default function CustomThemeScreen() {
  const navigate  = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { t }     = useLanguage()
  const { customColors, setCustomColors, isDark } = useTheme()

  const [activeIdx, setActiveIdx] = useState(0)
  const safeIdx    = Math.min(activeIdx, customColors.length - 1)
  const activeColor = customColors[safeIdx] ?? '#ffffff'

  function updateColor(hex) {
    const next = [...customColors]
    next[safeIdx] = hex
    setCustomColors(next)
  }

  function addColor() {
    if (customColors.length >= 4) return
    const next = [...customColors, '#ffffff']
    setCustomColors(next)
    setActiveIdx(next.length - 1)
  }

  function removeColor(idx) {
    if (customColors.length <= 1) return
    const next = customColors.filter((_, i) => i !== idx)
    setActiveIdx(Math.min(safeIdx, next.length - 1))
    setCustomColors(next)
  }

  // Full-opacity gradient for the preview bar — makes colors easy to read.
  const previewGradient = customColors.length === 1
    ? customColors[0]
    : `linear-gradient(90deg, ${customColors.join(', ')})`

  // Realistic "navbar as it will look" preview using the same opacity logic.
  const navbarPreview = buildCustomNavbarBg(customColors, isDark)

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
          {t('settings.appearance.custom.title')}
        </h1>

        {/* Preview */}
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t('settings.appearance.custom.preview')} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ height: 48, borderRadius: 14, background: previewGradient, border: '0.5px solid var(--glass-card-stroke)' }} />
            <div style={{ height: 48, borderRadius: 14, background: navbarPreview, border: '0.5px solid var(--glass-card-stroke)' }} />
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', margin: '2px 4px 0', display: 'flex', justifyContent: 'space-between' }}>
              <span>{t('settings.appearance.custom.preview-full')}</span>
              <span>{t('settings.appearance.custom.preview-navbar')}</span>
            </p>
          </div>
        </div>

        {/* Color swatches */}
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t('settings.appearance.custom.colors')} />
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', padding: '4px 0' }}>
            {customColors.map((color, i) => (
              <div key={i} style={{ position: 'relative' }}>
                <motion.button
                  whileTap={{ scale: 0.92 }}
                  onClick={() => setActiveIdx(i)}
                  style={{
                    width: 52, height: 52, borderRadius: 14,
                    background: color,
                    border: safeIdx === i
                      ? '3px solid var(--accent)'
                      : '1.5px solid var(--border-strong)',
                    boxShadow: safeIdx === i ? '0 0 0 3px var(--accent-muted)' : 'none',
                    cursor: 'pointer', outline: 'none', display: 'block',
                    transition: 'box-shadow 0.15s, border 0.15s',
                  }}
                />
                {customColors.length > 1 && (
                  <motion.button
                    whileTap={{ scale: 0.85 }}
                    onClick={() => removeColor(i)}
                    style={{
                      position: 'absolute', top: -7, right: -7,
                      width: 20, height: 20, borderRadius: '50%',
                      background: 'var(--wrong)', border: '1.5px solid var(--bg-primary)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      cursor: 'pointer', padding: 0,
                    }}
                  >
                    <svg width="9" height="9" viewBox="0 0 10 10" fill="none">
                      <path d="M2 2l6 6M8 2L2 8" stroke="white" strokeWidth="2" strokeLinecap="round"/>
                    </svg>
                  </motion.button>
                )}
              </div>
            ))}

            {customColors.length < 4 && (
              <motion.button
                whileTap={{ scale: 0.92 }}
                onClick={addColor}
                style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: 'var(--bg-tertiary)',
                  border: '1.5px dashed var(--border-strong)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--text-secondary)',
                }}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
              </motion.button>
            )}
          </div>
        </div>

        {/* Color picker */}
        <div style={{ marginBottom: 32 }}>
          <SectionLabel title={t('settings.appearance.custom.picker')} />
          <div style={{ ...GLASS, padding: '20px 20px 16px' }}>
            <HexColorPicker
              color={activeColor}
              onChange={updateColor}
              style={{ width: '100%', height: 220 }}
            />
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 38, height: 38, borderRadius: 10, flexShrink: 0,
                background: activeColor,
                border: '0.5px solid var(--border-strong)',
              }} />
              <div style={{
                flex: 1, height: 40, borderRadius: 10,
                background: 'var(--bg-tertiary)', border: '0.5px solid var(--border)',
                display: 'flex', alignItems: 'center', paddingLeft: 10, gap: 2,
              }}>
                <span style={{ fontSize: 15, fontFamily: 'monospace', color: 'var(--text-tertiary)', userSelect: 'none' }}>#</span>
                <HexColorInput
                  color={activeColor}
                  onChange={updateColor}
                  style={{
                    background: 'transparent', border: 'none', outline: 'none',
                    fontSize: 15, fontFamily: 'monospace', color: 'var(--text-primary)',
                    width: '100%', letterSpacing: 1,
                  }}
                />
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  )
}
