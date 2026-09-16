// Maintenance over a user's todos. Pure: rows in, rows to delete out.

const norm = s => (s ?? '').trim().toLowerCase()

function childrenOf(todos) {
  const map = new Map()
  for (const td of todos) {
    if (!td.parent_id) continue
    if (!map.has(td.parent_id)) map.set(td.parent_id, [])
    map.get(td.parent_id).push(td)
  }
  return map
}

// Identical todos — same workspace, parent, text and due date — keep one each.
// The keeper is one with subtasks, then one linked to Google, then the oldest.
// A todo with subtasks is never deleted, so no subtree is left orphaned.
export function findDuplicates(todos) {
  const kids = childrenOf(todos)
  const groups = new Map()
  for (const td of todos) {
    const key = JSON.stringify([td.workspace_id ?? null, td.parent_id ?? null, norm(td.text), td.due_date ?? null])
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(td)
  }

  const rank = td => [kids.has(td.id) ? 0 : 1, td.google_task_id ? 0 : 1, td.created_at ?? '']
  const byRank = (a, b) => {
    const [ra, rb] = [rank(a), rank(b)]
    for (let i = 0; i < ra.length; i++) if (ra[i] !== rb[i]) return ra[i] < rb[i] ? -1 : 1
    return 0
  }

  const doomed = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    group.sort(byRank)
    for (const td of group.slice(1)) if (!kids.has(td.id)) doomed.push(td)
  }
  return doomed
}

// Completed todos whose whole subtree is completed too — a finished parent with
// an open subtask stays. Subtasks come before their parent, so a parent is never
// deleted ahead of its children.
export function findCompleted(todos) {
  const kids = childrenOf(todos)
  const byId = new Map(todos.map(td => [td.id, td]))
  const memo = new Map()
  const allDone = td => {
    if (memo.has(td.id)) return memo.get(td.id)
    memo.set(td.id, false) // guards a malformed parent cycle
    const done = !!td.completed && (kids.get(td.id) ?? []).every(allDone)
    memo.set(td.id, done)
    return done
  }

  const doomed = []
  const take = td => {
    for (const child of kids.get(td.id) ?? []) take(child)
    doomed.push(td)
  }
  for (const td of todos) {
    if (!allDone(td)) continue
    const parent = td.parent_id ? byId.get(td.parent_id) : null
    if (parent && allDone(parent)) continue // goes with its parent
    take(td)
  }
  return doomed
}
