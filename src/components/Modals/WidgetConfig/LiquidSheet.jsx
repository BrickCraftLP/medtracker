import { motion } from 'framer-motion'
import LiquidPanel from '../../Glass/LiquidPanel.jsx'
import { remeasureGlass } from '../../Glass/glassConfig.js'

// Centered modal sheet made of liquid glass. It has a fixed size (see
// .liquid-sheet) and scrolls its content internally. The glass mounts while
// the entrance animation is still scaled down, so it re-measures once settled.
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
        <LiquidPanel radius={26}>
          <div className="liquid-sheet__body">{children}</div>
        </LiquidPanel>
      </motion.div>
    </div>
  )
}
