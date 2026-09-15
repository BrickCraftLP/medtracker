# Graph Report - MedTracker-26F11.2M-V1.5  (2026-08-23)

## Corpus Check
- 116 files · ~102,208 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 766 nodes · 1773 edges · 33 communities (26 shown, 7 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 65 edges (avg confidence: 0.85)
- Token cost: 0 input · 0 output

## Community Hubs (Navigation)
- Statistics & Widgets Dashboard
- Data Sync & Storage Backend
- PIN Lock & Account Security
- Auth & Session Summary
- Package Dependencies
- Changelog & Settings Screen
- Active Study Session Flow
- Customisation & Graph Settings Screens
- Widget Config Modal
- Topics & Data Provider
- Home Screen & Widget Shell
- Theme Collections (Pride)
- App Shell & Routing
- Changelog System Meta
- Theme Context Core
- Appearance & Pride Screens
- Navbar & Heatmap Customisation
- i18n & Language Settings
- Todo Swipe-to-Delete Gesture
- Create Workspace Screen
- Topic Stats Screen
- Topic Targets Context
- Planner Time Slider
- Topic Card Interaction
- App Icon (192px)
- App Favicon
- App Icon (512px)
- App Icon (180px)
- Supabase Delete-User Function

## God Nodes (most connected - your core abstractions)
1. `useLanguage()` - 81 edges
2. `useData()` - 56 edges
3. `useAuth()` - 25 edges
4. `DataProvider()` - 24 edges
5. `useGraphSettings()` - 23 edges
6. `HomeScreen()` - 19 edges
7. `PinProvider()` - 17 edges
8. `NavDirectionContext` - 17 edges
9. `getDateRange()` - 17 edges
10. `GraphViewWidget()` - 15 edges

## Surprising Connections (you probably didn't know these)
- `medtracker-theme localStorage key` --semantically_similar_to--> `mt_changelog_seen localStorage key`  [INFERRED] [semantically similar]
  index.html → CHANGELOG_SYSTEM.md
- `AppShell()` --calls--> `useData()`  [EXTRACTED]
  src/App.jsx → src/context/DataContext.jsx
- `NavbarWrapper()` --calls--> `useData()`  [EXTRACTED]
  src/App.jsx → src/context/DataContext.jsx
- `SyncIndicator()` --calls--> `useData()`  [EXTRACTED]
  src/App.jsx → src/context/DataContext.jsx
- `refreshPending()` --calls--> `getLocalChanges()`  [EXTRACTED]
  src/context/DataContext.jsx → src/services/localStorageEngine.js

## Import Cycles
- None detected.

## Hyperedges (group relationships)
- **Changelog fetch/render data flow** — changelog_json_index, changelogs_version_lang_json, src_services_changelogservice_js, src_hooks_usechangelog_js, src_screens_changelogscreen_jsx [EXTRACTED 0.90]
- **Publishing reliability mechanisms** — changelog_system_publishing_checklist, changelog_system_jsdelivr_purge, changelog_json_index, changelogs_version_lang_json [EXTRACTED 0.85]

## Communities (33 total, 7 thin omitted)

### Community 0 - "Statistics & Widgets Dashboard"
Cohesion: 0.07
Nodes (51): MultiDisplayWidget(), GraphViewWidget(), HeatmapDayTrackerWidget(), HeatmapIntensityWidget(), BARS, formatScore(), LernScoreWidget(), StatNumberWidget() (+43 more)

### Community 1 - "Data Sync & Storage Backend"
Cohesion: 0.09
Nodes (67): DataContext, DEFAULT_TOPICS, deleteSession(), deleteTodo(), deleteTopic(), deleteWidgetConfig(), fetchChangedSince(), fetchDeletionsSince() (+59 more)

### Community 2 - "PIN Lock & Account Security"
Cohesion: 0.06
Nodes (40): PinLockOverlay(), deviceId, PinContext, PinProvider(), applyConfig(), onOnline(), onVisibility(), reloadPinConfig() (+32 more)

### Community 3 - "Auth & Session Summary"
Cohesion: 0.06
Nodes (37): AppRoutes(), loadTurnstileScript(), Turnstile, LogExerciseModal(), handleSave(), ProfileModal(), handleLogout(), AuthContext (+29 more)

### Community 4 - "Package Dependencies"
Cohesion: 0.04
Nodes (47): autoprefixer, date-fns, framer-motion, hash-wasm, dependencies, date-fns, framer-motion, hash-wasm (+39 more)

### Community 5 - "Changelog & Settings Screen"
Cohesion: 0.07
Nodes (27): CHANGELOG_URL, FALLBACK_CHANGELOG, readSeen(), useChangelog(), ChangelogScreen(), formatDate(), GLASS, ReleaseCard() (+19 more)

### Community 6 - "Active Study Session Flow"
Cohesion: 0.07
Nodes (23): StartExerciseModal(), FloatingActionPopup(), handleSaveProgress(), handleSessionComplete(), handleStartSession(), QuickLaunchWidget(), useSession(), ActiveSessionScreen() (+15 more)

### Community 7 - "Customisation & Graph Settings Screens"
Cohesion: 0.06
Nodes (27): SIZES, Switch(), getLocale(), COLOR_PALETTES, GLASS, PAL_KEY, PALETTE_PREVIEWS, DataSettingsScreen() (+19 more)

### Community 8 - "Widget Config Modal"
Cohesion: 0.05
Nodes (13): chipStyle(), CYCLE_PREVIEWS, OptionPicker(), rowChipStyle(), SIZE_OPTIONS, stepVariants, SUB_WIDGET_TYPES, SWATCH_COLORS (+5 more)

### Community 9 - "Topics & Data Provider"
Cohesion: 0.08
Nodes (28): CAT_KEY, CATEGORY_ICONS, COLOR_PALETTES, EMOJI_CATEGORIES, PAL_KEY, PALETTE_PREVIEWS, TopicEditModal(), handleSave() (+20 more)

### Community 10 - "Home Screen & Widget Shell"
Cohesion: 0.09
Nodes (20): WorkspaceCombobox(), close(), handleKeyDown(), handlePointerDown(), select(), WORKSPACES, SIZE_STYLES, WidgetShell() (+12 more)

### Community 11 - "Theme Collections (Pride)"
Cohesion: 0.13
Nodes (23): darkTheme, COLLECTIONS, THEME_MAP, lightTheme, prideAce, prideAg, prideAll, prideAro (+15 more)

### Community 12 - "App Shell & Routing"
Cohesion: 0.11
Nodes (11): App(), AppShell(), NavbarWrapper(), pageVariants, SwipeContainer(), SyncIndicator(), CircleRevealOverlay(), EASE (+3 more)

### Community 13 - "Changelog System Meta"
Cohesion: 0.12
Nodes (18): changelog.json (index), Changelog / Update Log System, Hardcoded default CHANGELOG_URL rationale, jsDelivr (GitHub CDN) delivery, jsDelivr CDN purge mechanism, mt_changelog_seen localStorage key, No client-side caching policy, Publishing checklist (three failure modes) (+10 more)

### Community 14 - "Theme Context Core"
Cohesion: 0.18
Nodes (14): applyTheme(), buildCustomNavbarBg(), DEFAULT_CUSTOM_COLORS, hexToRgba(), migrateLegacy(), ThemeContext, ThemeProvider(), setCustomColors() (+6 more)

### Community 15 - "Appearance & Pride Screens"
Cohesion: 0.15
Nodes (11): setCollection(), setMode(), useTheme(), AppearanceScreen(), GLASS, THEME_ICONS, GLASS, PRIDE_THEMES (+3 more)

### Community 16 - "Navbar & Heatmap Customisation"
Cohesion: 0.17
Nodes (5): NAV_ITEMS, Navbar(), NavDirectionContext, TABS, GLASS

### Community 17 - "i18n & Language Settings"
Cohesion: 0.18
Nodes (8): LanguageContext, LanguageProvider(), setLanguage(), getTranslator(), LANGUAGES, translations, GLASS, LanguageSettingsScreen()

### Community 18 - "Todo Swipe-to-Delete Gesture"
Cohesion: 0.25
Nodes (14): SwipeDeleteTodo(), gestureCancel(), gestureEnd(), gestureMove(), gestureStart(), handlePointerDown(), handlePointerMove(), handlePointerUp() (+6 more)

### Community 19 - "Create Workspace Screen"
Cohesion: 0.29
Nodes (3): CreateWorkspaceScreen(), GLASS, SWATCH_COLORS

### Community 20 - "Topic Stats Screen"
Cohesion: 0.33
Nodes (4): SwipeToDeleteRow(), handleDragEnd(), triggerDelete(), TIMEFRAMES

### Community 22 - "Planner Time Slider"
Cohesion: 0.60
Nodes (4): TimeSlider(), getValueFromPointer(), handlePointerDown(), handlePointerMove()

## Knowledge Gaps
- **122 isolated node(s):** `name`, `private`, `version`, `type`, `dev` (+117 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **7 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `useLanguage()` connect `Statistics & Widgets Dashboard` to `PIN Lock & Account Security`, `Auth & Session Summary`, `Changelog & Settings Screen`, `Active Study Session Flow`, `Customisation & Graph Settings Screens`, `Widget Config Modal`, `Topics & Data Provider`, `Home Screen & Widget Shell`, `App Shell & Routing`, `Theme Context Core`, `Appearance & Pride Screens`, `Navbar & Heatmap Customisation`, `i18n & Language Settings`, `Topic Stats Screen`?**
  _High betweenness centrality (0.186) - this node is a cross-community bridge._
- **Why does `useData()` connect `Statistics & Widgets Dashboard` to `Data Sync & Storage Backend`, `Auth & Session Summary`, `Changelog & Settings Screen`, `Active Study Session Flow`, `Customisation & Graph Settings Screens`, `Widget Config Modal`, `Topics & Data Provider`, `Home Screen & Widget Shell`, `App Shell & Routing`, `Navbar & Heatmap Customisation`, `Topic Stats Screen`?**
  _High betweenness centrality (0.072) - this node is a cross-community bridge._
- **Why does `SwipeDeleteTodo()` connect `Todo Swipe-to-Delete Gesture` to `App Shell & Routing`?**
  _High betweenness centrality (0.030) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `DataProvider()` (e.g. with `addRecentSession()` and `onOffline()`) actually correct?**
  _`DataProvider()` has 11 INFERRED edges - model-reasoned connections that need verification._
- **What connects `name`, `private`, `version` to the rest of the system?**
  _122 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Statistics & Widgets Dashboard` be split into smaller, more focused modules?**
  _Cohesion score 0.07030205827318899 - nodes in this community are weakly interconnected._
- **Should `Data Sync & Storage Backend` be split into smaller, more focused modules?**
  _Cohesion score 0.08972972972972973 - nodes in this community are weakly interconnected._