// The looping illustration on the first step of the connect flow: two cards
// with event chips travelling between them, so "two-way sync" is shown rather
// than only claimed.
//
// Purely decorative — aria-hidden, and it falls back to a static composition
// under prefers-reduced-motion (the arrangement still explains the flow, so
// dropping it entirely would lose more than it saves).

import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

const TRAVEL = 118   // px a chip covers between the two cards
const CYCLE = 2.6    // seconds for one chip to cross

function useReducedMotion() {
  const [reduced, setReduced] = useState(
    () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
  )
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return
    const onChange = e => setReduced(e.matches)
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return reduced
}

const CARD = {
  width: 84, height: 96, borderRadius: 18, flexShrink: 0,
  background: 'var(--glass-card-bg)',
  backdropFilter: 'blur(60px) saturate(200%)',
  WebkitBackdropFilter: 'blur(60px) saturate(200%)',
  border: '0.5px solid var(--glass-card-stroke)',
  boxShadow: 'var(--glass-card-shadow)',
  display: 'flex', flexDirection: 'column',
  alignItems: 'center', justifyContent: 'center', gap: 8,
}

// Three chips: two leaving the app, one arriving from Google. Offsets keep
// them on separate lanes so an overlap never reads as a single blob.
const CHIPS = [
  { dir: 1,  delay: 0,    top: 4,   color: 'var(--accent)' },
  { dir: -1, delay: 0.85, top: 26,  color: '#4285f4' },
  { dir: 1,  delay: 1.7,  top: 48,  color: 'var(--accent)' },
]

function Chip({ dir, delay, top, color, reduced }) {
  const from = dir > 0 ? 0 : TRAVEL
  const to = dir > 0 ? TRAVEL : 0

  const style = {
    position: 'absolute', top, left: 0,
    width: 30, height: 13, borderRadius: 4,
    background: color, opacity: 0.9,
    boxShadow: '0 2px 6px rgba(0,0,0,0.18)',
  }

  if (reduced) {
    return <div style={{ ...style, left: dir > 0 ? TRAVEL * 0.55 : TRAVEL * 0.2, opacity: 0.55 }} />
  }

  return (
    <motion.div
      style={style}
      initial={{ x: from, opacity: 0, scale: 0.7 }}
      animate={{
        x: [from, to],
        opacity: [0, 1, 1, 0],
        scale: [0.7, 1, 1, 0.7],
      }}
      transition={{
        duration: CYCLE,
        repeat: Infinity,
        repeatDelay: 0.5,
        delay,
        ease: 'easeInOut',
        times: [0, 0.18, 0.8, 1],
      }}
    />
  )
}

function Breathe({ children, delay, reduced }) {
  if (reduced) return <div style={CARD}>{children}</div>
  return (
    <motion.div
      style={CARD}
      animate={{ scale: [1, 1.035, 1] }}
      transition={{ duration: CYCLE + 0.5, repeat: Infinity, delay, ease: 'easeInOut' }}
    >
      {children}
    </motion.div>
  )
}

export default function SyncFlowDiagram() {
  const reduced = useReducedMotion()

  return (
    <div
      aria-hidden="true"
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        gap: 12, padding: '26px 8px 22px',
      }}
    >
      {/* MedTracker */}
      <Breathe delay={0} reduced={reduced}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, borderRadius: 12, background: 'var(--accent-muted)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--accent)">
            <path d="M7 2v2H5a2 2 0 00-2 2v13a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2h-2V2h-2v2H9V2H7zm12 8v9H5v-9h14z" />
          </svg>
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
          MedTracker
        </span>
      </Breathe>

      {/* The lane the chips travel */}
      <div style={{ position: 'relative', width: TRAVEL + 30, height: 68, flexShrink: 0 }}>
        <div style={{
          position: 'absolute', top: '50%', left: 4, right: 4, height: 0,
          borderTop: '1.5px dashed var(--border-strong)', opacity: 0.55,
        }} />
        {CHIPS.map((c, i) => <Chip key={i} {...c} reduced={reduced} />)}
      </div>

      {/* Google */}
      <Breathe delay={CYCLE / 2} reduced={reduced}>
        <span style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          width: 38, height: 38, borderRadius: 12, background: 'rgba(66,133,244,0.12)',
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24">
            <path fill="#4285f4" d="M21.35 11.1H12v2.9h5.35c-.25 1.35-1.7 3.95-5.35 3.95A5.95 5.95 0 1112 6.05c1.7 0 2.85.72 3.5 1.35l2.4-2.3A9 9 0 1012 21c5.2 0 8.65-3.65 8.65-8.8 0-.6-.07-1.05-.15-1.5z" />
          </svg>
        </span>
        <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-secondary)' }}>
          Google
        </span>
      </Breathe>
    </div>
  )
}
