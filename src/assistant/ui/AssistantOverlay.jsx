// The floating pill. Pull down from the top edge (or Ctrl/Cmd+K, or the FAB
// entry) and it drops in; asking something grows it into a chat thread with
// the input at the bottom and suggestions right above it.
// Closing ends the chat — the next opening starts empty.

import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { AnimatePresence, motion, useMotionValue, useTransform, animate } from 'framer-motion'
import { useAssistant, AssistantContext } from '../AssistantProvider.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useData } from '../../context/DataContext.jsx'
import { todoSwipeActive } from '../../utils/gestureState.js'
import { suggest } from '../engine/suggest.js'
import { fold } from '../engine/normalize.js'
import ResultBlocks from './blocks.jsx'
import FlowComposer, { flowPlaceholder, enterLabel } from './FlowComposer.jsx'
import LiquidPanel from '../../components/Glass/LiquidPanel.jsx'
import { remeasureGlass } from '../../components/Glass/glassConfig.js'

const EventEditorModal = lazy(() => import('../../components/Modals/EventEditorModal.jsx'))

const EDGE = 80          // px from the top where a pull may start (generous — covers notches/safe-area and thumb imprecision)
const OPEN_AT = 60       // px of pull that opens the pill
const LOCK_SLOP = 10     // px of ambiguous movement before direction (vertical vs horizontal) is decided
const SPRING = { type: 'spring', stiffness: 420, damping: 36 }
const MAX_CHIPS = 6

// Visible viewport (shrinks when the on-screen keyboard opens on iOS/Android).
function useVisualViewport() {
  const read = () => ({ height: window.visualViewport?.height ?? window.innerHeight, offsetTop: window.visualViewport?.offsetTop ?? 0 })
  const [vv, setVv] = useState(read)
  useEffect(() => {
    const target = window.visualViewport ?? window
    const update = () => setVv(read())
    target.addEventListener('resize', update)
    target.addEventListener('scroll', update)
    return () => {
      target.removeEventListener('resize', update)
      target.removeEventListener('scroll', update)
    }
  }, [])
  return vv
}

export default function AssistantOverlay() {
  const a = useAssistant()
  const { t } = useLanguage()
  const { widgetModalOpen } = useData()
  const pull = useMotionValue(0)
  const hintOpacity = useTransform(pull, [0, OPEN_AT], [0, 1])
  const hintY = useTransform(pull, v => Math.min(v, OPEN_AT * 1.4) * 0.6 - 56)
  const [pulling, setPulling] = useState(false)

  // ── Top-edge pull ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!a) return
    // `lock` decides once, on the first bit of movement, whether this drag is
    // "our" vertical pull or a horizontal swipe/scroll we should stay out of —
    // decided once and never revisited, instead of the old per-move check
    // that only ever cancelled and could flip-flop on a wobbly finger.
    let startY = null, startX = 0, lastY = 0, lastT = 0, velocity = 0, lock = null
    const onStart = e => {
      if (a.open || widgetModalOpen || todoSwipeActive.current || e.touches.length !== 1) return
      const touch = e.touches[0]
      if (touch.clientY > EDGE) return
      startY = touch.clientY; startX = touch.clientX; lastY = startY; lastT = e.timeStamp; lock = null
    }
    const onMove = e => {
      if (startY == null) return
      const touch = e.touches[0]
      const dy = touch.clientY - startY
      const dx = touch.clientX - startX
      if (lock == null) {
        if (Math.abs(dx) + Math.abs(dy) < LOCK_SLOP) return
        lock = dy > 0 && Math.abs(dy) > Math.abs(dx) * 1.2 ? 'v' : 'h'
        if (lock === 'h') { startY = null; return }
      }
      if (dy <= 0) { pull.set(0); return }
      if (e.cancelable) e.preventDefault()
      velocity = (touch.clientY - lastY) / Math.max(1, e.timeStamp - lastT)
      lastY = touch.clientY; lastT = e.timeStamp
      // Rubber band past the threshold.
      pull.set(dy < OPEN_AT ? dy : OPEN_AT + (dy - OPEN_AT) * 0.35)
      setPulling(true)
    }
    const onEnd = () => {
      if (startY == null) return
      startY = null
      const shouldOpen = pull.get() >= OPEN_AT || (pull.get() > 22 && velocity > 0.5)
      animate(pull, 0, SPRING)
      setPulling(false)
      if (shouldOpen) {
        navigator.vibrate?.(8)
        a.openAssistant()
      }
    }
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
    return () => {
      window.removeEventListener('touchstart', onStart)
      window.removeEventListener('touchmove', onMove)
      window.removeEventListener('touchend', onEnd)
      window.removeEventListener('touchcancel', onEnd)
    }
  }, [a?.open, a?.openAssistant, widgetModalOpen]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Keyboard ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!a) return
    const onKey = e => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); a.open ? a.close() : a.openAssistant() }
      else if (e.key === 'Escape' && a.open && !a.editor) a.close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [a?.open, a?.editor]) // eslint-disable-line react-hooks/exhaustive-deps

  if (!a) return null

  return createPortal(
    <>
      {/* Pull hint: a ghost pill that follows the finger before it opens. */}
      {pulling && !a.open && (
        <motion.div style={{ ...wrap, opacity: hintOpacity, y: hintY, pointerEvents: 'none' }}>
          <div className="liquid-scope" style={{ ...pillShell, maxWidth: 220, justifyContent: 'center', padding: '10px 16px', color: 'var(--text-secondary)', fontSize: 14, borderRadius: 22 }}>
            <GlassLayer radius={22} />
            <span style={{ position: 'relative', display: 'flex', alignItems: 'center', gap: 8 }}><Sparkle /> {t('assistant.pullHint')}</span>
          </div>
        </motion.div>
      )}

      <AnimatePresence>
        {a.open && !a.editor && <Panel key="assistant" />}
      </AnimatePresence>

      {a.editor && (
        <Suspense fallback={null}>
          <EventEditorModal {...a.editor} onClose={() => a.setEditor(null)} />
        </Suspense>
      )}
    </>,
    document.body,
  )
}

function Panel() {
  const a = useAssistant()
  const { t } = useLanguage()
  const [value, setValue] = useState('')
  const inputRef = useRef(null)
  const scrollRef = useRef(null)
  const lastRef = useRef(null)
  const vv = useVisualViewport()
  const hasThread = a.thread.length > 0
  const busy = a.thread.some(e => e.status)
  const last = a.thread[a.thread.length - 1] ?? null

  // No autocomplete while a flow waits for an answer (a place, a todo text).
  const suggestions = useMemo(() => {
    if (a.flow) return []
    try { return suggest(value, a.api) } catch (e) { console.warn('[assistant] suggest', e); return [] }
  }, [value, a.api, a.flow])

  // In a chat with an empty input: the latest answer's follow-ups first, then
  // the usual starters.
  const chips = useMemo(() => {
    if (!hasThread || value) return suggestions
    const followups = (last?.result?.followups ?? []).map(f => ({ value: f, label: f, submit: true }))
    const seen = new Set()
    return [...followups, ...suggestions].filter(s => {
      const key = fold(s.value).trim()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, MAX_CHIPS)
  }, [hasThread, value, suggestions, last?.result])

  // Inline completion of the top suggestion, only when it literally continues the input.
  const top = suggestions[0]
  const ghost = value && top && top.value.toLowerCase().startsWith(value.toLowerCase()) && top.value.length > value.length
    ? top.value.slice(value.length)
    : ''

  useEffect(() => { const id = setTimeout(() => inputRef.current?.focus(), 180); return () => clearTimeout(id) }, [])
  // Bring the newest question to the top of the thread: on a new question and
  // again when its answer lands.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      const box = scrollRef.current
      const el = lastRef.current
      if (box && el) box.scrollTo({ top: Math.max(0, el.offsetTop - 8), behavior: 'smooth' })
    })
    return () => cancelAnimationFrame(id)
  }, [a.thread.length, !!last?.status])

  function submit(q = value) {
    const query = q.trim()
    if (!query) {
      // Enter on an empty input moves a flow on (skip / next / save).
      if (a.flow) a.flowAction('enter', null, enterLabel(a.flow, a.api))
      return
    }
    setValue('')
    a.run(query)
  }

  function focusEnd(next) {
    setValue(next)
    requestAnimationFrame(() => {
      const el = inputRef.current
      if (!el) return
      el.focus()
      el.setSelectionRange(next.length, next.length)
    })
  }

  function pick(s) {
    if (s.submit) submit(s.value)
    else focusEnd(s.value)
  }

  function onKeyDown(e) {
    const atEnd = e.currentTarget.selectionStart === value.length
    if (ghost && atEnd && (e.key === 'Tab' || e.key === 'ArrowRight')) {
      e.preventDefault()
      focusEnd(value + ghost)
    }
  }

  const topInset = `calc(max(env(safe-area-inset-top, 0px), 10px) + 8px + ${vv.offsetTop}px)`
  // DOM order stays fixed (so the input never remounts and keeps focus); CSS
  // `order` moves the input below the thread once a chat has started.
  const order = hasThread ? { handle: 0, thread: 1, chips: 2, form: 3 } : { handle: 0, thread: 3, chips: 2, form: 1 }
  // Round pill ≈ half its height; the glass displacement map breaks on 999.
  const radius = hasThread || chips.length ? 26 : 28

  return (
    <>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={a.close}
        style={{ position: 'fixed', inset: 0, zIndex: 290, background: 'rgba(0,0,0,0.28)' }}
      />
      <div style={{ ...wrap, top: topInset, zIndex: 300 }}>
        {/* No `layout` here: its scale transforms fool the glass measuring
            (getBoundingClientRect) and leave a stale inner glass outline. */}
        <motion.div
          initial={{ y: -80, opacity: 0, scale: 0.9 }}
          animate={{ y: 0, opacity: 1, scale: 1 }}
          exit={{ y: -80, opacity: 0, scale: 0.9 }}
          transition={SPRING}
          drag="y"
          dragConstraints={{ top: 0, bottom: 0 }}
          dragElastic={{ top: 0.5, bottom: 0.05 }}
          dragListener={!hasThread}
          onDragEnd={(_, info) => { if (info.offset.y < -50 || info.velocity.y < -500) a.close() }}
          onAnimationComplete={remeasureGlass}
          className="liquid-scope"
          style={{
            ...pillShell,
            flexDirection: 'column', alignItems: 'stretch', padding: 0,
            borderRadius: radius,
            ...(hasThread
              ? { height: `calc(${vv.height}px - max(env(safe-area-inset-top, 0px), 10px) - 8px - max(env(safe-area-inset-bottom, 0px), 12px))` }
              : { maxHeight: `calc(${vv.height}px - max(env(safe-area-inset-top, 0px), 12px) - 110px)` }),
            pointerEvents: 'auto',
          }}
        >
          <GlassLayer radius={radius} />

          {hasThread && (
            <div style={{ order: order.handle, position: 'relative' }}>
              <GrabHandle onClose={a.close} onNewChat={a.newChat} label={t('assistant.newChat')} />
            </div>
          )}

          <motion.form
            layout="position"
            onSubmit={e => { e.preventDefault(); submit() }}
            style={{
              order: order.form, flexShrink: 0, position: 'relative',
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '8px 8px 8px 16px',
              ...(hasThread ? { borderTop: '0.5px solid var(--border)' } : null),
            }}
          >
            <Sparkle animate={busy} />
            <div style={{ position: 'relative', flex: 1, minWidth: 0 }}>
              {ghost && (
                <div aria-hidden style={{ ...inputText, position: 'absolute', inset: 0, pointerEvents: 'none', whiteSpace: 'pre', overflow: 'hidden' }}>
                  <span style={{ visibility: 'hidden' }}>{value}</span>
                  <span style={{ color: 'var(--text-tertiary)' }}>{ghost}</span>
                </div>
              )}
              <input
                ref={inputRef}
                value={value}
                onChange={e => setValue(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder={a.flow ? flowPlaceholder(a.flow, a.api) : hasThread ? t('assistant.followupPlaceholder') : t('assistant.placeholder')}
                enterKeyHint="send"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
                style={{ ...inputText, position: 'relative', width: '100%', border: 'none', outline: 'none', background: 'transparent', color: 'var(--text-primary)' }}
              />
            </div>
            <motion.button
              type="submit"
              whileTap={{ scale: 0.9 }}
              disabled={!value.trim() && !a.flow}
              aria-label={t('assistant.send')}
              style={{ width: 34, height: 34, borderRadius: 17, border: 'none', flexShrink: 0, cursor: 'pointer', display: 'grid', placeItems: 'center', background: value.trim() || a.flow ? 'var(--accent)' : 'var(--bg-tertiary)', transition: 'background 0.2s' }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none"><path d="M12 19V5M5 12l7-7 7 7" stroke={value.trim() || a.flow ? 'white' : 'var(--text-tertiary)'} strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </motion.button>
          </motion.form>

          {/* Autocomplete / starters / follow-ups */}
          <AnimatePresence initial={false}>
            {!a.flow && chips.length > 0 && (
              <motion.div
                key="suggest"
                layout="position"
                initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                style={{ order: order.chips, flexShrink: 0, position: 'relative', display: 'flex', gap: 6, padding: hasThread ? '8px 12px 2px' : '0 12px 10px', overflowX: 'auto', scrollbarWidth: 'none', ...(hasThread ? { borderTop: '0.5px solid var(--border)' } : null) }}
              >
                {chips.map(s => (
                  <Chip key={s.value} onClick={() => pick(s)}>
                    {s.submit ? s.label : <><span>{s.label}</span><span style={{ opacity: 0.5, marginLeft: 4 }}>✎</span></>}
                  </Chip>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Guided creation: selectors for the current step, right above the input. */}
          {a.flow && (
            <div style={{ order: order.chips, flexShrink: 0, position: 'relative', borderTop: '0.5px solid var(--border)' }}>
              <FlowComposer />
            </div>
          )}

          {hasThread && (
            <motion.div
              ref={scrollRef}
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              style={{ order: order.thread, flex: 1, minHeight: 0, position: 'relative', overflowY: 'auto', overscrollBehavior: 'contain', padding: '8px 14px 16px' }}
            >
              {a.thread.map((entry, idx) => (
                <div
                  key={entry.id}
                  ref={idx === a.thread.length - 1 ? lastRef : null}
                  style={idx > 0 ? { marginTop: 18, paddingTop: 16, borderTop: '0.5px solid var(--border)' } : null}
                >
                  <Entry entry={entry} onFollowup={submit} isLast={idx === a.thread.length - 1} />
                </div>
              ))}
            </motion.div>
          )}
        </motion.div>
      </div>
    </>
  )
}

// One question + answer. Blocks inside read `result` / `setResult` from a
// scoped context, so "Plan it" in an older answer rewrites that answer only.
// The newest answer's follow-ups live in the chip row above the input.
function Entry({ entry, onFollowup, isLast }) {
  const a = useAssistant()
  const { t } = useLanguage()
  const scoped = useMemo(() => ({
    ...a,
    result: entry.result,
    setResult: r => a.updateEntry(entry.id, r),
  }), [a, entry.id, entry.result])

  const statusText = typeof entry.status === 'object' && entry.status
    ? `${t('assistant.loadingModel')} ${Math.round((entry.status.progress ?? 0) * 100)}%`
    : entry.status === 'llm' ? t('assistant.thinkingLLM')
      : entry.status ? t('assistant.thinking') : null

  return (
    <>
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 10 }}>
        <div style={{ maxWidth: '85%', background: 'var(--accent)', color: 'white', fontSize: 14, lineHeight: 1.35, padding: '7px 12px', borderRadius: 16, borderBottomRightRadius: 5 }}>
          {entry.query}
        </div>
      </div>
      {statusText ? (
        <Shimmer text={statusText} />
      ) : entry.result && (
        <AssistantContext.Provider value={scoped}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
            <h3 style={{ margin: 0, fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.3, flex: 1 }}>{entry.result.title}</h3>
            {entry.result.meta?.source === 'llm' && <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--accent)', background: 'var(--accent-muted)', padding: '2px 6px', borderRadius: 6 }}>{t('assistant.onDevice')}</span>}
          </div>
          <ResultBlocks blocks={entry.result.blocks ?? []} />
          {!isLast && !!entry.result.followups?.length && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 12 }}>
              {entry.result.followups.map(f => <Chip key={f} onClick={() => onFollowup(f)}>{f}</Chip>)}
            </div>
          )}
          <Rating entry={entry} />
        </AssistantContext.Provider>
      )}
    </>
  )
}

const REASONS = ['wrong_action', 'wrong_answer', 'not_understood', 'other']

// 👍 / 👎 under an answer. 👎 asks what went wrong; both are saved with the
// answer's trace and can be exported in Settings → Assistant.
function Rating({ entry }) {
  const a = useAssistant()
  const { t } = useLanguage()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState(null)
  const [expected, setExpected] = useState('')

  if (entry.rated) {
    return (
      <div style={{ marginTop: 10, textAlign: 'right', fontSize: 12, color: 'var(--text-tertiary)' }}>
        {entry.rated === 'good' ? `👍 ${t('assistant.rate.thanks')}` : `👎 ${t('assistant.rate.savedBad')}`}
      </div>
    )
  }

  return (
    <div style={{ marginTop: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
        <RateButton label={t('assistant.rate.good')} onClick={() => a.rateEntry(entry.id, 'good')}>👍</RateButton>
        <RateButton label={t('assistant.rate.bad')} active={open} onClick={() => setOpen(o => !o)}>👎</RateButton>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{ marginTop: 8, padding: 10, borderRadius: 14, background: 'var(--bg-tertiary)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>{t('assistant.rate.question')}</div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {REASONS.map(r => (
                  <button
                    key={r} type="button" onClick={() => setReason(r)}
                    style={{ border: 'none', cursor: 'pointer', borderRadius: 12, padding: '5px 10px', fontSize: 12, fontWeight: 500, background: reason === r ? 'var(--accent)' : 'var(--card-bg)', color: reason === r ? 'white' : 'var(--text-primary)' }}
                  >
                    {t(`assistant.rate.${r}`)}
                  </button>
                ))}
              </div>
              <input
                value={expected}
                onChange={e => setExpected(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); a.rateEntry(entry.id, 'bad', { reason: reason ?? 'other', expected }) } }}
                placeholder={t('assistant.rate.expected')}
                style={{ border: 'none', outline: 'none', borderRadius: 10, padding: '8px 10px', fontSize: 16, fontFamily: 'inherit', background: 'var(--card-bg)', color: 'var(--text-primary)' }}
              />
              <button
                type="button"
                onClick={() => a.rateEntry(entry.id, 'bad', { reason: reason ?? 'other', expected })}
                style={{ alignSelf: 'flex-end', border: 'none', cursor: 'pointer', borderRadius: 10, padding: '7px 14px', fontSize: 13, fontWeight: 600, background: 'var(--accent)', color: 'white' }}
              >
                {t('assistant.rate.send')}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

function RateButton({ children, label, onClick, active }) {
  return (
    <motion.button
      type="button" whileTap={{ scale: 0.85 }} onClick={onClick} aria-label={label} title={label}
      style={{ border: 'none', cursor: 'pointer', borderRadius: 10, width: 32, height: 28, fontSize: 14, display: 'grid', placeItems: 'center', background: active ? 'var(--accent-muted)' : 'transparent', opacity: active ? 1 : 0.55 }}
    >
      {children}
    </motion.button>
  )
}

export function Chip({ children, onClick, active }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{ flexShrink: 0, border: 'none', cursor: 'pointer', borderRadius: 14, padding: '6px 11px', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap', background: active ? 'var(--accent)' : 'var(--bg-tertiary)', color: active ? 'white' : 'var(--text-primary)' }}
    >
      {children}
    </motion.button>
  )
}

function GrabHandle({ onClose, onNewChat, label }) {
  return (
    <div style={{ position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 26 }}>
      <motion.div
        onPanEnd={(_, info) => { if (info.offset.y < -40 || info.velocity.y < -400) onClose() }}
        style={{ padding: '8px 40px 4px', cursor: 'grab', touchAction: 'none' }}
      >
        <div style={{ width: 36, height: 5, borderRadius: 3, background: 'var(--text-tertiary)', opacity: 0.5 }} />
      </motion.div>
      <button
        type="button"
        onClick={onNewChat}
        style={{ position: 'absolute', right: 10, top: 4, border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--accent)', padding: '4px 6px' }}
      >
        ＋ {label}
      </button>
    </div>
  )
}

// Liquid glass behind the pill's content (same layer as GlassCard).
function GlassLayer({ radius }) {
  return (
    <div className="glass-card-frame__glass" aria-hidden="true">
      <LiquidPanel radius={radius} />
    </div>
  )
}

function Sparkle({ animate: spin = false }) {
  return (
    <motion.svg
      width="20" height="20" viewBox="0 0 24 24" style={{ flexShrink: 0 }}
      animate={spin ? { rotate: 360, scale: [1, 1.15, 1] } : { rotate: 0, scale: 1 }}
      transition={spin ? { repeat: Infinity, duration: 1.6, ease: 'linear' } : { duration: 0.2 }}
    >
      <defs>
        <linearGradient id="mt-sparkle" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#5AC8FA" /><stop offset="50%" stopColor="#AF52DE" /><stop offset="100%" stopColor="#FF6B9D" />
        </linearGradient>
      </defs>
      <path d="M12 2l2.2 6.3L20.5 10.5 14.2 12.7 12 19l-2.2-6.3L3.5 10.5l6.3-2.2L12 2z" fill="url(#mt-sparkle)" />
    </motion.svg>
  )
}

function Shimmer({ text }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <motion.div
        animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
        transition={{ repeat: Infinity, duration: 1.8, ease: 'linear' }}
        style={{ fontSize: 14, fontWeight: 600, backgroundImage: 'linear-gradient(90deg, var(--text-tertiary) 30%, var(--text-primary) 50%, var(--text-tertiary) 70%)', backgroundSize: '200% 100%', WebkitBackgroundClip: 'text', backgroundClip: 'text', color: 'transparent' }}
      >
        {text}
      </motion.div>
      {[0.9, 0.7, 0.8].map((w, i) => (
        <motion.div key={i} animate={{ opacity: [0.35, 0.7, 0.35] }} transition={{ repeat: Infinity, duration: 1.2, delay: i * 0.15 }}
          style={{ height: 40, width: `${w * 100}%`, borderRadius: 12, background: 'var(--bg-tertiary)' }} />
      ))}
    </div>
  )
}

const inputText = { fontSize: 16, padding: '8px 0', fontFamily: 'inherit', letterSpacing: 'normal', lineHeight: '20px' }

const wrap = {
  position: 'fixed', left: 0, right: 0,
  top: 'calc(max(env(safe-area-inset-top, 0px), 10px) + 8px)',
  display: 'flex', justifyContent: 'center',
  padding: '0 16px', zIndex: 280, pointerEvents: 'none',
}

const pillShell = {
  display: 'flex', alignItems: 'center', gap: 8,
  position: 'relative',
  width: '100%', maxWidth: 520,
  boxShadow: '0 12px 40px rgba(0,0,0,0.22), 0 0 0 0.5px rgba(255,255,255,0.15) inset',
  overflow: 'hidden',
}
