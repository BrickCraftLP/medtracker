import { createContext, useContext, useState, useMemo, useCallback, useRef, useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

// How often to ask the browser to re-fetch sw.js while the app stays open.
const CHECK_INTERVAL = 30 * 60 * 1000
// Keep the manual-check spinner on screen long enough to read.
const MIN_CHECK_MS = 600
// If `controllerchange` never fires (seen on iOS Safari), reload anyway.
const APPLY_TIMEOUT_MS = 10000

const UpdateContext = createContext(null)

export function UpdateProvider({ children }) {
  const [updating, setUpdating] = useState(false)   // drives the full-screen plate
  const [checking, setChecking] = useState(false)   // drives the Settings row spinner
  const [dismissed, setDismissed] = useState(false) // hides the toast until reload
  const regRef = useRef(null)
  const cleanupRef = useRef(null)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_swUrl, r) {
      regRef.current = r ?? null
      if (!r) return
      // Poll periodically, and again whenever the app returns to the
      // foreground — an installed PWA can sit backgrounded for days.
      const update = () => { r.update().catch(() => {}) }
      const id = setInterval(update, CHECK_INTERVAL)
      const onVisible = () => { if (document.visibilityState === 'visible') update() }
      document.addEventListener('visibilitychange', onVisible)
      cleanupRef.current = () => {
        clearInterval(id)
        document.removeEventListener('visibilitychange', onVisible)
      }
    },
  })

  useEffect(() => () => { cleanupRef.current?.() }, [])

  const checkForUpdate = useCallback(async () => {
    setChecking(true)
    const started = Date.now()
    try {
      await regRef.current?.update()
    } catch {
      // Offline or the SW isn't registered (dev) — fall through, no update.
    } finally {
      const wait = MIN_CHECK_MS - (Date.now() - started)
      if (wait > 0) await new Promise((res) => setTimeout(res, wait))
      setChecking(false)
    }
  }, [])

  // Tells the waiting SW to skipWaiting; vite-plugin-pwa reloads the page on
  // `controllerchange`, so `updating` is never cleared — the plate stays up
  // until the new build replaces this document.
  const applyUpdate = useCallback(async () => {
    setUpdating(true)
    const watchdog = setTimeout(() => { window.location.reload() }, APPLY_TIMEOUT_MS)
    try {
      await updateServiceWorker(true)
    } catch {
      clearTimeout(watchdog)
      setTimeout(() => { window.location.reload() }, 300)
    }
  }, [updateServiceWorker])

  const value = useMemo(
    () => ({ needRefresh, updating, checking, dismissed, setDismissed, checkForUpdate, applyUpdate }),
    [needRefresh, updating, checking, dismissed, checkForUpdate, applyUpdate],
  )

  return <UpdateContext.Provider value={value}>{children}</UpdateContext.Provider>
}

export function useUpdate() {
  const ctx = useContext(UpdateContext)
  if (!ctx) throw new Error('useUpdate must be used within UpdateProvider')
  return ctx
}
