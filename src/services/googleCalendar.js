// Google Calendar API, straight from the browser.
//
// Auth uses Google Identity Services' token model, not the classic
// server-side code exchange. That choice is load-bearing:
//   • no client secret, so no Edge Function and no server in the loop;
//   • no refresh token, so the 7-day refresh-token expiry that applies to
//     unverified apps never bites — GIS re-issues an access token silently
//     while the user has a Google session in this browser;
//   • the cost is that sync only runs while the app is open. There is no
//     background job. For a timetable that is an acceptable trade.
//
// The Calendar API sends CORS headers, so every call below is a plain fetch.

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const SCOPE = 'https://www.googleapis.com/auth/calendar'
const API = 'https://www.googleapis.com/calendar/v3'

// Google's sync token has expired and a full resync is required.
export class SyncTokenGone extends Error {}
export class NotSignedIn extends Error {}

export const clientId = () => import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
export const isConfigured = () => !!clientId()

let gisPromise = null
let tokenClient = null
let token = null // { value, expiresAt }

function loadGis() {
  if (gisPromise) return gisPromise
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) { resolve(); return }
    const script = document.createElement('script')
    script.src = GIS_SRC
    script.async = true
    script.defer = true
    script.onload = () => resolve()
    script.onerror = () => { gisPromise = null; reject(new Error('Google Identity Services failed to load')) }
    document.head.appendChild(script)
  })
  return gisPromise
}

// A token is only reused while it has a minute of life left, so a long
// request can't die halfway through on a token that expired in flight.
const tokenValid = () => token && token.expiresAt - Date.now() > 60_000

// `interactive: false` asks Google to reissue without any UI. It only works
// once the user has granted the scope on this browser, which is why the first
// call must come from a click.
export async function getAccessToken({ interactive = false } = {}) {
  if (!isConfigured()) throw new Error('VITE_GOOGLE_CLIENT_ID is not set')
  if (tokenValid()) return token.value

  await loadGis()
  if (!tokenClient) {
    tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: clientId(),
      scope: SCOPE,
      callback: () => {}, // replaced per request below
    })
  }

  return new Promise((resolve, reject) => {
    tokenClient.callback = response => {
      if (response.error) {
        // consent_required / interaction_required on a silent attempt simply
        // means "ask the user"; the caller decides whether to.
        reject(new NotSignedIn(response.error))
        return
      }
      token = {
        value: response.access_token,
        expiresAt: Date.now() + (Number(response.expires_in ?? 3600) * 1000),
      }
      resolve(token.value)
    }
    try {
      tokenClient.requestAccessToken({ prompt: interactive ? 'consent' : '' })
    } catch (e) {
      reject(e)
    }
  })
}

export function forgetToken() {
  token = null
}

export async function signOut() {
  const value = token?.value
  token = null
  if (!value) return
  try { window.google?.accounts?.oauth2?.revoke(value, () => {}) } catch {}
}

export async function hasSilentAccess() {
  try {
    await getAccessToken({ interactive: false })
    return true
  } catch {
    return false
  }
}

// ── Requests ───────────────────────────────────────────────────────────────

async function request(path, { method = 'GET', body, params, retry = true } = {}) {
  const accessToken = await getAccessToken({ interactive: false })
  const url = new URL(API + path)
  for (const [key, value] of Object.entries(params ?? {})) {
    if (value != null) url.searchParams.set(key, value)
  }

  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(body ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401 && retry) {
    // The token was revoked or expired early; drop it and try once more.
    forgetToken()
    return request(path, { method, body, params, retry: false })
  }
  // 410 on a list call means the sync token is too old to be useful.
  if (res.status === 410) throw new SyncTokenGone()
  if (res.status === 404 && method === 'DELETE') return null // already gone
  if (res.status === 204) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`Google Calendar ${method} ${path} → ${res.status} ${text.slice(0, 200)}`)
  }
  return res.json()
}

export async function listCalendars() {
  const data = await request('/users/me/calendarList', { params: { maxResults: 250 } })
  return (data.items ?? [])
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
export async function listEvents(calendarId, { syncToken, timeMin, pageToken } = {}) {
  const params = syncToken
    ? { syncToken, pageToken, maxResults: 250, showDeleted: true }
    : { timeMin, pageToken, maxResults: 250, singleEvents: false }
  const data = await request(`/calendars/${encodeURIComponent(calendarId)}/events`, { params })
  return {
    items: data.items ?? [],
    nextPageToken: data.nextPageToken ?? null,
    nextSyncToken: data.nextSyncToken ?? null,
  }
}

export function insertEvent(calendarId, body) {
  return request(`/calendars/${encodeURIComponent(calendarId)}/events`, { method: 'POST', body })
}

export function patchEvent(calendarId, eventId, body) {
  return request(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'PATCH', body,
  })
}

export function deleteEvent(calendarId, eventId) {
  return request(`/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`, {
    method: 'DELETE',
  })
}