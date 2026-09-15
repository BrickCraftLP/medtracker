import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePin } from '../context/PinContext.jsx'
import { useLanguage } from '../context/LanguageContext.jsx'
import { hideBootLoader } from '../utils/bootLoader.js'

const PAD_KEYS = ['1','2','3','4','5','6','7','8','9','','0','⌫']

function PinDots({ filled, total, shake }) {
  return (
    <motion.div
      animate={shake ? { x: [0, -10, 10, -10, 10, -6, 6, 0] } : { x: 0 }}
      transition={{ duration: 0.45 }}
      style={{ display: 'flex', gap: 14, justifyContent: 'center', margin: '24px 0 8px' }}
    >
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: i < filled ? 'var(--text-primary)' : 'transparent',
            border: '2px solid',
            borderColor: i < filled ? 'var(--text-primary)' : 'var(--border-strong)',
            transition: 'background 0.15s, border-color 0.15s',
          }}
        />
      ))}
    </motion.div>
  )
}

function NumPad({ onKey, disabled }) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 72px)', gap: 12, justifyContent: 'center', marginTop: 24 }}>
      {PAD_KEYS.map((k, i) => {
        if (k === '') return <div key={i} />
        return (
          <motion.button
            key={i}
            whileTap={disabled ? undefined : { scale: 0.88, backgroundColor: 'var(--bg-tertiary)' }}
            onClick={() => !disabled && onKey(k)}
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              border: '0.5px solid var(--glass-card-stroke)',
              background: 'var(--glass-card-bg)',
              backdropFilter: 'blur(60px)',
              WebkitBackdropFilter: 'blur(60px)',
              fontSize: k === '⌫' ? 20 : 26,
              fontWeight: k === '⌫' ? 400 : 300,
              color: disabled ? 'var(--text-tertiary)' : 'var(--text-primary)',
              cursor: disabled ? 'default' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'color 0.2s',
            }}
          >
            {k}
          </motion.button>
        )
      })}
    </div>
  )
}

export default function PinLockScreen() {
  useEffect(() => { hideBootLoader() }, [])
  const {
    pinConfig,
    lockReason,
    setLockReason,
    consecutiveFailures,
    lockedUntil,
    isOfflineFallback,
    submitPin,
    submitPasswordForUnlock,
  } = usePin()
  const { t } = useLanguage()

  const [digits, setDigits]         = useState([])
  const [shake, setShake]           = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [password, setPassword]     = useState('')
  const [pwError, setPwError]       = useState(null)
  const [pwSubmitting, setPwSubmitting] = useState(false)
  const [secondsLeft, setSecondsLeft]   = useState(0)
  const [showPasswordFallback, setShowPasswordFallback] = useState(false)

  const inputRef = useRef(null)

  // Countdown when timed out
  useEffect(() => {
    if (lockReason !== 'timeout' || !lockedUntil) return
    function tick() {
      const s = Math.max(0, Math.ceil((lockedUntil.getTime() - Date.now()) / 1000))
      setSecondsLeft(s)
      if (s === 0) setLockReason('pin')
    }
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [lockReason, lockedUntil, setLockReason])

  // Focus hidden input for alphanumeric mode
  useEffect(() => {
    if (lockReason === 'pin' && pinConfig?.pin_type === 'alphanumeric') {
      inputRef.current?.focus()
    }
  }, [lockReason, pinConfig?.pin_type])

  // Reset digits when screen changes
  useEffect(() => {
    setDigits([])
    setShake(false)
    setShowPasswordFallback(false)
    setPassword('')
    setPwError(null)
  }, [lockReason])

  async function doSubmit(pin) {
    if (submitting) return
    setSubmitting(true)
    const result = await submitPin(pin)
    setSubmitting(false)
    if (!result.success) {
      setDigits([])
      setShake(true)
      setTimeout(() => setShake(false), 500)
    }
  }

  function handleNumKey(k) {
    if (submitting || !pinConfig) return
    if (k === '⌫') {
      setDigits(d => d.slice(0, -1))
      return
    }
    setDigits(d => {
      const next = [...d, k]
      if (next.length === pinConfig.pin_length) {
        // submit after render so dots update visually first
        setTimeout(() => doSubmit(next.join('')), 80)
        return next
      }
      return next
    })
  }

  function handleAlphaChange(e) {
    const val = e.target.value.slice(0, pinConfig?.pin_length ?? 6)
    setDigits(val.split(''))
  }

  async function handleAlphaSubmit() {
    if (!digits.length || submitting) return
    await doSubmit(digits.join(''))
  }

  async function handlePasswordSubmit() {
    if (!password || pwSubmitting) return
    setPwError(null)
    setPwSubmitting(true)
    const result = await submitPasswordForUnlock(password)
    setPwSubmitting(false)
    if (!result.success) setPwError(result.error)
  }

  function formatTime(s) {
    const m = Math.floor(s / 60)
    const sec = s % 60
    if (m > 0) return t('pin.timeMin', { m, s: String(sec).padStart(2, '0') })
    return t('pin.timeSec', { s })
  }

  const attemptsLeft = 3 - consecutiveFailures
  const pinLen = pinConfig?.pin_length ?? 4
  const isAlpha = pinConfig?.pin_type === 'alphanumeric'

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingTop: 'max(calc(env(safe-area-inset-top, 0px) + 20px), 40px)',
      paddingBottom: 'max(calc(env(safe-area-inset-bottom, 0px) + 20px), 40px)',
      zIndex: 500,
    }}>

      <AnimatePresence mode="wait">

        {/* ── Offline unavailable state ── */}
        {lockReason === 'offline_unavailable' && (
          <motion.div
            key="offline"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{ width: '100%', maxWidth: 320, padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}
          >
            <div style={{ fontSize: 52, marginBottom: 16, lineHeight: 1 }}>📡</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', letterSpacing: -0.4 }}>
              {t('pin.noConnection')}
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.6 }}>
              {isOfflineFallback
                ? t('pin.noConnectionFallback')
                : t('pin.noConnectionFirst')}
            </p>
          </motion.div>
        )}

        {/* ── Password-required state ── */}
        {lockReason === 'password_required' && (
          <motion.div
            key="pw-required"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{ width: '100%', maxWidth: 320, padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}
          >
            <div style={{ fontSize: 52, marginBottom: 16, lineHeight: 1 }}>🔐</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', letterSpacing: -0.4 }}>
              {t('pin.tooMany')}
            </h2>
            <p style={{ margin: '0 0 28px', fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
              {t('pin.passwordRequired')}
            </p>
            <input
              type="password"
              placeholder={t('pin.passwordPlaceholder')}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
              autoFocus
              className="input"
              style={{ width: '100%', fontSize: 16, marginBottom: 12, boxSizing: 'border-box' }}
            />
            {pwError && (
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--wrong)', fontWeight: 500, alignSelf: 'flex-start' }}>
                {pwError}
              </p>
            )}
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handlePasswordSubmit}
              disabled={!password || pwSubmitting}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 14,
                border: 'none',
                background: 'var(--accent)',
                fontSize: 15,
                fontWeight: 700,
                color: 'white',
                cursor: !password || pwSubmitting ? 'default' : 'pointer',
                opacity: !password || pwSubmitting ? 0.5 : 1,
              }}
            >
              {pwSubmitting ? t('pin.checking') : t('pin.unlock')}
            </motion.button>
          </motion.div>
        )}

        {/* ── Timeout state ── */}
        {lockReason === 'timeout' && (
          <motion.div
            key="timeout"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{ width: '100%', maxWidth: 320, padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            <div style={{ fontSize: 52, marginBottom: 16, lineHeight: 1 }}>⏳</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', letterSpacing: -0.4 }}>
              {t('pin.tooMany')}
            </h2>
            <p style={{ margin: '0 0 4px', fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
              {t('pin.unlockIn')}
            </p>
            <p style={{ margin: '0 0 40px', fontSize: 36, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -1 }}>
              {formatTime(secondsLeft)}
            </p>

            {/* Grayed-out pad preview */}
            <PinDots filled={0} total={pinLen} shake={false} />
            <NumPad onKey={() => {}} disabled />
          </motion.div>
        )}

        {/* ── Password fallback (forgot PIN) ── */}
        {lockReason === 'pin' && showPasswordFallback && (
          <motion.div
            key="pw-fallback"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{ width: '100%', maxWidth: 320, padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 0 }}
          >
            <div style={{ fontSize: 52, marginBottom: 16, lineHeight: 1 }}>🔑</div>
            <h2 style={{ margin: '0 0 8px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', textAlign: 'center', letterSpacing: -0.4 }}>
              {t('pin.forgotTitle')}
            </h2>
            <p style={{ margin: '0 0 28px', fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center', lineHeight: 1.5 }}>
              {t('pin.forgotMsg')}
            </p>
            <input
              type="password"
              placeholder={t('pin.passwordPlaceholder')}
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handlePasswordSubmit()}
              autoFocus
              className="input"
              style={{ width: '100%', fontSize: 16, marginBottom: 12, boxSizing: 'border-box' }}
            />
            {pwError && (
              <p style={{ margin: '0 0 10px', fontSize: 13, color: 'var(--wrong)', fontWeight: 500, alignSelf: 'flex-start' }}>
                {pwError}
              </p>
            )}
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={handlePasswordSubmit}
              disabled={!password || pwSubmitting}
              style={{
                width: '100%',
                padding: '14px',
                borderRadius: 14,
                border: 'none',
                background: 'var(--accent)',
                fontSize: 15,
                fontWeight: 700,
                color: 'white',
                cursor: !password || pwSubmitting ? 'default' : 'pointer',
                opacity: !password || pwSubmitting ? 0.5 : 1,
              }}
            >
              {pwSubmitting ? t('pin.checking') : t('pin.unlock')}
            </motion.button>
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { setShowPasswordFallback(false); setPassword(''); setPwError(null) }}
              style={{ marginTop: 16, background: 'none', border: 'none', fontSize: 14, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
            >
              {t('pin.backToPin')}
            </motion.button>
          </motion.div>
        )}

        {/* ── Normal PIN entry ── */}
        {lockReason === 'pin' && !showPasswordFallback && (
          <motion.div
            key="pin-entry"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            style={{ width: '100%', maxWidth: 320, padding: '0 24px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}
          >
            <div style={{ fontSize: 44, marginBottom: 10, lineHeight: 1 }}>🔒</div>
            <h2 style={{ margin: '0 0 2px', fontSize: 22, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.4 }}>
              MedTracker
            </h2>
            <p style={{ margin: 0, fontSize: 14, color: 'var(--text-secondary)' }}>
              {t('pin.subtitle')}
            </p>

            <PinDots filled={digits.length} total={pinLen} shake={shake} />

            <AnimatePresence>
              {consecutiveFailures > 0 && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--wrong)', fontWeight: 500, textAlign: 'center' }}
                >
                  {attemptsLeft === 1 ? t('pin.attemptsOne') : t('pin.attemptsMany', { n: attemptsLeft })}
                </motion.p>
              )}
            </AnimatePresence>

            {isAlpha ? (
              <>
                {/* Hidden input captures keyboard */}
                <input
                  ref={inputRef}
                  type="text"
                  value={digits.join('')}
                  onChange={handleAlphaChange}
                  onKeyDown={e => e.key === 'Enter' && handleAlphaSubmit()}
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
                />
                <motion.button
                  whileTap={{ scale: 0.96 }}
                  onClick={() => { inputRef.current?.focus(); handleAlphaSubmit() }}
                  disabled={digits.length < pinLen || submitting}
                  style={{
                    marginTop: 28,
                    width: '100%',
                    padding: '14px',
                    borderRadius: 14,
                    border: 'none',
                    background: 'var(--accent)',
                    fontSize: 15,
                    fontWeight: 700,
                    color: 'white',
                    cursor: digits.length < pinLen || submitting ? 'default' : 'pointer',
                    opacity: digits.length < pinLen || submitting ? 0.4 : 1,
                  }}
                >
                  {submitting ? '…' : t('pin.confirm')}
                </motion.button>
                <motion.button
                  whileTap={{ scale: 0.95 }}
                  onClick={() => inputRef.current?.focus()}
                  style={{ marginTop: 14, background: 'none', border: 'none', fontSize: 14, color: 'var(--accent)', cursor: 'pointer', fontWeight: 600 }}
                >
                  {t('pin.openKeyboard')}
                </motion.button>
              </>
            ) : (
              <NumPad onKey={handleNumKey} disabled={submitting} />
            )}

            {submitting && (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }}
                style={{ width: 20, height: 20, borderRadius: '50%', border: '2.5px solid var(--border)', borderTopColor: 'var(--accent)', marginTop: 20 }}
              />
            )}

            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => { setShowPasswordFallback(true); setDigits([]) }}
              style={{ marginTop: 24, background: 'none', border: 'none', fontSize: 14, color: 'var(--text-tertiary)', cursor: 'pointer', fontWeight: 500 }}
            >
              {t('pin.forgot')}
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
