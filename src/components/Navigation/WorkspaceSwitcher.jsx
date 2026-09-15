import { useState, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { useCircleReveal } from '../../context/circleReveal.js'
import { useWorkspace } from '../../context/WorkspaceContext.jsx'
import { useData } from '../../context/DataContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import NavPopover, { PopoverRow } from './NavPopover.jsx'

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

export default function WorkspaceSwitcher() {
  const [isOpen, setIsOpen] = useState(false)
  const buttonRef = useRef(null)
  const navigate = useNavigate()
  const { triggerReveal } = useCircleReveal()
  const { canAddWorkspace, switchWorkspace } = useWorkspace()
  const { t } = useLanguage()
  const { items, active, activeWorkspaceId } = useWorkspaceItems()

  const close = useCallback(() => setIsOpen(false), [])

  function select(value) {
    switchWorkspace(value)
    close()
  }

  function edit(value) {
    close()
    triggerReveal(() => navigate(`/workspaces/${value}/edit`))
  }

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
        <span style={{
          position: 'absolute', top: 3, right: 3,
          padding: 1.5, borderRadius: '50%', background: 'var(--bg-primary)',
          display: 'flex',
        }}>
          <SyncStatusDot size={7} />
        </span>
      </motion.button>

      <AnimatePresence>
        {isOpen && (
          <NavPopover
            key="ws-switcher"
            anchorRef={buttonRef}
            rowCount={items.length + (canAddWorkspace ? 1 : 0)}
            onClose={close}
          >
            {items.map(item => {
              const isSelected = item.value === activeWorkspaceId
              return (
                <PopoverRow
                  key={item.value}
                  icon={<ItemIcon icon={item.icon} color={item.color} />}
                  color={item.color}
                  label={item.label}
                  detail={item.detail}
                  selected={isSelected}
                  onClick={() => select(item.value)}
                  trailing={<>
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
                  </>}
                />
              )
            })}

            {canAddWorkspace && (
              <PopoverRow
                icon={<ItemIcon icon="plus" />}
                color="var(--accent)"
                label={t('workspace.add')}
                labelColor="var(--accent)"
                onClick={() => { close(); triggerReveal(() => navigate('/workspaces/new')) }}
              />
            )}
          </NavPopover>
        )}
      </AnimatePresence>
    </>
  )
}
