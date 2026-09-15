import { useState, useEffect, useRef, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { NavDirectionContext } from '../context/navDirection.js'
import { motion, AnimatePresence, LayoutGroup, useDragControls } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import { useData } from '../context/DataContext.jsx'
import { useWidgets } from '../hooks/useWidgets.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { useChangelog } from '../hooks/useChangelog.js'
import { useTour } from '../hooks/useTour.js'
import WidgetShell from '../components/Widgets/Core/WidgetShell.jsx'
import { WorkspaceLabel } from '../components/Navigation/WorkspaceSwitcher.jsx'
import WidgetConfigModal from '../components/Modals/WidgetConfigModal.jsx'
import SaveErrorModal from '../components/Modals/SaveErrorModal.jsx'
import { renderWidgetContent } from '../components/Widgets/widgetRegistry.jsx'
import { useCircleReveal } from '../context/circleReveal.js'

const EASE_OUT = [0.23, 1, 0.32, 1]

function getGreeting(t) {
  const h = new Date().getHours()
  const key = h < 5 ? 'night' : h < 10 ? 'morning' : h < 13 ? 'midday' : h < 18 ? 'afternoon' : h < 22 ? 'evening' : 'latenight'
  const pool = t(`home.greetings.${key}`)
  return Array.isArray(pool) ? pool[Math.floor(Math.random() * pool.length)] : pool
}

function ProfileAvatar({ user, avatarUrl }) {
  const [imgError, setImgError] = useState(false)
  const initial = (user?.user_metadata?.display_name ?? user?.email ?? '?')[0].toUpperCase()

  if (avatarUrl && !imgError) {
    return (
      <img
        src={avatarUrl}
        alt=""
        onError={() => setImgError(true)}
        style={{ width: 56, height: 56, borderRadius: '50%', flexShrink: 0, objectFit: 'cover' }}
      />
    )
  }

  return (
    <div style={{
      width: 56,
      height: 56,
      borderRadius: '50%',
      background: 'linear-gradient(135deg, var(--accent), #8b5cf6)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      fontWeight: 700,
      fontSize: 22,
      flexShrink: 0,
    }}>
      {initial}
    </div>
  )
}

// Drag only starts from the handle icon (dragListener={false} + dragControls),
// so a tap/long-press anywhere else on the card never races the drag gesture.
function DraggableWidget({ widget: w, idx, widgetRef, isWiggleMode, widgetWidth, onDrag, onLongPress, onTap, children }) {
  const dragControls = useDragControls()

  return (
    <motion.div
      ref={widgetRef}
      layout
      drag={isWiggleMode}
      dragListener={false}
      dragControls={dragControls}
      dragSnapToOrigin
      dragMomentum={false}
      dragElastic={0.12}
      onDrag={onDrag}
      whileDrag={{ scale: 1.08, zIndex: 50, boxShadow: '0 24px 60px rgba(0,0,0,0.40)' }}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: idx * 0.04, duration: 0.22 }}
      style={{
        width: widgetWidth(w.size),
        flexShrink: 0,
        borderRadius: 22,
        touchAction: isWiggleMode ? 'none' : 'auto',
        cursor: isWiggleMode ? 'grab' : 'default',
      }}
    >
      <WidgetShell
        size={w.size}
        isWiggling={isWiggleMode}
        onLongPress={onLongPress}
        onTap={onTap}
        onDragStart={(e) => dragControls.start(e)}
        style={{ width: '100%' }}
      >
        {children}
      </WidgetShell>
    </motion.div>
  )
}

export default function HomeScreen() {
  const { user, avatarUrl } = useAuth()
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { triggerReveal } = useCircleReveal()
  const { t } = useLanguage()
  const { hasUnread } = useChangelog()
  const { hasSeenTour, markTourSeen } = useTour()
  const { dataLoading, setWidgetModalOpen } = useData()
  const {
    widgets,
    isWiggleMode,
    editingWidget,
    enterWiggleMode,
    exitWiggleMode,
    handleWidgetTap,
    addWidget,
    updateWidget,
    deleteWidget,
    reorderWidgets,
    canAddWidget,
    setEditingWidget,
  } = useWidgets()

  const [showAddWidget, setShowAddWidget] = useState(false)
  // Widget saves are optimistic (the sheet closes before the network write),
  // so a failure surfaces here. Retry re-sends the current widget list, which
  // already holds the optimistic change — safe for both add and edit.
  const [widgetSaveError, setWidgetSaveError] = useState(false)
  const { widgets: savedWidgets, updateWidgets: pushWidgets } = useData()
  const savedWidgetsRef = useRef(savedWidgets)
  savedWidgetsRef.current = savedWidgets
  const [localWidgets, setLocalWidgets] = useState([])
  const draggedRef = useRef(false)
  const bgPressTimer = useRef(null)
  const bgPointerDown = useRef(false)
  const widgetRefs = useRef({})

  const displayName = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? 'du'

  function widgetWidth(size) {
    // --nav-inset accounts for a vertical navbar rail (0 by default).
    return size === 'small'
      ? 'calc(50vw - 22px - var(--nav-inset, 0px) / 2)'
      : 'calc(100vw - 32px - var(--nav-inset, 0px))'
  }

  // Stable React key that survives position reassignment on save.
  // DB-loaded widgets always have `id` (uuid); brand-new ones get a client id from addWidget.
  function widgetKey(w) {
    return w.id ?? `pos-${w.position}`
  }

  // iOS-style drag: hit-test pointer against other widgets, swap order live.
  function handleDrag(draggedWidget, _event, info) {
    if (!isWiggleMode) return
    const x = info?.point?.x
    const y = info?.point?.y
    if (x == null || y == null) return

    const draggedKey = widgetKey(draggedWidget)
    let target = null
    for (const w of localWidgets) {
      if (widgetKey(w) === draggedKey) continue
      const el = widgetRefs.current[widgetKey(w)]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      // Hit zone: middle 60% to prevent oscillation when hovering on edges.
      const m = 0.2
      const hL = rect.left + rect.width * m
      const hR = rect.right - rect.width * m
      const hT = rect.top + rect.height * m
      const hB = rect.bottom - rect.height * m
      if (x >= hL && x <= hR && y >= hT && y <= hB) {
        target = w
        break
      }
    }
    if (!target) return

    const targetKey = widgetKey(target)
    const fromIdx = localWidgets.findIndex(w => widgetKey(w) === draggedKey)
    const toIdx = localWidgets.findIndex(w => widgetKey(w) === targetKey)
    if (fromIdx === toIdx || fromIdx === -1 || toIdx === -1) return

    draggedRef.current = true
    const newList = [...localWidgets]
    const [moved] = newList.splice(fromIdx, 1)
    newList.splice(toIdx, 0, moved)
    setLocalWidgets(newList)
  }

  // Sync flat sorted list from DB when not mid-drag
  useEffect(() => {
    if (!draggedRef.current) {
      setLocalWidgets([...widgets].sort((a, b) => a.position - b.position))
    }
  }, [widgets])

  // Save reordered positions when wiggle mode exits after a drag
  const prevWiggle = useRef(false)
  useEffect(() => {
    if (prevWiggle.current && !isWiggleMode && draggedRef.current) {
      draggedRef.current = false
      reorderWidgets(localWidgets)
    }
    prevWiggle.current = isWiggleMode
  }, [isWiggleMode])

  if (dataLoading) {
    return (
      <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
        <div style={{ padding: '20px 16px 0' }}>
          {/* Header skeleton */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
            <div>
              <div className="skeleton" style={{ width: 64, height: 12, borderRadius: 6, marginBottom: 8 }} />
              <div className="skeleton" style={{ width: 160, height: 28, borderRadius: 8 }} />
            </div>
            <div className="skeleton" style={{ width: 40, height: 40, borderRadius: '50%' }} />
          </div>
          {/* Widget skeletons */}
          <div className="skeleton" style={{ width: '100%', height: 164, borderRadius: 20, marginBottom: 12 }} />
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <div className="skeleton" style={{ flex: 1, height: 'calc(50vw - 22px - var(--nav-inset, 0px) / 2)', borderRadius: 20 }} />
            <div className="skeleton" style={{ flex: 1, height: 'calc(50vw - 22px - var(--nav-inset, 0px) / 2)', borderRadius: 20 }} />
          </div>
          <div className="skeleton" style={{ width: '100%', height: 164, borderRadius: 20 }} />
        </div>
      </div>
    )
  }

  function handleBgPointerDown(e) {
    if (isWiggleMode) return
    bgPointerDown.current = true
    bgPressTimer.current = setTimeout(() => {
      if (bgPointerDown.current) enterWiggleMode()
    }, 500)
  }
  function handleBgPointerUp() { bgPointerDown.current = false; clearTimeout(bgPressTimer.current) }

  return (
    <div
      className="scroll-container"
      style={{ background: 'var(--bg-primary)' }}
      onPointerDown={handleBgPointerDown}
      onPointerUp={handleBgPointerUp}
      onPointerLeave={handleBgPointerUp}
    >
      <div style={{ padding: '20px 16px 0' }}>

        {/* Header */}
        <div style={{ marginBottom: 24 }}>
          {/* Row 1: profile avatar + name (bold) + encouraging text (small, not bold),
              with the workspace picker (or "Fertig" while rearranging widgets) pinned
              to the top-right corner, level with the name/avatar. */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={() => { triggerReveal(() => { setDirection(1); navigate('/settings') }) }}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', borderRadius: '50%', position: 'relative', flexShrink: 0 }}
            >
              <ProfileAvatar user={user} avatarUrl={avatarUrl} />
              {hasUnread && (
                <span style={{
                  position: 'absolute',
                  top: 0,
                  right: 0,
                  width: 12,
                  height: 12,
                  borderRadius: '50%',
                  background: '#ef4444',
                  border: '2px solid var(--bg-primary)',
                  boxShadow: '0 0 6px rgba(239,68,68,0.6)',
                }} />
              )}
            </motion.button>
            <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', textAlign: 'left' }}>
              <h1 style={{ margin: 0, fontSize: 18, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayName} 👋
              </h1>
              <p style={{ margin: '2px 0 0', fontSize: 12, fontWeight: 400, color: 'var(--text-secondary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{getGreeting(t)}</p>
            </div>
            <AnimatePresence mode="popLayout" initial={false}>
              {!isWiggleMode ? (
                <motion.div
                  key="combobox"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.94 }}
                  transition={{ duration: 0.18, ease: EASE_OUT }}
                  style={{ flexShrink: 0, marginLeft: 'auto' }}
                >
                  <WorkspaceLabel />
                </motion.div>
              ) : (
                <motion.button
                  key="done-btn"
                  initial={{ opacity: 0, scale: 0.7 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.7 }}
                  transition={{ type: 'spring', damping: 18, stiffness: 300 }}
                  onClick={exitWiggleMode}
                  style={{
                    marginLeft: 'auto',
                    background: 'var(--accent)',
                    color: 'white',
                    border: 'none',
                    borderRadius: 12,
                    padding: '9px 18px',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: '0 4px 12px rgba(99,102,241,0.35)',
                    flexShrink: 0,
                  }}
                >
                  {t('home.done')}
                </motion.button>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* First-run walkthrough prompt — shown until the user opens or dismisses it */}
        <AnimatePresence initial={false}>
          {!hasSeenTour && !isWiggleMode && (
            <motion.div
              key="tour-banner"
              initial={{ opacity: 0, height: 0, y: -6 }}
              animate={{ opacity: 1, height: 'auto', y: 0 }}
              exit={{ opacity: 0, height: 0, y: -6 }}
              transition={{ duration: 0.28, ease: EASE_OUT }}
              style={{ overflow: 'hidden', marginBottom: 12 }}
            >
              <div style={{
                background: 'var(--glass-card-bg)',
                backdropFilter: 'blur(60px) saturate(200%)',
                WebkitBackdropFilter: 'blur(60px) saturate(200%)',
                border: '0.5px solid var(--glass-card-stroke)',
                boxShadow: 'var(--glass-card-shadow)',
                borderRadius: 18,
                padding: '16px 18px',
              }}>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.2 }}>
                  {t('home.tourBanner.title')}
                </div>
                <p style={{ margin: '5px 0 14px', fontSize: 13.5, lineHeight: 1.55, color: 'var(--text-secondary)' }}>
                  {t('home.tourBanner.body')}
                </p>
                <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => { triggerReveal(() => { setDirection(1); navigate('/settings/tour') }) }}
                    style={{
                      flex: 1, padding: '11px 16px', border: 'none', borderRadius: 12,
                      background: 'var(--accent)', color: 'white',
                      fontSize: 14, fontWeight: 700, cursor: 'pointer',
                    }}
                  >
                    {t('home.tourBanner.cta')}
                  </motion.button>
                  <motion.button
                    whileTap={{ scale: 0.95 }}
                    onClick={markTourSeen}
                    style={{
                      padding: '11px 14px', border: 'none', borderRadius: 12,
                      background: 'transparent', color: 'var(--text-secondary)',
                      fontSize: 14, fontWeight: 600, cursor: 'pointer',
                    }}
                  >
                    {t('home.tourBanner.dismiss')}
                  </motion.button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Wiggle hint strip */}
        <AnimatePresence>
          {isWiggleMode && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
              style={{ overflow: 'hidden', marginBottom: 12 }}
            >
              <div style={{
                background: 'var(--accent-muted)',
                border: '1px solid var(--accent)',
                borderRadius: 12,
                padding: '8px 14px',
                fontSize: 13,
                color: 'var(--accent)',
                fontWeight: 500,
                textAlign: 'center',
              }}>
                {t('home.editHint')}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Unified widget grid — same layout in normal & edit mode. In edit mode each widget is independently draggable (iOS-style). */}
        <LayoutGroup>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignContent: 'flex-start' }}>
            {localWidgets.map((w, idx) => (
              <DraggableWidget
                key={widgetKey(w)}
                widget={w}
                idx={idx}
                widgetRef={el => { widgetRefs.current[widgetKey(w)] = el }}
                isWiggleMode={isWiggleMode}
                widgetWidth={widgetWidth}
                onDrag={(e, info) => handleDrag(w, e, info)}
                onLongPress={enterWiggleMode}
                onTap={() => { handleWidgetTap(w); if (isWiggleMode) setWidgetModalOpen(true) }}
              >
                {renderWidgetContent(w, w.size)}
              </DraggableWidget>
            ))}
          </div>
        </LayoutGroup>

          {/* Add widget placeholder — only visible in wiggle mode */}
          {canAddWidget && isWiggleMode && (
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={() => { setShowAddWidget(true); setWidgetModalOpen(true) }}
              style={{
                width: '100%',
                height: 80,
                borderRadius: 20,
                border: '2px dashed var(--accent)',
                background: 'var(--accent-muted)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                color: 'var(--accent)',
                fontSize: 14,
                fontWeight: 600,
                marginTop: 12,
              }}
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--accent)">
                <path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              {t('home.addWidget')}
            </motion.button>
          )}
      </div>

      {/* Edit modal — shown when tapping a widget in wiggle mode */}
      <AnimatePresence
        onExitComplete={() => { if (!showAddWidget) setWidgetModalOpen(false) }}
      >
        {editingWidget && (
          <WidgetConfigModal
            widget={editingWidget}
            onSave={async (cfg) => {
              try {
                await updateWidget(editingWidget.position, cfg)
              } catch (e) {
                console.error('Widget save failed:', e)
                setWidgetSaveError(true)
              }
              setEditingWidget(null)
            }}
            onDelete={async () => {
              await deleteWidget(editingWidget.position)
              setEditingWidget(null)
            }}
            onClose={() => { setEditingWidget(null); setWidgetModalOpen(false) }}
          />
        )}
      </AnimatePresence>

      {/* Add new widget modal */}
      <AnimatePresence
        onExitComplete={() => { if (!editingWidget) setWidgetModalOpen(false) }}
      >
        {showAddWidget && (
          <WidgetConfigModal
            widget={null}
            onSave={async (cfg) => {
              try {
                await addWidget(cfg)
              } catch (e) {
                console.error('Widget save failed:', e)
                setWidgetSaveError(true)
              }
              setShowAddWidget(false)
            }}
            onClose={() => { setShowAddWidget(false); setWidgetModalOpen(false) }}
          />
        )}
      </AnimatePresence>

      {/* Background widget save failed */}
      <AnimatePresence>
        {widgetSaveError && (
          <SaveErrorModal
            onRetry={() => pushWidgets(savedWidgetsRef.current)}
            onClose={() => setWidgetSaveError(false)}
          />
        )}
      </AnimatePresence>

    </div>
  )
}
