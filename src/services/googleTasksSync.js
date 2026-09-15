// Two-way sync between todos and one Google task list.
//
// Syncing is per list, not per workspace. Several workspaces can share a list
// ("merged"), and synced apart each would see the other's tasks as new and
// copy them in. So one run takes every workspace linked to the list, and a
// task created in Google lands in the list's primary workspace.
//
// Same shape as googleSync.js (calendar), with the differences Tasks forces:
//   • no sync token — the pull uses updatedMin, backed off by a few minutes
//     for clock skew; re-seeing a change is harmless thanks to the echo guard;
//   • one level of subtasks — a todo syncs when it is top-level, or a direct
//     child of a top-level todo. Deeper subtasks stay local;
//   • Google stores the due DATE only — due_time, priority, topic and order
//     never leave MedTracker, and a pull never clears a local time while the
//     date it belongs to is unchanged;
//   • a todo attached to a calendar event goes too: due on the event's day
//     unless it has a date of its own, with the event's title as the first
//     line of its notes. Both are derived, so a pull never writes them back.
//
// Local rows come from the IndexedDB mirror as well as React state. React
// state only holds the active workspace, and right after a switch can still be
// empty — a pull matched against nothing would re-insert every task.

import { getMeta, setMeta, getAllByWorkspace, STORES } from './offlineDB.js'
import { listTasks, insertTask, patchTask, moveTask, deleteTask } from './googleTasks.js'
import { GoogleApiError } from './googleAuth.js'

const STATE_VERSION = 1
const SKEW_MS = 5 * 60_000
const stateKey = listId => `googleTasksList:${listId}`
// Per workspace, so a deletion can be noted without knowing which list is
// linked, and survives a relink.
const deletesKey = workspaceId => `googleTasksDeletes:${workspaceId}`
const EVENT_PREFIX = '📅 '

const freshState = () => ({ version: STATE_VERSION, updatedMin: null, lastPushed: {}, parents: {} })

async function loadState(listId) {
  const saved = await getMeta(stateKey(listId))
  return saved?.version === STATE_VERSION ? saved : freshState()
}

export async function noteTaskDelete(workspaceId, taskId) {
  if (!workspaceId || !taskId) return
  const pending = (await getMeta(deletesKey(workspaceId))) ?? []
  if (!pending.includes(taskId)) await setMeta(deletesKey(workspaceId), [...pending, taskId])
}

export async function clearTasksState(listId) {
  if (listId) await setMeta(stateKey(listId), null)
}

// ── Mapping ────────────────────────────────────────────────────────────────

export function toTask(todo, event = null) {
  const completed = !!todo.completed
  const due = todo.due_date ?? event?.start_date ?? null
  return {
    title: todo.text ?? '',
    notes: event
      ? [`${EVENT_PREFIX}${event.title || '—'}`, todo.notes].filter(Boolean).join('\n')
      : todo.notes ?? '',
    status: completed ? 'completed' : 'needsAction',
    // Google discards the time part; midnight UTC is what it hands back.
    due: due ? `${due}T00:00:00.000Z` : null,
    ...(completed ? {} : { completed: null }),
  }
}

// The event line toTask adds is derived, never part of the todo's own notes.
function ownNotes(notes) {
  if (!notes) return null
  if (!notes.startsWith(EVENT_PREFIX)) return notes
  const newline = notes.indexOf('\n')
  return newline < 0 ? null : notes.slice(newline + 1) || null
}

export function fromTask(item) {
  return {
    text: item.title ?? '',
    notes: ownNotes(item.notes),
    completed: item.status === 'completed',
    due_date: item.due ? item.due.slice(0, 10) : null,
  }
}

// What Google ends up holding for a todo, in comparable form.
const outgoing = (td, event = null) => [
  td.text ?? '', td.notes || null, !!td.completed, td.due_date || event?.start_date || null, td.parent_id || null,
]

// The event's title is part of what was pushed, so renaming the event re-pushes.
const taskHash = (td, event) => JSON.stringify([...outgoing(td, event), event?.title ?? null])

function isEligible(row, rows) {
  if (!row) return false
  if (!row.parent_id) return true
  const parent = rows.get(row.parent_id)
  return !!parent && !parent.parent_id
}

async function localRows(group, ctx) {
  const ids = new Set(group.workspaces.map(w => w.id))
  const rows = new Map()
  for (const ws of group.workspaces) {
    try {
      for (const td of await getAllByWorkspace(STORES.todos, ws.user_id, ws.id)) rows.set(td.id, td)
    } catch (e) {
      console.warn('googleTasksSync: offline mirror unavailable', e)
    }
  }
  // React state can be a write ahead of the mirror (a save still in flight).
  for (const td of ctx.todos) if (ids.has(td.workspace_id)) rows.set(td.id, td)
  return rows
}

// ── Sync ───────────────────────────────────────────────────────────────────

// `group` is { listId, workspaces, primaryId }.
// `ctx` keeps this file free of React: { todos, eventsById, upsertTodo, removeTodo }.
export async function syncTaskList(group, ctx) {
  const result = { pulled: 0, pushed: 0, deleted: 0, errors: 0, lastError: null }
  const listId = group?.listId
  if (!listId || !group.workspaces?.length) return result
  const primaryId = group.primaryId ?? group.workspaces[0].id

  const state = await loadState(listId)
  const startedAt = Date.now()
  const rows = await localRows(group, ctx)
  const byTaskId = new Map()
  for (const td of rows.values()) if (td.google_task_id) byTaskId.set(td.google_task_id, td)

  const eventOf = row => (row?.event_id ? ctx.eventsById?.get(row.event_id) ?? null : null)

  const remember = (saved, parentTaskId) => {
    rows.set(saved.id, saved)
    if (saved.google_task_id) byTaskId.set(saved.google_task_id, saved)
    state.lastPushed[saved.id] = taskHash(saved, eventOf(saved))
    state.parents[saved.id] = parentTaskId ?? null
    return saved
  }
  const forget = row => {
    if (row.google_task_id) byTaskId.delete(row.google_task_id)
    delete state.lastPushed[row.id]
    delete state.parents[row.id]
  }
  const fail = (what, e) => {
    console.error(`googleTasksSync: ${listId}: ${what} failed`, e)
    result.errors += 1
    result.lastError = e?.message ?? String(e)
  }

  // ── Pull, one item ──
  async function applyRemote(item) {
    const local = byTaskId.get(item.id)

    if (item.deleted) {
      if (local) {
        await ctx.removeTodo(local.id, { skipGoogle: true })
        forget(local)
        rows.delete(local.id)
        result.deleted += 1
      }
      return
    }

    const mapped = fromTask(item)
    const parent = item.parent ? byTaskId.get(item.parent) : null
    // A parent we don't know (yet) keeps the local link rather than orphaning.
    const parentId = item.parent ? (parent?.id ?? local?.parent_id ?? null) : null

    if (!local) {
      remember(await ctx.upsertTodo({
        ...mapped,
        due_time: null,
        parent_id: parentId,
        // A new subtask belongs with its parent; anything else goes to the
        // workspace that receives this list's new tasks.
        workspace_id: parent?.workspace_id ?? primaryId,
        google_task_id: item.id,
        // Same unit the migration backfilled with: epoch seconds, so a new
        // task lands after the existing ones.
        sort_order: Date.now() / 1000,
      }), item.parent)
      result.pulled += 1
      return
    }

    const event = eventOf(local)
    state.parents[local.id] = item.parent ?? null

    // Our own write, echoed back.
    if (JSON.stringify(outgoing(local, event)) === JSON.stringify(outgoing({ ...mapped, parent_id: parentId }))) {
      if (state.lastPushed[local.id] == null) state.lastPushed[local.id] = taskHash(local, event)
      return
    }

    const localDirty = state.lastPushed[local.id] !== taskHash(local, event)
    const remoteNewer = Date.parse(item.updated ?? 0) >= Date.parse(local.updated_at ?? 0)
    if (localDirty && !remoteNewer) return // the push below sends ours

    // A due date that is only the event's day stays derived.
    const dueDate = event && !local.due_date && mapped.due_date === event.start_date ? null : mapped.due_date
    remember(await ctx.upsertTodo({
      ...local,
      ...mapped,
      due_date: dueDate,
      parent_id: parentId,
      due_time: dueDate && dueDate === local.due_date ? local.due_time ?? null : null,
    }), item.parent)
    result.pulled += 1
  }

  // ── Push, one row ──
  async function pushOne(row) {
    if (!isEligible(row, rows)) {
      if (!row.google_task_id) return
      // Nested deeper since it was synced: it no longer belongs in Google.
      await deleteTask(listId, row.google_task_id)
      forget(row)
      rows.set(row.id, await ctx.upsertTodo({ ...row, google_task_id: null }))
      result.deleted += 1
      return
    }

    const event = eventOf(row)
    const parentTaskId = row.parent_id ? rows.get(row.parent_id)?.google_task_id ?? null : null
    if (row.parent_id && !parentTaskId) return // parent not on Google yet; next round

    if (!row.google_task_id) {
      const created = await insertTask(listId, toTask(row, event), { parent: parentTaskId ?? undefined })
      try {
        remember(await ctx.upsertTodo({ ...row, google_task_id: created.id }), parentTaskId)
      } catch (e) {
        // Without the id stored locally the next run would insert it again.
        await deleteTask(listId, created.id).catch(() => {})
        throw e
      }
      result.pushed += 1
      return
    }

    try {
      const knownParent = state.parents[row.id]
      if (knownParent !== undefined && knownParent !== parentTaskId) {
        await moveTask(listId, row.google_task_id, { parent: parentTaskId ?? undefined })
        state.parents[row.id] = parentTaskId
        result.pushed += 1
      }
      if (state.lastPushed[row.id] === taskHash(row, event)) return
      await patchTask(listId, row.google_task_id, toTask(row, event))
      state.lastPushed[row.id] = taskHash(row, event)
      result.pushed += 1
    } catch (e) {
      // Not in this list: it was synced with a list linked before (or its
      // workspace was merged into this one). Drop the stale id so the next run
      // creates it here.
      if (e instanceof GoogleApiError && e.status === 404) {
        forget(row)
        rows.set(row.id, await ctx.upsertTodo({ ...row, google_task_id: null }))
        return
      }
      throw e
    }
  }

  try {
    // 1. Deletions noted while offline, or cascaded from a deleted topic.
    for (const ws of group.workspaces) {
      const pending = (await getMeta(deletesKey(ws.id))) ?? []
      if (!pending.length) continue
      const stillPending = []
      for (const taskId of pending) {
        try { await deleteTask(listId, taskId); result.deleted += 1 } catch { stillPending.push(taskId) }
      }
      await setMeta(deletesKey(ws.id), stillPending)
    }

    // 2. Pull
    const items = []
    let pageToken = null
    do {
      const page = await listTasks(listId, { updatedMin: state.updatedMin ?? undefined, pageToken })
      items.push(...page.items)
      pageToken = page.nextPageToken
    } while (pageToken)

    // Parents before their subtasks, so a subtask arriving with a new parent
    // in the same pull can be attached to it.
    items.sort((a, b) => (a.parent ? 1 : 0) - (b.parent ? 1 : 0))
    let pullFailed = false
    for (const item of items) {
      try { await applyRemote(item) } catch (e) { pullFailed = true; fail(`pull ${item.id}`, e) }
    }

    // 3. Push, top-level first so a new subtask's parent already has its id.
    const ordered = [...rows.values()].sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0))
    for (const row of ordered) {
      const current = rows.get(row.id)
      if (!current) continue
      try { await pushOne(current) } catch (e) { fail(`push ${row.id}`, e) }
    }

    // A change that failed to apply must come back next time.
    if (!pullFailed) state.updatedMin = new Date(startedAt - SKEW_MS).toISOString()
  } finally {
    await setMeta(stateKey(listId), state)
  }
  return result
}
