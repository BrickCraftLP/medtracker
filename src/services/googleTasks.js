// Google Tasks API, straight from the browser. Auth is shared with Calendar
// (see googleAuth.js); the Tasks scope is asked for separately so granting it
// is opt-in.
//
// Requires the Google Tasks API to be enabled in the same Cloud project as
// the Calendar API.

import { SCOPES, googleFetch, getAccessToken, hasSilentAccess } from './googleAuth.js'

const API = 'https://tasks.googleapis.com/tasks/v1'

const request = (path, opts) => googleFetch(API, path, { ...opts, scope: SCOPES.tasks })
const enc = encodeURIComponent

// Must run straight from a click: the first grant opens Google's popup.
export const connectTasks = () => getAccessToken({ interactive: true, scope: SCOPES.tasks })
export const hasTasksAccess = () => hasSilentAccess(SCOPES.tasks)

export async function listTaskLists() {
  const lists = []
  let pageToken = null
  do {
    const data = await request('/users/@me/lists', { params: { maxResults: 100, pageToken } })
    lists.push(...(data?.items ?? []))
    pageToken = data?.nextPageToken ?? null
  } while (pageToken)
  return lists.map(l => ({ id: l.id, name: l.title }))
}

export function createTaskList(title) {
  return request('/users/@me/lists', { method: 'POST', body: { title } })
}

// One page. Without updatedMin this is the whole list; with it, only what
// changed since — deletions included, because showDeleted is on.
export async function listTasks(listId, { updatedMin, pageToken } = {}) {
  const data = await request(`/lists/${enc(listId)}/tasks`, {
    params: {
      maxResults: 100,
      showCompleted: true,
      showHidden: true,
      showDeleted: true,
      updatedMin,
      pageToken,
    },
  })
  return { items: data?.items ?? [], nextPageToken: data?.nextPageToken ?? null }
}

export function insertTask(listId, body, { parent, previous } = {}) {
  return request(`/lists/${enc(listId)}/tasks`, { method: 'POST', body, params: { parent, previous } })
}

export function patchTask(listId, taskId, body) {
  return request(`/lists/${enc(listId)}/tasks/${enc(taskId)}`, { method: 'PATCH', body })
}

// Omitting `parent` moves the task to the top level.
export function moveTask(listId, taskId, { parent, previous } = {}) {
  return request(`/lists/${enc(listId)}/tasks/${enc(taskId)}/move`, { method: 'POST', params: { parent, previous } })
}

export function deleteTask(listId, taskId) {
  return request(`/lists/${enc(listId)}/tasks/${enc(taskId)}`, { method: 'DELETE' })
}
