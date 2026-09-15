// Segmented Day / 3 / Week / Month / List control on a liquid-glass track.
// The selected pill is a shared layoutId so it slides between segments
// instead of blinking.

import { motion } from 'framer-motion'
import GlassPanel from '../Glass/GlassPanel.jsx'

export const VIEWS = ['day', 'three', 'week', 'month', 'agenda']

export default function ViewSwitcher({ value, onChange, t }) {
  return (
    <GlassPanel
      cornerRadius={18}
      displacementScale={26}
      aberrationIntensity={1}
      bodyStyle={{ display: 'flex', gap: 2, padding: 3 }}
    >
      {VIEWS.map(view => {
        const active = view === value
        return (
          <button
            key={view}
            onClick={() => onChange(view)}
            style={{
              position: 'relative', flex: 1, border: 'none', background: 'transparent',
              cursor: 'pointer', padding: '6px 0', borderRadius: 9999,
              fontSize: 11.5, fontWeight: 650, letterSpacing: -0.1,
              color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
              transition: 'color 0.18s',
            }}
          >
            {active && (
              <motion.span
                layoutId="calendar-view-pill"
                transition={{ type: 'spring', damping: 30, stiffness: 380 }}
                style={{
                  position: 'absolute', inset: 0, borderRadius: 9999,
                  background: 'color-mix(in srgb, var(--card-bg) 82%, transparent)',
                  boxShadow: '0 1px 0 rgba(255,255,255,0.35) inset, var(--shadow)',
                }}
              />
            )}
            <span style={{ position: 'relative' }}>{t(`calendar.view.${view}`)}</span>
          </button>
        )
      })}
    </GlassPanel>
  )
}
