import { motion } from 'framer-motion'
import LiquidPanel from '../../Glass/LiquidPanel.jsx'
import { useWidgetPress } from './useWidgetPress.js'

// `--nav-inset` is the width a vertical navbar rail takes off the content
// area (0 with the default bottom bar) — see index.css.
const SMALL = 'calc(50vw - 22px - var(--nav-inset, 0px) / 2)'
const FULL  = 'calc(100vw - 32px - var(--nav-inset, 0px))'

const SIZE_STYLES = {
  small:  { width: SMALL, height: SMALL },
  medium: { width: FULL,  height: 164 },
  large:  { width: FULL,  height: FULL },
}

const ICON_EDIT = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--text-primary)">
    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
  </svg>
)

const wiggleOn  = { rotate: [-0.6, 0.6] }
const wiggleOff = { rotate: 0, scale: 1 }
const wiggleOnTransition  = { repeat: Infinity, repeatType: 'mirror', duration: 0.32, ease: 'easeInOut' }
const wiggleOffTransition = { duration: 0.2 }

// Dashboard widget card: liquid glass with the widget inside. In wiggle mode
// an overlay intercepts presses (hold to edit, move to drag) and the edit
// badge + drag grip appear above the glass.
export default function WidgetShell({ children, size = 'medium', isWiggling = false, onLongPress, onTap, onDragStart, style }) {
  const { frameHandlers, overlayHandlers } = useWidgetPress({ isWiggling, onLongPress, onTap, onDragStart })

  return (
    <motion.div
      className={`widget-shell${isWiggling ? ' is-wiggling' : ''}`}
      animate={isWiggling ? wiggleOn : wiggleOff}
      transition={isWiggling ? wiggleOnTransition : wiggleOffTransition}
      {...frameHandlers}
      style={{ ...(SIZE_STYLES[size] ?? SIZE_STYLES.medium), ...style }}
    >
      <LiquidPanel radius={22}>{children}</LiquidPanel>

      {isWiggling && (
        <>
          <div className="widget-shell__overlay" {...overlayHandlers} />
          <motion.div className="widget-shell__badge" initial={{ scale: 0 }} animate={{ scale: 1 }}>
            {ICON_EDIT}
          </motion.div>
          <motion.div className="widget-shell__grip" initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
            <span /><span /><span />
          </motion.div>
        </>
      )}
    </motion.div>
  )
}
