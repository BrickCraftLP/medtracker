import de from './de.js'
import en from './en.js'

const translations = { de, en }

export const LANGUAGES = [
  { code: 'de', label: 'Deutsch', flag: '🇦🇹' },
  { code: 'en', label: 'English', flag: '🇬🇧' },
]

export function getLocale(lang) {
  return lang === 'en' ? 'en-US' : 'de-AT'
}

export function getTranslator(lang) {
  const dict = translations[lang] ?? translations.de
  return function t(key, vars) {
    let val = dict[key] ?? translations.de[key] ?? key
    if (typeof val === 'string' && vars) {
      Object.entries(vars).forEach(([k, v]) => {
        val = val.replace(`{${k}}`, String(v))
      })
    }
    return val
  }
}
