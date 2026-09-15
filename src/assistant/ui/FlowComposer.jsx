// Selectors above the input while the assistant walks through creating an
// event or todos: the current step's choices, the todo settings, Cancel.
// Every tap goes through `flowAction`, the same reducer typed answers use.

import { useMemo } from 'react'
import { motion } from 'framer-motion'
import { useAssistant } from '../AssistantProvider.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'
import { useData } from '../../context/DataContext.jsx'
import { addDays } from '../../utils/calendar/eventModel.js'
import { PRIORITY_COLORS } from '../../utils/calculations/todoPriorityCalcs.js'
import { fmtMin } from '../engine/parse/times.js'
import { freeSlots } from '../intents/calendar.js'
import { REMINDER_CHOICES } from '../flows/eventFlow.js'

export function flowPlaceholder(flow, api) {
  const L = api.L
  if (flow.type === 'todo') return L('Todo text…', 'Todo eingeben…')
  return ({
    title: L('Title…', 'Titel…'),
    date: L('e.g. tomorrow, Friday, 3.10.', 'z. B. morgen, Freitag, 3.10.'),
    time: L('e.g. 10-12, at 3pm', 'z. B. 10 bis 12, um 15 Uhr'),
    conflict: L('Another time…', 'Andere Uhrzeit…'),
    location: L('Where? e.g. Café Central', 'Wo? z. B. Café Central'),
    calendar: L('Calendar name…', 'Kalendername…'),
    reminder: L('e.g. 30 min before', 'z. B. 30 Min. vorher'),
    askTodos: L('Yes / no — or type a todo', 'Ja / nein – oder direkt ein Todo'),
    todos: L('Todo text…', 'Todo eingeben…'),
    review: L('Change something, or Enter to save', 'Etwas ändern – oder Enter zum Speichern'),
  })[flow.step] ?? ''
}

// Label of the chat bubble when Enter is pressed on an empty input.
export function enterLabel(flow, api) {
  const L = api.L
  if (flow.type === 'todo') return flow.step === 'review' ? L('Save', 'Speichern') : L('Done', 'Fertig')
  return ({
    location: L('Skip', 'Überspringen'),
    calendar: L('Next', 'Weiter'),
    reminder: L('Next', 'Weiter'),
    askTodos: L('No todos', 'Keine Todos'),
    todos: L('Done', 'Fertig'),
    conflict: L('Keep it', 'Trotzdem'),
    review: L('Save', 'Speichern'),
  })[flow.step] ?? L('Continue', 'Weiter')
}

export function reminderLabel(t, min) {
  if (min === 0) return t('calendar.reminderAtStart')
  return min >= 60 ? t('calendar.reminderHours', { n: String(min / 60) }) : t('calendar.reminderMinutes', { n: String(min) })
}

export default function FlowComposer() {
  const a = useAssistant()
  const { t } = useLanguage()
  const flow = a?.flow
  if (!flow) return null
  const api = a.api
  const L = api.L
  const act = (action, payload = null, label = null) => a.flowAction(action, payload, label)
  const heading = flow.type === 'todo'
    ? L('New todo', 'Neues Todo')
    : ({
      title: L('Title', 'Titel'), date: L('Day', 'Tag'), time: L('Time', 'Uhrzeit'), conflict: L('Overlap', 'Überschneidung'),
      location: L('Place', 'Ort'), calendar: L('Calendar', 'Kalender'), reminder: t('calendar.reminders'),
      askTodos: 'Todos', todos: 'Todos', review: L('Review', 'Überblick'),
    })[flow.step] ?? ''

  return (
    <div style={{ padding: '8px 12px 4px', maxHeight: '40vh', overflowY: 'auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 6 }}>
        <span style={{ flex: 1, fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: 'uppercase', color: 'var(--text-secondary)' }}>{heading}</span>
        <button type="button" onClick={() => act('cancel', null, L('Cancel', 'Abbrechen'))} style={linkBtn}>{L('Cancel', 'Abbrechen')}</button>
      </div>
      {flow.type === 'todo'
        ? <TodoBody flow={flow} act={act} api={api} />
        : <EventBody flow={flow} act={act} api={api} t={t} />}
    </div>
  )
}

function EventBody({ flow, act, api, t }) {
  const { events, calendars, topics } = useData()
  const L = api.L
  const d = flow.draft

  const recentPlaces = useMemo(() => [...new Set(
    events
      .filter(e => e.location?.trim())
      .sort((x, y) => String(y.updated_at ?? y.created_at ?? '').localeCompare(String(x.updated_at ?? x.created_at ?? '')))
      .map(e => e.location.trim()),
  )].slice(0, 6), [events])

  switch (flow.step) {
    case 'date': {
      const days = [0, 1, 2, 3, 4, 5, 6].map(i => addDays(api.today, i))
      const name = (k, i) => (i === 0 ? L('Today', 'Heute') : i === 1 ? L('Tomorrow', 'Morgen') : api.fmtDay(k))
      return <Wrap>{days.map((k, i) => <C key={k} onClick={() => act('setDate', k, name(k, i))}>{name(k, i)}</C>)}</Wrap>
    }
    case 'time': {
      let starts = []
      try {
        const set = new Set()
        for (const s of freeSlots(api, d.date ?? api.today, 60)) {
          for (let m = Math.ceil(s.start / 60) * 60; m + 60 <= s.end && set.size < 6; m += 60) set.add(m)
        }
        starts = [...set]
      } catch { /* no data */ }
      return (
        <Wrap>
          {starts.map(m => <C key={m} onClick={() => act('setTime', m, fmtMin(m))}>{fmtMin(m)}</C>)}
          <C onClick={() => act('allDay', null, L('All day', 'Ganztägig'))}>{L('All day', 'Ganztägig')}</C>
        </Wrap>
      )
    }
    case 'conflict':
      return (
        <Wrap>
          {flow.alts.map((x, i) => {
            const label = `${x.date === d.date ? '' : `${api.fmtDay(x.date)} · `}${fmtMin(x.start)}–${fmtMin(x.end)}`
            return <C key={i} onClick={() => act('pickAlt', i, label)}>{label}</C>
          })}
          <C onClick={() => act('keep', null, L('Keep it', 'Trotzdem'))}>{L('Keep it', 'Trotzdem behalten')}</C>
        </Wrap>
      )
    case 'location':
      return (
        <Wrap>
          {recentPlaces.map(p => <C key={p} onClick={() => act('setLocation', p, `📍 ${p}`)}>📍 {p}</C>)}
          <C onClick={() => act('skip', null, L('Skip', 'Überspringen'))}>{L('Skip', 'Überspringen')}</C>
        </Wrap>
      )
    case 'calendar':
      return <CalendarChips calendars={calendars} value={d.calendar_id} onPick={c => act('setCalendar', c.id, `${c.icon ?? '📅'} ${c.name}`)} />
    case 'reminder':
      return (
        <>
          <ReminderChips value={d.reminders} act={act} t={t} L={L} />
          <Wrap>
            <C primary onClick={() => act('next', null, d.reminders.length ? `🔔 ${d.reminders.map(m => reminderLabel(t, m)).join(', ')}` : L('No reminder', 'Keine Erinnerung'))}>{L('Next', 'Weiter')}</C>
          </Wrap>
        </>
      )
    case 'askTodos':
      return (
        <Wrap>
          <C primary onClick={() => act('todosYes', null, L('Yes, add todos', 'Ja, Todos anlegen'))}>{L('Yes, add todos', 'Ja, Todos anlegen')}</C>
          <C onClick={() => act('todosNo', null, L('No, save', 'Nein, speichern'))}>{L('No, save', 'Nein, speichern')}</C>
        </Wrap>
      )
    case 'todos':
      return (
        <>
          <TodoSettings value={flow.todoSettings} onChange={p => act('todoSetting', p)} api={api} topics={topics} eventDate={d.date} />
          {flow.todos.length > 0 && (
            <Wrap>{flow.todos.map((td, i) => <C key={`${td.text}-${i}`} onClick={() => act('removeTodo', i)}>☐ {td.text} ×</C>)}</Wrap>
          )}
          <Wrap><C primary onClick={() => act('done', null, L('Done', 'Fertig'))}>{L('Done', 'Fertig')}</C></Wrap>
        </>
      )
    case 'review':
      return (
        <>
          {calendars.length > 1 && (
            <>
              <Label>{L('Calendar', 'Kalender')}</Label>
              <CalendarChips calendars={calendars} value={d.calendar_id} onPick={c => act('setCalendar', c.id)} />
            </>
          )}
          <Label>{t('calendar.reminders')}</Label>
          <ReminderChips value={d.reminders} act={act} t={t} L={L} />
          <Wrap>
            <C onClick={() => act('addLocation', null, L('+ Place', '+ Ort'))}>📍 {d.location ? L('Change place', 'Ort ändern') : L('+ Place', '+ Ort')}</C>
            <C onClick={() => act('addTodos', null, L('+ Todos', '+ Todos'))}>☑️ {L('+ Todos', '+ Todos')}{flow.todos.length ? ` (${flow.todos.length})` : ''}</C>
            <C primary onClick={() => act('save', null, L('Save', 'Speichern'))}>{L('Save', 'Speichern')}</C>
          </Wrap>
        </>
      )
    default:
      return null
  }
}

function TodoBody({ flow, act, api }) {
  const { topics } = useData()
  const L = api.L
  const upcoming = useMemo(() => {
    const seen = new Set()
    const out = []
    try {
      for (const o of api.occurrences(api.today, addDays(api.today, 30)).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.startMin - b.startMin))) {
        if (seen.has(o.event.id)) continue
        seen.add(o.event.id)
        out.push(o)
        if (out.length >= 20) break
      }
    } catch { /* no data */ }
    return out
  }, [api])

  return (
    <>
      <TodoSettings value={flow.settings} onChange={p => act('setting', p)} api={api} topics={topics} upcoming={upcoming} />
      <Wrap>
        {flow.step === 'review'
          ? <C primary onClick={() => act('save', null, L('Save', 'Speichern'))}>{L('Save', 'Speichern')}</C>
          : <C primary onClick={() => act('done', null, L('Done', 'Fertig'))}>{L('Done', 'Fertig')}</C>}
      </Wrap>
    </>
  )
}

function TodoSettings({ value, onChange, api, topics, eventDate = null, upcoming = null }) {
  const L = api.L
  const tomorrow = addDays(api.today, 1)
  const dueChoices = [
    [null, L('No date', 'Kein Datum')],
    ...(eventDate && eventDate !== api.today && eventDate !== tomorrow ? [[eventDate, L('Event day', 'Termintag')]] : []),
    [api.today, L('Today', 'Heute')],
    [tomorrow, L('Tomorrow', 'Morgen')],
  ]
  return (
    <>
      <Label>{L('Due', 'Fällig')}</Label>
      <Wrap>
        {dueChoices.map(([k, label]) => <C key={label} active={value.due_date === k} onClick={() => onChange({ due_date: k, ...(k ? {} : { due_time: null }) })}>{label}</C>)}
        <input type="date" value={value.due_date ?? ''} onChange={e => onChange({ due_date: e.target.value || null })} style={field} />
        {value.due_date && <input type="time" value={value.due_time ?? ''} onChange={e => onChange({ due_time: e.target.value || null })} style={field} />}
      </Wrap>
      <Label>{L('Priority', 'Priorität')}</Label>
      <Wrap>
        {[null, 1, 2, 3].map(p => (
          <C key={String(p)} active={value.priority === p} onClick={() => onChange({ priority: p })}>
            {p ? <><span style={{ display: 'inline-block', width: 7, height: 7, borderRadius: 4, background: PRIORITY_COLORS[p], marginRight: 5 }} />{'!'.repeat(p)}</> : '–'}
          </C>
        ))}
      </Wrap>
      {(topics.length > 0 || upcoming?.length > 0) && (
        <Wrap>
          {topics.length > 0 && (
            <select value={value.topic_id ?? ''} onChange={e => onChange({ topic_id: e.target.value || null })} style={{ ...field, flex: '1 1 140px' }}>
              <option value="">{L('No topic', 'Kein Topic')}</option>
              {topics.map(tp => <option key={tp.id} value={tp.id}>{tp.emoji} {tp.name}</option>)}
            </select>
          )}
          {upcoming?.length > 0 && (
            <select value={value.event_id ?? ''} onChange={e => onChange({ event_id: e.target.value || null })} style={{ ...field, flex: '1 1 160px' }}>
              <option value="">{L('No event', 'Kein Termin')}</option>
              {upcoming.map(o => <option key={o.event.id} value={o.event.id}>{api.fmtDay(o.date)} · {o.event.title}</option>)}
            </select>
          )}
        </Wrap>
      )}
    </>
  )
}

function CalendarChips({ calendars, value, onPick }) {
  return (
    <Wrap>
      {calendars.map(c => (
        <C key={c.id} active={value === c.id} color={c.color} onClick={() => onPick(c)}>{c.icon ?? '📅'} {c.name}</C>
      ))}
    </Wrap>
  )
}

function ReminderChips({ value, act, t, L }) {
  return (
    <Wrap>
      <C active={!value.length} onClick={() => act('toggleReminder', null)}>{L('None', 'Keine')}</C>
      {REMINDER_CHOICES.map(m => <C key={m} active={value.includes(m)} onClick={() => act('toggleReminder', m)}>{reminderLabel(t, m)}</C>)}
    </Wrap>
  )
}

function Wrap({ children }) {
  return <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 6, marginBottom: 6 }}>{children}</div>
}

function Label({ children }) {
  return <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-tertiary)', margin: '2px 0 4px' }}>{children}</div>
}

function C({ children, onClick, active, primary, color }) {
  const accent = color ?? 'var(--accent)'
  const on = active || primary
  return (
    <motion.button
      type="button"
      whileTap={{ scale: 0.95 }}
      onClick={onClick}
      style={{
        flexShrink: 0, cursor: 'pointer', borderRadius: 14, padding: '6px 11px', fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
        border: `1.5px solid ${on ? accent : 'transparent'}`,
        background: on ? accent : 'var(--bg-tertiary)',
        color: on ? 'white' : 'var(--text-primary)',
      }}
    >
      {children}
    </motion.button>
  )
}

const field = { border: 'none', outline: 'none', borderRadius: 10, padding: '6px 8px', fontSize: 13, background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontFamily: 'inherit' }
const linkBtn = { border: 'none', background: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 600, color: 'var(--wrong)', padding: '2px 4px' }
