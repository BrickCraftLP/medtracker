// Ambient active-workspace scope.
//
// The whole app is scoped to one workspace at a time. Rather than threading a
// workspaceId argument through ~40 call sites (DataContext, the hooks, every
// screen), the active id lives here and dbInterface reads it internally. That
// keeps every existing call — saveTopic(user.id, topic) — unchanged.
//
// WorkspaceContext sets this synchronously during its first render, before any
// child mounts, so no read ever runs against an unresolved scope.

let activeId = null

export function setActiveWorkspace(id) {
  activeId = id ?? null
}

export function getActiveWorkspace() {
  return activeId
}

// Cache/storage key scoped to both user and workspace, e.g. `topics_<uid>_<wsid>`.
export function scopedKey(name, userId) {
  return `${name}_${userId}_${activeId ?? 'none'}`
}

// localStorage key scoped to the workspace only (user-independent settings that
// still must not bleed across workspaces, e.g. planner history).
export function wsKey(base) {
  return `${base}_${activeId ?? 'none'}`
}
