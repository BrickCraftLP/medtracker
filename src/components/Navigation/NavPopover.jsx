import { useState, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { motion } from 'framer-motion'
import { useNavLayout } from '../../context/NavLayoutContext.jsx'
import GlassPanel from '../Glass/GlassPanel.jsx'
import { remeasureGlass } from '../Glass/constants.js'

// The panel scales out of its navbar button: it sits a fixed gap off the
// navbar's measured edge, centered on the button, with the transform origin
// pinned to the button's center. Size comes from fixed row heights so it
// opens identically wherever the button sits.
const MARGIN = 16
const GAP = 12
const PANEL_W = 280
const PANEL_MAX_H = 360
export const PANEL_PAD = 8
export const ROW_H = 48
export const ROW_GAP = 3

const clamp = (v, min, max) => Math.max(min, Math.min(v, max))

function layoutPanel(position, anchor, rowCount) {
  if (!anchor) return null
  const { button, nav } = anchor
  // visualViewport tracks what's actually visible on iOS; innerHeight doesn't
  // shrink for browser chrome.
  const vw = window.visualViewport?.width ?? window.innerWidth
  const vh = window.visualViewport?.height ?? window.innerHeight
  const cx = button.left + button.width / 2
  const cy = button.top + button.height / 2

  const width = Math.min(PANEL_W, vw - MARGIN * 2)
  const contentH = rowCount * ROW_H + Math.max(0, rowCount - 1) * ROW_GAP
  const naturalH = Math.min(PANEL_PAD * 2 + contentH, PANEL_MAX_H, vh - MARGIN * 2)

  if (position === 'left' || position === 'right') {
    const height = naturalH
    const top = clamp(cy - height / 2, MARGIN, vh - MARGIN - height)
    const left = position === 'left'
      ? Math.min(nav.right + GAP, vw - MARGIN - width)
      : Math.max(nav.left - GAP - width, MARGIN)
    const originY = cy - top
    return {
      style: { left, top },
      width,
      height,
      transformOrigin: position === 'left' ? `0px ${originY}px` : `${width}px ${originY}px`,
    }
  }

  const height = Math.min(naturalH, nav.top - GAP - MARGIN)
  const left = clamp(cx - width / 2, MARGIN, vw - width - MARGIN)
  const top = nav.top - GAP - height
  return {
    style: { left, top },
    width,
    height,
    transformOrigin: `${cx - left}px ${height}px`,
  }
}

const OPEN_SPRING = { type: 'spring', duration: 0.62, bounce: 0.3 }
const CLOSE_TWEEN = { duration: 0.24, ease: [0.23, 1, 0.32, 1] }

// Render inside <AnimatePresence> so the exit animation plays. Portaled to
// <body>: .navbar's backdrop-filter/transform would otherwise contain and clip
// fixed children.
export default function NavPopover({ anchorRef, rowCount, onClose, children }) {
  const [anchor, setAnchor] = useState(null)
  const { position } = useNavLayout()

  useLayoutEffect(() => {
    function measure() {
      const btn = anchorRef.current
      if (!btn) return
      const button = btn.getBoundingClientRect()
      const nav = btn.closest('.navbar')?.getBoundingClientRect() ?? button
      setAnchor({ button, nav })
    }
    measure()
    window.addEventListener('resize', measure)
    window.visualViewport?.addEventListener('resize', measure)
    return () => {
      window.removeEventListener('resize', measure)
      window.visualViewport?.removeEventListener('resize', measure)
    }
  }, [anchorRef, position])

  useEffect(() => {
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); onClose() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  const panel = layoutPanel(position, anchor, rowCount)
  if (!panel) return null

  return createPortal(
    <>
      <div
        onClick={onClose}
        style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'transparent' }}
      />
      <motion.div
        initial={{ opacity: 0, scale: 0.2 }}
        animate={{ opacity: 1, scale: 1, transition: OPEN_SPRING }}
        exit={{ opacity: 0, scale: 0.35, transition: CLOSE_TWEEN }}
        onAnimationComplete={remeasureGlass}
        style={{
          position: 'fixed', zIndex: 60,
          width: panel.width,
          height: panel.height,
          transformOrigin: panel.transformOrigin,
          borderRadius: 20,
          boxShadow: '0 20px 60px rgba(0,0,0,0.18), 0 4px 16px rgba(0,0,0,0.08)',
          ...panel.style,
        }}
      >
        <GlassPanel
          className="nav-popover"
          cornerRadius={20}
          displacementScale={60}
          blurAmount={0.4}
          aberrationIntensity={2}
          style={{ width: '100%', height: '100%' }}
          bodyStyle={{
            boxSizing: 'border-box',
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            display: 'flex', flexDirection: 'column', gap: ROW_GAP,
            padding: PANEL_PAD,
          }}
        >
          {children}
        </GlassPanel>
      </motion.div>
    </>,
    document.body
  )
}

export function PopoverRow({ icon, color, label, detail, labelColor, selected, onClick, trailing }) {
  return (
    <motion.button
      whileTap={{ scale: 0.96 }}
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 10, padding: '0 10px', borderRadius: 12, cursor: 'pointer',
        boxSizing: 'border-box', height: ROW_H, flexShrink: 0, width: '100%',
        border: 'none', textAlign: 'left', font: 'inherit',
        background: selected ? 'var(--bg-tertiary)' : 'transparent',
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <span style={{
          width: 28, height: 28, borderRadius: 8, flexShrink: 0, position: 'relative',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: color.startsWith("#") ? `${color}26` : "var(--accent-muted)", color,
        }}>
          {icon}
        </span>
        <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: labelColor ?? 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {label}
          </span>
          {detail && (
            <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {detail}
            </span>
          )}
        </span>
      </span>
      {trailing && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {trailing}
        </span>
      )}
    </motion.button>
  )
}
