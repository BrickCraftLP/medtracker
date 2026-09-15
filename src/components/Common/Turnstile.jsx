import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'

// Cloudflare Turnstile widget, wired for the "existing widget" flow: the
// widget itself (sitekey) was already created in the Cloudflare dashboard —
// this component only renders it and reports the resulting token upward.
// Verification of that token happens server-side, out of this app's code:
// Supabase Auth has native Turnstile support (Authentication → Settings →
// Bot and Abuse Protection), so the secret key lives there, never here.

const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js'
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY

let scriptPromise = null
function loadTurnstileScript() {
  if (window.turnstile) return Promise.resolve()
  if (!scriptPromise) {
    scriptPromise = new Promise((resolve, reject) => {
      const existing = document.querySelector(`script[src^="${SCRIPT_SRC}"]`)
      if (existing) {
        existing.addEventListener('load', () => resolve())
        existing.addEventListener('error', reject)
        return
      }
      const script = document.createElement('script')
      script.src = SCRIPT_SRC
      script.async = true
      script.defer = true
      script.onload = () => resolve()
      script.onerror = reject
      document.head.appendChild(script)
    })
  }
  return scriptPromise
}

// Ref API: { reset() } — call after a failed submit so the (single-use)
// token is cleared and the widget re-runs before the next attempt.
const Turnstile = forwardRef(function Turnstile({ onVerify, onExpire, onError, action }, ref) {
  const containerRef = useRef(null)
  const widgetIdRef = useRef(null)

  useImperativeHandle(ref, () => ({
    reset() {
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current)
      }
    },
  }))

  useEffect(() => {
    if (!SITE_KEY) {
      console.error('VITE_TURNSTILE_SITE_KEY is not set — Turnstile widget cannot render.')
      return
    }

    let cancelled = false

    loadTurnstileScript().then(() => {
      if (cancelled || !containerRef.current || !window.turnstile) return
      widgetIdRef.current = window.turnstile.render(containerRef.current, {
        sitekey: SITE_KEY,
        action,
        theme: 'dark',
        callback: token => onVerify?.(token),
        'expired-callback': () => onExpire?.(),
        'error-callback': () => onError?.(),
      })
    })

    return () => {
      cancelled = true
      if (widgetIdRef.current != null && window.turnstile) {
        window.turnstile.remove(widgetIdRef.current)
        widgetIdRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return <div ref={containerRef} style={{ display: 'flex', justifyContent: 'center' }} />
})

export default Turnstile
