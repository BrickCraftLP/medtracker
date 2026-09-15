// Todo ranking shared by the todo widget and the calendar, so both views agree.
// Derived priority mirrors the Planner: topics far below their target accuracy
// and carrying a high weight are the most urgent.

export const PRIORITY_COLORS = { 1: '#94a3b8', 2: '#f59e0b', 3: '#ef4444' }
export const PRIORITY_KEYS = ['none', 'low', 'medium', 'high']

// Local calendar day key. Never toISOString() — it shifts across the UTC boundary.
export function localDayKey(d = new Date()) {
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${d.getFullYear()}-${m}-${day}`
}

export function addDaysKey(n, from = new Date()) {
  const d = new Date(from)
  d.setDate(d.getDate() + n)
  return localDayKey(d)
}

function daysBetween(fromKey, toKey) {
  const utc = k => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d) }
  return Math.round((utc(toKey) - utc(fromKey)) / 86400000)
}

// Map<topicId, 0..1> — gap × weight, normalised by the most urgent topic.
export function calcTopicUrgency(topics, sessions = []) {
  const totals = {}
  for (const s of sessions) {
    if (!s.topic_id) continue
    const tot = (totals[s.topic_id] ??= { correct: 0, total: 0 })
    tot.correct += s.correct ?? 0
    tot.total   += s.total_exercises ?? 0
  }
  const raw = new Map()
  for (const topic of topics) {
    const tot = totals[topic.id]
    const accuracy = tot?.total > 0 ? (tot.correct / tot.total) * 100 : null
    const target = Number(topic.target_accuracy ?? 80)
    const gap = accuracy === null ? target : Math.max(0, target - accuracy)
    raw.set(topic.id, gap * Number(topic.weight ?? 50))
  }
  const max = Math.max(0, ...raw.values())
  const out = new Map()
  for (const [id, v] of raw) out.set(id, max > 0 ? v / max : 0)
  return out
}

// Manual priority wins; otherwise derive from the topic. Level 0 = no priority.
export function effectivePriority(todo, urgency) {
  if (todo.priority >= 1 && todo.priority <= 3) return { level: todo.priority, derived: false }
  if (!todo.topic_id || !urgency?.has(todo.topic_id)) return { level: 0, derived: false }
  const u = urgency.get(todo.topic_id)
  return { level: u >= 0.66 ? 3 : u >= 0.33 ? 2 : 1, derived: true }
}

// 'HH:mm' from a Postgres time ('HH:mm:ss') or an <input type="time"> value.
export const shortTime = value => (value ? value.slice(0, 5) : null)

export function dueStatus(todo, today = localDayKey(), now = new Date()) {
  if (!todo.due_date) return null
  const diff = daysBetween(today, todo.due_date)
  if (diff < 0) return 'overdue'
  if (diff === 0) {
    const nowTime = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
    return todo.due_time && shortTime(todo.due_time) < nowTime ? 'overdue' : 'today'
  }
  if (diff === 1) return 'tomorrow'
  if (diff <= 3) return 'soon'
  return 'later'
}

const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

// Modes: smart (overdue/today first, then priority, due date, age),
// priority, due, created. Completed todos always sink to the bottom.
export function sortTodos(todos, { mode = 'smart', urgency, today = localDayKey() } = {}) {
  const dueRank = td => { const s = dueStatus(td, today); return s === 'overdue' ? 0 : s === 'today' ? 1 : 2 }
  return [...todos].sort((a, b) => {
    if (!!a.completed !== !!b.completed) return a.completed ? 1 : -1
    const byPriority = effectivePriority(b, urgency).level - effectivePriority(a, urgency).level
    // All-day todos sort after timed ones on the same day.
    const dueKey     = td => `${td.due_date ?? '9999-12-31'}T${shortTime(td.due_time) ?? '99:99'}`
    const byDue      = cmp(dueKey(a), dueKey(b))
    const byCreated  = cmp(a.created_at ?? '', b.created_at ?? '')
    switch (mode) {
      case 'priority': return byPriority || byDue || byCreated
      case 'due':      return byDue || byPriority || byCreated
      case 'created':  return byCreated
      default:         return (dueRank(a) - dueRank(b)) || byPriority || byDue || byCreated
    }
  })
}

// Only send the optional columns when they are (or were) set, so rows keep
// saving on a database that hasn't run supabase_migration_todo_priority.sql or
// supabase_migration_calendar_v2.sql yet. A time without a date is
// meaningless, so it is dropped with the date.
export function buildTodo(base, {
  text, topic_id, due_date, due_time, priority,
  parent_id, event_id, sort_order, notes,
}) {
  const row = { ...base, text, topic_id: topic_id ?? null, due_date: due_date ?? null }
  const optional = {
    priority,
    due_time: due_date && due_time ? `${shortTime(due_time)}:00` : null,
    parent_id,
    event_id,
    sort_order,
    notes,
  }
  for (const [key, value] of Object.entries(optional)) {
    if (value != null || base[key] != null) row[key] = value ?? null
    else delete row[key]
  }
  return row
}
