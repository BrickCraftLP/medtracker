// Nested todos, and the completion ratio an event's outline draws.
//
// Lives next to todoPriorityCalcs.js and reuses its row shape — a subtask is
// an ordinary todo with a parent_id, so priority, due dates and the smart sort
// all keep working on it unchanged.

// Deep enough to break real work down, shallow enough to stay readable on a
// phone. Enforced in the UI (the "add subtask" affordance disappears), not in
// SQL, so an import can never be rejected for being one level too deep.
export const MAX_DEPTH = 3

export function buildTodoTree(todos, { rootFilter } = {}) {
  const byParent = new Map()
  for (const td of todos) {
    const key = td.parent_id ?? null
    if (!byParent.has(key)) byParent.set(key, [])
    byParent.get(key).push(td)
  }
  for (const list of byParent.values()) {
    list.sort((a, b) =>
      (a.sort_order ?? 0) - (b.sort_order ?? 0) ||
      String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')))
  }

  const attach = (node, depth) => ({
    ...node,
    depth,
    children: (byParent.get(node.id) ?? []).map(child => attach(child, depth + 1)),
  })

  const roots = (byParent.get(null) ?? []).filter(rootFilter ?? (() => true))
  return roots.map(root => attach(root, 0))
}

// Leaf-weighted on purpose: a parent with four subtasks contributes four
// units, so breaking work down doesn't quietly shrink its share of the ring.
export function leafProgress(nodes) {
  let done = 0
  let total = 0
  const walk = list => {
    for (const node of list) {
      if (node.children?.length) walk(node.children)
      else { total += 1; if (node.completed) done += 1 }
    }
  }
  walk(nodes)
  return { done, total, ratio: total ? done / total : 0 }
}

export function flattenTree(nodes, out = []) {
  for (const node of nodes) {
    out.push(node)
    if (node.children?.length) flattenTree(node.children, out)
  }
  return out
}

export function descendantsOf(node) {
  const out = []
  const walk = list => { for (const n of list) { out.push(n); walk(n.children ?? []) } }
  walk(node.children ?? [])
  return out
}

// Drop position between two siblings. Fractional so a reorder is one write
// instead of re-indexing the whole list; the caller re-indexes only if the gap
// collapses (see NEEDS_REINDEX).
export const NEEDS_REINDEX = 1e-6

export function orderBetween(prev, next) {
  const a = prev?.sort_order ?? 0
  if (next == null) return a + 1
  const b = next.sort_order ?? a + 2
  return (a + b) / 2
}

// eventId → { done, total, ratio }, built once per render and handed to every
// block as a lookup, so no block filters the todo list itself.
//
// A task linked to an event counts its whole subtree, whether or not the
// subtasks carry the link themselves — you attach the work, not each step.
// A linked task nested under another linked task is counted once, inside its
// parent's subtree.
export function progressByEvent(todos) {
  const byId = new Map(todos.map(td => [td.id, td]))
  const childrenOf = new Map()
  for (const td of todos) {
    const key = td.parent_id ?? null
    if (!childrenOf.has(key)) childrenOf.set(key, [])
    childrenOf.get(key).push(td)
  }

  const countLeaves = node => {
    const kids = childrenOf.get(node.id) ?? []
    if (!kids.length) return { done: node.completed ? 1 : 0, total: 1 }
    let done = 0
    let total = 0
    for (const kid of kids) {
      const sub = countLeaves(kid)
      done += sub.done
      total += sub.total
    }
    return { done, total }
  }

  const linkedAbove = (td, eventId) => {
    let cursor = td.parent_id ? byId.get(td.parent_id) : null
    let guard = 0
    while (cursor && guard++ < MAX_DEPTH + 2) {
      if (cursor.event_id === eventId) return true
      cursor = cursor.parent_id ? byId.get(cursor.parent_id) : null
    }
    return false
  }

  const out = new Map()
  for (const td of todos) {
    if (!td.event_id || linkedAbove(td, td.event_id)) continue
    const sub = countLeaves(td)
    const acc = out.get(td.event_id) ?? { done: 0, total: 0, ratio: 0 }
    acc.done += sub.done
    acc.total += sub.total
    acc.ratio = acc.total ? acc.done / acc.total : 0
    out.set(td.event_id, acc)
  }
  return out
}
