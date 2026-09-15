// Google Calendar API, straight from the browser.
//
// Sign-in and the request plumbing are shared with Tasks and live in
// googleAuth.js (see there for why the browser token model was chosen). This
// file only knows Calendar's endpoints, and asks for the Calendar scope alone.
//
// The Calendar API sends CORS headers, so every call below is a plain fetch.

import {
  SCOPES, googleFetch, GoogleApiError, NotSignedIn,
  clientId, isConfigured, forgetToken, signOut,
  getAccessToken as getToken, hasSilentAccess as hasSilent,
} from './googleAuth.js'

export { NotSignedIn, clientId, isConfigured, forgetToken, signOut }

const API = 'https://www.googleapis.com/calendar/v3'

// Google's sync token has expired and a full resync is required.
export class SyncTokenGone extends Error {}

export const getAccessToken = ({ interactive = false } = {}) => getToken({ interactive, scope: SCOPES.calendar })
export const hasSilentAccess = () => hasSilent(SCOPES.calendar)

export const userTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Vienna'

const enc = encodeURIComponent

async function request(path, opts) {
  try {
    return await googleFetch(API, path, { ...opts, scope: SCOPES.calendar })
  } catch (e) {
    // 410 on a list call means the sync token is too old to be useful.
    if (e instanceof GoogleApiError && e.status === 410) throw new SyncTokenGone()
    throw e
  }
}

export async function listCalendars() {
  const data = await request('/users/me/calendarList', { params: { maxResults: 250 } })
  return (data?.items ?? [])
    .filter(c => c.accessRole === 'owner' || c.accessRole === 'writer')
    .map(c => ({
      id: c.id,
      name: c.summaryOverride ?? c.summary,
      color: c.backgroundColor,
      primary: !!c.primary,
    }))
}

// One page of changes. With a syncToken Google returns only what changed
// since it was issued, including cancellations; without one it returns
// everything in the window and we ask for a token to use next time.
//
// `timeZone` makes Google write every dateTime in the user's own zone, which
// is what lets the mapper read local wall time straight off the string. By
// default it would use the Google calendar's zone, and an event on a calendar
// set to another zone would land hours off.
export async function listEvents(calendarId, { syncToken, timeMin, pageToken } = {}) {
  const params = syncToken
    ? { syncToken, pageToken, maxResults: 250, showDeleted: true, timeZone: userTimeZone() }
    : { timeMin, pageToken, maxResults: 250, singleEvents: false, timeZone: userTimeZone() }
  const data = await request(`/calendars/${enc(calendarId)}/events`, { params })
  return {
    items: data?.items ?? [],
    nextPageToken: data?.nextPageToken ?? null,
    nextSyncToken: data?.nextSyncToken ?? null,
  }
}

// The generated occurrences of a series inside a window — how a single local
// occurrence finds the Google instance it corresponds to.
export async function listInstances(calendarId, eventId, { timeMin, timeMax }) {
  const data = await request(`/calendars/${enc(calendarId)}/events/${enc(eventId)}/instances`, {
    params: { timeMin, timeMax, maxResults: 50, timeZone: userTimeZone() },
  })
  return data?.items ?? []
}

export function insertEvent(calendarId, body) {
  return request(`/calendars/${enc(calendarId)}/events`, { method: 'POST', body })
}

export function patchEvent(calendarId, eventId, body) {
  return request(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: 'PATCH', body })
}

export function deleteEvent(calendarId, eventId) {
  return request(`/calendars/${enc(calendarId)}/events/${enc(eventId)}`, { method: 'DELETE' })
}

// Keeps the event's id, so nothing is left behind in the source calendar.
export function moveEvent(calendarId, eventId, destinationCalendarId) {
  return request(`/calendars/${enc(calendarId)}/events/${enc(eventId)}/move`, {
    method: 'POST', params: { destination: destinationCalendarId },
  })
}
