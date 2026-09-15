import { createContext, useContext, useEffect, useState } from 'react'
import { supabase } from '../services/supabaseConfig.js'
import { signIn, signUp, signOut, initializeUserData, getCachedProfile, getProfile, upsertProfile } from '../services/dbInterface.js'
import { detachDevice } from '../services/pushService.js'

const AuthContext = createContext(null)

const CACHE_KEY = 'mt_cached_user_id'

export function AuthProvider({ children }) {
  // Synchronously read cached user id so the app can render structure
  // immediately without waiting for the async getSession() call.
  const [user, setUser] = useState(() => {
    const id = localStorage.getItem(CACHE_KEY)
    return id ? { id, _stub: true } : null
  })
  const [loading, setLoading] = useState(true)

  // Profile picture — backed by the `profiles` table (see profiles.sql),
  // not user_metadata. Seeded synchronously from the local cache (same
  // pattern as the cached user id above) so it's on screen on first paint,
  // then revalidated from Supabase once the real session/user id is known.
  const [avatarUrl, setAvatarUrl] = useState(() => {
    const id = localStorage.getItem(CACHE_KEY)
    return (id && getCachedProfile(id)?.avatar_url) || ''
  })

  useEffect(() => {
    if (!user?.id) { setAvatarUrl(''); return }
    let cancelled = false
    getProfile(user.id)
      .then((profile) => { if (!cancelled) setAvatarUrl(profile?.avatar_url ?? '') })
      .catch(() => {})
    return () => { cancelled = true }
  }, [user?.id])

  async function saveAvatarUrl(url) {
    if (!user?.id) return
    const trimmed = (url ?? '').trim()
    const profile = await upsertProfile(user.id, { avatar_url: trimmed || null })
    setAvatarUrl(profile?.avatar_url ?? '')
  }

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) {
        localStorage.setItem(CACHE_KEY, session.user.id)
        setUser(session.user)
      } else {
        localStorage.removeItem(CACHE_KEY)
        setUser(null)
      }
      setLoading(false)
    })

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        localStorage.setItem(CACHE_KEY, session.user.id)
        setUser(session.user)
      } else {
        localStorage.removeItem(CACHE_KEY)
        setUser(null)
      }
    })

    // iOS suspends JS timers while a PWA is backgrounded, so autoRefreshToken
    // never fires and the access token goes stale. Reads then return empty and
    // writes fail RLS. Force a refresh whenever the app regains focus —
    // getSession() transparently refreshes an expired token before any write.
    const refresh = () => {
      if (document.visibilityState === 'visible') supabase.auth.getSession()
    }
    document.addEventListener('visibilitychange', refresh)
    window.addEventListener('focus', refresh)

    return () => {
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', refresh)
      window.removeEventListener('focus', refresh)
    }
  }, [])

  async function login(email, password, captchaToken) {
    const data = await signIn(email, password, captchaToken)
    return data
  }

  async function register(email, password, displayName) {
    const data = await signUp(email, password, displayName)
    if (data.user) {
      await initializeUserData(data.user.id).catch(() => {})
    }
    return data
  }

  async function logout() {
    // Before signOut: removing this device's push row needs the live session.
    await detachDevice().catch(() => {})
    await signOut()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, avatarUrl, saveAvatarUrl }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
