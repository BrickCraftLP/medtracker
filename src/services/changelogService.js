import { CHANGELOG_URL, FALLBACK_CHANGELOG } from '../data/changelog.js'

export const UPDATED_EVENT = 'mt-changelog-updated'

// Changelog content is NEVER persisted to localStorage — it's always fetched
// fresh from the network. The only in-memory state below is a session holder for
// the index (so the unread badge can render synchronously) and request de-duping.
let indexCache = null
let inFlight = null
const langInFlight = {}

// ── index ─────────────────────────────────────────────────────────────────────

function extractReleases(data) {
  if (Array.isArray(data)) return data
  if (data && Array.isArray(data.releases)) return data.releases
  return []
}

function isValidIndex(data) {
  const releases = extractReleases(data)
  return releases.length > 0 && releases.every(e =>
    e && typeof e.version === 'string' && e.urls && typeof e.urls === 'object'
  )
}

// Best index available right now without a network round-trip: the last one
// fetched this session, else the bundled fallback. Used for the unread badge.
export function getChangelog() {
  return indexCache ?? FALLBACK_CHANGELOG
}

export function latestVersion(entries) {
  return entries?.[0]?.version ?? ''
}

// Always fetches the index from the network (no caching). Concurrent callers
// share a single in-flight request.
export async function refreshChangelog() {
  if (!CHANGELOG_URL) return getChangelog()

  if (inFlight) return inFlight
  inFlight = (async () => {
    try {
      const res = await fetch(CHANGELOG_URL, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!isValidIndex(data)) throw new Error('invalid changelog index format')
      const entries = extractReleases(data)
      indexCache = entries
      window.dispatchEvent(new Event(UPDATED_EVENT))
      return entries
    } catch (e) {
      console.warn('[changelog] index fetch failed:', e.message)
      return getChangelog()
    } finally {
      inFlight = null
    }
  })()
  return inFlight
}

// ── per-language content files ────────────────────────────────────────────────

// Always fetches the language file for a release from the network — never cached.
// Concurrent callers for the same release+lang share a single in-flight request.
export async function fetchLanguageFile(entry, lang) {
  const url = entry?.urls?.[lang] ?? entry?.urls?.en
  if (!url) return null

  const key = `${entry.version}_${lang}`
  if (langInFlight[key]) return langInFlight[key]

  langInFlight[key] = (async () => {
    try {
      const res = await fetch(url, { cache: 'no-store' })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const data = await res.json()
      if (!Array.isArray(data?.changes) || !Array.isArray(data?.blocks))
        throw new Error('invalid language file format')
      return { changes: data.changes, blocks: data.blocks }
    } catch (e) {
      console.warn(`[changelog] language file fetch failed (${key}):`, e.message)
      return null
    } finally {
      delete langInFlight[key]
    }
  })()

  return langInFlight[key]
}
