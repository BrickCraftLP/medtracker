// Google Calendar as a sync provider — a thin adapter over the two files that
// do the actual work (googleCalendar.js for the API, googleSync.js for the
// reconciliation).

import { defineProvider } from './provider.js'
import {
  isConfigured, hasSilentAccess, getAccessToken, listCalendars, signOut,
} from '../googleCalendar.js'
import { syncCalendar, noteLocalDelete, clearSyncState } from '../googleSync.js'

export default defineProvider({
  id: 'google',
  labelKey: 'sync.provider.google',

  isConfigured,
  hasAccess: hasSilentAccess,

  // Must run straight from a click: the first grant opens Google's popup.
  async connect() {
    await getAccessToken({ interactive: true })
    return true
  },

  disconnect: signOut,

  async listRemoteCalendars() {
    // Reuse an existing grant if there is one; only prompt when there is not.
    try { await getAccessToken({ interactive: false }) } catch { await getAccessToken({ interactive: true }) }
    return listCalendars()
  },

  sync: syncCalendar,
  noteLocalDelete,
  clearState: clearSyncState,
})
