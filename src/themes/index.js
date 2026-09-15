import { lightTheme } from './light.js'
import { darkTheme } from './dark.js'
import {
  prideAll, prideProg,
  prideMlm, prideWlw, prideBi,
  pridePan, prideTrans, prideNb,
  prideAce, prideAro, prideAg,
  prideGf, prideIs,
  prideDemiboy, prideDemigirl,
  prideGq, pridePoly, prideOmni, prideDemi,
} from './pride_collection.js'

// Appearance has two independent dimensions:
//   • MODE       — light / dark / auto, picks the base palette
//   • COLLECTION — a theme overlay (e.g. a Pride flag) merged on top of the base
//
// To add a custom theme overlay:
//   1. Add a make(...) entry in pride_collection.js (returns overlay vars only)
//   2. Import it above
//   3. Add one entry in the THEMES array below (group: 'pride')
//   4. Add a label in src/i18n/en.js + de.js
//   group: 'standard' → mode rows on the Appearance screen
//   group: 'pride'    → Pride Collection screen overlays
export const THEMES = [
  { key: 'light',          labelKey: 'settings.appearance.light',          vars: lightTheme,    isDark: false, group: 'standard' },
  { key: 'dark',           labelKey: 'settings.appearance.dark',           vars: darkTheme,     isDark: true,  group: 'standard' },
  { key: 'pride-all',      labelKey: 'settings.appearance.pride-all',      vars: prideAll,      isDark: false, group: 'pride'    },
  { key: 'pride-prog',     labelKey: 'settings.appearance.pride-prog',     vars: prideProg,     isDark: false, group: 'pride'    },
  { key: 'pride-mlm',      labelKey: 'settings.appearance.pride-mlm',      vars: prideMlm,      isDark: false, group: 'pride'    },
  { key: 'pride-wlw',      labelKey: 'settings.appearance.pride-wlw',      vars: prideWlw,      isDark: false, group: 'pride'    },
  { key: 'pride-bi',       labelKey: 'settings.appearance.pride-bi',       vars: prideBi,       isDark: false, group: 'pride'    },
  { key: 'pride-pan',      labelKey: 'settings.appearance.pride-pan',      vars: pridePan,      isDark: false, group: 'pride'    },
  { key: 'pride-trans',    labelKey: 'settings.appearance.pride-trans',    vars: prideTrans,    isDark: false, group: 'pride'    },
  { key: 'pride-nb',       labelKey: 'settings.appearance.pride-nb',       vars: prideNb,       isDark: false, group: 'pride'    },
  { key: 'pride-ace',      labelKey: 'settings.appearance.pride-ace',      vars: prideAce,      isDark: false, group: 'pride'    },
  { key: 'pride-aro',      labelKey: 'settings.appearance.pride-aro',      vars: prideAro,      isDark: false, group: 'pride'    },
  { key: 'pride-ag',       labelKey: 'settings.appearance.pride-ag',       vars: prideAg,       isDark: false, group: 'pride'    },
  { key: 'pride-gf',       labelKey: 'settings.appearance.pride-gf',       vars: prideGf,       isDark: false, group: 'pride'    },
  { key: 'pride-is',       labelKey: 'settings.appearance.pride-is',       vars: prideIs,       isDark: false, group: 'pride'    },
  { key: 'pride-demiboy',  labelKey: 'settings.appearance.pride-demiboy',  vars: prideDemiboy,  isDark: false, group: 'pride'    },
  { key: 'pride-demigirl', labelKey: 'settings.appearance.pride-demigirl', vars: prideDemigirl, isDark: false, group: 'pride'    },
  { key: 'pride-gq',       labelKey: 'settings.appearance.pride-gq',       vars: prideGq,       isDark: false, group: 'pride'    },
  { key: 'pride-poly',     labelKey: 'settings.appearance.pride-poly',     vars: pridePoly,     isDark: false, group: 'pride'    },
  { key: 'pride-omni',     labelKey: 'settings.appearance.pride-omni',     vars: prideOmni,     isDark: false, group: 'pride'    },
  { key: 'pride-demi',     labelKey: 'settings.appearance.pride-demi',     vars: prideDemi,     isDark: false, group: 'pride'    },
]

export const THEME_MAP = Object.fromEntries(THEMES.map(t => [t.key, t]))

// Light / dark / auto rows shown at the top of the Appearance screen.
export const MODES = THEMES.filter(t => t.group === 'standard')
// Theme overlays shown on the Pride Collection screen.
export const COLLECTIONS = THEMES.filter(t => t.group === 'pride')

// Resolve the active CSS vars from the two independent settings.
//   mode       — 'system' | 'light' | 'dark'
//   collection — 'none' | a pride theme key (overlay merged on top of the base)
export function resolveTheme(mode, collection, systemPrefersDark) {
  const isDark = mode === 'dark' || (mode !== 'light' && systemPrefersDark)
  const base = isDark ? darkTheme : lightTheme
  const overlayEntry = collection && collection !== 'none' ? THEME_MAP[collection]?.vars : null
  const overlayVars = overlayEntry ? (isDark ? overlayEntry.dark : overlayEntry.light) : null
  return { vars: overlayVars ? { ...base, ...overlayVars } : base, isDark }
}
