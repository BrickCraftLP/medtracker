import { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useCircleReveal } from '../../context/circleReveal.js'
import { useWorkspace } from '../../context/WorkspaceContext.jsx'
import { useData } from '../../context/DataContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useNavLayout } from '../../context/NavLayoutContext.jsx'

// green = last sync succeeded (static), yellow = sync in progress (pulsing),
// red = last sync attempt failed (pulsing).
export function SyncStatusDot({ size = 9 }) {
  const { syncing, syncError } = useData()
  const color = syncing ? '#f59e0b' : syncError ? '#ef4444' : '#22c55e'
  const pulsing = syncing || syncError
  const label = syncing ? 'Syncing…' : syncError ? 'Sync failed' : 'Synced'
  return (
    <span
      role="status"
      aria-label={label}
      title={label}
      className={pulsing ? 'sync-dot-pulse' : undefined}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: color,
        boxShadow: `0 0 6px ${color}99`,
        flexShrink: 0,
      }}
    />
  )
}

export function ItemIcon({ icon, size = 14, color }) {
  const stroke = color ?? 'currentColor'
  const common = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' }
  switch (icon) {
    case 'grid':
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>
    case 'layers':
      return <svg {...common}><path d="M12 3l9 5-9 5-9-5 9-5z" /><path d="M3 13l9 5 9-5" /></svg>
    case 'blocks':
      return <svg {...common}><rect x="3" y="3" width="8" height="8" rx="1.5" /><rect x="13" y="3" width="8" height="8" rx="1.5" /><rect x="8" y="13" width="8" height="8" rx="1.5" /></svg>
    case 'box':
      return <svg {...common}><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>
    case 'spark':
      return <svg {...common}><path d="M12 3l2 5 5 2-5 2-2 5-2-5-5-2 5-2 2-5z" /></svg>
    case 'chart':
      return <svg {...common}><path d="M4 19V10" /><path d="M12 19V5" /><path d="M20 19v-7" /></svg>
    case 'heart':
      return <svg {...common}><path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.6l-1-1a5.5 5.5 0 00-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 000-7.8z" /></svg>
    case 'star':
      return <svg {...common}><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" /></svg>
    case 'flag':
      return <svg {...common}><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" /><path d="M4 22V3" /></svg>
    case 'home':
      return <svg {...common}><path d="M3 11l9-8 9 8" /><path d="M5 10v10h14V10" /></svg>
    case 'folder':
      return <svg {...common}><path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" /></svg>
    case 'target':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /><circle cx="12" cy="12" r="1" /></svg>
    case 'bell':
      return <svg {...common}><path d="M6 8a6 6 0 0112 0c0 7 3 9 3 9H3s3-2 3-9" /><path d="M10.3 21a1.94 1.94 0 003.4 0" /></svg>
    case 'bookmark':
      return <svg {...common}><path d="M6 3h12a1 1 0 011 1v17l-7-4-7 4V4a1 1 0 011-1z" /></svg>
    case 'calendar':
      return <svg {...common}><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4" /><path d="M8 2v4" /><path d="M3 10h18" /></svg>
    case 'clock':
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 3" /></svg>
    case 'sun':
      return <svg {...common}><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
    case 'moon':
      return <svg {...common}><path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" /></svg>
    case 'cloud':
      return <svg {...common}><path d="M17.5 19a4.5 4.5 0 000-9 6 6 0 00-11.4 2A4 4 0 007 19h10.5z" /></svg>
    case 'shield':
      return <svg {...common}><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6l8-3z" /></svg>
    case 'zap':
      return <svg {...common}><path d="M13 2L4 14h7l-1 8 9-12h-7l1-8z" /></svg>
    case 'gift':
      return <svg {...common}><rect x="3" y="8" width="18" height="4" /><rect x="4" y="12" width="16" height="9" /><path d="M12 8v13" /><path d="M12 8c-1.5-4-6-4-6-1.5S9 8 12 8z" /><path d="M12 8c1.5-4 6-4 6-1.5S15 8 12 8z" /></svg>
    case 'check':
      return <svg {...common}><path d="M20 6L9 17l-5-5" /></svg>
    case 'chevrons':
      return <svg {...common}><path d="M7 15l5 5 5-5" /><path d="M7 9l5-5 5 5" /></svg>
    case 'plus':
      return <svg {...common}><path d="M12 5v14" /><path d="M5 12h14" /></svg>
    case 'pencil':
      return <svg {...common}><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4 12.5-12.5z" /></svg>
    default:
      return null
  }
}

// Shape the workspace rows the way both the button and the panel want them.
// `detail` is only known for the active workspace — the others' topics are not
// in memory, and loading them just for a subtitle would defeat the point.
function useWorkspaceItems() {
  const { workspaces, activeWorkspaceId } = useWorkspace()
  const { topics } = useData()
  const { t } = useLanguage()

  const items = workspaces.map(w => ({
    value: w.id,
    label: w.name,
    detail: w.id === activeWorkspaceId
      ? (topics.length === 1 ? t('workspace.topicCountOne') : t('workspace.topicCount', { count: topics.length }))
      : '',
    color: w.color ?? '#6366f1',
    icon: w.icon ?? 'grid',
  }))

  const active = items.find(w => w.value === activeWorkspaceId) ?? items[0]
    ?? { value: null, label: '—', detail: '', color: '#6366f1', icon: 'grid' }

  return { items, active, activeWorkspaceId }
}

// The plain name-with-status-light line that sits at the top of Home now that
// the picker itself lives in the navbar.
export function WorkspaceLabel() {
  const { active } = useWorkspaceItems()
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, minWidth: 0 }}>
      <span style={{
        width: 18, height: 18, borderRadius: 6, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: `${active.color}26`, color: active.color,
      }}>
        <ItemIcon icon={active.icon} color={active.color} size={11} />
      </span>
      <span style={{
        fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)',
        letterSpacing: -0.1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>
        {active.label}
      </span>
      <SyncStatusDot size={7} />
    </div>
  )
}

// The panel genuinely scales out of the button: it sits a fixed gap off the
// navbar's *measured* edge, is centered on the button along the bar (the
// button can sit anywhere once the user reorders it), and its transform origin
// is pinned to the button's center — so growing from scale 0 to 1 reads as the
// panel popping out of that exact point, like an iOS bubble.
//
// Its size is computed up front from fixed row heights instead of left to
// content + available space, so it opens at the same size every time no
// matter where the button sits or which workspace is active.
const MARGIN = 16
const GAP = 12
const PANEL_W = 280
const PANEL_MAX_H = 360
const PANEL_PAD = 8
const ROW_H = 48
const ROW_GAP = 3

const clamp = (v, min, max) => Math.max(min, Math.min(v, max))

function layoutPanel(position, anchor, rowCount) {
  if (!anchor) return null
  const { button, nav } = anchor
  // window.innerWidth/innerHeight is the *layout* viewport — on iOS that's
  // taller than what's actually visible (it doesn't shrink for the browser
  // chrome), so the panel sized itself against real estate the user can't
  // see, rendering oversized/clipped. visualViewport tracks what's actually
  // on screen right now.
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

  // Bottom bar: pop upward off the bar's top edge, centered on the button,
  // clamped to the viewport. Positioned with `top` (not `bottom`) so it lines
  // up with the measured rect instead of an iOS viewport height guess.
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

// Slower and softer than a snappy UI spring — more like the panel is welling
// up out of the button than popping open.
const OPEN_SPRING = { type: 'spring', duration: 0.62, bounce: 0.3 }
const CLOSE_TWEEN = { duration: 0.24, ease: [0.23, 1, 0.32, 1] }

export default function WorkspaceSwitcher() {
  const [isOpen, setIsOpen] = useState(false)
  const [anchor, setAnchor] = useState(null)
  const buttonRef = useRef(null)
  const navigate = useNavigate()
  const { triggerReveal } = useCircleReveal()
  const { canAddWorkspace, switchWorkspace } = useWorkspace()
  const { t } = useLanguage()
  const { position } = useNavLayout()
  const { items, active, activeWorkspaceId } = useWorkspaceItems()

  const close = () => setIsOpen(false)

  function select(value) {
    switchWorkspace(value)
    close()
  }

  function edit(value) {
    close()
    triggerReveal(() => navigate(`/workspaces/${value}/edit`))
  }

  // Measure the button and the bar right before the panel mounts (and again
  // if the viewport changes while open), so the panel hugs the bar's edge and
  // the pop animation's transform-origin lands exactly on the button.
  useLayoutEffect(() => {
    if (!isOpen || !buttonRef.current) return
    function measure() {
      const btn = buttonRef.current
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
  }, [isOpen, position])

  useEffect(() => {
    if (!isOpen) return
    function onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); close() }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [isOpen])

  const panel = layoutPanel(position, anchor, items.length + (canAddWorkspace ? 1 : 0))

  return (
    <>
      <motion.button
        ref={buttonRef}
        whileTap={{ scale: 0.88 }}
        onClick={() => setIsOpen(v => !v)}
        aria-label={t('nav.workspace')}
        aria-expanded={isOpen}
        style={{
          background: 'none', border: 'none', cursor: 'pointer',
          padding: 6, borderRadius: 12, flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          position: 'relative',
        }}
      >
        {/* A standing glass pill instead of the tabs' flat icon — it's a
            control that opens something, not a place you navigate to, so it
            shouldn't read as one more tab in the row. Same liquid-glass
            recipe as the navbar itself (blur + translucent ring + inset
            sheen), just at button scale. The chevron badge below is a
            permanent disclosure cue, not just an open-state indicator. */}
        <motion.span
          animate={{ scale: isOpen ? [1, 1.15, 1] : 1 }}
          transition={{ duration: 0.28, ease: [0.34, 1.56, 0.64, 1] }}
          style={{
            width: 32, height: 32, borderRadius: '50%',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: isOpen ? 'var(--accent-muted)' : 'var(--navbar-bg)',
            backdropFilter: 'blur(6px) saturate(160%)',
            WebkitBackdropFilter: 'blur(6px) saturate(160%)',
            border: `0.5px solid ${isOpen ? 'var(--accent)' : 'var(--glass-border)'}`,
            boxShadow: isOpen
              ? 'none'
              : '0 1px 0 rgba(255,255,255,0.35) inset, 0 -0.5px 0 rgba(0,0,0,0.05) inset, 0 2px 8px rgba(0,0,0,0.06)',
            color: isOpen ? 'var(--accent)' : 'var(--text-secondary)',
            transition: 'background 0.2s, border-color 0.2s, box-shadow 0.2s',
          }}
        >
          <ItemIcon icon={active.icon} size={15} />
        </motion.span>
        {/* Status light */}
        <span style={{
          position: 'absolute', top: 3, right: 3,
          padding: 1.5, borderRadius: '50%', background: 'var(--bg-primary)',
          display: 'flex',
        }}>
          <SyncStatusDot size={7} />
        </span>
      </motion.button>

      {/* Portaled to <body>: .navbar sets backdrop-filter (and a transform when
          horizontal), which makes it a containing block for fixed children — a
          panel rendered inside it would be anchored to the bar and clipped by
          its overflow. */}
      {createPortal(
        <AnimatePresence>
          {isOpen && panel && (
            <>
            {/* Invisible click-catcher: tapping outside closes the panel,
                but the screen behind stays sharp and undimmed. */}
            <div
              key="ws-switcher-dismiss"
              onClick={close}
              style={{ position: 'fixed', inset: 0, zIndex: 40, background: 'transparent' }}
            />

            <motion.div
              key="ws-switcher-panel"
              initial={{ opacity: 0, scale: 0.2 }}
              animate={{ opacity: 1, scale: 1, transition: OPEN_SPRING }}
              exit={{ opacity: 0, scale: 0.35, transition: CLOSE_TWEEN }}
              className="ws-switcher-glass"
              style={{
                position: 'fixed', zIndex: 60,
                boxSizing: 'border-box',
                width: panel.width,
                height: panel.height,
                overflowY: 'auto',
                display: 'flex', flexDirection: 'column', gap: ROW_GAP,
                transformOrigin: panel.transformOrigin,
                borderRadius: 20,
                padding: PANEL_PAD,
                ...panel.style,
              }}
            >
              {items.map(item => {
                const isSelected = item.value === activeWorkspaceId
                return (
                  <motion.div
                    key={item.value}
                    whileTap={{ scale: 0.96 }}
                    onClick={() => select(item.value)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                      gap: 10, padding: '0 10px', borderRadius: 12, cursor: 'pointer',
                      boxSizing: 'border-box', height: ROW_H, flexShrink: 0,
                      background: isSelected ? 'var(--bg-tertiary)' : 'transparent',
                    }}
                  >
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <span style={{
                        width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `${item.color}26`, color: item.color,
                      }}>
                        <ItemIcon icon={item.icon} color={item.color} />
                      </span>
                      <span style={{ minWidth: 0, display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {item.label}
                        </span>
                        {item.detail && (
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {item.detail}
                          </span>
                        )}
                      </span>
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                      {isSelected && (
                        <motion.span
                          initial={{ scale: 0.7, opacity: 0 }}
                          animate={{ scale: 1, opacity: 1 }}
                          transition={{ type: 'spring', bounce: 0.5, duration: 0.25 }}
                          style={{ color: 'var(--accent)', display: 'flex' }}
                        >
                          <ItemIcon icon="check" />
                        </motion.span>
                      )}
                      <motion.span
                        whileTap={{ scale: 0.85 }}
                        onClick={(e) => { e.stopPropagation(); edit(item.value) }}
                        title={t('workspace.edit')}
                        style={{ display: 'flex', padding: 4, borderRadius: 6, cursor: 'pointer', color: 'var(--text-tertiary)' }}
                      >
                        <ItemIcon icon="pencil" size={13} />
                      </motion.span>
                    </span>
                  </motion.div>
                )
              })}

              {canAddWorkspace && (
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { close(); triggerReveal(() => navigate('/workspaces/new')) }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
                    boxSizing: 'border-box', height: ROW_H, flexShrink: 0,
                    padding: '0 10px', borderRadius: 12, cursor: 'pointer',
                    background: 'transparent', border: 'none', textAlign: 'left',
                  }}
                >
                  <span style={{
                    width: 28, height: 28, borderRadius: 8, flexShrink: 0,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: 'var(--accent-muted)', color: 'var(--accent)',
                  }}>
                    <ItemIcon icon="plus" />
                  </span>
                  <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--accent)' }}>
                    {t('workspace.add')}
                  </span>
                </motion.button>
              )}
            </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  )
}
