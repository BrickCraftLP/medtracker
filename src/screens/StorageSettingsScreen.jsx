import { useState, useRef, useContext, useEffect, useLayoutEffect, useId, useCallback, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { NavDirectionContext } from '../context/navDirection.js'
import { motion, useReducedMotion } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import {
  getTopics, getAllSessions, getAllExercises,
  getTodos, getWidgetConfigs,
} from '../services/dbInterface.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import { GlassCard } from '../components/Common/Glass.jsx'

function byteSize(arr) {
  return JSON.stringify(arr ?? []).length
}

function formatBytes(bytes) {
  if (!bytes) return '0 KB'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

const STORAGE_CATEGORIES = [
  { key: 'topics',    color: '#3b82f6' },
  { key: 'sessions',  color: '#22c55e' },
  { key: 'exercises', color: '#f59e0b' },
  { key: 'todos',     color: '#a855f7' },
  { key: 'widgets',   color: '#ef4444' },
]

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 16px 6px' }}>
        {title}
      </p>
      <GlassCard cornerRadius={16} style={{ overflow: 'hidden' }}>{children}</GlassCard>
    </div>
  )
}

function StorageBar({ breakdown, total }) {
  return (
    <div style={{ display: 'flex', width: '100%', height: 10, borderRadius: 5, overflow: 'hidden', background: 'var(--bg-tertiary)' }}>
      {STORAGE_CATEGORIES.map(({ key, color }) => {
        const bytes = breakdown[key] ?? 0
        const pct = total > 0 ? (bytes / total) * 100 : 0
        if (pct <= 0) return null
        return (
          <motion.div
            key={key}
            initial={{ flexBasis: 0 }}
            animate={{ flexBasis: `${pct}%` }}
            transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
            style={{ flexGrow: 0, flexShrink: 0, background: color, height: '100%' }}
          />
        )
      })}
    </div>
  )
}

function StorageLegendRow({ color, label, size, divider = true }) {
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', padding: '11px 16px', gap: 10 }}>
        <span style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: 'var(--text-primary)' }}>{label}</span>
        <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{size}</span>
      </div>
      {divider && <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />}
    </>
  )
}

// ── Spring transitions, ported verbatim from the main settings accordion ──
const EASE_OUT = [0.16, 1, 0.3, 1]
const CONTENT_OPEN_TRANSITION = { type: 'spring', duration: 0.88, bounce: 0.16 }
const CONTENT_CLOSE_TRANSITION = { type: 'spring', duration: 0.70, bounce: 0.12 }
const DESCRIPTION_TRANSITION = { duration: 0.32, ease: EASE_OUT }
const CHEVRON_TRANSITION = { type: 'spring', duration: 0.65, bounce: 0.14 }

const ICON_TIP = <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7z"/></svg>
const ICON_INFO = <svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M11 7h2v2h-2V7zm0 4h2v6h-2v-6zm1-9C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8z"/></svg>

// Same "bouncy accordion" engine as the main Settings screen — the open item
// detaches into its own floating glass card, closed items fuse together.
function FaqAccordionRow({ item, open, startsGroup, endsGroup, separatedFromPrevious, contentId, triggerId, reduce, onToggle }) {
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
            <span style={{ fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', display: 'block', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {item.title}
            </span>
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

function FaqAccordion({ items, value, onValueChange }) {
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
          <FaqAccordionRow
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

export default function StorageSettingsScreen() {
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { user } = useAuth()
  const { t } = useLanguage()

  const [storage, setStorage] = useState(null)
  const [openFaqId, setOpenFaqId] = useState(null)

  const faqItems = useMemo(() => [
    {
      id: 'why',
      title: t('settings.storageFaq.why.title'),
      icon: ICON_INFO,
      content: (
        <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>
          {t('settings.storageFaq.why.desc')}
        </p>
      ),
    },
    {
      id: 'reduce',
      title: t('settings.storageFaq.reduce.title'),
      icon: ICON_TIP,
      content: (
        <ul style={{ margin: 0, paddingLeft: 18, display: 'flex', flexDirection: 'column', gap: 6 }}>
          {[
            t('settings.storageFaq.reduce.tip1'),
            t('settings.storageFaq.reduce.tip2'),
            t('settings.storageFaq.reduce.tip3'),
            t('settings.storageFaq.reduce.tip4'),
          ].map((tip, i) => (
            <li key={i} style={{ fontSize: 13, lineHeight: 1.5, color: 'var(--text-secondary)' }}>{tip}</li>
          ))}
        </ul>
      ),
    },
  ], [t])

  useEffect(() => {
    if (!user?.id) return
    let cancelled = false
    Promise.all([
      getTopics(user.id), getAllSessions(user.id), getAllExercises(user.id),
      getTodos(user.id), getWidgetConfigs(user.id),
    ]).then(([topics, sessions, exercises, todos, widgets]) => {
      if (cancelled) return
      const breakdown = {
        topics: byteSize(topics), sessions: byteSize(sessions), exercises: byteSize(exercises),
        todos: byteSize(todos), widgets: byteSize(widgets),
      }
      const total = Object.values(breakdown).reduce((a, b) => a + b, 0)
      setStorage({ breakdown, total })
    }).catch(e => console.error(e))
    return () => { cancelled = true }
  }, [user?.id])

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 60px' }}>

        {/* Back button */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => { setDirection(-1); navigate(-1) }}
          style={{
            background: 'rgba(0,0,0,0.18)',
            backdropFilter: 'blur(20px)',
            WebkitBackdropFilter: 'blur(20px)',
            border: '0.5px solid rgba(255,255,255,0.22)',
            borderRadius: 10,
            padding: '7px 12px',
            color: 'white',
            fontSize: 14,
            fontWeight: 600,
            cursor: 'pointer',
            marginBottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white">
            <path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/>
          </svg>
          {t('btn.back')}
        </motion.button>

        <h1 style={{ margin: '0 0 30px', fontSize: 34, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          {t('settings.storage')}
        </h1>

        <Section title={t('settings.storage')}>
          <div style={{ padding: '14px 16px 16px' }}>
            <p style={{ margin: '0 0 10px', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)' }}>
              {storage ? t('settings.storageUsed', { size: formatBytes(storage.total) }) : t('settings.storageLoading')}
            </p>
            <StorageBar breakdown={storage?.breakdown ?? {}} total={storage?.total ?? 0} />
          </div>
          <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />
          {STORAGE_CATEGORIES.map(({ key, color }, i) => (
            <StorageLegendRow
              key={key}
              color={color}
              label={t(`settings.${key}`)}
              size={formatBytes(storage?.breakdown?.[key] ?? 0)}
              divider={i < STORAGE_CATEGORIES.length - 1}
            />
          ))}
        </Section>

        <div style={{ marginBottom: 32 }}>
          <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 16px 6px' }}>
            {t('settings.storageFaq')}
          </p>
          <FaqAccordion items={faqItems} value={openFaqId} onValueChange={setOpenFaqId} />
        </div>

      </div>
    </div>
  )
}
