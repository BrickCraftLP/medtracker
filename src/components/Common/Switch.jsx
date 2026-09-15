import React from 'react'
import { motion } from 'framer-motion'

const SIZES = {
  sm: { width: 44, height: 26, knob: 20, iconOn: 10, iconOff: 6 },
  lg: { width: 50, height: 30, knob: 26, iconOn: 12, iconOff: 7 },
}

// Shared on/off switch used throughout the app. Colors are driven by the
// active theme's CSS vars (var(--accent) / var(--border)) so it adapts
// across dark/light/pride themes automatically.
export default function Switch({ checked, onChange, size = 'sm', disabled = false }) {
  const { width, height, knob, iconOn, iconOff } = SIZES[size] || SIZES.sm
  const offset = (height - knob) / 2

  // Small "whoosh" streak that trails behind the knob mid-slide, matching
  // the original design's .slider::before effect line.
  const effectWidth = knob / 2
  const effectHeight = effectWidth / 2 - 1
  const effectLeftOff = offset + effectWidth / 2
  const effectLeftOn = width - effectWidth - effectWidth / 2 - offset

  return (
    <motion.button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      whileTap={disabled ? undefined : { scale: 0.95 }}
      onClick={(e) => {
        // Stop propagation so switches nested inside a clickable row
        // (e.g. a settings row that toggles on click anywhere) don't
        // double-fire: one click from the row, one from the switch.
        e.stopPropagation()
        if (!disabled) onChange && onChange(!checked)
      }}
      style={{
        width, height, borderRadius: height / 2,
        background: checked ? 'var(--accent)' : 'var(--border)',
        border: 'none', position: 'relative', flexShrink: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        padding: 0, transition: 'background 0.2s',
      }}
    >
      <motion.div
        animate={{ left: checked ? effectLeftOn : effectLeftOff }}
        transition={{ duration: 0.2, ease: 'easeInOut' }}
        style={{
          position: 'absolute', top: '50%', marginTop: -effectHeight / 2,
          width: effectWidth, height: effectHeight,
          background: 'white', borderRadius: 1,
        }}
      />
      <motion.div
        animate={{ x: checked ? width - knob - offset : offset }}
        transition={{ type: 'spring', stiffness: 500, damping: 30 }}
        style={{
          position: 'absolute', top: offset, width: knob, height: knob,
          borderRadius: '50%', background: 'white',
          boxShadow: '0 1px 4px rgba(0,0,0,0.25)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        <svg
          viewBox="0 0 365.696 365.696"
          width={iconOff}
          height={iconOff}
          style={{
            position: 'absolute', color: 'var(--border)',
            transform: checked ? 'scale(0)' : 'scale(1)',
            transition: 'transform 0.2s cubic-bezier(0.27, 0.2, 0.25, 1.51)',
          }}
        >
          <path
            fill="currentColor"
            d="M243.188 182.86 356.32 69.726c12.5-12.5 12.5-32.766 0-45.247L341.238 9.398c-12.504-12.503-32.77-12.503-45.25 0L182.86 122.528 69.727 9.374c-12.5-12.5-32.766-12.5-45.247 0L9.375 24.457c-12.5 12.504-12.5 32.77 0 45.25l113.152 113.152L9.398 295.99c-12.503 12.503-12.503 32.769 0 45.25L24.48 356.32c12.5 12.5 32.766 12.5 45.247 0l113.132-113.132L295.99 356.32c12.503 12.5 32.769 12.5 45.25 0l15.081-15.082c12.5-12.504 12.5-32.77 0-45.25zm0 0"
          />
        </svg>
        <svg
          viewBox="0 0 24 24"
          width={iconOn}
          height={iconOn}
          style={{
            position: 'absolute', color: 'var(--accent)',
            transform: checked ? 'scale(1)' : 'scale(0)',
            transition: 'transform 0.2s cubic-bezier(0.27, 0.2, 0.25, 1.51)',
          }}
        >
          <path
            fill="currentColor"
            d="M9.707 19.121a.997.997 0 0 1-1.414 0l-5.646-5.647a1.5 1.5 0 0 1 0-2.121l.707-.707a1.5 1.5 0 0 1 2.121 0L9 14.171l9.525-9.525a1.5 1.5 0 0 1 2.121 0l.707.707a1.5 1.5 0 0 1 0 2.121z"
          />
        </svg>
      </motion.div>
    </motion.button>
  )
}
