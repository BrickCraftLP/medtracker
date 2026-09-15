// Nested checklist, used inside the event editor and (later) the exam editor.
//
// Completion semantics follow Things 3, which is what people expect:
//   • ticking a parent ticks its whole subtree (one write, one repaint);
//   • unticking a parent leaves the children alone;
//   • finishing the last child does NOT auto-close the parent — it fills the
//     parent's ring and lets the user close it deliberately.

import { useState } from 'react'
import { motion } from 'framer-motion'
import { buildTodoTree, descendantsOf, leafProgress, MAX_DEPTH } from '../../utils/calculations/eventProgressCalcs.js'
import { PRIORITY_COLORS, buildTodo } from '../../utils/calculations/todoPriorityCalcs.js'

const INDENT = 18

export default function SubtaskList({
  todos, eventId, topicId, dueDate, onUpsert, onUpsertMany, onRemove, t,
}) {
  const [adding, setAdding] = useState(null) // null | parentId | 'root'
  const [text, setText] = useState('')

  // Everything reachable from this event: linked tasks plus their subtrees,
  // whether or not the children carry the link themselves.
  const ids = new Set()
  const collect = id => {
    if (ids.has(id)) return
    ids.add(id)
    for (const td of todos) if (td.parent_id === id) collect(td.id)
  }
  for (const td of todos) if (td.event_id === eventId) collect(td.id)
  const scoped = todos.filter(td => ids.has(td.id))
  const tree = buildTodoTree(
    scoped.map(td => (td.parent_id && ids.has(td.parent_id) ? td : { ...td, parent_id: null })),
  )
  const progress = leafProgress(tree)

  async function toggle(node) {
    const next = !node.completed
    // Ticking a parent closes the whole subtree; unticking only itself.
    const rows = next
      ? [node, ...descendantsOf(node)].filter(n => n.completed !== true)
      : [node]
    const payload = rows.map(n => ({ ...stripTreeFields(n), completed: next }))
    if (payload.length > 1 && onUpsertMany) await onUpsertMany(payload)
    else await onUpsert(payload[0])
  }

  async function add(parentId) {
    const value = text.trim()
    if (!value) { setAdding(null); return }
    const siblings = scoped.filter(td => (td.parent_id ?? null) === (parentId ?? null))
    const last = siblings[siblings.length - 1]
    await onUpsert(buildTodo(
      { id: crypto.randomUUID(), completed: false },
      {
        text: value,
        topic_id: topicId ?? null,
        due_date: dueDate ?? null,
        parent_id: parentId ?? null,
        // Only the root level carries the event link — the subtree is reached
        // through its parent, so a moved subtask can't orphan its progress.
        event_id: parentId ? null : eventId,
        sort_order: (last?.sort_order ?? 0) + 1,
      },
    ))
    setText('')
    setAdding(parentId ?? 'root')
  }

  const render = nodes => nodes.map(node => (
    <div key={node.id}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8,
        paddingLeft: node.depth * INDENT, marginBottom: 5,
      }}>
        <button
          onClick={() => toggle(node)}
          aria-label={t('calendar.done')}
          style={{
            width: 18, height: 18, borderRadius: '50%', flexShrink: 0, cursor: 'pointer',
            display: 'grid', placeItems: 'center',
            border: `1.5px solid ${node.completed ? 'var(--accent)' : 'var(--border-strong)'}`,
            background: node.completed ? 'var(--accent)' : 'transparent',
          }}
        >
          {node.completed && (
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="3.4" strokeLinecap="round">
              <path d="M5 13l4 4L19 7" />
            </svg>
          )}
        </button>

        {node.priority > 0 && (
          <span style={{
            width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
            background: PRIORITY_COLORS[node.priority],
          }} />
        )}

        <span style={{
          flex: 1, minWidth: 0, fontSize: 13.5, color: 'var(--text-primary)',
          textDecoration: node.completed ? 'line-through' : 'none',
          opacity: node.completed ? 0.55 : 1,
          whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
        }}>
          {node.text}
        </span>

        {node.depth + 1 < MAX_DEPTH && (
          <button
            onClick={() => { setText(''); setAdding(node.id) }}
            aria-label={t('calendar.addSubtask')}
            style={{
              border: 'none', background: 'transparent', cursor: 'pointer',
              color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1, padding: '0 2px',
            }}
          >+</button>
        )}
        <button
          onClick={() => onRemove(node.id)}
          aria-label={t('calendar.delete')}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer',
            color: 'var(--text-tertiary)', fontSize: 15, lineHeight: 1, padding: '0 2px',
          }}
        >×</button>
      </div>

      {adding === node.id && (
        <AddRow
          value={text} onChange={setText} onSubmit={() => add(node.id)} onCancel={() => setAdding(null)}
          indent={(node.depth + 1) * INDENT} placeholder={t('calendar.subtaskPlaceholder')}
        />
      )}

      {node.children?.length > 0 && render(node.children)}
    </div>
  ))

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-secondary)', letterSpacing: 0.3 }}>
          {t('calendar.checklist')}
        </span>
        {progress.total > 0 && (
          <span style={{ fontSize: 11.5, color: 'var(--text-tertiary)', fontVariantNumeric: 'tabular-nums' }}>
            {progress.done}/{progress.total}
          </span>
        )}
      </div>

      {render(tree)}

      {adding === 'root' || tree.length === 0 ? (
        <AddRow
          value={text} onChange={setText} onSubmit={() => add(null)} onCancel={() => setAdding(null)}
          indent={0} placeholder={t('calendar.taskPlaceholder')}
        />
      ) : (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => { setText(''); setAdding('root') }}
          style={{
            border: 'none', background: 'transparent', cursor: 'pointer', padding: '2px 0',
            fontSize: 12.5, fontWeight: 600, color: 'var(--accent)',
          }}
        >
          + {t('calendar.addTask')}
        </motion.button>
      )}
    </div>
  )
}

function AddRow({ value, onChange, onSubmit, onCancel, indent, placeholder }) {
  return (
    <div style={{ display: 'flex', gap: 6, paddingLeft: indent, marginBottom: 6 }}>
      <input
        className="te-input"
        autoFocus
        value={value}
        placeholder={placeholder}
        onChange={e => onChange(e.target.value)}
        onKeyDown={e => {
          if (e.key === 'Enter') { e.preventDefault(); onSubmit() }
          if (e.key === 'Escape') onCancel()
        }}
        onBlur={() => { if (!value.trim()) onCancel() }}
        style={{ flex: 1, height: 36, padding: '0 10px', fontSize: 13.5 }}
      />
    </div>
  )
}

// The tree adds `depth` and `children`; never write those back to the row.
function stripTreeFields(node) {
  const { depth, children, ...row } = node
  return row
}
