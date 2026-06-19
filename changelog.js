{
  "_guide": {
    "about": "MedTracker changelog INDEX — metadata only. Bullet points and story content live in the per-language files (see urls). The app fetches this index on launch (cached 6 h), then lazily fetches each language file when a card is shown. The first 5 releases are cached locally; older ones ('Fetch more') are held in memory only.",

    "jsDelivr_url_pattern": "https://cdn.jsdelivr.net/gh/{GITHUB_USER}/{REPO}@{BRANCH}/changelogs/{VERSION}/{LANG}.json",
    "jsDelivr_note": "jsDelivr caches aggressively. Append ?v=1 (bump each time) to bust CDN cache during testing.",

    "adding_a_new_release": [
      "1. Copy changelogs/_template/en.json → changelogs/{VERSION}/en.json  (same for de.json)",
      "2. Fill in version, changes[], and blocks[] in each language file.",
      "3. Add a new object at the TOP of releases[] below — newest first.",
      "4. Set version, date, urls (one per language), and style.",
      "5. Commit and push. No app rebuild needed."
    ],

    "index_entry_fields": {
      "version":  "String shown in the UI, e.g. '26F19.1F'.",
      "date":     "ISO 8601, e.g. '2026-06-19'.",
      "urls":     "{ en: '...', de: '...' } — jsDelivr URL per language. Add more keys for future languages.",
      "style": {
        "accent":   "CSS color for headings, table, badge. Default '#6366f1'.",
        "gradient": "CSS linear-gradient for the hero block, e.g. '135deg, #6366f1 0%, #8b5cf6 100%'. Omit for solid accent.",
        "tag":      "Single emoji next to the version number."
      }
    },

    "_template": {
      "version": "REPLACE_ME",
      "date": "YYYY-MM-DD",
      "urls": {
        "en": "https://cdn.jsdelivr.net/gh/BrickCraftLP/medtracker@Updatelogs/changelogs/REPLACE_ME/en.json",
        "de": "https://cdn.jsdelivr.net/gh/BrickCraftLP/medtracker@Updatelogs/changelogs/REPLACE_ME/de.json"
      },
      "style": {
        "accent": "#6366f1",
        "gradient": "135deg, #6366f1 0%, #8b5cf6 100%",
        "tag": "⚡"
      }
    }
  },

  "meta": {
    "schemaVersion": 3,
    "indexUrl": "https://cdn.jsdelivr.net/gh/BrickCraftLP/medtracker@Updatelogs/changelog.json"
  },

  "releases": [
    {
      "version": "26F19.2F",
      "date": "2026-06-19",
      "urls": {
        "en": "https://cdn.jsdelivr.net/gh/BrickCraftLP/medtracker@Updatelogs/changelogs/26F19.2F/en.json",
        "de": "https://cdn.jsdelivr.net/gh/BrickCraftLP/medtracker@Updatelogs/changelogs/26F19.2F/de.json"
      },
      "style": {
        "accent":   "#22c55e",
        "gradient": "135deg, #22c55e 0%, #0ea5e9 100%",
        "tag":      "🩹"
      }
    },
    {
      "version": "22F19.1F",
      "date": "2026-06-19",
      "urls": {
        "en": "https://cdn.jsdelivr.net/gh/BrickCraftLP/medtracker@Updatelogs/changelogs/26F19.1F/en.json",
        "de": "https://cdn.jsdelivr.net/gh/BrickCraftLP/medtracker@Updatelogs/changelogs/26F19.1F/de.json"
      },
      "style": {
        "accent":   "#6366f1",
        "gradient": "135deg, #6366f1 0%, #8b5cf6 100%",
        "tag":      "⚡"
      }
    },
    {
      "version": "22F11.2F",
      "date": "2026-06-11",
      "urls": {
        "en": "https://cdn.jsdelivr.net/gh/BrickCraftLP/medtracker@Updatelogs/changelogs/26F11.2F/en.json",
        "de": "https://cdn.jsdelivr.net/gh/BrickCraftLP/medtracker@Updatelogs/changelogs/26F11.2F/de.json"
      },
      "style": {
        "accent":   "#0ea5e9",
        "gradient": "135deg, #0ea5e9 0%, #6366f1 100%",
        "tag":      "🔧"
      }
    }
  ]
}
