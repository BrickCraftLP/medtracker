import { useState, useRef, useEffect, useContext } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { NavDirectionContext } from '../context/navDirection.js'
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion'
import { useData } from '../context/DataContext.jsx'
import { useSession } from '../hooks/useSession.js'
import { useLanguage } from '../context/LanguageContext.jsx'
import TopicEditModal from '../components/Modals/TopicEditModal.jsx'

// Card dimensions match the small widget: 2 cols, 16px side padding, 12px gap
// --nav-inset accounts for a vertical navbar rail (0 with the bottom bar).
const CARD_SIZE = 'calc(50vw - 22px - var(--nav-inset, 0px) / 2)'

function TopicCard({ topic, isWiggling, onPress, onLongPress }) {
  const pressTimer = useRef(null)
  const didLongPress = useRef(false)
  const pointerDown = useRef(false)

  function handlePointerDown() {
    if (isWiggling) return
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
    if (isWiggling) return
    if (!didLongPress.current) onPress?.()
  }

  return (
    <motion.div
      animate={isWiggling ? { rotate: [-1.5, 1.5] } : { rotate: 0 }}
      transition={isWiggling
        ? { repeat: Infinity, repeatType: 'mirror', duration: 0.25 }
        : { duration: 0.2 }
      }
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerLeave}
      onClick={handleClick}
      style={{
        width: CARD_SIZE,
        height: CARD_SIZE,
        borderRadius: 22,
        overflow: 'hidden',
        background: `linear-gradient(145deg, ${topic.color_from}55 0%, ${topic.color_from}18 58%, ${topic.color_to}38 100%)`,
        backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
        WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
        border: isWiggling
          ? `1px solid var(--accent)`
          : `0.5px solid ${topic.color_from}55`,
        boxShadow: isWiggling
          ? `0 0 0 4px var(--accent-muted), 0 4px 20px ${topic.color_from}30`
          : `0 0 0 0.5px rgba(255,255,255,0.18) inset, 0 2px 0 rgba(255,255,255,0.28) inset, 0 4px 20px ${topic.color_from}28`,
        cursor: 'pointer',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        userSelect: 'none',
        WebkitUserSelect: 'none',
        transition: 'border-color 0.18s, box-shadow 0.18s',
      }}
    >
      {/* Emoji — top-left */}
      <div style={{ padding: '13px 13px 0' }}>
        <span style={{
          fontSize: 40,
          lineHeight: 1,
          filter: 'drop-shadow(0 2px 6px rgba(0,0,0,0.18))',
        }}>{topic.emoji}</span>
      </div>

      {/* Text body */}
      <div style={{
        flex: 1,
        minHeight: 0,
        padding: '8px 13px 13px',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'flex-end',
        overflow: 'hidden',
      }}>
        <div style={{
          fontWeight: 700,
          fontSize: 14,
          color: 'var(--text-primary)',
          letterSpacing: -0.3,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {topic.name}
        </div>
        {topic.description ? (
          <div style={{
            fontSize: 11,
            color: 'var(--text-secondary)',
            marginTop: 3,
            overflow: 'hidden',
            display: '-webkit-box',
            WebkitLineClamp: 2,
            WebkitBoxOrient: 'vertical',
            lineHeight: 1.35,
          }}>
            {topic.description}
          </div>
        ) : null}
      </div>

      {/* Edit badge */}
      {isWiggling && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 26, height: 26, borderRadius: '50%',
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 10,
            boxShadow: '0 2px 8px rgba(0,0,0,0.22)',
          }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="white">
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
            position: 'absolute', bottom: 8, right: 8,
            zIndex: 10,
            display: 'flex', flexDirection: 'column', gap: 2.5, padding: 4,
          }}
        >
          {[0,1,2].map(i => (
            <div key={i} style={{ width: 14, height: 2, borderRadius: 1, background: 'var(--text-tertiary)' }} />
          ))}
        </motion.div>
      )}

      {/* Intercept child clicks in wiggle mode */}
      {isWiggling && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 9, cursor: 'pointer' }} />
      )}
    </motion.div>
  )
}


export default function TopicsScreen() {
  const { topics, dataLoading, upsertTopic } = useData()
  const { startSession } = useSession()
  const navigate = useNavigate()
  const location = useLocation()
  const { setDirection } = useContext(NavDirectionContext)
  const { t } = useLanguage()
  const isSelectMode = location.state?.selectForSession

  const [isWiggling, setIsWiggling] = useState(false)
  const [editTopic, setEditTopic] = useState(null)
  const [showAddTopic, setShowAddTopic] = useState(false)
  const [localTopics, setLocalTopics] = useState([])
  const draggedRef = useRef(false)
  const bgPressTimer = useRef(null)
  const bgPointerDown = useRef(false)
  const topicRefs = useRef({})

  function handleDrag(draggedTopic, _event, info) {
    if (!isWiggling) return
    const x = info?.point?.x
    const y = info?.point?.y
    if (x == null || y == null) return

    let target = null
    for (const t of localTopics) {
      if (t.id === draggedTopic.id) continue
      const el = topicRefs.current[t.id]
      if (!el) continue
      const rect = el.getBoundingClientRect()
      const m = 0.2
      const hL = rect.left + rect.width * m
      const hR = rect.right - rect.width * m
      const hT = rect.top + rect.height * m
      const hB = rect.bottom - rect.height * m
      if (x >= hL && x <= hR && y >= hT && y <= hB) {
        target = t
        break
      }
    }
    if (!target) return

    const fromIdx = localTopics.findIndex(t => t.id === draggedTopic.id)
    const toIdx = localTopics.findIndex(t => t.id === target.id)
    if (fromIdx === toIdx || fromIdx === -1 || toIdx === -1) return

    draggedRef.current = true
    const newList = [...localTopics]
    const [moved] = newList.splice(fromIdx, 1)
    newList.splice(toIdx, 0, moved)
    setLocalTopics(newList)
  }

  useEffect(() => {
    if (!draggedRef.current) {
      const sorted = [...topics].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0))
      setLocalTopics(sorted)
    }
  }, [topics])

  // Save reordered display_order when wiggle mode exits after a drag
  const prevWiggle = useRef(false)
  useEffect(() => {
    if (prevWiggle.current && !isWiggling && draggedRef.current) {
      draggedRef.current = false
      localTopics.forEach((t, i) => {
        if ((t.display_order ?? 0) !== i) upsertTopic({ ...t, display_order: i })
      })
    }
    prevWiggle.current = isWiggling
  }, [isWiggling])

  if (dataLoading) {
    return (
      <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
        <div style={{ padding: '20px 16px 0' }}>
          <div className="skeleton" style={{ width: 100, height: 28, borderRadius: 8, marginBottom: 24 }} />
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 12 }}>
            {[0, 1, 2, 3, 4, 5].map(i => (
              <div key={i} className="skeleton" style={{ borderRadius: 22, height: CARD_SIZE }} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  function handleTopicPress(topic) {
    if (isWiggling) {
      setEditTopic(topic)
      return
    }
    if (isSelectMode) {
      startSession(topic.id)
      navigate('/session', { state: { topicId: topic.id } })
      return
    }
    setDirection(1)
    navigate('/topic-stats', { state: { topicId: topic.id } })
  }

  function handleBgPointerDown(e) {
    if (isWiggling || isSelectMode) return
    bgPointerDown.current = true
    bgPressTimer.current = setTimeout(() => {
      if (bgPointerDown.current) setIsWiggling(true)
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
          <h1 style={{ margin: 0, fontSize: 26, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
            {isSelectMode ? t('topics.selectTitle') : t('topics.title')}
          </h1>
          <AnimatePresence mode="wait">
            {!isSelectMode && isWiggling && (
              <motion.button
                key="done"
                initial={{ opacity: 0, scale: 0.7 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.7 }}
                transition={{ type: 'spring', damping: 18, stiffness: 300 }}
                whileTap={{ scale: 0.88 }}
                onClick={() => setIsWiggling(false)}
                style={{
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '8px 14px',
                  fontSize: 14,
                  fontWeight: 600,
                  color: 'white',
                  cursor: 'pointer',
                }}
              >
                {t('btn.done')}
              </motion.button>
            )}
          </AnimatePresence>
        </div>

        {/* Wiggle hint strip */}
        <AnimatePresence>
          {isWiggling && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
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
                {t('topics.editHint')}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Unified topic grid — same layout in normal & wiggle mode */}
        <LayoutGroup>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignContent: 'flex-start' }}>
            {localTopics.map((topic, idx) => (
              <motion.div
                key={topic.id}
                ref={el => { topicRefs.current[topic.id] = el }}
                layout
                drag={isWiggling}
                dragSnapToOrigin
                dragMomentum={false}
                dragElastic={0.12}
                onDrag={(e, info) => handleDrag(topic, e, info)}
                onTap={() => { if (isWiggling) setEditTopic(topic) }}
                whileDrag={{ scale: 1.08, zIndex: 50, boxShadow: '0 24px 60px rgba(0,0,0,0.40)' }}
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: idx * 0.04, duration: 0.2 }}
                style={{
                  width: CARD_SIZE,
                  flexShrink: 0,
                  borderRadius: 22,
                  touchAction: isWiggling ? 'none' : 'auto',
                  cursor: isWiggling ? 'grab' : 'default',
                }}
              >
                <TopicCard
                  topic={topic}
                  isWiggling={isWiggling}
                  onPress={() => handleTopicPress(topic)}
                  onLongPress={() => setIsWiggling(true)}
                />
              </motion.div>
            ))}
          </div>
        </LayoutGroup>

        {localTopics.length === 0 && (
          <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary)' }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>📚</div>
            <div style={{ fontSize: 16, fontWeight: 600 }}>{t('topics.empty')}</div>
            <div style={{ fontSize: 13, marginTop: 4 }}>{t('topics.emptyHint')}</div>
          </div>
        )}

        {/* Add new topic button — only visible in wiggle mode */}
        <AnimatePresence>
          {isWiggling && (
            <motion.button
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              whileTap={{ scale: 0.96 }}
              onClick={() => setShowAddTopic(true)}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 14,
                border: '2px dashed var(--accent)',
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                fontSize: 15,
                fontWeight: 600,
                cursor: 'pointer',
                marginTop: 16,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
              }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="var(--accent)">
                <path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z"/>
              </svg>
              {t('topics.addNew')}
            </motion.button>
          )}
        </AnimatePresence>
      </div>

      <AnimatePresence>
        {editTopic && (
          <TopicEditModal topic={editTopic} onClose={() => setEditTopic(null)} />
        )}
        {showAddTopic && (
          <TopicEditModal topic={null} onClose={() => setShowAddTopic(false)} />
        )}
      </AnimatePresence>
    </div>
  )
}
