import { useRef, useCallback } from 'react'
import { motion } from 'framer-motion'

// `--nav-inset` is the width a vertical navbar rail takes off the content
// area (0 with the default bottom bar) — see index.css.
const SMALL = 'calc(50vw - 22px - var(--nav-inset, 0px) / 2)'
const FULL  = 'calc(100vw - 32px - var(--nav-inset, 0px))'

const SIZE_STYLES = {
  small: {
    width: SMALL,
    height: SMALL,
  },
  medium: {
    width: FULL,
    height: 164,
  },
  large: {
    width: FULL,
    height: FULL,
  },
}

export default function WidgetShell({
  children,
  size = 'medium',
  isWiggling = false,
  onLongPress,   // called only after 500ms hold
  onTap,         // called on a short press (only used in wiggle mode by parent)
  onDragStart,   // hands the pointer off to the parent's drag gesture once movement is detected
  style,
}) {
  const pressTimer = useRef(null)
  const didLongPress = useRef(false)
  const pointerDown = useRef(false)

  // Wiggle-mode long press (to open settings)
  const wigglePressTimer = useRef(null)
  const wigglePointerDown = useRef(false)
  const wiggleStartPos = useRef(null)
  const wiggleMoved = useRef(false)

  const handleOverlayPointerDown = useCallback((e) => {
    e.stopPropagation()
    wigglePointerDown.current = true
    wiggleMoved.current = false
    wiggleStartPos.current = { x: e.clientX, y: e.clientY }
    wigglePressTimer.current = setTimeout(() => {
      if (wigglePointerDown.current && !wiggleMoved.current) onTap?.()
    }, 500)
  }, [onTap])

  const handleOverlayPointerMove = useCallback((e) => {
    if (!wigglePointerDown.current || wiggleMoved.current) return
    const dx = e.clientX - (wiggleStartPos.current?.x ?? e.clientX)
    const dy = e.clientY - (wiggleStartPos.current?.y ?? e.clientY)
    if (Math.sqrt(dx * dx + dy * dy) > 6) {
      wiggleMoved.current = true
      wigglePointerDown.current = false
      clearTimeout(wigglePressTimer.current)
      // Movement before the long-press fired means the user meant to drag —
      // hand off to the parent's drag gesture instead of opening settings.
      onDragStart?.(e)
    }
  }, [onDragStart])

  const handleOverlayPointerUp = useCallback(() => {
    wigglePointerDown.current = false
    clearTimeout(wigglePressTimer.current)
  }, [])

  function handlePointerDown(e) {
    if (isWiggling) return  // parent handles drag in wiggle mode
    e.stopPropagation()
    pointerDown.current = true
    didLongPress.current = false

    pressTimer.current = setTimeout(() => {
      if (pointerDown.current) {
        didLongPress.current = true
        onLongPress?.()
      }
    }, 500)
  }

  function handlePointerUp() {
    if (isWiggling) return
    pointerDown.current = false
    clearTimeout(pressTimer.current)
  }

  function handlePointerLeave() {
    if (isWiggling) return
    pointerDown.current = false
    clearTimeout(pressTimer.current)
  }

  function handleClick(e) {
    e.stopPropagation()
    // In wiggle mode the parent (draggable wrapper) handles tap so we can
    // distinguish a real tap from a drag release. Firing onTap here too would
    // open the editor every time the user finishes dragging a widget.
    if (isWiggling) return
    if (!didLongPress.current) {
      onTap?.()
    }
  }

  const sizeStyle = SIZE_STYLES[size] ?? SIZE_STYLES.medium

  return (
    <motion.div
      animate={isWiggling
        ? { rotate: [-0.6, 0.6] }
        : { rotate: 0, scale: 1 }
      }
      transition={isWiggling
        ? { repeat: Infinity, repeatType: 'mirror', duration: 0.32, ease: 'easeInOut' }
        : { duration: 0.2 }
      }
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      style={{
        ...sizeStyle,
        borderRadius: 22,
        overflow: 'hidden',
        position: 'relative',
        background: 'var(--card-bg)',
        border: isWiggling
          ? '0.5px solid rgba(255,255,255,0.45)'
          : '0.5px solid var(--border)',
        boxShadow: isWiggling
          ? '0 0 0 1px rgba(255,255,255,0.18) inset, 0 2px 0 rgba(255,255,255,0.28) inset, 0 8px 32px rgba(0,0,0,0.18)'
          : 'var(--shadow)',
        cursor: isWiggling ? 'pointer' : 'default',
        flexShrink: 0,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        transition: 'border-color 0.18s, box-shadow 0.18s',
        ...style,
      }}
    >
      {children}

      {/* Intercept all child clicks in wiggle mode; long press opens settings */}
      {isWiggling && (
        <div
          onPointerDown={handleOverlayPointerDown}
          onPointerMove={handleOverlayPointerMove}
          onPointerUp={handleOverlayPointerUp}
          onPointerLeave={handleOverlayPointerUp}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 9,
            cursor: 'pointer',
          }}
        />
      )}

      {/* Edit badge */}
      {isWiggling && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          style={{
            position: 'absolute',
            top: 8,
            right: 8,
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: 'var(--bg-secondary)',
            backdropFilter: 'blur(16px)',
            WebkitBackdropFilter: 'blur(16px)',
            border: '0.5px solid var(--border-strong)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 10,
            boxShadow: 'var(--shadow)',
          }}
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--text-primary)">
            <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
          </svg>
        </motion.div>
      )}

      {/* Drag handle hint */}
      {isWiggling && (
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          style={{
            position: 'absolute',
            bottom: 8,
            right: 8,
            zIndex: 10,
            display: 'flex',
            flexDirection: 'column',
            gap: 2.5,
            padding: 4,
            pointerEvents: 'none',
          }}
        >
          {[0,1,2].map(i => (
            <div key={i} style={{ width: 14, height: 2, borderRadius: 1, background: 'var(--text-tertiary)' }} />
          ))}
        </motion.div>
      )}
    </motion.div>
  )
}
