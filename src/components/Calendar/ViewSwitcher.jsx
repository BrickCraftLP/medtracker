// Segmented Day / 3 / Week / Month / List control. The selected pill is a
// shared layoutId so it slides between segments instead of blinking.

import { motion } from 'framer-motion'

export const VIEWS = ['day', 'three', 'week', 'month', 'agenda']

export default function ViewSwitcher({ value, onChange, t }) {
  return (
    <div style={{
      display: 'flex', gap: 2, padding: 2, borderRadius: 9999,
      background: 'var(--bg-tertiary)',
    }}>
      {VIEWS.map(view => {
        const active = view === value
        return (
          <button
            key={view}
            onClick={() => onChange(view)}
            style={{
              position: 'relative', flex: 1, border: 'none', background: 'transparent',
              cursor: 'pointer', padding: '5px 0', borderRadius: 9999,
              fontSize: 11.5, fontWeight: 650, letterSpacing: -0.1,
              color: active ? 'var(--text-primary)' : 'var(--text-tertiary)',
            }}
          >
            {active && (
              <motion.span
                layoutId="calendar-view-pill"
                transition={{ type: 'spring', damping: 30, stiffness: 380 }}
                style={{
                  position: 'absolute', inset: 0, borderRadius: 9999,
                  background: 'var(--card-bg)', boxShadow: 'var(--shadow)',
                }}
              />
            )}
            <span style={{ position: 'relative' }}>{t(`calendar.view.${view}`)}</span>
          </button>
        )
      })}
    </div>
  )
}
