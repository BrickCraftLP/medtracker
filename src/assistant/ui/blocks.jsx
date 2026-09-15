// Interactive result blocks. Every block reads rows live from DataContext by
// id, so ticking a todo or saving an event repaints the card immediately.

import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useNavigate } from 'react-router-dom'
import { useAssistant } from '../AssistantProvider.jsx'
import { useData } from '../../context/DataContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useSession } from '../../hooks/useSession.js'
import { KINDS, metaFor, colorOf, withAlpha, buildEvent, timeOf, minutesOf, hhmm } from '../../utils/calendar/eventModel.js'
import { buildTodo, dueStatus } from '../../utils/calculations/todoPriorityCalcs.js'
import { fmtMin, fmtDuration } from '../engine/parse/times.js'
import { freeSlots } from '../intents/calendar.js'
import { startEventFlow } from '../flows/eventFlow.js'
import { reminderLabel } from './FlowComposer.jsx'

export default function ResultBlocks({ blocks }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {blocks.map((b, i) => {
        const C = BLOCKS[b.type]
        return C ? (
          <motion.div key={`${b.type}-${i}`} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.25 }}>
            <C {...b.data} />
          </motion.div>
        ) : null
      })}
    </div>
  )
}

// ── Text ───────────────────────────────────────────────────────────────────

function TextBlock({ text }) {
  return <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: 'var(--text-primary)', whiteSpace: 'pre-line' }}>{text}</p>
}

// ── Topics ─────────────────────────────────────────────────────────────────

function TopicsBlock({ items, date }) {
  const { topics } = useData()
  const a = useAssistant()
  const { t } = useLanguage()
  const navigate = useNavigate()
  const { startSession } = useSession()

  function plan(topic) {
    const api = a.apiRef.current
    const start = freeSlots(api, date, 60)[0]?.start ?? 9 * 60
    a.startFlow(
      startEventFlow({ title: topic.name, date, startMin: start, endMin: start + 60, kind: 'study', topic_id: topic.id }, api),
      api.L(`Plan ${topic.name}`, `${topic.name} planen`),
    )
  }

  return (
    <Card>
      {items.map((it, i) => {
        const topic = topics.find(tp => tp.id === it.topicId)
        if (!topic) return null
        return (
          <Row key={it.topicId} divider={i > 0}>
            <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0, background: topic.color_from ? `${topic.color_from}33` : 'var(--accent-muted)' }}>{topic.emoji ?? '📘'}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={titleStyle}>{i === 0 && '⭐ '}{topic.name}</div>
              {!!it.reasons.length && <div style={subStyle}>{it.reasons.join(' · ')}</div>}
            </div>
            <SmallBtn onClick={() => plan(topic)}>{t('assistant.plan')}</SmallBtn>
            <SmallBtn primary onClick={() => { startSession(topic.id); a.close(); navigate('/session', { state: { topicId: topic.id } }) }}>▶</SmallBtn>
          </Row>
        )
      })}
    </Card>
  )
}

// ── Events ─────────────────────────────────────────────────────────────────

// Same colored chip the Calendar tab draws an event as (EventBlock.jsx,
// MonthView.jsx): a filled, rounded box in the event's own color, not a plain
// list row — so an event looks like an event wherever the assistant shows one.
function EventsBlock({ items, collapsed = false, label, confirmId = null }) {
  const { events, calendars, removeEvent } = useData()
  const a = useAssistant()
  const { t } = useLanguage()
  const [open, setOpen] = useState(!collapsed)
  const [confirm, setConfirm] = useState(confirmId)
  const calById = useMemo(() => new Map(calendars.map(c => [c.id, c])), [calendars])

  const rows = items.map(it => ({ ...it, event: events.find(e => e.id === it.eventId) })).filter(r => r.event)
  if (!rows.length) return null

  return (
    <div>
      {label && (
        <button type="button" onClick={() => setOpen(o => !o)} style={{ ...linkBtn, marginBottom: 6 }}>
          {label} ({rows.length}) {open ? '▴' : '▾'}
        </button>
      )}
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {rows.map(r => {
              const e = r.event
              const color = colorOf(e, calById)
              const meta = metaFor(e.kind)
              const when = r.allDay ? t('assistant.allDay') : `${fmtMin(r.startMin)} – ${fmtMin(r.endMin)}`
              return (
                <motion.div
                  key={`${e.id}-${r.date}`}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => a.setEditor({ occurrence: { event: e, date: r.date, startMin: r.startMin, endMin: r.endMin, allDay: r.allDay } })}
                  style={{
                    position: 'relative', display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    borderRadius: 12, padding: '9px 10px 9px 12px', overflow: 'hidden',
                    border: `0.5px solid ${withAlpha(color, 0.5)}`,
                    background: withAlpha(color, e.completed ? 0.08 : 0.14),
                    opacity: e.completed ? 0.62 : 1,
                  }}
                >
                  <span style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, background: color }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ ...titleStyle, textDecoration: e.completed ? 'line-through' : 'none' }}>{meta.icon} {e.title || '—'}</div>
                    <div style={subStyle}>{r.showDate ? `${a.api.fmtDay(r.date)} · ` : ''}{when}{e.location ? ` · 📍 ${e.location}` : ''}</div>
                  </div>
                  <SmallBtn
                    danger={confirm === e.id}
                    onClick={ev => {
                      ev.stopPropagation()
                      if (confirm === e.id) { removeEvent(e.id).catch(console.error); setConfirm(null) } else setConfirm(e.id)
                    }}
                  >
                    {confirm === e.id ? t('assistant.confirmDelete') : '🗑'}
                  </SmallBtn>
                </motion.div>
              )
            })}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

// ── Free slots ─────────────────────────────────────────────────────────────

function SlotsBlock({ days, date, slots, minutes, title, kind = 'event', topicId = null, hint }) {
  const a = useAssistant()
  const list = (days ?? (slots ? [{ date, slots }] : [])).filter(d => d.slots.length)
  if (!list.length) return null
  const multi = list.length > 1

  function pick(day, slot) {
    const api = a.apiRef.current
    const len = Math.min(minutes, slot.end - slot.start)
    a.startFlow(
      startEventFlow({ title: title ?? '', date: day, startMin: slot.start, endMin: slot.start + len, kind, topic_id: topicId, conflictOk: true }, api),
      `${api.fmtDay(day)} · ${fmtMin(slot.start)}–${fmtMin(slot.start + len)}`,
    )
  }

  return (
    <div>
      {list.map(d => (
      <div key={d.date} style={{ marginBottom: multi ? 10 : 0 }}>
      {multi && <div style={{ ...subStyle, fontWeight: 600, marginBottom: 5 }}>{a.api.fmtDay(d.date)}</div>}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        {d.slots.map(s => (
          <motion.button
            key={s.start}
            type="button"
            whileTap={{ scale: 0.95 }}
            onClick={() => pick(d.date, s)}
            style={{ border: '1px solid color-mix(in srgb, var(--correct) 45%, transparent)', background: 'color-mix(in srgb, var(--correct) 12%, transparent)', color: 'var(--text-primary)', borderRadius: 12, padding: '8px 12px', cursor: 'pointer', textAlign: 'left' }}
          >
            <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtMin(s.start)} – {fmtMin(s.end)}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{fmtDuration(s.end - s.start, a.api.lang)}</div>
          </motion.button>
        ))}
      </div>
      </div>
      ))}
      {hint && <div style={{ ...subStyle, marginTop: 6 }}>{hint}</div>}
    </div>
  )
}

// ── Event draft (inline editor) ────────────────────────────────────────────

function DraftBlock({ draft }) {
  const a = useAssistant()
  const { t } = useLanguage()
  const { topics, upsertEvent } = useData()
  const [form, setForm] = useState(() => ({
    title: draft.title ?? '',
    date: draft.date,
    start: hhmm(timeOf(draft.startMin)),
    end: hhmm(timeOf(draft.endMin)),
    kind: draft.kind ?? 'event',
    topic_id: draft.topic_id ?? null,
  }))
  const [saved, setSaved] = useState(null)
  const [saving, setSaving] = useState(false)
  const patch = p => setForm(f => ({ ...f, ...p }))

  function toRow() {
    const api = a.apiRef.current
    const s = minutesOf(form.start) ?? 540
    const e = Math.max(s + 5, minutesOf(form.end) ?? s + 60)
    return buildEvent({}, {
      calendar_id: api.defaultCalendarId(),
      kind: form.kind,
      title: form.title || t('assistant.untitled'),
      start_date: form.date,
      start_time: timeOf(s),
      end_date: form.date,
      end_time: timeOf(e),
      all_day: false,
      topic_id: form.kind === 'study' ? form.topic_id : null,
      planned_minutes: e - s,
    })
  }

  async function save() {
    setSaving(true)
    try { setSaved(await upsertEvent(toRow())) } catch (e) { console.error(e) } finally { setSaving(false) }
  }

  if (saved) return <SavedBlock eventId={saved.id} />

  return (
    <Card style={{ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input value={form.title} onChange={e => patch({ title: e.target.value })} placeholder={t('assistant.titlePlaceholder')} style={{ ...inputStyle, fontSize: 16, fontWeight: 600 }} />
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        <input type="date" value={form.date} onChange={e => patch({ date: e.target.value })} style={{ ...inputStyle, flex: '1 1 140px' }} />
        <input type="time" value={form.start} onChange={e => {
          const d = (minutesOf(form.end) ?? 0) - (minutesOf(form.start) ?? 0)
          const s = minutesOf(e.target.value)
          patch({ start: e.target.value, end: s != null ? hhmm(timeOf(s + Math.max(5, d))) : form.end })
        }} style={{ ...inputStyle, flex: '1 1 90px' }} />
        <input type="time" value={form.end} onChange={e => patch({ end: e.target.value })} style={{ ...inputStyle, flex: '1 1 90px' }} />
      </div>
      <div style={{ display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
        {KINDS.map(k => (
          <button key={k} type="button" onClick={() => patch({ kind: k })}
            style={{ flexShrink: 0, border: 'none', borderRadius: 10, padding: '5px 9px', fontSize: 12, cursor: 'pointer', background: form.kind === k ? 'var(--accent)' : 'var(--bg-tertiary)', color: form.kind === k ? 'white' : 'var(--text-primary)' }}>
            {metaFor(k).icon} {t(metaFor(k).labelKey)}
          </button>
        ))}
      </div>
      {form.kind === 'study' && (
        <select value={form.topic_id ?? ''} onChange={e => patch({ topic_id: e.target.value || null })} style={inputStyle}>
          <option value="">{t('assistant.noTopic')}</option>
          {topics.map(tp => <option key={tp.id} value={tp.id}>{tp.emoji} {tp.name}</option>)}
        </select>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        <SmallBtn style={{ flex: 1, padding: '10px' }} onClick={() => a.setEditor({ draft: toRow() })}>{t('assistant.moreOptions')}</SmallBtn>
        <SmallBtn primary style={{ flex: 1, padding: '10px' }} onClick={save} disabled={saving}>{saving ? '…' : t('assistant.save')}</SmallBtn>
      </div>
    </Card>
  )
}

// ── Todos ──────────────────────────────────────────────────────────────────

// `pick` ({ intent, slots, label }): each row gets a button that runs that
// intent on the row's todo ("Which todo should be renamed?").
function TodosBlock({ ids, addMode = false, addDefaults = {}, highlight, confirmDelete, pick = null }) {
  const { todos, topics, upsertTodo, removeTodo } = useData()
  const a = useAssistant()
  const { t } = useLanguage()
  const [extraIds, setExtraIds] = useState([])
  const [editing, setEditing] = useState(null)
  const [draftText, setDraftText] = useState('')
  const [newText, setNewText] = useState('')
  const [confirm, setConfirm] = useState(confirmDelete ?? null)

  const rows = [...ids, ...extraIds].map(id => todos.find(td => td.id === id)).filter(Boolean)

  async function add() {
    const text = newText.trim()
    if (!text) return
    setNewText('')
    const topic = a.apiRef.current.findTopicIn(text)
    const saved = await upsertTodo(buildTodo({ completed: false }, { text, due_date: addDefaults.due_date ?? null, topic_id: topic?.id ?? null }))
    setExtraIds(x => [...x, saved.id])
  }

  function commitEdit(todo) {
    const text = draftText.trim()
    setEditing(null)
    if (text && text !== todo.text) upsertTodo({ ...todo, text }).catch(console.error)
  }

  return (
    <Card>
      <AnimatePresence initial={false}>
        {rows.map((td, i) => {
          const topic = topics.find(tp => tp.id === td.topic_id)
          const status = dueStatus(td, a.api.today)
          return (
            <motion.div key={td.id} layout initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}>
              <Row divider={i > 0} style={highlight === td.id ? { background: 'var(--accent-muted)' } : undefined}>
                <motion.button
                  type="button"
                  whileTap={{ scale: 0.8 }}
                  onClick={() => upsertTodo({ ...td, completed: !td.completed }).catch(console.error)}
                  aria-label="toggle"
                  style={{ width: 24, height: 24, borderRadius: 12, flexShrink: 0, cursor: 'pointer', display: 'grid', placeItems: 'center', border: td.completed ? 'none' : '2px solid var(--text-tertiary)', background: td.completed ? 'var(--correct)' : 'transparent' }}
                >
                  {td.completed && <svg width="12" height="12" viewBox="0 0 24 24"><path d="M5 13l4 4L19 7" stroke="white" strokeWidth="3.5" fill="none" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                </motion.button>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editing === td.id ? (
                    <input autoFocus value={draftText} onChange={e => setDraftText(e.target.value)} onBlur={() => commitEdit(td)} onKeyDown={e => { if (e.key === 'Enter') commitEdit(td); if (e.key === 'Escape') setEditing(null) }} style={{ ...inputStyle, padding: '4px 8px' }} />
                  ) : (
                    <div onClick={() => { setEditing(td.id); setDraftText(td.text) }} style={{ ...titleStyle, textDecoration: td.completed ? 'line-through' : 'none', opacity: td.completed ? 0.5 : 1, cursor: 'text' }}>{td.text}</div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    {topic && <span style={subStyle}>{topic.emoji} {topic.name}</span>}
                    <label style={{ ...subStyle, position: 'relative', cursor: 'pointer', color: status === 'overdue' ? 'var(--wrong)' : status === 'today' ? '#f59e0b' : 'var(--text-secondary)' }}>
                      📅 {td.due_date ? a.api.fmtDay(td.due_date) : t('assistant.noDue')}
                      <input type="date" value={td.due_date ?? ''} onChange={e => upsertTodo(buildTodo(td, { ...td, due_date: e.target.value || null })).catch(console.error)}
                        style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer' }} />
                    </label>
                  </div>
                </div>
                {pick ? (
                  <SmallBtn primary onClick={() => a.runIntent(pick.intent, { ...(pick.slots ?? {}), text: td.text }, `${pick.label}: ${td.text}`)}>
                    {t('assistant.pickThis')}
                  </SmallBtn>
                ) : (
                  <SmallBtn danger={confirm === td.id} onClick={() => { if (confirm === td.id) { removeTodo(td.id).catch(console.error); setConfirm(null) } else setConfirm(td.id) }}>
                    {confirm === td.id ? t('assistant.confirmDelete') : '🗑'}
                  </SmallBtn>
                )}
              </Row>
            </motion.div>
          )
        })}
      </AnimatePresence>
      {!pick && (addMode || rows.length > 0) && (
        <Row divider={rows.length > 0}>
          <span style={{ width: 24, textAlign: 'center', color: 'var(--accent)', fontSize: 20, flexShrink: 0 }}>+</span>
          <input value={newText} onChange={e => setNewText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') add() }} placeholder={t('assistant.addTodo')} style={{ ...inputStyle, background: 'transparent', padding: '4px 0' }} />
          {newText.trim() && <SmallBtn primary onClick={add}>{t('assistant.add')}</SmallBtn>}
        </Row>
      )}
    </Card>
  )
}

// ── Saved event (with undo) ────────────────────────────────────────────────

// `undo` is the row as it was before (a move); without it undo deletes (an add).
function SavedBlock({ eventId, undo }) {
  const { events, upsertEvent, removeEvent } = useData()
  const a = useAssistant()
  const { t } = useLanguage()
  const [undone, setUndone] = useState(false)
  const e = events.find(x => x.id === eventId)

  if (undone) return <TextBlock text={t('assistant.undone')} />
  if (!e) return null
  return (
    <Card>
      <Row>
        <span style={{ fontSize: 20 }}>✅</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={titleStyle}>{metaFor(e.kind).icon} {e.title}</div>
          <div style={subStyle}>{a.api.fmtDay(e.start_date)} · {hhmm(e.start_time)} – {hhmm(e.end_time)}</div>
        </div>
        <SmallBtn onClick={() => { (undo ? upsertEvent(undo) : removeEvent(e.id)).catch(console.error); setUndone(true) }}>{t('assistant.undo')}</SmallBtn>
        <SmallBtn onClick={() => a.setEditor({ occurrence: { event: e, date: e.start_date } })}>{t('assistant.edit')}</SmallBtn>
      </Row>
    </Card>
  )
}

// ── Stats list ─────────────────────────────────────────────────────────────

// items: [{ topicId?, icon?, label, value, sub?, trend?: 'up'|'down'|'flat', query? }]
// A row with `query` asks that as a follow-up when tapped.
const TREND = { up: ['▲', 'var(--correct)'], down: ['▼', 'var(--wrong)'], flat: ['–', 'var(--text-tertiary)'] }

function StatsBlock({ items, label }) {
  const { topics } = useData()
  const a = useAssistant()
  if (!items?.length) return null
  return (
    <div>
      {label && <div style={{ ...linkBtn, cursor: 'default', marginBottom: 6 }}>{label}</div>}
      <Card>
        {items.map((it, i) => {
          const topic = it.topicId ? topics.find(tp => tp.id === it.topicId) : null
          const icon = it.icon ?? topic?.emoji ?? null
          const trend = it.trend ? TREND[it.trend] : null
          return (
            <Row key={`${it.label}-${i}`} divider={i > 0} onClick={it.query ? () => a.run(it.query) : undefined}>
              {icon && (
                <div style={{ width: 34, height: 34, borderRadius: 10, display: 'grid', placeItems: 'center', fontSize: 18, flexShrink: 0, background: topic?.color_from ? `${topic.color_from}33` : 'var(--bg-tertiary)' }}>{icon}</div>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={titleStyle}>{it.label ?? topic?.name}</div>
                {it.sub && <div style={{ ...subStyle, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{it.sub}</div>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
                <span style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>{it.value}</span>
                {trend && <span style={{ fontSize: 12, color: trend[1] }}>{trend[0]}</span>}
              </div>
            </Row>
          )
        })}
      </Card>
    </div>
  )
}

// ── Event being created (guided flow) ──────────────────────────────────────

// Shows the flow's draft. The card of the newest question follows the live
// flow (selector taps show up immediately); older cards keep their snapshot.
function EventPreviewBlock({ flowId, rev, draft, todos = [] }) {
  const a = useAssistant()
  const { t } = useLanguage()
  const { calendars } = useData()
  const live = a.flow?.id === flowId && a.flow?.rev === rev
  const d = live ? a.flow.draft : draft
  const list = live ? a.flow.todos : todos
  const cal = calendars.find(c => c.id === d.calendar_id)
  const api = a.api
  const when = !d.date ? '…' : `${api.fmtDay(d.date)}${d.allDay ? ` · ${t('assistant.allDay')}` : d.startMin != null ? ` · ${fmtMin(d.startMin)} – ${fmtMin(d.endMin)}` : ''}`

  function moreOptions() {
    const s = d.startMin ?? 9 * 60
    const row = buildEvent({}, {
      calendar_id: d.calendar_id ?? api.defaultCalendarId(),
      kind: d.kind, title: d.title,
      start_date: d.date ?? api.today, end_date: d.date ?? api.today,
      all_day: !!d.allDay,
      start_time: d.allDay ? null : timeOf(s),
      end_time: d.allDay ? null : timeOf(Math.max(s + 5, d.endMin ?? s + 60)),
      location: d.location || null, notes: d.notes || null, reminders: d.reminders,
      topic_id: d.topic_id,
    })
    a.flowAction('cancel', null, t('assistant.moreOptions'))
    a.setEditor({ draft: row })
  }

  return (
    <Card>
      <Row>
        <div style={{ width: 4, alignSelf: 'stretch', borderRadius: 2, background: cal?.color ?? 'var(--accent)', flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={titleStyle}>{metaFor(d.kind).icon} {d.title || '…'}</div>
          <div style={subStyle}>{when}</div>
          {d.location && <div style={subStyle}>📍 {d.location}</div>}
          <div style={subStyle}>
            {cal ? `${cal.icon ?? '📅'} ${cal.name}` : ''}
            {d.reminders?.length ? ` · 🔔 ${d.reminders.map(m => reminderLabel(t, m)).join(', ')}` : ''}
          </div>
          {list.length > 0 && <div style={{ ...subStyle, marginTop: 4, whiteSpace: 'pre-line' }}>{list.map(td => `☐ ${td.text}`).join('\n')}</div>}
        </div>
        {live && <SmallBtn onClick={moreOptions}>{t('assistant.moreOptions')}</SmallBtn>}
      </Row>
    </Card>
  )
}

// A button that starts the guided flow from `init` (e.g. "add it anyway").
function FlowButtonBlock({ label, init }) {
  const a = useAssistant()
  return (
    <SmallBtn primary style={{ width: '100%', padding: '10px' }} onClick={() => a.startFlow(startEventFlow(init, a.apiRef.current), label)}>
      {label}
    </SmallBtn>
  )
}

// ── Choices ("Did you mean …?", "Should I do this?") ───────────────────────

// options: [{ label, intent, slots }]. A tap runs that intent directly (no
// re-parsing) and remembers it for this phrasing; `primary` highlights the
// first option as the proposed action.
function ChoicesBlock({ prompt, options = [], query, primary = false }) {
  const a = useAssistant()
  const { t } = useLanguage()
  const [chosen, setChosen] = useState(null)   // index | 'none'
  if (!options.length) return null
  const locked = chosen != null

  return (
    <div>
      {prompt && <div style={{ ...subStyle, fontWeight: 600, marginBottom: 6 }}>{prompt}</div>}
      <Card>
        {options.map((o, i) => (
          <Row
            key={`${o.intent}-${i}`}
            divider={i > 0}
            onClick={locked ? undefined : () => { setChosen(i); a.runIntent(o.intent, o.slots, o.label, { query }) }}
            style={chosen === i ? { background: 'var(--accent-muted)' } : locked ? { opacity: 0.45 } : undefined}
          >
            <span style={{ width: 22, textAlign: 'center', fontWeight: 700, flexShrink: 0, color: 'var(--accent)' }}>{chosen === i ? '✓' : primary && i === 0 ? '→' : '›'}</span>
            <div style={{ ...titleStyle, whiteSpace: 'normal', flex: 1, fontWeight: primary && i === 0 ? 600 : 500 }}>{o.label}</div>
          </Row>
        ))}
        <Row divider onClick={locked ? undefined : () => setChosen('none')} style={locked && chosen !== 'none' ? { opacity: 0.45 } : undefined}>
          <span style={{ width: 22, textAlign: 'center', flexShrink: 0, color: 'var(--text-tertiary)' }}>✕</span>
          <div style={{ ...subStyle, fontSize: 14, flex: 1 }}>{t('assistant.choices.none')}</div>
        </Row>
      </Card>
      {chosen === 'none' && <div style={{ ...subStyle, marginTop: 6 }}>{t('assistant.choices.noneHint')}</div>}
    </div>
  )
}

const BLOCKS = { text: TextBlock, topics: TopicsBlock, events: EventsBlock, slots: SlotsBlock, draft: DraftBlock, todos: TodosBlock, saved: SavedBlock, stats: StatsBlock, eventPreview: EventPreviewBlock, flowButton: FlowButtonBlock, choices: ChoicesBlock }

// ── Primitives ─────────────────────────────────────────────────────────────

function Card({ children, style }) {
  return <div style={{ background: 'var(--card-bg)', borderRadius: 16, overflow: 'hidden', border: '0.5px solid var(--border)', ...style }}>{children}</div>
}

function Row({ children, divider, onClick, style }) {
  return (
    <motion.div
      whileTap={onClick ? { backgroundColor: 'var(--bg-tertiary)' } : undefined}
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', borderTop: divider ? '0.5px solid var(--border)' : 'none', cursor: onClick ? 'pointer' : 'default', ...style }}
    >
      {children}
    </motion.div>
  )
}

function SmallBtn({ children, onClick, primary, danger, style, disabled }) {
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.92 }}
      onClick={onClick}
      disabled={disabled}
      style={{ flexShrink: 0, border: 'none', cursor: 'pointer', borderRadius: 10, padding: '6px 10px', fontSize: 13, fontWeight: 600, background: danger ? 'var(--wrong)' : primary ? 'var(--accent)' : 'var(--bg-tertiary)', color: danger || primary ? 'white' : 'var(--text-primary)', opacity: disabled ? 0.6 : 1, ...style }}
    >
      {children}
    </motion.button>
  )
}

const titleStyle = { fontSize: 15, fontWeight: 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }
const subStyle = { fontSize: 12, color: 'var(--text-secondary)' }
const inputStyle = { width: '100%', boxSizing: 'border-box', border: 'none', outline: 'none', borderRadius: 10, padding: '8px 10px', fontSize: 14, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontFamily: 'inherit' }
const linkBtn = { border: 'none', background: 'none', padding: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: 0.4 }
