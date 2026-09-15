import { createContext, useContext, useState, useMemo, useCallback } from 'react'
import { getTranslator } from '../i18n/index.js'

const STORAGE_KEY = 'mt_language'

const LanguageContext = createContext(null)

export function LanguageProvider({ children }) {
  const [language, setLanguageState] = useState(() =>
    localStorage.getItem(STORAGE_KEY) ?? 'de'
  )
  // Stable `t` and context value: without these every provider render hands
  // out new identities and re-renders every consumer in the tree.
  const t = useMemo(() => getTranslator(language), [language])

  const setLanguage = useCallback(lang => {
    localStorage.setItem(STORAGE_KEY, lang)
    setLanguageState(lang)
  }, [])

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t])

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  )
}

export function useLanguage() {
  const ctx = useContext(LanguageContext)
  if (!ctx) throw new Error('useLanguage must be used within LanguageProvider')
  return ctx
}
