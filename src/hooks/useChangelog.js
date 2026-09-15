import { useState, useEffect, useCallback } from 'react'
import { getChangelog, latestVersion, refreshChangelog, UPDATED_EVENT } from '../services/changelogService.js'

const SEEN_KEY = 'mt_changelog_seen'
const SEEN_EVENT = 'mt-changelog-seen'

function readSeen() {
  try {
    return localStorage.getItem(SEEN_KEY)
  } catch {
    return null
  }
}

// Reactive view of the (remotely-hosted, locally-cached) update log.
// Re-renders when the cached changelog refreshes or the seen version changes —
// including across tabs (storage event) and other components (custom events).
export function useChangelog() {
  const [entries, setEntries] = useState(getChangelog)
  const [seen, setSeen] = useState(readSeen)

  useEffect(() => {
    const onUpdated = () => setEntries(getChangelog())
    const onSeen = () => setSeen(readSeen())
    const onStorage = () => { onUpdated(); onSeen() }

    window.addEventListener(UPDATED_EVENT, onUpdated)
    window.addEventListener(SEEN_EVENT, onSeen)
    window.addEventListener('storage', onStorage)

    // Pull the latest from GitHub (cached/throttled inside the service).
    refreshChangelog().then(() => setEntries(getChangelog()))

    return () => {
      window.removeEventListener(UPDATED_EVENT, onUpdated)
      window.removeEventListener(SEEN_EVENT, onSeen)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  const markSeen = useCallback(() => {
    const v = latestVersion(getChangelog())
    try {
      localStorage.setItem(SEEN_KEY, v)
    } catch {
      // ignore — badge will just keep showing
    }
    setSeen(v)
    window.dispatchEvent(new Event(SEEN_EVENT))
  }, [])

  const version = latestVersion(entries)

  return {
    entries,
    latestVersion: version,
    hasUnread: !!version && seen !== version,
    markSeen,
  }
}
