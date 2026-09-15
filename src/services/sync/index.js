// The registry. Adding a provider is one import and one array entry.

import googleProvider from './googleProvider.js'

export const PROVIDERS = [googleProvider]

export const DEFAULT_PROVIDER_ID = googleProvider.id

export function providerFor(id) {
  return PROVIDERS.find(p => p.id === (id ?? DEFAULT_PROVIDER_ID)) ?? null
}

// Providers whose keys are actually present in this build.
export const availableProviders = () => PROVIDERS.filter(p => p.isConfigured())

// A calendar is connected when it names a provider and a remote calendar.
export function providerOfCalendar(calendar) {
  if (!calendar?.google_calendar_id) return null
  return providerFor(calendar.sync_provider)
}

// Routes a local deletion to whichever provider owns the calendar, so
// DataContext does not have to know about any of them.
export async function noteRemoteDelete(calendar, remoteEventId) {
  const provider = providerOfCalendar(calendar)
  if (!provider || !remoteEventId) return
  await provider.noteLocalDelete(calendar, remoteEventId)
}
