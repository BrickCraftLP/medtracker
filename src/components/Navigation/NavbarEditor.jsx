import { useRef, useState } from 'react'
import { motion } from 'framer-motion'
import { useNavLayout, PLUS_ID, WORKSPACE_ID, SETTINGS_ID, ASSISTANT_ID, isTabId, capFor, NAV_SCALES } from '../../context/NavLayoutContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { NAV_ICONS, SettingsIcon, AssistantIcon } from './Navbar.jsx'
import { ItemIcon } from './WorkspaceSwitcher.jsx'
import { useWorkspace } from '../../context/WorkspaceContext.jsx'
import { todoSwipeActive } from '../../utils/gestureState.js'

const isTab = isTabId

// Drop targets are forgiving: a finger that lands just outside a row still
// counts as a drop into it.
const HIT_PAD = 14

function hits(point, rect) {
  if (!rect) return false
  return point.x >= rect.left - HIT_PAD && point.x <= rect.right + HIT_PAD &&
         point.y >= rect.top - HIT_PAD && point.y <= rect.bottom + HIT_PAD
}

// The workspace item renders the workspace it would actually switch, so the
// preview and the chips match what lands in the bar.
function WorkspaceMiniIcon({ size }) {
  const { workspaces, activeWorkspaceId } = useWorkspace()
  const w = workspaces.find(x => x.id === activeWorkspaceId) ?? workspaces[0]
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      color: 'var(--text-secondary)',
    }}>
      <ItemIcon icon={w?.icon ?? 'grid'} size={size * 0.72} />
    </div>
  )
}

function MiniIcon({ id, size = 14 }) {
  if (id === PLUS_ID) {
    return (
      <div style={{
        width: size, height: size, borderRadius: '50%', background: 'var(--accent)',
        flexShrink: 0,
      }} />
    )
  }
  if (id === WORKSPACE_ID) return <WorkspaceMiniIcon size={size} />
  if (id === SETTINGS_ID) {
    return (
      <div style={{
        width: size, height: size, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `scale(${size / 24})`,
      }}>
        <SettingsIcon />
      </div>
    )
  }
  if (id === ASSISTANT_ID) {
    return (
      <div style={{
        width: size, height: size, flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transform: `scale(${size / 24})`,
      }}>
        <AssistantIcon />
      </div>
    )
  }
  const Icon = NAV_ICONS[id]
  if (!Icon) return null
  return (
    <div style={{
      width: size, height: size, flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      transform: `scale(${size / 24})`,
    }}>
      <Icon active={false} />
    </div>
  )
}

// Where the mini navbar sits for a given edge — shared by the real rail and
// by the dashed placeholders below, so a placeholder always lines up exactly
// where the bar would land if picked.
function wrapAlignFor(edge) {
  return edge === 'bottom'
    ? { alignItems: 'flex-end', justifyContent: 'center' }
    : edge === 'left'
      ? { alignItems: 'flex-end', justifyContent: 'flex-start' }
      : { alignItems: 'flex-end', justifyContent: 'flex-end' }
}

// An empty-outline preview of the navbar at an edge the user hasn't picked —
// a dashed pill sized to how many items would actually sit in it, so the
// placeholder itself communicates "the bar would be about this big here".
const ITEM_SIZE = 18
const ITEM_GAP = 6
const RAIL_PAD = 11

function EdgePlaceholder({ edge, itemCount, onPick, label }) {
  const run = itemCount * ITEM_SIZE + Math.max(0, itemCount - 1) * ITEM_GAP + RAIL_PAD * 2
  const thickness = ITEM_SIZE + RAIL_PAD * 2 - 4
  const size = edge === 'bottom' ? { width: run, height: thickness } : { width: thickness, height: run }

  return (
    // The wrapper spans the full preview (inset:0) just to position the pill
    // via flex alignment — with several of these stacked (one per unpicked
    // edge), a later one would otherwise sit on top and swallow clicks meant
    // for an earlier one's pill, since an absolutely-positioned div is
    // click-through-able across its whole box, not just where it's drawn.
    <div style={{ position: 'absolute', inset: 0, padding: 8, display: 'flex', pointerEvents: 'none', ...wrapAlignFor(edge) }}>
      <motion.button
        type="button"
        layout
        onClick={() => onPick(edge)}
        aria-label={label}
        whileTap={{ scale: 0.94 }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{
          ...size,
          pointerEvents: 'auto',
          maxWidth: '100%',
          maxHeight: '100%',
          borderRadius: 9999,
          border: '1.5px dashed var(--text-tertiary)',
          background: 'transparent',
          cursor: 'pointer',
          padding: 0,
        }}
      />
    </div>
  )
}

// The fake phone: widgets that step aside for the bar, three tappable edges
// and a scaled-down navbar showing the live arrangement.
const SCALE_FACTOR = { small: 0.85, medium: 1, large: 1.18 }

function PhonePreview({ position, order, scale, onPick, t }) {
  const vertical = position !== 'bottom'
  const RAIL = 24

  // Centering the bottom rail with left:50% + transform:translateX(-50%) fights
  // framer-motion's own transform when `layout` animates it (it ends up pushed
  // to one side) — so position is done with flex alignment on the wrapper
  // instead, and the rail itself never carries a manual transform.
  const wrapAlign = wrapAlignFor(position)
  const railStyle = position === 'bottom'
    ? { flexDirection: 'row', padding: '7px 11px' }
    : { flexDirection: 'column', padding: '11px 7px' }

  return (
    <div style={{
      position: 'relative',
      width: '100%',
      maxWidth: 188,
      aspectRatio: '9 / 17',
      margin: '0 auto',
      borderRadius: 22,
      border: '0.5px solid var(--glass-card-stroke)',
      background: 'var(--bg-primary)',
      boxShadow: 'var(--shadow)',
      overflow: 'hidden',
    }}>
      {/* Fake widgets — they shift away from a vertical rail, exactly like the
          real --nav-inset padding does on the scroll containers. */}
      <motion.div
        layout
        animate={{
          paddingLeft: position === 'left' ? RAIL + 10 : 10,
          paddingRight: position === 'right' ? RAIL + 10 : 10,
          paddingBottom: vertical ? 10 : RAIL + 8,
        }}
        transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        style={{
          position: 'absolute', inset: 0, paddingTop: 14,
          display: 'flex', flexDirection: 'column', gap: 7,
        }}
      >
        <motion.div layout className="skeleton" style={{ height: 26, borderRadius: 8, flexShrink: 0 }} />
        <motion.div layout style={{ display: 'flex', gap: 7, flexShrink: 0 }}>
          <motion.div layout className="skeleton" style={{ flex: 1, aspectRatio: '1 / 1', borderRadius: 8 }} />
          <motion.div layout className="skeleton" style={{ flex: 1, aspectRatio: '1 / 1', borderRadius: 8 }} />
        </motion.div>
        <motion.div layout className="skeleton" style={{ height: 26, borderRadius: 8, flexShrink: 0 }} />
      </motion.div>

      {/* Dashed outline on the two edges not currently picked — sized to the
          item count, so it previews how big the bar would actually be there. */}
      {['left', 'right', 'bottom'].filter(edge => edge !== position).map(edge => (
        <EdgePlaceholder
          key={edge}
          edge={edge}
          itemCount={Math.min(order.length, capFor(edge))}
          onPick={onPick}
          label={t(`settings.nav.zone.${edge}`)}
        />
      ))}

      {/* Mini navbar — a full-bleed flex wrapper does the edge positioning,
          so the rail itself only ever needs `layout`, no manual transform.
          The size scale is applied on a separate plain wrapper div instead
          of the motion.div, so it never fights framer-motion's own
          layout-driven transform. */}
      <div style={{
        position: 'absolute', inset: 0, padding: 8,
        display: 'flex', pointerEvents: 'none', ...wrapAlign,
      }}>
        <div style={{
          transform: `scale(${SCALE_FACTOR[scale] ?? 1})`,
          transformOrigin: position === 'bottom' ? 'bottom center' : position === 'left' ? 'bottom left' : 'bottom right',
          transition: 'transform 0.15s ease-out',
        }}>
          <motion.div
            layout
            transition={{ type: 'spring', stiffness: 320, damping: 32 }}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              borderRadius: 9999,
              background: 'var(--navbar-bg)',
              border: '0.5px solid var(--glass-border)',
              backdropFilter: 'blur(6px)',
              WebkitBackdropFilter: 'blur(6px)',
              boxShadow: '0 4px 14px rgba(0,0,0,0.10)',
              ...railStyle,
            }}
          >
            {order.map(id => (
              <motion.div layout key={id}>
                <MiniIcon id={id} size={id === PLUS_ID ? 16 : 18} />
              </motion.div>
            ))}
          </motion.div>
        </div>
      </div>
    </div>
  )
}

// A draggable item. Defined at module scope: re-declaring it inside the editor
// would give React a new component type on every drag frame, which unmounts the
// element mid-gesture and kills the drag.
function Chip({ id, inBar, label, dragging, collapsed, onRef, onPress, onDragStart, onDrag, onDragEnd, onTap }) {
  return (
    <motion.div
      // Bar chips share the row equally so all of them fit on one line; the
      // one being dragged out gives its slot up to the drop placeholder.
      // `position` keeps a width change from squashing the icon.
      layout={inBar ? 'position' : true}
      layoutId={`navchip-${id}`}
      ref={onRef}
      title={label}
      drag
      dragSnapToOrigin
      dragElastic={0.12}
      dragMomentum={false}
      onPointerDown={onPress}
      onDragStart={() => onDragStart(id)}
      onDrag={(_, info) => onDrag(id, info)}
      onDragEnd={(_, info) => onDragEnd(id, info)}
      onClick={() => onTap(id, inBar)}
      whileDrag={{ scale: 1.12, zIndex: 10, cursor: 'grabbing' }}
      whileTap={{ scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 3,
        borderRadius: 12,
        cursor: 'grab',
        touchAction: 'none',
        opacity: dragging ? 0.9 : 1,
        ...(inBar
          ? { flex: collapsed ? '0 0 0px' : '1 1 0px', minWidth: 0, height: 44, padding: 0, background: 'transparent' }
          : { minWidth: 58, padding: '8px 10px', background: 'var(--bg-tertiary)' }),
      }}
    >
      <MiniIcon id={id} size={id === PLUS_ID ? 20 : 22} />
      {!inBar && (
        <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      )}
    </motion.div>
  )
}

// The slot a dragged item will land in — a liquid-glass square that grows
// open between the bar items, pushing them aside to make room.
function DropSlot() {
  return (
    <motion.div
      layout
      initial={{ flexGrow: 0, opacity: 0 }}
      animate={{ flexGrow: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
      style={{ flexBasis: 0, flexShrink: 1, minWidth: 0, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
    >
      <motion.div
        initial={{ scale: 0.5 }}
        animate={{ scale: 1 }}
        transition={{ type: 'spring', stiffness: 460, damping: 26 }}
        style={{
          height: '100%',
          maxWidth: '100%',
          aspectRatio: '1 / 1',
          borderRadius: 12,
          background: 'color-mix(in srgb, var(--accent) 14%, var(--glass-bg, rgba(255,255,255,0.25)))',
          backdropFilter: 'blur(20px) saturate(180%)',
          WebkitBackdropFilter: 'blur(20px) saturate(180%)',
          border: '0.5px solid color-mix(in srgb, var(--accent) 45%, transparent)',
          boxShadow: '0 1px 0 rgba(255,255,255,0.45) inset, 0 -0.5px 0 rgba(0,0,0,0.08) inset, 0 4px 14px color-mix(in srgb, var(--accent) 22%, transparent)',
        }}
      />
    </motion.div>
  )
}

// Horizontal padding of the bar row — the slot math below measures inside it.
const BAR_PAD_X = 8

// Small/Medium/Large picker for the bar's scale — same segmented-pill look
// as the other settings controls.
function ScaleControl({ value, onChange, t }) {
  return (
    <div style={{ display: 'flex', gap: 6, padding: 3, background: 'var(--bg-tertiary)', borderRadius: 12 }}>
      {NAV_SCALES.map((key) => {
        const active = value === key
        return (
          <button
            key={key}
            type="button"
            onClick={() => onChange(key)}
            style={{
              flex: 1, padding: '7px 10px', borderRadius: 9, border: 'none', cursor: 'pointer',
              fontSize: 13, fontWeight: 600,
              background: active ? 'var(--accent)' : 'transparent',
              color: active ? 'white' : 'var(--text-secondary)',
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            {t(`settings.nav.scale.${key}`)}
          </button>
        )
      })}
    </div>
  )
}

export default function NavbarEditor() {
  const { position, order, hidden, scale, setSetting } = useNavLayout()
  const { t } = useLanguage()

  const barRef = useRef(null)
  const trayRef = useRef(null)
  const itemRefs = useRef({})
  const movedRef = useRef(false)

  // Moving a dragged chip to a new DOM parent (bar <-> tray) mid-gesture
  // unmounts its motion node and kills the drag — so the lists are NOT
  // rewritten while dragging. `dragTarget` only drives a highlight; the real
  // move is computed and committed once, in onDragEnd.
  const [draggingId, setDraggingId] = useState(null)
  const [dragTarget, setDragTarget] = useState(null)
  // Where the glass drop slot opens in the bar, or null when there's no slot.
  const [dropIndex, setDropIndex] = useState(null)

  const cap = capFor(position)

  // Bar items are equal-width, so the slot under the finger is plain division
  // over the row — measuring the items instead would feed back on itself, as
  // the opening slot shifts them around under the pointer.
  function barSlotAt(point, slots) {
    const rect = barRef.current?.getBoundingClientRect()
    if (!rect) return slots - 1
    const inner = rect.width - BAR_PAD_X * 2
    const i = Math.floor(((point.x - rect.left - BAR_PAD_X) / inner) * slots)
    return Math.max(0, Math.min(slots - 1, i))
  }

  function place(id, target, point) {
    const from = { order: order.filter(x => x !== id), hidden: hidden.filter(x => x !== id) }
    // The bar must always keep at least one tab, or there is no way back.
    if (target === 'tray' && isTab(id) && !from.order.some(isTab)) return null
    // A horizontal pill runs out of room sooner than a vertical rail.
    if (target === 'bar' && from.order.length >= cap) return null

    const list = target === 'bar' ? from.order : from.hidden
    let index = list.length
    if (point && target === 'bar') {
      index = barSlotAt(point, list.length + 1)
    } else if (point) {
      for (let i = 0; i < list.length; i++) {
        const rect = itemRefs.current[list[i]]?.getBoundingClientRect()
        if (rect && point.x < rect.left + rect.width / 2) { index = i; break }
      }
    }
    const next = [...list]
    next.splice(index, 0, id)
    return target === 'bar' ? { order: next, hidden: from.hidden } : { order: from.order, hidden: next }
  }

  function targetAt(point) {
    if (hits(point, barRef.current?.getBoundingClientRect())) return 'bar'
    if (hits(point, trayRef.current?.getBoundingClientRect())) return 'tray'
    return null
  }

  function handleDragStart(id) {
    todoSwipeActive.current = true
    movedRef.current = false
    setDraggingId(id)
  }

  function handleDrag(id, info) {
    if (Math.abs(info.offset.x) > 4 || Math.abs(info.offset.y) > 4) movedRef.current = true
    const target = targetAt(info.point)
    setDragTarget(target)
    // No slot when the bar is already full — there's nowhere for it to land.
    const rest = order.filter(x => x !== id)
    setDropIndex(target === 'bar' && rest.length < cap ? barSlotAt(info.point, rest.length + 1) : null)
  }

  function handleDragEnd(id, info) {
    const target = targetAt(info.point)
    if (target) {
      const next = place(id, target, info.point)
      if (next) {
        setSetting('order', next.order)
        setSetting('hidden', next.hidden)
      }
    }
    setDraggingId(null)
    setDragTarget(null)
    setDropIndex(null)
    todoSwipeActive.current = false
  }

  // Tapping is the no-drag shortcut: an item hops to the other row.
  function handleTap(id, inBar) {
    if (movedRef.current) return
    const next = place(id, inBar ? 'tray' : 'bar', null)
    if (!next) return
    setSetting('order', next.order)
    setSetting('hidden', next.hidden)
  }

  // Switching to a position with a smaller cap (vertical -> bottom, 7 -> 5)
  // can leave the bar over-full — trim the overflow into the tray, keeping at
  // least one tab, rather than silently exceeding the new cap.
  function pickPosition(next) {
    const nextCap = capFor(next)
    if (order.length > nextCap) {
      const keep = order.slice(0, nextCap)
      const overflow = order.slice(nextCap)
      if (!keep.some(isTab)) {
        const tabIdx = overflow.findIndex(isTab)
        if (tabIdx !== -1) {
          const tabId = overflow.splice(tabIdx, 1)[0]
          overflow.push(keep.pop())
          keep.push(tabId)
        }
      }
      setSetting('order', keep)
      setSetting('hidden', [...hidden, ...overflow])
    }
    setSetting('position', next)
  }

  // The dragged chip can't leave its row mid-gesture (that kills the drag), so
  // the slot is threaded in between the *other* bar items and the dragged one
  // just collapses to nothing where it was.
  function renderBar() {
    const out = []
    let n = 0
    for (const id of order) {
      if (id !== draggingId) {
        if (n === dropIndex) out.push(<DropSlot key="drop-slot" />)
        n++
      }
      out.push(renderChip(id, true, id === draggingId && dropIndex !== null))
    }
    if (dropIndex !== null && dropIndex >= n) out.push(<DropSlot key="drop-slot" />)
    return out
  }

  function renderChip(id, inBar, collapsed = false) {
    return (
      <Chip
        key={id}
        id={id}
        inBar={inBar}
        collapsed={collapsed}
        label={
          id === PLUS_ID ? t('settings.nav.addItem')
            : id === WORKSPACE_ID ? t('nav.workspace')
              : id === SETTINGS_ID ? t('settings.title')
                : id === ASSISTANT_ID ? t('nav.assistant')
                  : t(`nav.${id.slice(1)}`)
        }
        dragging={draggingId === id}
        onRef={el => { itemRefs.current[id] = el }}
        onPress={() => { movedRef.current = false }}
        onDragStart={handleDragStart}
        onDrag={handleDrag}
        onDragEnd={handleDragEnd}
        onTap={handleTap}
      />
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, paddingTop: 4 }}>
      <PhonePreview
        position={position}
        order={order}
        scale={scale}
        onPick={pickPosition}
        t={t}
      />

      <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
        {t('settings.nav.scale')}
      </p>
      <ScaleControl value={scale} onChange={(v) => setSetting('scale', v)} t={t} />

      <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between' }}>
        <span>{t('settings.nav.bar')}</span>
        <span style={{ color: order.length >= cap ? 'var(--accent)' : 'var(--text-tertiary)', fontWeight: 500 }}>
          {order.length}/{cap}
        </span>
      </p>
      <div
        ref={barRef}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexWrap: 'nowrap', gap: 2, minHeight: 60, padding: `8px ${BAR_PAD_X}px`,
          borderRadius: 9999,
          background: 'var(--navbar-bg)',
          border: '0.5px solid var(--glass-border)',
          // Highlight with a ring, not a thicker border — a border change would
          // resize the row and throw off the slot math mid-drag.
          boxShadow: dragTarget === 'bar' ? '0 0 0 1.5px var(--accent)' : 'none',
          transition: 'box-shadow 0.15s',
        }}
      >
        {renderBar()}
      </div>

      <p style={{ margin: '4px 0 0', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)' }}>
        {t('settings.nav.available')}
      </p>
      <div
        ref={trayRef}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexWrap: 'wrap', gap: 6, minHeight: 66, padding: '8px 12px',
          borderRadius: 16,
          border: dragTarget === 'tray' ? '1.5px solid var(--accent)' : '1px dashed var(--border)',
          transition: 'border-color 0.15s',
        }}
      >
        {hidden.length === 0 ? (
          <span style={{ fontSize: 12, color: 'var(--text-tertiary)' }}>{t('settings.nav.trayEmpty')}</span>
        ) : (
          hidden.map(id => renderChip(id, false))
        )}
      </div>

      <p style={{ margin: 0, fontSize: 12, color: 'var(--text-tertiary)' }}>{t('settings.nav.editorHint')}</p>
    </div>
  )
}
