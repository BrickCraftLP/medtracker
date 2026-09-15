// App update log.
//
// The live changelog is hosted as a JSON file (see CHANGELOG_URL) so it can be
// updated WITHOUT rebuilding/redeploying the app. The fetched file is cached in
// localStorage, so it's read from disk on every launch and only re-downloaded
// occasionally — see services/changelogService.js.
//
// Hosted file format (changelog.json) — newest entry first:
//   [
//     {
//       "version": "26F11.2M",
//       "date": "2026-06-19",
//       "changes": [
//         { "type": "new",      "de": "…", "en": "…" },
//         { "type": "fix",      "de": "…", "en": "…" },
//         { "type": "improved", "de": "…", "en": "…" }
//       ]
//     }
//   ]
//
// type ∈ 'new' | 'fix' | 'improved'. The unread badge keys off the top entry's
// `version`. A sample file lives at the repo root: changelog.json.

// Raw URL of the hosted changelog INDEX (metadata only; content lives in the
// per-language files it points to). This is a PUBLIC jsDelivr link, not a secret,
// so it's hardcoded as the default — that way it works on any host with no
// build-time env var (e.g. Cloudflare static-asset Workers can't inject one).
// VITE_CHANGELOG_URL still overrides it for local/staging if set.
const DEFAULT_CHANGELOG_URL =
  'https://cdn.jsdelivr.net/gh/BrickCraftLP/medtracker@Updatelogs/changelog.json'

export const CHANGELOG_URL = import.meta.env.VITE_CHANGELOG_URL || DEFAULT_CHANGELOG_URL

// Bundled fallback shown on first launch (before the remote file is fetched)
// and whenever the device is offline with no cached copy yet. Keep this small —
// it doesn't need to mirror the full history, just the current release.
export const FALLBACK_CHANGELOG = []
