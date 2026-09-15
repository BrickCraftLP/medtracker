import { motion } from 'framer-motion'
import LiquidGlass from 'liquid-glass-react'
import { GLASS_CENTERED } from './constants.js'

// liquid-glass-react measures its glass only on mount and on window resize.
// Mount happens mid-entrance (scaled down), so re-measure once it settles.
const remeasureGlass = () => window.dispatchEvent(new Event('resize'))

// Centered modal sheet made of real refracting liquid glass. The sheet has a
// fixed size (see .liquid-sheet) and scrolls its content internally, so the
// measured glass never goes stale while sections expand or steps change.
export default function LiquidSheet({ onClose, children }) {
  return (
    <div className="modal-overlay liquid-overlay" onClick={onClose}>
      <motion.div
        className="liquid-sheet"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 340 }}
        onAnimationComplete={remeasureGlass}
        onClick={e => e.stopPropagation()}
      >
        <LiquidGlass
          className="liquid-fill"
          style={GLASS_CENTERED}
          cornerRadius={26}
          padding="0"
          displacementScale={70}
          blurAmount={0.5}
          saturation={140}
          aberrationIntensity={2}
          elasticity={0}
        >
          <div className="liquid-sheet__body">{children}</div>
        </LiquidGlass>
      </motion.div>
    </div>
  )
}
