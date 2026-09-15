# Changelog / Update Log System — Implementation Guide

Copy this file into any new project and give it to Claude Code with the prompt at the bottom.

---

## What this system does

- Shows an in-app "What's new" screen under Settings
- Red dot badge on the home screen avatar + Settings row until the user reads it
- All content is fetched from jsDelivr (GitHub CDN) — **no app rebuild needed to publish updates**
- A lightweight **index** lists releases; each release has **per-language content files** holding both the bullet list and a rich story (hero, headings, paragraphs, callouts, comparison tables)
- First 5 releases shown by default; older ones load on demand via a **"Show older"** button
- **Nothing is cached** — every screen open fetches fresh from the CDN. No localStorage, no TTLs, no stale data
- **No bundled content.** If nothing can be fetched, a friendly empty-state message is shown
- Fetching only happens when the user opens the "What's new" screen — not on app launch

---

## Architecture (important — read this first)

There are **two layers** of remote files:

1. **The index** (`changelog.json`, repo root) — metadata only. Lists every release with its `version`, `date`, `style`, and the `urls` to its content files. **Contains no text content.**
2. **Per-language content files** (`changelogs/{VERSION}/{LANG}.json`) — hold the actual `changes[]` (bullets) and `blocks[]` (story) for one release in one language.

The app fetches the index first, then lazily fetches each release's content file for the active language. **A release will not appear unless it is listed in the index** — and its content will not appear unless the content file exists and is valid.

---

## File structure

```
changelog.json                        ← hosted INDEX (repo root, metadata only)
changelogs/
  _template/
    en.json                           ← copy this to start a new release
    de.json
  {VERSION}/
    en.json                           ← content: changes[] + blocks[]
    de.json
src/
  data/
    changelog.js                      ← CHANGELOG_URL + FALLBACK_CHANGELOG (empty [])
  services/
    changelogService.js               ← fetch (no cache), per-language loading
  hooks/
    useChangelog.js                   ← React hook (entries, hasUnread, markSeen)
  screens/
    ChangelogScreen.jsx               ← screen: collapse/expand, block renderer, "show older"
```

The screen is registered as a nested route under `/settings/changelog`.

---

## Tech stack assumptions

Tell Claude Code to adjust if yours differs:

- React 18 + Vite
- React Router v6 (nested routes)
- Framer Motion (animations)
- TailwindCSS or CSS variables for theming
- localStorage for persistence
- i18n via flat key-value dictionaries (`src/i18n/en.js`, `src/i18n/de.js`)
- CSS variables: `--bg-primary`, `--text-primary`, `--text-secondary`, `--text-tertiary`, `--accent`, `--border`, `--glass-card-bg`, `--glass-card-stroke`, `--glass-card-shadow`

---

## Schema 1 — `changelog.json` (the INDEX, metadata only)

```json
{
  "_guide": { "...": "self-documenting notes for editors, ignored by the app" },
  "meta": {
    "schemaVersion": 3,
    "indexUrl": "https://cdn.jsdelivr.net/gh/{USER}/{REPO}@{BRANCH}/changelog.json"
  },
  "releases": [
    {
      "version": "1.2.0",
      "date": "2026-06-19",
      "urls": {
        "en": "https://cdn.jsdelivr.net/gh/{USER}/{REPO}@{BRANCH}/changelogs/1.2.0/en.json",
        "de": "https://cdn.jsdelivr.net/gh/{USER}/{REPO}@{BRANCH}/changelogs/1.2.0/de.json"
      },
      "style": {
        "accent":   "#6366f1",
        "gradient": "135deg, #6366f1 0%, #8b5cf6 100%",
        "tag":      "⚡"
      }
    }
  ]
}
```

- Releases are listed **newest first** (top = latest).
- `urls` is keyed by language code; add more keys for more languages.
- `style.gradient` is the inner value of a CSS `linear-gradient(...)`. Omit for a solid accent.
- **No `changes` or content here** — that lives in the per-language files.

The index is validated on fetch: every release must have a string `version` and an object `urls`. Releases failing this are discarded.

## Schema 2 — `changelogs/{VERSION}/{LANG}.json` (content)

```json
{
  "version": "1.2.0",
  "lang": "en",
  "changes": [
    { "type": "new",      "text": "Short bullet, always visible on the card." },
    { "type": "improved", "text": "..." },
    { "type": "fix",      "text": "..." }
  ],
  "blocks": [
    { "type": "hero",      "title": "Big headline", "subtitle": "Subline" },
    { "type": "heading",   "text": "Section title" },
    { "type": "paragraph", "text": "Body copy. Use \\n for line breaks." },
    { "type": "callout",   "text": "Highlighted note with accent border." },
    { "type": "table",     "headers": ["Feature","Before","Now"], "rows": [["Row label","Old","New"]] }
  ]
}
```

### ⚠️ Content file rules (these caused real bugs — do not skip)

- The language key is **`lang`**, not `language`.
- **`changes` and `blocks` must BOTH be arrays.** The app rejects the entire file if either is missing or the wrong type — the release then renders empty. A file with no story can use `"blocks": []`; a file with no bullets can use `"changes": []`, but the keys must be present.
- `changes[]` items are **single-language**: `{ type, text }`. (The language is the file itself.) `type ∈ 'new' | 'improved' | 'fix'`.
- Keep the bullet `text` short — it's the always-visible summary. The `blocks[]` are the expandable detail.

---

## i18n keys to add

Add to both `en.js` and `de.js` (translate the de values):

```js
'settings.aboutSection':           'About',
'settings.changelog':              "What's new",
'settings.changelogSubtitle':      'Latest updates and fixes.',
'settings.changelogVersion':       'Version {v}',
'settings.changelogLatest':        'Latest',
'settings.changelogType.new':      'New',
'settings.changelogType.improved': 'Improved',
'settings.changelogType.fix':      'Fix',
'settings.changelogExpand':        'Read more',
'settings.changelogCollapse':      'Show less',
'settings.changelogFetchMore':     'Show {n} older updates',
'settings.changelogLoadingMore':   'Loading…',
```

---

## Environment variable

The changelog URL is **hardcoded as the default** in `src/data/changelog.js` — no env var needed for production. This is intentional: the URL is a public jsDelivr link (not a secret), and static-asset hosts (like Cloudflare Workers) cannot inject build-time env vars.

```js
// src/data/changelog.js
const DEFAULT_CHANGELOG_URL =
  'https://cdn.jsdelivr.net/gh/{USER}/{REPO}@{BRANCH}/changelog.json'

export const CHANGELOG_URL = import.meta.env.VITE_CHANGELOG_URL || DEFAULT_CHANGELOG_URL
```

`VITE_CHANGELOG_URL` in `.env` still works as an override (e.g. to point a local dev build at a staging branch), but it is not required.

> ⚠️ Do NOT rely on the env var alone for production deploys — if the host doesn't inject it, the URL will be empty and the screen will always show the empty state.

---

## Empty / error state

There is intentionally **no bundled content**. When the index fetch returns nothing (offline first launch, 404, bad JSON), the screen shows a friendly empty state instead of failing silently — e.g.:

> 🔧 **Silent. Too silent.**
> Where is the maintenance guy again?

The empty state only appears **after** the fetch completes; while fetching, a loading indicator is shown.

---

## Where to wire things up

### App.jsx — add route
```jsx
import ChangelogScreen from './screens/ChangelogScreen.jsx'

// nested under /settings:
<Route path="/settings/changelog" element={<PageWrapper><ChangelogScreen /></PageWrapper>} />
```

### SettingsScreen — add row in an "About" section
```jsx
import { useChangelog } from '../hooks/useChangelog.js'

const { hasUnread } = useChangelog()

<Section title={t('settings.aboutSection')}>
  <Row
    label={t('settings.changelog')}
    icon={/* document icon svg */}
    onTap={() => navigate('/settings/changelog')}
    right={hasUnread ? <RedDot /> : undefined}
  />
</Section>
```

### HomeScreen — red dot on avatar
```jsx
import { useChangelog } from '../hooks/useChangelog.js'

const { hasUnread } = useChangelog()

// Wrap avatar button in position:relative, then:
{hasUnread && (
  <span style={{
    position: 'absolute', top: 0, right: 0,
    width: 12, height: 12, borderRadius: '50%',
    background: '#ef4444',
    border: '2px solid var(--bg-primary)',
    boxShadow: '0 0 6px rgba(239,68,68,0.6)',
  }} />
)}
```

The badge clears when the user opens the changelog screen (`markSeen()` writes the latest version to localStorage).

---

## Publishing a new update (no app rebuild needed)

1. Copy `changelogs/_template/en.json` → `changelogs/{NEW_VERSION}/en.json` (same for `de.json`).
2. Fill in `version`, `changes[]`, and `blocks[]` in **each** language file. Keep `lang` correct.
3. Add a new entry at the **top** of `releases[]` in `changelog.json` (version, date, urls, style).
4. Commit and push **all** of these to the branch: the new content files **and** the updated index.
5. jsDelivr serves them within minutes; users see the update on next launch.

### ⚠️ Publishing checklist — the three things that break it

These are the exact failures that happened in practice:

1. **Index not pushed.** `changelog.json` must be at the **repo root** (next to `README.md`), not inside `changelogs/`. If it's missing, the app gets no release list and the screen is empty even though content files exist. Verify: `curl -s -o /dev/null -w "%{http_code}" ".../changelog.json"` → must be `200`.
2. **Content file in the wrong format.** Must have `lang` (not `language`) and both `changes[]` and `blocks[]` as arrays, or the app discards it and that release renders empty. Verify each file's keys after pushing.
3. **Stale jsDelivr CDN cache.** jsDelivr caches `@branch` URLs aggressively. After updating an **existing** file, purge it (new files don't need purging):
   ```
   curl "https://purge.jsdelivr.net/gh/{USER}/{REPO}@{BRANCH}/changelog.json"
   curl "https://purge.jsdelivr.net/gh/{USER}/{REPO}@{BRANCH}/changelogs/{VERSION}/en.json"
   ```
   Purge by opening the URL in a browser too — you'll see `{"status":"finished"}`. If `throttled: true` appears, wait the number of seconds shown in `throttlingReset` and try again. jsDelivr rate-limits purges per file.

   > The app itself has **no client-side cache** — content is always fetched fresh. The only `localStorage` key used is `mt_changelog_seen` (tracks whether the user has read the latest version for the red dot badge). No need to clear browser storage when testing.

4. **Special characters in JSON.** Curly/smart quotes (`"` `"` `„`) inside text values can silently corrupt the file on some editors or when copy-pasting. Stick to straight ASCII quotes inside string values, or validate with `python -c "import json;json.load(open('file.json'));print('ok')"` before pushing.

> Tip: list everything actually on the branch with the jsDelivr API:
> `https://data.jsdelivr.com/v1/packages/gh/{USER}/{REPO}@{BRANCH}`

---

## Prompt for Claude Code

Paste this entire file into a new Claude Code session, then send:

```
Implement the changelog system described in this file for my app.
My GitHub repo is: {USER}/{REPO}, branch: {BRANCH}
My app uses: [list your stack differences if any]
My home screen avatar component is in: [file path]
My settings screen is in: [file path]
My App.jsx / router is in: [file path]
My i18n files are at: [paths]
My nav direction context is: [describe or say "none"]
```

Claude Code will create all the files (index, `_template`, service, hook, screen), wire up the route, add the badge to the avatar, and add the Settings row. After implementing, push `changelog.json` (repo root) plus the `changelogs/` folder to your branch and set `VITE_CHANGELOG_URL`.
