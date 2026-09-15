import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { useAuth } from './AuthContext.jsx'
import { getPinConfig, updatePinAttempts } from '../services/dbInterface.js'
import { verifyPin } from '../services/pinService.js'
import { idbGetPin, idbSavePin, idbDeletePin } from '../services/pinOfflineStore.js'
import { supabase } from '../services/supabaseConfig.js'

const TIERS = [30, 300, 900] // seconds per timeout tier

// ── Device ID ─────────────────────────────────────────────────────────────────
function getOrCreateDeviceId() {
  let id = localStorage.getItem('mt_device_id')
  if (!id) {
    id = crypto.randomUUID()
    localStorage.setItem('mt_device_id', id)
  }
  return id
}
const deviceId = getOrCreateDeviceId()

// ── Write-ahead log (WAL) ─────────────────────────────────────────────────────
// Synchronous localStorage writes that survive a reload even if the async IDB
// write hasn't completed yet.  Only stores the two values needed to enforce
// the lockout; the actual PIN hash never leaves IDB/Supabase.
// '1' | '0' — whether this device had a PIN configured the last time the
// config resolved. Read synchronously on boot by PinLockOverlay (App.jsx).
export const PIN_HINT_KEY = 'mt_pin_configured'

export function hasPinHint() {
  try { return localStorage.getItem(PIN_HINT_KEY) !== '0' } catch { return true }
}

const WAL_TOTAL = 'mt_pin_wal_total'
const WAL_UNTIL = 'mt_pin_wal_until'

function walWrite(total, until) {
  localStorage.setItem(WAL_TOTAL, String(total))
  if (until) localStorage.setItem(WAL_UNTIL, until.toISOString())
  else localStorage.removeItem(WAL_UNTIL)
}

function walClear() {
  localStorage.removeItem(WAL_TOTAL)
  localStorage.removeItem(WAL_UNTIL)
}

function walRead() {
  const total    = parseInt(localStorage.getItem(WAL_TOTAL) ?? '0', 10)
  const untilStr = localStorage.getItem(WAL_UNTIL)
  const until    = untilStr ? new Date(untilStr) : null
  return { total, until }
}

// ── Context ───────────────────────────────────────────────────────────────────
const PinContext = createContext(null)

export function PinProvider({ children }) {
  const { user } = useAuth()

  const [pinConfig, setPinConfig]         = useState(null)
  const [configLoading, setConfigLoading] = useState(true)
  const [isLocked, setIsLocked]           = useState(false)
  // 'pin' | 'timeout' | 'password_required' | 'offline_unavailable'
  const [lockReason, setLockReason]       = useState('pin')

  const [failedConsec, setFailedConsec] = useState(0)
  const [failedTotal, setFailedTotal]   = useState(0)
  const [lockedUntil, setLockedUntil]   = useState(null)
  const [batchCount, setBatchCount]     = useState(0)

  const [isOfflineFallback, setIsOfflineFallback] = useState(false)
  const [idbError, setIdbError]                   = useState(false)

  const pinConfigRef  = useRef(null)
  const failedTotalRef   = useRef(0)
  const failedConsecRef  = useRef(0)
  const lockedUntilRef   = useRef(null)
  const batchCountRef    = useRef(0)
  const skipNextLockRef  = useRef(false)

  useEffect(() => { pinConfigRef.current   = pinConfig  }, [pinConfig])
  useEffect(() => { failedTotalRef.current = failedTotal }, [failedTotal])
  useEffect(() => { failedConsecRef.current = failedConsec }, [failedConsec])
  useEffect(() => { lockedUntilRef.current = lockedUntil }, [lockedUntil])
  useEffect(() => { batchCountRef.current  = batchCount  }, [batchCount])

  // ── Apply a config object from Supabase or IDB ───────────────────────────
  // Merges with the synchronous WAL so a reload mid-IDB-write still enforces
  // any in-progress lockout.
  function applyConfig(cfg) {
    setPinConfig(cfg)
    pinConfigRef.current = cfg
    // Synchronous hint for the next boot: with no PIN on this device there is
    // nothing to hide, so the lock overlay can skip its opaque plate entirely
    // instead of covering the app until the network round-trip resolves.
    try { localStorage.setItem(PIN_HINT_KEY, cfg ? '1' : '0') } catch {}
    if (!cfg) { skipNextLockRef.current = false; setIsLocked(false); return }

    const skipLock = skipNextLockRef.current
    skipNextLockRef.current = false

    const { total: walTotal, until: walUntil } = walRead()

    // Take the more restrictive value between server/IDB and WAL
    const rawTotal = cfg.failed_total ?? 0
    const rawUntil = cfg.locked_until ? new Date(cfg.locked_until) : null
    const consec   = cfg.failed_consec ?? 0
    const batch    = cfg.batch_count   ?? 0

    const total = Math.max(rawTotal, walTotal)
    let   until = rawUntil
    if (walUntil && walUntil > new Date() && (!until || walUntil > until)) {
      until = walUntil
    }

    setFailedConsec(consec);  failedConsecRef.current = consec
    setFailedTotal(total);    failedTotalRef.current  = total
    setLockedUntil(until);    lockedUntilRef.current  = until
    setBatchCount(batch);     batchCountRef.current   = batch

    if (skipLock) return

    if (total >= 10) {
      setLockReason('password_required')
    } else if (until && until > new Date()) {
      setLockReason('timeout')
    } else {
      setLockReason('pin')
    }
    setIsLocked(true)
  }

  // ── IDB sync (fire-and-forget; WAL covers the async gap) ─────────────────
  function syncToIdb(cfg, consec, total, until, batch) {
    if (!cfg) return
    idbSavePin(deviceId, {
      pin_hash:      cfg.pin_hash,
      pin_salt:      cfg.pin_salt,
      pin_length:    cfg.pin_length,
      pin_type:      cfg.pin_type,
      failed_consec: consec,
      failed_total:  total,
      locked_until:  until ? until.toISOString() : null,
      batch_count:   batch,
    }).catch(() => setIdbError(true))
  }

  // ── Supabase sync (fire-and-forget when called from submitPin) ───────────
  function syncToSupabase(consec, total, until, batch) {
    if (!user || !navigator.onLine) return
    updatePinAttempts(user.id, deviceId, {
      failed_consec: consec,
      failed_total:  total,
      locked_until:  until ? until.toISOString() : null,
      batch_count:   batch,
    }).catch(() => {})
  }

  // Write to WAL first (synchronous), then persist async
  function syncAttempts(consec, total, until, batch) {
    walWrite(total, until)                               // sync — survives reload
    syncToIdb(pinConfigRef.current, consec, total, until, batch) // async IDB
    syncToSupabase(consec, total, until, batch)          // async Supabase
  }

  // ── Load config ───────────────────────────────────────────────────────────
  const loadConfig = useCallback(async (uid) => {
    setConfigLoading(true)
    try {
      const cfg = await getPinConfig(uid, deviceId)
      applyConfig(cfg)
      setIsOfflineFallback(false)
      if (cfg) {
        idbSavePin(deviceId, {
          pin_hash:      cfg.pin_hash,
          pin_salt:      cfg.pin_salt,
          pin_length:    cfg.pin_length,
          pin_type:      cfg.pin_type,
          failed_consec: cfg.failed_consec ?? 0,
          failed_total:  cfg.failed_total  ?? 0,
          locked_until:  cfg.locked_until  ?? null,
          batch_count:   cfg.batch_count   ?? 0,
        }).then(() => setIdbError(false))
          .catch(() => setIdbError(true))
      } else {
        idbDeletePin(deviceId).catch(() => {})
        setIdbError(false)
        walClear()
      }
    } catch {
      // Supabase unreachable — try IDB fallback only when offline
      if (!navigator.onLine) {
        if (idbError) {
          setIsLocked(true)
          setLockReason('offline_unavailable')
          setIsOfflineFallback(false)
        } else {
          try {
            const cached = await idbGetPin(deviceId)
            if (cached) {
              applyConfig(cached)   // WAL merge happens inside applyConfig
              setIsOfflineFallback(true)
            } else {
              setIsLocked(true)
              setLockReason('offline_unavailable')
              setIsOfflineFallback(false)
            }
          } catch {
            setIdbError(true)
            setIsLocked(true)
            setLockReason('offline_unavailable')
            setIsOfflineFallback(false)
          }
        }
      } else {
        // Online but Supabase returned unexpected error — don't lock
        setPinConfig(null)
        setIsLocked(false)
        setIsOfflineFallback(false)
      }
    } finally {
      setConfigLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idbError])

  useEffect(() => {
    if (!user) {
      setPinConfig(null)
      setIsLocked(false)
      setConfigLoading(false)
      setIsOfflineFallback(false)
      return
    }
    loadConfig(user.id)
  }, [user, loadConfig])

  // ── Re-lock on background → foreground ───────────────────────────────────
  useEffect(() => {
    function onVisibility() {
      if (document.visibilityState !== 'visible') return
      setPinConfig(cfg => {
        if (!cfg) return cfg
        setFailedTotal(total => {
          setLockedUntil(until => {
            const { total: walTotal, until: walUntil } = walRead()
            const effectiveTotal = Math.max(total, walTotal)
            const effectiveUntil = (walUntil && (!until || walUntil > until)) ? walUntil : until
            if (effectiveTotal >= 10) setLockReason('password_required')
            else if (effectiveUntil && effectiveUntil > new Date()) setLockReason('timeout')
            else if (!navigator.onLine && idbError) setLockReason('offline_unavailable')
            else setLockReason('pin')
            return until
          })
          return total
        })
        setIsLocked(true)
        return cfg
      })
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [idbError])

  // ── Re-connect after offline: push accumulated attempts, then reload ──────
  useEffect(() => {
    async function onOnline() {
      if (!user) return
      if (isOfflineFallback) {
        // Push offline attempts to Supabase FIRST, then reload so loadConfig
        // reads the updated values instead of overwriting them.
        try {
          await updatePinAttempts(user.id, deviceId, {
            failed_consec: failedConsecRef.current,
            failed_total:  failedTotalRef.current,
            locked_until:  lockedUntilRef.current
              ? lockedUntilRef.current.toISOString() : null,
            batch_count:   batchCountRef.current,
          })
        } catch {}
        loadConfig(user.id)
      } else if (idbError) {
        loadConfig(user.id)
      }
    }
    window.addEventListener('online', onOnline)
    return () => window.removeEventListener('online', onOnline)
  }, [user, isOfflineFallback, idbError, loadConfig])

  // ── PIN submit ────────────────────────────────────────────────────────────
  async function submitPin(pin) {
    if (!pinConfig) return { success: false }

    const ok = await verifyPin(pin, pinConfig.pin_hash, pinConfig.pin_salt)
    if (ok) {
      walClear()
      setFailedConsec(0)
      setLockedUntil(null)
      setIsLocked(false)
      setLockReason('pin')
      syncAttempts(0, failedTotalRef.current, null, batchCountRef.current)
      return { success: true }
    }

    const newTotal  = failedTotalRef.current  + 1
    const newConsec = failedConsecRef.current + 1

    if (newTotal >= 10) {
      walWrite(newTotal, null)   // synchronous — survives reload
      syncAttempts(newConsec, newTotal, lockedUntilRef.current, batchCountRef.current)
      setFailedConsec(newConsec)
      setFailedTotal(newTotal)
      setLockReason('password_required')
      return { success: false, reason: 'password_required' }
    }

    if (newConsec >= 3) {
      const tier     = Math.min(batchCountRef.current, TIERS.length - 1)
      const until    = new Date(Date.now() + TIERS[tier] * 1000)
      const newBatch = Math.min(batchCountRef.current + 1, TIERS.length - 1)
      walWrite(newTotal, until)  // synchronous — survives reload before IDB write
      syncAttempts(0, newTotal, until, newBatch)
      setFailedConsec(0)
      setFailedTotal(newTotal)
      setLockedUntil(until)
      setBatchCount(newBatch)
      setLockReason('timeout')
      return { success: false, reason: 'timeout' }
    }

    walWrite(newTotal, lockedUntilRef.current)  // track total for password_required threshold
    syncAttempts(newConsec, newTotal, lockedUntilRef.current, batchCountRef.current)
    setFailedConsec(newConsec)
    setFailedTotal(newTotal)
    return { success: false, reason: 'wrong' }
  }

  // ── Password unlock (always requires network) ────────────────────────────
  async function submitPasswordForUnlock(password) {
    if (!navigator.onLine) {
      return { success: false, error: 'Internetverbindung erforderlich.' }
    }
    try {
      skipNextLockRef.current = true
      const { error } = await supabase.auth.signInWithPassword({
        email: user.email,
        password,
      })
      if (error) {
        skipNextLockRef.current = false
        return { success: false, error: 'Falsches Passwort.' }
      }
      walClear()
      setFailedConsec(0)
      setFailedTotal(0)
      setLockedUntil(null)
      setBatchCount(0)
      setIsLocked(false)
      setIsOfflineFallback(false)
      setLockReason('pin')
      syncAttempts(0, 0, null, 0)
      return { success: true }
    } catch {
      skipNextLockRef.current = false
      return { success: false, error: 'Fehler beim Entsperren.' }
    }
  }

  // ── Called from Settings after enabling/disabling PIN ───────────────────
  async function reloadPinConfig() {
    if (!user) return
    try {
      const cfg = await getPinConfig(user.id, deviceId)
      applyConfig(cfg)
      setIsOfflineFallback(false)
      if (cfg) {
        idbSavePin(deviceId, {
          pin_hash:      cfg.pin_hash,
          pin_salt:      cfg.pin_salt,
          pin_length:    cfg.pin_length,
          pin_type:      cfg.pin_type,
          failed_consec: 0,
          failed_total:  0,
          locked_until:  null,
          batch_count:   0,
        }).then(() => setIdbError(false)).catch(() => setIdbError(true))
        walClear()
      } else {
        idbDeletePin(deviceId).catch(() => {})
        setIdbError(false)
        walClear()
      }
    } catch {}
  }

  return (
    <PinContext.Provider value={{
      pinConfig,
      configLoading,
      isLocked,
      lockReason,
      consecutiveFailures: failedConsec,
      totalFailures: failedTotal,
      lockedUntil,
      isOfflineFallback,
      idbError,
      deviceId,
      submitPin,
      submitPasswordForUnlock,
      reloadPinConfig,
      setLockReason,
    }}>
      {children}
    </PinContext.Provider>
  )
}

export function usePin() {
  const ctx = useContext(PinContext)
  if (!ctx) throw new Error('usePin must be used within PinProvider')
  return ctx
}
