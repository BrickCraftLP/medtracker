// Where a calendar shows up.
//
// A calendar has one owning workspace (`workspace_id`, never null) and may be
// shown in others on top of that. Events, semesters and exams do not decide
// this for themselves — they inherit their calendar's scope — so visibility is
// answered here once and every consumer asks the same question.

export function visibleInWorkspace(calendar, workspaceId) {
  if (!calendar || !workspaceId) return false
  if (calendar.workspace_id === workspaceId) return true
  if (calendar.shared_all) return true
  return (calendar.shared_workspace_ids ?? []).includes(workspaceId)
}

export const isShared = calendar =>
  !!calendar?.shared_all || (calendar?.shared_workspace_ids ?? []).length > 0

// The workspace a row hanging off this calendar must be stamped with. Using
// the calendar's own workspace rather than the active one keeps a shared
// calendar's contents together: they are created, cached and cascade-deleted
// as one set, no matter which workspace the user happened to be in.
export const scopeOf = calendar => calendar?.workspace_id ?? null

// Calendar to put a new entry in when the user did not choose one. Prefers a
// calendar this workspace actually owns, so a quick drag-create cannot land in
// a shared calendar by accident.
export function defaultCalendarFor(calendars, workspaceId, { exclude = [] } = {}) {
  // Only calendars this workspace can actually see are candidates — falling
  // back to "the first one in the list" could otherwise hand back a calendar
  // owned by another workspace and invisible here.
  const visible = calendars.filter(c => visibleInWorkspace(c, workspaceId))
  const usable = visible.filter(c => !exclude.includes(c.id))
  return usable.find(c => c.workspace_id === workspaceId && c.is_default)
    ?? usable.find(c => c.workspace_id === workspaceId)
    ?? usable[0]
    // Everything is excluded (all hidden): a hidden calendar is still a better
    // answer than none, so the new entry has somewhere to go.
    ?? visible[0]
    ?? null
}
