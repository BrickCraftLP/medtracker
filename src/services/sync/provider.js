// What a calendar integration has to offer.
//
// One seam, so adding Apple (CalDAV) or Outlook later is a new file here plus
// one line in index.js — no change to the calendar screen, the settings screen
// or the sync bookkeeping. The provider owns its own auth; nothing above it
// knows what a token is.
//
// A provider is a plain object:
//
//   id                 stable string, stored on calendars.sync_provider
//   labelKey           i18n key for its display name
//   isConfigured()     → boolean, false when its env keys are missing
//   hasAccess()        → Promise<boolean>, true if it can act without asking
//   connect()          → Promise<boolean>, MUST be called from a click
//   disconnect()       → Promise<void>
//   listRemoteCalendars() → Promise<[{ id, name, color, primary }]>
//   sync(calendar, ctx)   → Promise<{ pulled, pushed, deleted }>
//   noteLocalDelete(calendar, remoteId) → Promise<void>
//   clearState(calendarId)              → Promise<void>
//
// `ctx` is `{ events, upsertEvent, removeEvent }` — the provider never imports
// React or the data context itself.

export const PROVIDER_CONTRACT = [
  'id', 'labelKey', 'isConfigured', 'hasAccess', 'connect', 'disconnect',
  'listRemoteCalendars', 'sync', 'noteLocalDelete', 'clearState',
]

// Cheap guard so a half-written provider fails at import time, not at 2am
// during a sync.
export function defineProvider(provider) {
  for (const key of PROVIDER_CONTRACT) {
    if (provider[key] == null) throw new Error(`sync provider "${provider.id}" is missing ${key}`)
  }
  return Object.freeze(provider)
}
