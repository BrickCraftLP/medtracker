import { useState, useRef, useLayoutEffect, useId, useCallback } from 'react'
import { motion, useReducedMotion } from 'framer-motion'

// ── Spring transitions, ported verbatim from the bouncy-accordion showcase ──
const EASE_OUT = [0.16, 1, 0.3, 1]
const CONTENT_OPEN_TRANSITION = { type: 'spring', duration: 0.88, bounce: 0.16 }
const CONTENT_CLOSE_TRANSITION = { type: 'spring', duration: 0.70, bounce: 0.12 }
const DESCRIPTION_TRANSITION = { duration: 0.32, ease: EASE_OUT }
const CHEVRON_TRANSITION = { type: 'spring', duration: 0.65, bounce: 0.14 }

// ── Bouncy accordion engine — ported from the showcase. The open item
// detaches into its own floating glass card (margin gap + full rounded
// corners + shadow on all sides); closed items fuse back into a shared block
// (touching, square shared edges). To avoid a doubled seam line where two
// fused rows touch, only the row(s) at the true outer edge of a fused run
// draw a border/shadow on that edge — a row fused on BOTH sides carries no
// border or shadow at all, just the matching background, so it blends
// invisibly between its neighbors instead of drawing a hairline against them.
function AccordionRow({ item, open, startsGroup, endsGroup, separatedFromPrevious, contentId, triggerId, reduce, onToggle }) {
  const contentRef = useRef(null)
  const [contentHeight, setContentHeight] = useState(0)

  useLayoutEffect(() => {
    const node = contentRef.current
    if (!node) return

    const updateHeight = () => setContentHeight(node.offsetHeight)
    updateHeight()

    const observer = new ResizeObserver(updateHeight)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  // A row only draws a border on an edge that's actually free (the very
  // top/bottom of the whole list, or next to the open item) — never on an
  // edge shared with a fused neighbor, so two touching rows never both draw
  // a line on the same boundary. Side borders are always on (they run the
  // full height of the block, so they never create a horizontal seam). The
  // ambient shadow only appears on a row that's free on BOTH edges — i.e.
  // truly standalone, like the open row — so it never bleeds across a fused edge.
  const isolated = startsGroup && endsGroup

  return (
    <motion.div
      initial={false}
      animate={{ marginTop: separatedFromPrevious ? 12 : 0 }}
      transition={reduce ? { duration: 0 } : CONTENT_OPEN_TRANSITION}
    >
      <motion.div
        data-state={open ? 'open' : 'closed'}
        initial={false}
        animate={{
          borderTopLeftRadius: startsGroup ? 16 : 0,
          borderTopRightRadius: startsGroup ? 16 : 0,
          borderBottomLeftRadius: endsGroup ? 16 : 0,
          borderBottomRightRadius: endsGroup ? 16 : 0,
        }}
        transition={reduce ? { duration: 0 } : CONTENT_OPEN_TRANSITION}
        style={{
          overflow: 'hidden',
          background: 'var(--glass-card-bg)',
          backdropFilter: 'blur(60px) saturate(200%)',
          WebkitBackdropFilter: 'blur(60px) saturate(200%)',
          borderLeft: '0.5px solid var(--glass-card-stroke)',
          borderRight: '0.5px solid var(--glass-card-stroke)',
          borderTop: startsGroup ? '0.5px solid var(--glass-card-stroke)' : 'none',
          borderBottom: endsGroup ? '0.5px solid var(--glass-card-stroke)' : 'none',
          boxShadow: isolated ? 'var(--glass-card-shadow)' : 'none',
        }}
      >
        <button
          id={triggerId}
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          onClick={onToggle}
          style={{
            display: 'flex', alignItems: 'center', gap: 12, width: '100%',
            minHeight: 56, padding: '0 16px', textAlign: 'left',
            background: 'transparent', border: 'none', cursor: 'pointer',
          }}
        >
          <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {item.icon}
          </div>

          <div style={{ minWidth: 0, flex: 1, padding: '10px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.title}
              </span>
              {item.badge}
            </div>
            {item.summary && (
              <p style={{ margin: '2px 0 0', fontSize: 12, color: 'var(--text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {item.summary}
              </p>
            )}
          </div>

          <motion.span
            aria-hidden
            animate={{ rotate: open ? 180 : 0 }}
            transition={reduce ? { duration: 0 } : CHEVRON_TRANSITION}
            style={{ display: 'grid', placeItems: 'center', width: 20, height: 20, flexShrink: 0 }}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
              <path d="M6 9l6 6 6-6" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </motion.span>
        </button>

        <motion.div
          id={contentId}
          role="region"
          aria-labelledby={triggerId}
          aria-hidden={!open}
          inert={!open ? '' : undefined}
          initial={false}
          animate={{ height: open ? contentHeight : 0 }}
          transition={reduce ? { duration: 0 } : open ? CONTENT_OPEN_TRANSITION : CONTENT_CLOSE_TRANSITION}
          style={{ overflow: 'hidden' }}
        >
          <motion.div
            ref={contentRef}
            animate={{ opacity: open ? 1 : 0 }}
            transition={reduce ? { duration: 0 } : DESCRIPTION_TRANSITION}
            style={{ padding: '4px 16px 16px', borderTop: '0.5px solid var(--border)' }}
          >
            {item.content}
          </motion.div>
        </motion.div>
      </motion.div>
    </motion.div>
  )
}

// items: [{ id, title, summary?, icon, badge?, content }] · value: open id or null
export default function BouncyAccordion({ items, value, onValueChange }) {
  const reduce = useReducedMotion()
  const baseId = useId()
  const activeIndex = items.findIndex((item) => item.id === value)

  const toggleItem = useCallback(
    (id) => onValueChange(value === id ? null : id),
    [value, onValueChange]
  )

  return (
    <div style={{ width: '100%' }}>
      {items.map((item, index) => {
        const open = value === item.id
        const previousIsOpen = activeIndex === index - 1
        const nextIsOpen = activeIndex === index + 1
        const startsGroup = open || index === 0 || previousIsOpen
        const endsGroup = open || index === items.length - 1 || nextIsOpen
        const separatedFromPrevious = index > 0 && (open || previousIsOpen)

        return (
          <AccordionRow
            key={item.id}
            item={item}
            open={open}
            startsGroup={startsGroup}
            endsGroup={endsGroup}
            separatedFromPrevious={separatedFromPrevious}
            contentId={`${baseId}-${item.id}-content`}
            triggerId={`${baseId}-${item.id}-trigger`}
            reduce={reduce}
            onToggle={() => toggleItem(item.id)}
          />
        )
      })}
    </div>
  )
}
