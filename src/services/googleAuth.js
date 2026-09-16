// Google sign-in and requests, shared by every Google API this app talks to.
//
// Auth is Google's authorization-code flow, with the code exchanged
// server-side by the google-oauth Edge Function
// (supabase/functions/google-oauth). That choice is load-bearing:
//   • the refresh token lives in Postgres, readable only by the function, so a
//     connection survives reloads, token expiry and new devices — the user
//     connects once, not once per session;
//   • the browser only holds a short-lived access token, fetched from the
//     function when needed, and never opens a popup on its own. The old
//     browser token model did, a popup outside a click is blocked, and that
//     is what kept sending people back through setup;
//   • the client secret stays in the function's secrets.
//
// Scopes are granted incrementally: connecting Calendar never asks for Tasks,
// so nobody grants access to more than the feature they turned on.
// include_granted_scopes folds earlier grants into the new token.

import { supabase } from './supabaseConfig.js'

const GIS_SRC = 'https://accounts.google.com/gsi/client'
const FUNCTION = 'google-oauth'
// Only for the login hint: a reconnect lands on the right account without the
// account chooser.
const IDENTITY = ['openid', 'email']

export const SCOPES = {
  calendar: 'https://www.googleapis.com/auth/calendar',
  tasks: 'https://www.googleapis.com/auth/tasks',
}

export class NotSignedIn extends Error {}

// Google returned no refresh token — the account had granted this app before
// one was ever stored. The function has ended that grant; the next Connect tap
// gets a fresh one.
export class RetryConsent extends Error {}

export class GoogleApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export const clientId = () => import.meta.env.VITE_GOOGLE_CLIENT_ID ?? ''
export const isConfigured = () => !!clientId()

let gisPromise = null
let token = null        // { value, expiresAt, scopes: Set }
let tokenRequest = null // the refresh in flight, shared by concurrent callers
let status = null       // Promise<{ connected, scopes: Set, email }>
let email = null

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

// Loads the script ahead of time, so a Connect tap opens the popup inside the
// click's user activation instead of after a network round trip.
export function preloadGis() {
  if (isConfigured()) loadGis().catch(() => {})
}

async function call(body) {
  const { data, error } = await supabase.functions.invoke(FUNCTION, { body })
  if (error) {
    let detail = null
    try { detail = await error.context?.json?.() } catch { /* not JSON */ }
    throw new Error(detail?.error ?? error.message ?? `${FUNCTION} failed`)
  }
  return data ?? {}
}

const asStatus = s => ({ connected: !!s?.connected, scopes: new Set(s?.scopes ?? []), email: s?.email ?? null })

function setStatus(s) {
  status = Promise.resolve(asStatus(s))
  if (s?.email) email = s.email
}

function loadStatus() {
  if (!status) {
    const request = call({ action: 'status' }).then(s => {
      if (s.email) email = s.email
      return asStatus(s)
    })
    // A failed check (offline) is retried next time rather than cached.
    request.catch(() => { if (status === request) status = null })
    status = request
  }
  return status
}

// Forces the next access check to ask the server again — a disconnect on
// another device shows up when the app returns to the foreground.
export function refreshStatus() {
  status = null
}

function remember(data) {
  token = {
    value: data.access_token,
    expiresAt: Date.now() + Number(data.expires_in ?? 3600) * 1000,
    scopes: new Set(data.scopes ?? []),
  }
  return token
}

// A token is only reused while it has a minute of life left, so a long
// request can't die halfway through on a token that expired in flight.
const usable = scope => token && token.scopes.has(scope) && token.expiresAt - Date.now() > 60_000

function requestCode(scopes) {
  return new Promise((resolve, reject) => {
    const client = window.google.accounts.oauth2.initCodeClient({
      client_id: clientId(),
      scope: [...IDENTITY, ...scopes].join(' '),
      ux_mode: 'popup',
      include_granted_scopes: true,
      login_hint: email ?? undefined,
      callback: response => (response.error
        ? reject(new NotSignedIn(response.error))
        : resolve(response.code)),
      // Popup blocked or closed. Without this the request never settles.
      error_callback: err => reject(new NotSignedIn(err?.type ?? 'popup_failed')),
    })
    client.requestCode()
  })
}

// Must run straight from a click: it opens Google's popup. Used for the first
// connect and for every reconnect alike — Google only shows the consent
// screen when something new is being granted.
export async function connect(scopes) {
  if (!isConfigured()) throw new Error('VITE_GOOGLE_CLIENT_ID is not set')
  await loadGis()
  const code = await requestCode(scopes)
  const data = await call({ action: 'exchange', code })
  if (data.error === 'no_refresh_token') {
    token = null
    setStatus({ connected: false })
    throw new RetryConsent('retry_consent')
  }
  if (data.error) throw new Error(data.error)
  remember(data)
  setStatus({ connected: true, scopes: data.scopes, email: data.email })
  // Google's granular consent lets a user untick a scope in the popup.
  if (!scopes.every(s => token.scopes.has(s))) throw new NotSignedIn('scope_not_granted')
  return token.value
}

// Never opens a popup. `interactive` is kept for the callers that still pass
// it; it means "connect", and so has to come from a click too.
export async function getAccessToken({ interactive = false, scope = SCOPES.calendar } = {}) {
  if (!isConfigured()) throw new Error('VITE_GOOGLE_CLIENT_ID is not set')
  if (usable(scope)) return token.value
  if (interactive) return connect([scope])

  if (!tokenRequest) {
    tokenRequest = call({ action: 'token' })
      .then(data => {
        if (data.error === 'revoked' || data.error === 'not_connected') {
          token = null
          setStatus({ connected: false })
          throw new NotSignedIn(data.error)
        }
        if (data.error) throw new Error(data.error)
        return remember(data)
      })
      .finally(() => { tokenRequest = null })
  }
  const fresh = await tokenRequest
  if (!fresh.scopes.has(scope)) throw new NotSignedIn('scope_missing')
  return fresh.value
}

export function forgetToken(value) {
  if (!value || token?.value === value) token = null
}

// Revoking ends the whole grant with Google, every scope included.
export async function signOut() {
  token = null
  try {
    await call({ action: 'revoke' })
  } finally {
    setStatus({ connected: false })
  }
}

// Asks the server, not Google, so it is cheap and safe on launch. Throws when
// the server can't be reached: "couldn't check" must not read as "not
// connected", or an offline launch would ask the user to reconnect.
export async function hasSilentAccess(scope = SCOPES.calendar) {
  const s = await loadStatus()
  return s.connected && s.scopes.has(scope)
}

// One authorised call. Both APIs send CORS headers, so this is a plain fetch.
export async function googleFetch(base, path, { method = 'GET', body, params, scope, retry = true } = {}) {
  const accessToken = await getAccessToken({ interactive: false, scope })
  const url = new URL(base + path)
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
    forgetToken(accessToken)
    return googleFetch(base, path, { method, body, params, scope, retry: false })
  }
  if (res.status === 404 && method === 'DELETE') return null // already gone
  if (res.status === 204) return null
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new GoogleApiError(`Google ${method} ${path} → ${res.status} ${text.slice(0, 200)}`, res.status)
  }
  const text = await res.text()
  return text ? JSON.parse(text) : null
}
