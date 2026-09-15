import { useState, useRef, useEffect, useMemo } from 'react'
import { motion, AnimatePresence, useMotionValue, useTransform, animate } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useData } from '../../../context/DataContext.jsx'
import { todoSwipeActive } from '../../../utils/gestureState.js'
import { useLanguage } from '../../../context/LanguageContext.jsx'
import {
  PRIORITY_COLORS, PRIORITY_KEYS, localDayKey, addDaysKey, shortTime,
  calcTopicUrgency, effectivePriority, dueStatus, sortTodos, buildTodo,
} from '../../../utils/calculations/todoPriorityCalcs.js'

const REVEAL = 58
const FULL   = 160

function SwipeDeleteTodo({ children, onDelete, onLongPress }) {
  const x          = useMotionValue(0)
  const isDragging = useRef(false)
  const startX     = useRef(null)
  const [gone, setGone] = useState(false)
  const lastMoveX  = useRef(null)
  const lastMoveT  = useRef(null)
  const velocity   = useRef(0)
  const minX       = useRef(0)
  const longPressTimer = useRef(null)

  const zoneOpacity  = useTransform(x, [-(REVEAL * 0.3), 0], [1, 0])
  const redOverlay   = useTransform(x, [-FULL, -REVEAL, 0], [0.85, 0, 0])
  const trashOpacity = useTransform(x, [-REVEAL, -(REVEAL * 0.6)], [1, 0])

  async function triggerDelete() {
    await animate(x, -400, { duration: 0.18, ease: [0.4, 0, 1, 1] })
    setGone(true)
    setTimeout(onDelete, 120)
  }

  function gestureStart(clientX) {
    startX.current = clientX
    isDragging.current = false
    minX.current = 0
    velocity.current = 0
    lastMoveX.current = null
    lastMoveT.current = null
    longPressTimer.current = setTimeout(() => {
      startX.current = null   // cancel any swipe after long-press fires
      onLongPress?.()
    }, 500)
  }

  function gestureMove(clientX) {
    if (startX.current === null) return
    const dx = clientX - startX.current
    if (!isDragging.current && Math.abs(dx) > 6) {
      clearTimeout(longPressTimer.current)  // swipe started — cancel long-press
      isDragging.current = true
      todoSwipeActive.current = true
    }
    if (isDragging.current) {
      const newX = Math.max(Math.min(dx, 0), -FULL)
      x.set(newX)
      if (newX < minX.current) minX.current = newX
      const now = Date.now()
      if (lastMoveX.current !== null) {
        const dt = now - lastMoveT.current
        if (dt > 0) velocity.current = (clientX - lastMoveX.current) / dt * 1000
      }
      lastMoveX.current = clientX
      lastMoveT.current = now
    }
  }

  function gestureEnd() {
    clearTimeout(longPressTimer.current)
    setTimeout(() => { todoSwipeActive.current = false }, 80)
    if (!isDragging.current) { startX.current = null; return }
    isDragging.current = false
    startX.current = null
    const vel = velocity.current
    velocity.current = 0
    lastMoveX.current = null
    lastMoveT.current = null
    const cur = minX.current
    minX.current = 0
    if (cur < -(FULL * 0.55) || vel < -400) {
      triggerDelete()
    } else if (x.get() < -(REVEAL * 0.5)) {
      animate(x, -REVEAL, { type: 'spring', stiffness: 400, damping: 38 })
    } else {
      animate(x, 0, { type: 'spring', stiffness: 400, damping: 38 })
    }
  }

  function gestureCancel() {
    clearTimeout(longPressTimer.current)
    todoSwipeActive.current = false
    isDragging.current = false
    startX.current = null
    minX.current = 0
    animate(x, 0, { type: 'spring', stiffness: 400, damping: 38 })
  }

  // Touch events — primary path on iOS/mobile (reliable, no setPointerCapture quirks)
  // closest(): taps on an icon/label inside a button count as the button.
  function isInteractive(e) {
    return !!e.target?.closest?.('button, input, textarea, a, select')
  }

  function handleTouchStart(e) {
    if (isInteractive(e)) return  // let button/checkbox handle their own tap
    e.stopPropagation()
    gestureStart(e.touches[0].clientX)
  }
  function handleTouchMove(e) { gestureMove(e.touches[0].clientX) }
  function handleTouchEnd()   { gestureEnd() }
  function handleTouchCancel(){ gestureCancel() }

  // Pointer events — mouse only (skip touch-generated pointer events to avoid double-handling)
  function handlePointerDown(e) {
    if (isInteractive(e)) return  // let button/checkbox handle their own click
    e.stopPropagation()  // stop so WidgetShell long-press never fires on swipe
    if (e.pointerType === 'touch') return
    e.currentTarget.setPointerCapture(e.pointerId)
    gestureStart(e.clientX)
  }
  function handlePointerMove(e) { if (e.pointerType !== 'touch') gestureMove(e.clientX) }
  function handlePointerUp(e)   { if (e.pointerType !== 'touch') gestureEnd() }

  if (gone) return null

  return (
    <div
      style={{ position: 'relative', overflow: 'hidden', touchAction: 'pan-y' }}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onTouchCancel={handleTouchCancel}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
    >
      {/* Delete zone */}
      <motion.div style={{
        position: 'absolute', right: 0, top: 0, bottom: 0, width: REVEAL,
        background: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center',
        opacity: zoneOpacity,
      }}>
        <motion.div style={{ opacity: trashOpacity, pointerEvents: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="white">
            <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/>
          </svg>
        </motion.div>
        <button onClick={triggerDelete} style={{ position: 'absolute', inset: 0, background: 'transparent', border: 'none', cursor: 'pointer' }} />
      </motion.div>

      {/* Red full-swipe overlay */}
      <motion.div style={{ position: 'absolute', inset: 0, background: '#ef4444', opacity: redOverlay, pointerEvents: 'none', zIndex: 2 }} />

      {/* Sliding content */}
      <motion.div style={{ x, position: 'relative', zIndex: 1 }}>
        {children}
      </motion.div>
    </div>
  )
}

// ── Icons (currentColor so the toolbar can tint them) ───────────────────────
const ICON_FLAG  = <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M14.4 6L14 4H5v17h2v-7h5.6l.4 2h7V6z"/></svg>
const ICON_CAL   = <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M19 4h-1V2h-2v2H8V2H6v2H5a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2V6a2 2 0 00-2-2zm0 16H5V10h14v10z"/></svg>
const ICON_CLOCK = <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a10 10 0 100 20 10 10 0 000-20zm0 18a8 8 0 110-16 8 8 0 010 16zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>
const ICON_TAG   = <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M21.41 11.58l-9-9A2 2 0 0011 2H4a2 2 0 00-2 2v7c0 .55.22 1.05.59 1.42l9 9a2 2 0 002.82 0l7-7a2 2 0 000-2.84zM5.5 7A1.5 1.5 0 117 5.5 1.5 1.5 0 015.5 7z"/></svg>
const ICON_ARROW = <svg width="14" height="14" viewBox="0 0 24 24" fill="white"><path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/></svg>

const TIME_PRESETS = ['08:00', '12:00', '16:00', '20:00']

const stopGesture = e => e.stopPropagation()  // keep WidgetShell long-press out of the editor

function formatShortDate(key, language) {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d).toLocaleDateString(language === 'de' ? 'de-DE' : 'en-US', { day: 'numeric', month: 'short' })
}

// compact (small widget): today's todos show just the time, others just the day.
function DueBadge({ status, date, time, t, language, compact }) {
  const color = status === 'overdue' ? '#ef4444' : status === 'today' ? '#f59e0b' : 'var(--text-secondary)'
  const label = ['overdue', 'today', 'tomorrow'].includes(status)
    ? t(`widget.todo.due.${status}`)
    : formatShortDate(date, language)
  const text = compact
    ? (status === 'today' && time ? shortTime(time) : label)
    : `${label}${time ? ` · ${shortTime(time)}` : ''}`
  return (
    <span
      title={`${formatShortDate(date, language)}${time ? ` ${shortTime(time)}` : ''}`}
      style={{ fontSize: 9, fontWeight: 600, color, display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}
    >
      {time ? ICON_CLOCK : ICON_CAL}
      {text}
    </span>
  )
}

// compact (small widget): emoji only, full name in the tooltip.
function TopicChip({ topic, onOpen, compact }) {
  return (
    <button
      title={topic.name}
      onClick={e => { e.stopPropagation(); onOpen() }}
      style={{
        fontSize: 9, lineHeight: 1.4, padding: compact ? '0 4px' : '1px 6px', borderRadius: 20, minWidth: 0,
        border: `1px solid ${topic.color_from}`, background: `${topic.color_from}18`,
        color: 'var(--text-primary)', cursor: 'pointer', fontFamily: 'inherit',
        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '100%',
      }}
    >
      {compact ? topic.emoji : `${topic.emoji} ${topic.name}`}
    </button>
  )
}

function pillStyle(active, color) {
  return {
    padding: '4px 9px', borderRadius: 20, fontSize: 10, fontWeight: 600, lineHeight: 1.3,
    fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
    border: `1.5px solid ${active ? (color ?? 'var(--accent)') : 'var(--border)'}`,
    background: active ? (color ? `${color}22` : 'var(--accent-muted)') : 'var(--card-bg)',
    color: active && color ? color : active ? 'var(--accent)' : 'var(--text-secondary)',
  }
}

const fieldStyle = {
  fontSize: 11, padding: '3px 8px', borderRadius: 20, fontFamily: 'inherit',
  border: '1.5px solid var(--border)', background: 'var(--card-bg)', color: 'var(--text-primary)',
  minWidth: 0,
}

// Toolbar of priority / date / time / topic. Each tool shows its current value
// and opens one picker panel at a time. Shared by the composer and inline edit.
// compact (small): icon-only tools · full (large): extra quick picks.
function TodoMetaEditor({ value, onChange, topics, compact, full, t, language, today, trailing }) {
  const [panel, setPanel] = useState(null)
  const tomorrow = addDaysKey(1)
  const nextWeek = addDaysKey(7)
  const topic = topics.find(tp => tp.id === value.topic_id)

  const dateLabel = !value.due_date ? null
    : value.due_date === today    ? t('widget.todo.due.today')
    : value.due_date === tomorrow ? t('widget.todo.due.tomorrow')
    : formatShortDate(value.due_date, language)

  const tools = [
    { id: 'priority', icon: ICON_FLAG, title: t('widget.todo.priority'),
      label: value.priority ? t(`widget.todo.priority.${PRIORITY_KEYS[value.priority]}`) : null,
      color: value.priority ? PRIORITY_COLORS[value.priority] : null },
    { id: 'date', icon: ICON_CAL, title: t('widget.todo.due'), label: dateLabel },
    { id: 'time', icon: ICON_CLOCK, title: t('widget.todo.time'), label: value.due_time },
    ...(topics.length ? [{ id: 'topic', icon: ICON_TAG, title: t('widget.todo.topic'),
      label: topic ? `${topic.emoji} ${topic.name}` : null, color: topic?.color_from }] : []),
  ]

  // Picking a time implies a date — default to today rather than dropping it.
  const setTime = time => onChange({ due_time: time, ...(time && !value.due_date ? { due_date: today } : {}) })
  const customDate = value.due_date && ![today, tomorrow, ...(full ? [nextWeek] : [])].includes(value.due_date)

  return (
    <div onPointerDown={stopGesture} onTouchStart={stopGesture}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <div style={{ display: 'flex', gap: 4, overflowX: 'auto', flex: 1, minWidth: 0, scrollbarWidth: 'none' }}>
          {tools.map(tool => {
            const active = panel === tool.id
            const set = !!tool.label
            return (
              <motion.button
                key={tool.id}
                type="button"
                whileTap={{ scale: 0.92 }}
                title={tool.title}
                onClick={() => setPanel(p => (p === tool.id ? null : tool.id))}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0,
                  height: 24, padding: set && !compact ? '0 8px' : '0 7px', borderRadius: 8,
                  fontSize: 10, fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', whiteSpace: 'nowrap',
                  border: `1px solid ${active ? 'var(--accent)' : set ? (tool.color ?? 'var(--accent)') : 'var(--border)'}`,
                  background: set ? (tool.color ? `${tool.color}1f` : 'var(--accent-muted)') : 'transparent',
                  color: set ? (tool.color && tool.id === 'priority' ? tool.color : 'var(--text-primary)') : 'var(--text-tertiary)',
                  maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis',
                }}
              >
                {tool.icon}
                {set && !compact && <span style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{tool.label}</span>}
              </motion.button>
            )
          })}
        </div>
        {trailing}
      </div>

      <AnimatePresence initial={false} mode="wait">
        {panel && (
          <motion.div
            key={panel}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.16 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 4, paddingTop: 8 }}>
              {panel === 'priority' && [null, 1, 2, 3].map(level => (
                <button key={level ?? 0} type="button"
                  onClick={() => { onChange({ priority: level }); setPanel(null) }}
                  style={pillStyle(value.priority === level, level ? PRIORITY_COLORS[level] : undefined)}>
                  {t(`widget.todo.priority.${PRIORITY_KEYS[level ?? 0]}`)}
                </button>
              ))}

              {panel === 'date' && (
                <>
                  <button type="button" onClick={() => onChange({ due_date: today })} style={pillStyle(value.due_date === today)}>{t('widget.todo.due.today')}</button>
                  <button type="button" onClick={() => onChange({ due_date: tomorrow })} style={pillStyle(value.due_date === tomorrow)}>{t('widget.todo.due.tomorrow')}</button>
                  {full && (
                    <button type="button" onClick={() => onChange({ due_date: nextWeek })} style={pillStyle(value.due_date === nextWeek)}>{t('widget.todo.due.nextWeek')}</button>
                  )}
                  <input
                    type="date"
                    aria-label={t('widget.todo.due.pick')}
                    value={customDate ? value.due_date : ''}
                    onChange={e => onChange(e.target.value ? { due_date: e.target.value } : { due_date: null, due_time: null })}
                    style={{ ...fieldStyle, width: 118, borderColor: customDate ? 'var(--accent)' : 'var(--border)' }}
                  />
                  {value.due_date && (
                    <button type="button" onClick={() => onChange({ due_date: null, due_time: null })} style={pillStyle(false)}>{t('widget.todo.due.none')}</button>
                  )}
                </>
              )}

              {panel === 'time' && (
                <>
                  <input
                    type="time"
                    aria-label={t('widget.todo.time')}
                    value={value.due_time ?? ''}
                    onChange={e => setTime(e.target.value || null)}
                    style={{ ...fieldStyle, width: 92, fontVariantNumeric: 'tabular-nums', borderColor: value.due_time ? 'var(--accent)' : 'var(--border)' }}
                  />
                  {full && TIME_PRESETS.map(time => (
                    <button key={time} type="button" onClick={() => setTime(time)}
                      style={{ ...pillStyle(value.due_time === time), fontVariantNumeric: 'tabular-nums' }}>
                      {time}
                    </button>
                  ))}
                  {value.due_time && (
                    <button type="button" onClick={() => setTime(null)} style={pillStyle(false)}>{t('widget.todo.time.none')}</button>
                  )}
                </>
              )}

              {panel === 'topic' && topics.map(tp => {
                const active = value.topic_id === tp.id
                return (
                  <button key={tp.id} type="button"
                    onClick={() => { onChange({ topic_id: active ? null : tp.id }); setPanel(null) }}
                    style={{
                      ...pillStyle(active),
                      border: `1.5px solid ${active ? tp.color_from : 'var(--border)'}`,
                      background: active ? `${tp.color_from}18` : 'var(--card-bg)',
                      color: 'var(--text-primary)', fontWeight: active ? 600 : 400,
                    }}>
                    {tp.emoji} {tp.name}
                  </button>
                )
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

const editorCard = {
  background: 'var(--bg-tertiary)', border: '0.5px solid var(--border)',
  borderRadius: 12, padding: '8px 8px 8px 10px',
}

export default function TodoListWidget({ config = {}, size = 'medium' }) {
  const { todos, topics, recentSessions, upsertTodo, removeTodo } = useData()
  const { t, language } = useLanguage()
  const navigate = useNavigate()
  const compact = size === 'small'
  const full    = size === 'large'

  const topicFilter   = config.topic_id ?? null
  const sortMode      = config.sort_mode ?? 'smart'
  const hideCompleted = config.hide_completed ?? false

  const emptyDraft = () => ({ text: '', topic_id: topicFilter, priority: null, due_date: null, due_time: null })
  const [draft, setDraft]   = useState(emptyDraft)
  const [adding, setAdding] = useState(false)
  const [edit, setEdit]     = useState(null)   // { id, text, topic_id, priority, due_date, due_time }
  const editInputRef = useRef(null)

  useEffect(() => {
    if (edit?.id) setTimeout(() => editInputRef.current?.focus(), 50)
  }, [edit?.id])

  const today     = localDayKey()
  const topicById = useMemo(() => new Map(topics.map(tp => [tp.id, tp])), [topics])
  const urgency   = useMemo(() => calcTopicUrgency(topics, recentSessions), [topics, recentSessions])

  // Subtasks belong to their parent, not to this flat list — they are shown
  // and completed inside the event's checklist. Only roots surface here.
  const roots = useMemo(() => todos.filter(td => !td.parent_id), [todos])
  const scoped = useMemo(
    () => (topicFilter ? roots.filter(td => td.topic_id === topicFilter) : roots),
    [roots, topicFilter],
  )
  const subtaskCount = useMemo(() => {
    const counts = new Map()
    for (const td of todos) {
      if (!td.parent_id) continue
      const acc = counts.get(td.parent_id) ?? { done: 0, total: 0 }
      acc.total += 1
      if (td.completed) acc.done += 1
      counts.set(td.parent_id, acc)
    }
    return counts
  }, [todos])
  const pendingCount = scoped.filter(td => !td.completed).length
  const visible = useMemo(
    () => sortTodos(hideCompleted ? scoped.filter(td => !td.completed) : scoped, { mode: sortMode, urgency, today }),
    [scoped, hideCompleted, sortMode, urgency, today],
  )

  function toggleComposer() {
    if (!adding) setDraft(emptyDraft())
    setAdding(!adding)
  }

  async function addTodo() {
    const text = draft.text.trim()
    if (!text) return
    await upsertTodo(buildTodo({ id: crypto.randomUUID(), completed: false }, { ...draft, text }))
    setDraft(emptyDraft())
    setAdding(false)
  }

  function startEditing(todo) {
    if (edit && edit.id !== todo.id) saveEdit()
    setEdit({
      id: todo.id, text: todo.text, topic_id: todo.topic_id ?? null, priority: todo.priority ?? null,
      due_date: todo.due_date ?? null, due_time: shortTime(todo.due_time),
    })
  }

  async function saveEdit() {
    const current = edit
    setEdit(null)
    const todo = current && todos.find(td => td.id === current.id)
    const text = current?.text.trim()
    if (!todo || !text) return
    const changed = text !== todo.text
      || current.topic_id !== (todo.topic_id ?? null)
      || current.priority !== (todo.priority ?? null)
      || current.due_date !== (todo.due_date ?? null)
      || current.due_time !== shortTime(todo.due_time)
    if (changed) await upsertTodo(buildTodo(todo, { ...current, text }))
  }

  function cancelEdit() { setEdit(null) }

  async function toggleTodo(todo) {
    await upsertTodo({ ...todo, completed: !todo.completed })
  }

  function openTopic(topicId) {
    navigate('/topic-stats', { state: { topicId } })
  }

  const filterTopic = topicById.get(topicFilter)
  const canAdd = !!draft.text.trim()

  return (
    <div style={{ padding: '12px 14px', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: 0.5, display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          TO-DO
          {filterTopic && <span style={{ fontSize: 11 }}>{filterTopic.emoji}</span>}
          {pendingCount > 0 && (
            <span style={{ fontSize: 9, fontWeight: 700, color: 'var(--accent)', background: 'var(--accent-muted)', borderRadius: 10, padding: '1px 6px' }}>
              {pendingCount}
            </span>
          )}
        </span>
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={toggleComposer}
          animate={{ rotate: adding ? 45 : 0 }}
          transition={{ type: 'spring', stiffness: 500, damping: 30 }}
          style={{ background: 'var(--accent-muted)', border: 'none', borderRadius: 8, width: 24, height: 24, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--accent)"><path d="M19 13H13v6h-2v-6H5v-2h6V5h2v6h6v2z"/></svg>
        </motion.button>
      </div>

      <AnimatePresence>
        {adding && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            style={{ overflow: 'hidden', marginBottom: 8, flexShrink: 0 }}
          >
            <div style={editorCard} onPointerDown={stopGesture} onTouchStart={stopGesture}>
              <input
                autoFocus
                value={draft.text}
                placeholder={t('widget.todo.placeholder')}
                onChange={e => setDraft(d => ({ ...d, text: e.target.value }))}
                onKeyDown={e => {
                  if (e.key === 'Enter') addTodo()
                  if (e.key === 'Escape') setAdding(false)
                }}
                style={{
                  width: '100%', boxSizing: 'border-box', fontSize: 12, fontWeight: 500,
                  color: 'var(--text-primary)', background: 'transparent', border: 'none', outline: 'none',
                  fontFamily: 'inherit', padding: '2px 0 8px',
                }}
              />
              <TodoMetaEditor
                value={draft}
                onChange={patch => setDraft(d => ({ ...d, ...patch }))}
                topics={topics} compact={compact} full={full} t={t} language={language} today={today}
                trailing={
                  <motion.button
                    type="button"
                    whileTap={canAdd ? { scale: 0.88 } : undefined}
                    onClick={addTodo}
                    disabled={!canAdd}
                    aria-label={t('widget.todo.add')}
                    style={{
                      width: 26, height: 26, borderRadius: '50%', border: 'none', flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: 'var(--accent)', opacity: canAdd ? 1 : 0.35,
                      cursor: canAdd ? 'pointer' : 'default', transition: 'opacity 0.15s',
                    }}
                  >
                    {ICON_ARROW}
                  </motion.button>
                }
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div style={{ flex: 1, overflowY: 'auto' }}>
        {visible.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'var(--text-tertiary)', fontSize: 11, paddingTop: 20 }}>{t('widget.todo.empty')}</div>
        ) : (
          <AnimatePresence>
            {visible.map(todo => {
              const isEditing = edit?.id === todo.id
              const prio   = effectivePriority(todo, urgency)
              const topic  = topicById.get(todo.topic_id)
              const status = todo.completed ? null : dueStatus(todo, today)
              const showPrioLabel = full && prio.level > 0 && !todo.completed
              const showMeta = !isEditing && (topic || status || showPrioLabel)
              return (
                <motion.div
                  key={todo.id}
                  layout="position"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.18 }}
                  style={{ overflow: 'hidden' }}
                >
                  <SwipeDeleteTodo onDelete={() => removeTodo(todo.id)} onLongPress={() => startEditing(todo)}>
                    <div style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8, padding: '6px 0 6px 7px', borderBottom: `1px solid ${isEditing ? 'transparent' : 'var(--border)'}`, background: 'var(--card-bg)' }}>
                      {prio.level > 0 && !todo.completed && (
                        <span
                          title={prio.derived ? t('widget.todo.derivedHint') : t(`widget.todo.priority.${PRIORITY_KEYS[prio.level]}`)}
                          style={{ position: 'absolute', left: 0, top: 7, bottom: 7, width: 3, borderRadius: 2, background: PRIORITY_COLORS[prio.level], opacity: prio.derived ? 0.4 : 1 }}
                        />
                      )}
                      <motion.button
                        whileTap={{ scale: 0.85 }}
                        onClick={() => toggleTodo(todo)}
                        style={{
                          width: 20, height: 20, borderRadius: 6,
                          border: `2px solid ${todo.completed ? 'var(--accent)' : 'var(--border)'}`,
                          background: todo.completed ? 'var(--accent)' : 'transparent',
                          cursor: 'pointer', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {todo.completed && <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>}
                      </motion.button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            value={edit.text}
                            onChange={e => setEdit(cur => ({ ...cur, text: e.target.value }))}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); saveEdit() }
                              if (e.key === 'Escape') cancelEdit()
                            }}
                            style={{
                              width: '100%', boxSizing: 'border-box', fontSize: 11, fontWeight: 500,
                              color: 'var(--text-primary)', background: 'var(--bg-tertiary)',
                              border: '1px solid var(--accent)', borderRadius: 8, outline: 'none',
                              padding: '4px 8px', fontFamily: 'inherit',
                            }}
                          />
                        ) : (
                          <span style={{
                            display: 'block', fontSize: 11, color: 'var(--text-primary)',
                            textDecoration: todo.completed ? 'line-through' : 'none',
                            opacity: todo.completed ? 0.5 : 1,
                          }}>
                            {todo.text}
                          </span>
                        )}
                        {showMeta && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: compact ? 4 : 6, marginTop: 3, minWidth: 0, overflow: 'hidden' }}>
                            {status && <DueBadge status={status} date={todo.due_date} time={todo.due_time} t={t} language={language} compact={compact} />}
                            {topic && <TopicChip topic={topic} compact={compact} onOpen={() => openTopic(topic.id)} />}
                            {/* Subtasks live in the calendar's checklist; here
                                they are just a count, so the row still says how
                                much of the task is actually done. */}
                            {subtaskCount.get(todo.id) && (
                              <span style={{
                                fontSize: 9, fontWeight: 600, color: 'var(--text-tertiary)',
                                whiteSpace: 'nowrap', flexShrink: 0, fontVariantNumeric: 'tabular-nums',
                              }}>
                                ☑ {subtaskCount.get(todo.id).done}/{subtaskCount.get(todo.id).total}
                              </span>
                            )}
                            {showPrioLabel && (
                              <span
                                title={prio.derived ? t('widget.todo.derivedHint') : undefined}
                                style={{ fontSize: 9, fontWeight: 600, color: PRIORITY_COLORS[prio.level], opacity: prio.derived ? 0.65 : 1, display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap', flexShrink: 0 }}
                              >
                                {ICON_FLAG}
                                {t(`widget.todo.priority.${PRIORITY_KEYS[prio.level]}`)}{prio.derived && ` · ${t('widget.todo.priority.auto')}`}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </SwipeDeleteTodo>

                  {isEditing && (
                    <div style={{ ...editorCard, margin: '2px 0 8px' }}>
                      <TodoMetaEditor
                        value={edit}
                        onChange={patch => setEdit(cur => ({ ...cur, ...patch }))}
                        topics={topics} compact={compact} full={full} t={t} language={language} today={today}
                        trailing={
                          <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                            <button type="button" onClick={cancelEdit} style={pillStyle(false)}>{t('widget.todo.cancel')}</button>
                            <button type="button" onClick={saveEdit} style={{ ...pillStyle(true), background: 'var(--accent)', borderColor: 'var(--accent)', color: 'white' }}>{t('widget.todo.save')}</button>
                          </div>
                        }
                      />
                    </div>
                  )}
                </motion.div>
              )
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  )
}
