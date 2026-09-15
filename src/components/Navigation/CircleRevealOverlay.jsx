import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'

// Full-screen white "material reveal" transition.
//
// Opening (`reverse` false): a circle grows from the center of the screen
// until it fully covers everything (this is when the caller should
// navigate — see circleReveal.js), holds for a beat, then FADES away
// (opacity) to reveal the new page underneath.
//
// Closing (`reverse` true): the exact opposite — once the circle has grown
// to fully cover the screen and the caller has navigated, it SHRINKS back
// down to a point at the center (clip-path reversing), revealing the page
// beneath through the collapsing circle instead of a uniform fade.
//
// Rendered as a stable sibling at the app-shell level (not inside the
// route/page tree) so it's never clipped by a transformed ancestor and never
// gets unmounted mid-transition by a page's exit animation.
//
// Timing is driven by plain setTimeout chained off a `stage` state machine
// rather than framer-motion's onAnimationComplete — more predictable here,
// and avoids the flash/flicker that came from unmounting the moment an
// onAnimationComplete fired.
const EXPAND_MS = 620
const HOLD_MS = 110
const FADE_MS = 420
const CLOSE_MS = 620 // reverse/closing shrink — a tad slower than open's fade
const EASE = [0.65, 0, 0.35, 1]

const FULL_CIRCLE = 'circle(150vmax at 50% 50%)'
const NO_CIRCLE = 'circle(0px at 50% 50%)'

export default function CircleRevealOverlay({ active, reverse, onCovered, onDone }) {
  const [stage, setStage] = useState('idle') // 'idle' | 'expand' | 'covered' | 'fade'

  useEffect(() => {
    // Closing (`reverse`) skips the grow-from-center phase entirely — it
    // should just already be fully white, then shrink away. Only opening
    // plays the expand-in animation.
    if (active && stage === 'idle') setStage(reverse ? 'covered' : 'expand')
  }, [active, stage, reverse])

  useEffect(() => {
    if (stage === 'expand') {
      const t = setTimeout(() => setStage('covered'), EXPAND_MS)
      return () => clearTimeout(t)
    }
    if (stage === 'covered') {
      onCovered?.()
      const t = setTimeout(() => setStage('fade'), HOLD_MS)
      return () => clearTimeout(t)
    }
    if (stage === 'fade') {
      const t = setTimeout(() => { setStage('idle'); onDone?.() }, reverse ? CLOSE_MS : FADE_MS)
      return () => clearTimeout(t)
    }
  }, [stage, reverse])

  if (stage === 'idle') return null

  const revealing = stage === 'fade'

  return (
    <motion.div
      initial={{ clipPath: reverse ? FULL_CIRCLE : NO_CIRCLE, opacity: 1 }}
      animate={
        reverse
          ? { clipPath: revealing ? NO_CIRCLE : FULL_CIRCLE, opacity: 1 }
          : { clipPath: FULL_CIRCLE, opacity: revealing ? 0 : 1 }
      }
      transition={
        reverse
          ? { clipPath: { duration: (revealing ? CLOSE_MS : EXPAND_MS) / 1000, ease: EASE } }
          : { clipPath: { duration: EXPAND_MS / 1000, ease: EASE }, opacity: { duration: FADE_MS / 1000, ease: 'easeInOut' } }
      }
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 1000,
        background: 'var(--bg-primary)',
        pointerEvents: stage === 'expand' ? 'auto' : 'none',
      }}
    />
  )
}
