import { useState, useEffect, useContext } from 'react'
import { useNavigate } from 'react-router-dom'
import { NavDirectionContext } from '../context/navDirection.js'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../context/AuthContext.jsx'
import { supabase } from '../services/supabaseConfig.js'
import { savePinConfig, deletePinConfig } from '../services/dbInterface.js'
import { usePin } from '../context/PinContext.jsx'
import { hashPin, generateSalt } from '../services/pinService.js'
import { useLanguage } from '../context/LanguageContext.jsx'

const GLASS = { background: 'var(--glass-card-bg)', backdropFilter: 'blur(60px) saturate(200%)', WebkitBackdropFilter: 'blur(60px) saturate(200%)', borderRadius: 16, border: '0.5px solid var(--glass-card-stroke)', boxShadow: 'var(--glass-card-shadow)', overflow: 'hidden' }

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 32 }}>
      <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-tertiary)', letterSpacing: 0.5, textTransform: 'uppercase', margin: '0 16px 6px' }}>
        {title}
      </p>
      <div style={GLASS}>{children}</div>
    </div>
  )
}

function Row({ label, value, onTap, destructive, right, divider = true, icon }) {
  return (
    <>
      <motion.div
        whileTap={onTap ? { scale: 0.98, backgroundColor: 'var(--bg-tertiary)' } : undefined}
        onClick={onTap}
        style={{ display: 'flex', alignItems: 'center', padding: '13px 16px', gap: 12, cursor: onTap ? 'pointer' : 'default' }}
      >
        {icon && (
          <div style={{ width: 30, height: 30, borderRadius: 8, background: destructive ? 'rgba(239,68,68,0.15)' : 'var(--accent-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            {icon}
          </div>
        )}
        <span style={{ flex: 1, fontSize: 15, fontWeight: 500, color: destructive ? '#ef4444' : 'var(--text-primary)' }}>{label}</span>
        {value && <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>{value}</span>}
        {right}
        {onTap && !right && (
          <svg width="7" height="12" viewBox="0 0 7 12" fill="var(--text-tertiary)">
            <path d="M1 1l5 5-5 5" stroke="var(--text-tertiary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </svg>
        )}
      </motion.div>
      {divider && <div style={{ height: 0.5, background: 'var(--border)', margin: '0 16px' }} />}
    </>
  )
}

export default function AccountSettingsScreen() {
  const { user, avatarUrl, saveAvatarUrl } = useAuth()
  const navigate = useNavigate()
  const { setDirection } = useContext(NavDirectionContext)
  const { t } = useLanguage()

  const displayName = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? ''
  const email = user?.email ?? ''
  const initial = displayName[0]?.toUpperCase() ?? '?'

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(displayName)
  const [savingName, setSavingName] = useState(false)
  const [avatarError, setAvatarError] = useState(false)

  async function handleSaveName() {
    if (!nameValue.trim() || nameValue.trim() === displayName) {
      setEditingName(false)
      setNameValue(displayName)
      return
    }
    setSavingName(true)
    try {
      await supabase.auth.updateUser({ data: { display_name: nameValue.trim() } })
      setEditingName(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSavingName(false)
    }
  }

  // ── Profile picture ──────────────────────────────────────────────────────────
  const [editingAvatar, setEditingAvatar] = useState(false)
  const [avatarValue, setAvatarValue] = useState(avatarUrl)
  const [avatarPreviewError, setAvatarPreviewError] = useState(false)
  const [savingAvatar, setSavingAvatar] = useState(false)

  async function handleSaveAvatar() {
    setSavingAvatar(true)
    try {
      await saveAvatarUrl(avatarValue)
      setAvatarError(false)
      setEditingAvatar(false)
    } catch (e) {
      console.error(e)
    } finally {
      setSavingAvatar(false)
    }
  }

  // ── Email ────────────────────────────────────────────────────────────────────
  const [changingEmail, setChangingEmail] = useState(false)
  const [emailValue, setEmailValue] = useState('')
  const [emailPassword, setEmailPassword] = useState('')
  const [emailError, setEmailError] = useState(null)
  const [emailSaving, setEmailSaving] = useState(false)
  const [emailSent, setEmailSent] = useState(false)

  async function handleChangeEmail() {
    setEmailError(null)
    const trimmed = emailValue.trim()
    if (!trimmed || !trimmed.includes('@')) { setEmailError(t('settings.err.emailInvalid')); return }
    if (trimmed.toLowerCase() === email.toLowerCase()) { setEmailError(t('settings.err.emailSame')); return }
    setEmailSaving(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: emailPassword })
      if (signInError) { setEmailError(t('settings.err.pwOld')); return }
      const { error } = await supabase.auth.updateUser({ email: trimmed })
      if (error) throw error
      setEmailSent(true)
      setEmailValue(''); setEmailPassword('')
      setTimeout(() => { setChangingEmail(false); setEmailSent(false) }, 3000)
    } catch (e) {
      setEmailError(e.message ?? t('settings.err.emailChange'))
    } finally {
      setEmailSaving(false)
    }
  }

  // ── Password ───────────────────────────────────────────────────────────────
  const [changingPassword, setChangingPassword] = useState(false)
  const [pwOld, setPwOld] = useState('')
  const [pwNew, setPwNew] = useState('')
  const [pwConfirm, setPwConfirm] = useState('')
  const [pwError, setPwError] = useState(null)
  const [pwSaving, setPwSaving] = useState(false)
  const [pwDone, setPwDone] = useState(false)

  async function handleChangePassword() {
    setPwError(null)
    if (pwNew.length < 6) { setPwError(t('settings.err.pwShort')); return }
    if (pwNew !== pwConfirm) { setPwError(t('settings.err.pwMismatch')); return }
    setPwSaving(true)
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: pwOld })
      if (signInError) { setPwError(t('settings.err.pwOld')); return }
      const { error } = await supabase.auth.updateUser({ password: pwNew })
      if (error) throw error
      setPwDone(true)
      setPwOld(''); setPwNew(''); setPwConfirm('')
      setTimeout(() => { setChangingPassword(false); setPwDone(false) }, 2000)
    } catch (e) {
      setPwError(e.message ?? t('settings.err.pwChange'))
    } finally {
      setPwSaving(false)
    }
  }

  // ── PIN ────────────────────────────────────────────────────────────────────
  const { pinConfig, reloadPinConfig, deviceId } = usePin()
  const [pinEnabled, setPinEnabled]       = useState(!!pinConfig)
  const [pinLength, setPinLength]         = useState(pinConfig?.pin_length ?? 4)
  const [pinType, setPinType]             = useState(pinConfig?.pin_type ?? 'numeric')

  const [pinSetupStep, setPinSetupStep]     = useState(null)
  const [pinSetupDigits, setPinSetupDigits] = useState([])
  const [pinFirstEntry, setPinFirstEntry]   = useState('')
  const [pinSetupError, setPinSetupError]   = useState(null)
  const [pinSaving, setPinSaving]           = useState(false)

  const [disablingPin, setDisablingPin]       = useState(false)
  const [disablePassword, setDisablePassword] = useState('')
  const [disableError, setDisableError]       = useState(null)
  const [disableSaving, setDisableSaving]     = useState(false)

  useEffect(() => { setPinEnabled(!!pinConfig) }, [pinConfig])

  function openPinSetup(len = pinLength, type = pinType) {
    setPinLength(len)
    setPinType(type)
    setPinSetupStep('enter')
    setPinSetupDigits([])
    setPinFirstEntry('')
    setPinSetupError(null)
  }

  function handlePinSetupKey(k) {
    if (k === '⌫') { setPinSetupDigits(d => d.slice(0, -1)); return }
    setPinSetupDigits(d => {
      const next = [...d, k]
      if (next.length === pinLength) {
        const pin = next.join('')
        if (pinSetupStep === 'enter') {
          setPinFirstEntry(pin)
          setPinSetupStep('confirm')
          return []
        }
        if (pin === pinFirstEntry) {
          handlePinSave(pin)
        } else {
          setPinSetupError(t('settings.pinMismatch'))
          setPinFirstEntry('')
          setPinSetupStep('enter')
        }
        return []
      }
      return next
    })
  }

  async function handlePinSave(pin) {
    setPinSaving(true)
    setPinSetupError(null)
    try {
      const { bytes: saltBytes, hex: saltHex } = generateSalt()
      const hashHex = await hashPin(pin, saltBytes)
      await savePinConfig(user.id, deviceId, {
        pin_hash: hashHex,
        pin_salt: saltHex,
        pin_length: pinLength,
        pin_type: pinType,
      })
      await reloadPinConfig()
      setPinSetupStep(null)
      setPinSetupDigits([])
      setPinFirstEntry('')
    } catch (e) {
      setPinSetupError(t('settings.err.pinSave', { msg: e.message ?? '?' }))
      setPinSetupStep('enter')
      setPinFirstEntry('')
    } finally {
      setPinSaving(false)
    }
  }

  async function handleDisablePin() {
    if (!disablePassword) return
    setDisableSaving(true)
    setDisableError(null)
    try {
      const { error } = await supabase.auth.signInWithPassword({ email, password: disablePassword })
      if (error) { setDisableError(t('settings.err.wrongPassword')); return }
      await deletePinConfig(user.id, deviceId)
      await reloadPinConfig()
      setDisablingPin(false)
      setDisablePassword('')
    } catch (e) {
      setDisableError(t('settings.err.generic', { msg: e.message ?? '?' }))
    } finally {
      setDisableSaving(false)
    }
  }

  // ── Delete account ─────────────────────────────────────────────────────────
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleteInput, setDeleteInput] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState(null)

  async function handleDeleteAccount() {
    if (!confirmDelete) { setConfirmDelete(true); setDeleteInput(''); return }
    if (deleteInput !== 'DELETE') return
    setDeleting(true)
    setDeleteError(null)
    try {
      const { error: rpcError } = await supabase.rpc('delete_user')
      if (rpcError) throw rpcError
      await supabase.auth.signOut()
    } catch (e) {
      console.error('Delete account error:', e)
      setDeleteError(`${e.message ?? '?'}`)
      setDeleting(false)
    }
  }

  return (
    <div className="scroll-container" style={{ background: 'var(--bg-primary)' }}>
      <div style={{ padding: '16px 16px 100px' }}>

        {/* Back button */}
        <motion.button
          whileTap={{ scale: 0.88 }}
          onClick={() => { setDirection(-1); navigate(-1) }}
          style={{ background: 'rgba(0,0,0,0.18)', backdropFilter: 'blur(20px)', WebkitBackdropFilter: 'blur(20px)', border: '0.5px solid rgba(255,255,255,0.22)', borderRadius: 10, padding: '7px 12px', color: 'white', fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 16, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="white"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
          {t('btn.back')}
        </motion.button>

        <h1 style={{ margin: '0 0 30px', fontSize: 34, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.5 }}>
          {t('settings.profile')}
        </h1>

        {/* Profile card */}
        <div style={{ ...GLASS, marginBottom: 32 }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(0,122,255,0.19) 0%, rgba(139,92,246,0.19) 100%)', padding: '22px 20px 18px', display: 'flex', alignItems: 'center', gap: 16 }}>
            {avatarUrl && !avatarError ? (
              <img
                src={avatarUrl}
                alt=""
                onError={() => setAvatarError(true)}
                style={{ width: 68, height: 68, borderRadius: '50%', flexShrink: 0, objectFit: 'cover', boxShadow: '0 6px 24px rgba(99,102,241,0.4)' }}
              />
            ) : (
              <div style={{ width: 68, height: 68, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 28, flexShrink: 0, boxShadow: '0 6px 24px rgba(99,102,241,0.4)' }}>
                {initial}
              </div>
            )}
            <div style={{ flex: 1, minWidth: 0 }}>
              <AnimatePresence mode="wait">
                {editingName ? (
                  <motion.div key="edit" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', gap: 8, marginBottom: 4 }}>
                    <input autoFocus value={nameValue} onChange={e => setNameValue(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') { setEditingName(false); setNameValue(displayName) } }}
                      style={{ flex: 1, background: 'rgba(255,255,255,0.15)', border: '1.5px solid rgba(255,255,255,0.5)', borderRadius: 10, padding: '7px 10px', fontSize: 17, fontWeight: 600, color: 'var(--text-primary)', outline: 'none' }}
                    />
                    <motion.button whileTap={{ scale: 0.88 }} onClick={handleSaveName} disabled={savingName}
                      style={{ background: 'var(--accent)', border: 'none', borderRadius: 8, padding: '7px 14px', color: 'white', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
                      {savingName ? '…' : 'OK'}
                    </motion.button>
                  </motion.div>
                ) : (
                  <motion.div key="display" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 4 }}>
                    <span style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{displayName}</span>
                    <motion.button whileTap={{ scale: 0.85 }} onClick={() => setEditingName(true)}
                      style={{ background: 'none', border: 'none', padding: '2px', cursor: 'pointer', display: 'flex', opacity: 0.45 }}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--text-secondary)">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                      </svg>
                    </motion.button>
                  </motion.div>
                )}
              </AnimatePresence>
              <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{email}</span>
            </div>
          </div>
        </div>

        {/* Profile picture */}
        <Section title={t('settings.profilePicture')}>
          <Row
            label={t('settings.profilePicture')}
            divider={editingAvatar}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M9 2 7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2h-3.17L15 2H9zm3 15c-2.76 0-5-2.24-5-5s2.24-5 5-5 5 2.24 5 5-2.24 5-5 5z"/></svg>}
            onTap={() => { setEditingAvatar(v => !v); setAvatarValue(avatarUrl); setAvatarPreviewError(false) }}
          />
          <AnimatePresence>
            {editingAvatar && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    {avatarValue && !avatarPreviewError ? (
                      <img
                        src={avatarValue}
                        alt=""
                        onError={() => setAvatarPreviewError(true)}
                        onLoad={() => setAvatarPreviewError(false)}
                        style={{ width: 44, height: 44, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                      />
                    ) : (
                      <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg, var(--accent), #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 18, flexShrink: 0 }}>
                        {initial}
                      </div>
                    )}
                    <input
                      type="url"
                      placeholder={t('settings.avatarUrlPlaceholder')}
                      value={avatarValue}
                      onChange={e => { setAvatarValue(e.target.value); setAvatarPreviewError(false) }}
                      className="input"
                      style={{ flex: 1, fontSize: 14 }}
                    />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={() => { setEditingAvatar(false); setAvatarValue(avatarUrl) }} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: 'var(--bg-tertiary)', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>{t('btn.cancel')}</motion.button>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={handleSaveAvatar} disabled={savingAvatar} style={{ flex: 2, padding: '11px', borderRadius: 12, border: 'none', background: 'var(--accent)', fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer' }}>{savingAvatar ? '…' : t('btn.save')}</motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        {/* Change email */}
        <Section title={t('settings.changeEmail')}>
          <Row
            label={t('settings.changeEmail')}
            value={!changingEmail ? email : undefined}
            divider={changingEmail}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z"/></svg>}
            onTap={() => { setChangingEmail(v => !v); setEmailError(null); setEmailValue(''); setEmailPassword('') }}
            right={emailSent ? <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>{t('settings.emailChangeSent')}</span> : undefined}
          />
          <AnimatePresence>
            {changingEmail && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input type="email" placeholder={t('settings.newEmail')} value={emailValue} onChange={e => setEmailValue(e.target.value)} className="input" style={{ fontSize: 15 }} />
                  <input type="password" placeholder={t('settings.oldPassword')} value={emailPassword} onChange={e => setEmailPassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChangeEmail()} className="input" style={{ fontSize: 15 }} />
                  {emailError && <p style={{ margin: 0, fontSize: 13, color: 'var(--wrong)', fontWeight: 500 }}>{emailError}</p>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={() => setChangingEmail(false)} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: 'var(--bg-tertiary)', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>{t('btn.cancel')}</motion.button>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={handleChangeEmail} disabled={emailSaving || !emailValue || !emailPassword} style={{ flex: 2, padding: '11px', borderRadius: 12, border: 'none', background: 'var(--accent)', fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer', opacity: (!emailValue || !emailPassword) ? 0.5 : 1 }}>{emailSaving ? '…' : t('btn.save')}</motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        {/* Change password */}
        <Section title={t('settings.changePassword')}>
          <Row
            label={t('settings.changePassword')}
            divider={changingPassword}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>}
            onTap={() => { setChangingPassword(v => !v); setPwError(null); setPwOld(''); setPwNew(''); setPwConfirm('') }}
            right={pwDone ? <span style={{ fontSize: 13, color: '#22c55e', fontWeight: 600 }}>{t('settings.passwordSaved')}</span> : undefined}
          />
          <AnimatePresence>
            {changingPassword && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <input type="password" placeholder={t('settings.oldPassword')} value={pwOld} onChange={e => setPwOld(e.target.value)} className="input" style={{ fontSize: 15 }} />
                  <input type="password" placeholder={t('settings.newPassword')} value={pwNew} onChange={e => setPwNew(e.target.value)} className="input" style={{ fontSize: 15 }} />
                  <input type="password" placeholder={t('settings.confirmPassword')} value={pwConfirm} onChange={e => setPwConfirm(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleChangePassword()} className="input" style={{ fontSize: 15 }} />
                  {pwError && <p style={{ margin: 0, fontSize: 13, color: 'var(--wrong)', fontWeight: 500 }}>{pwError}</p>}
                  <div style={{ display: 'flex', gap: 8, marginTop: 2 }}>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={() => setChangingPassword(false)} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: 'var(--bg-tertiary)', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>{t('btn.cancel')}</motion.button>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={handleChangePassword} disabled={pwSaving || !pwOld || !pwNew || !pwConfirm} style={{ flex: 2, padding: '11px', borderRadius: 12, border: 'none', background: 'var(--accent)', fontSize: 14, fontWeight: 700, color: 'white', cursor: 'pointer', opacity: (!pwOld || !pwNew || !pwConfirm) ? 0.5 : 1 }}>{pwSaving ? '…' : t('btn.save')}</motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        {/* PIN */}
        <Section title={t('settings.pin')}>
          <Row
            label={t('settings.pin')}
            divider={pinEnabled || disablingPin || !!pinSetupStep}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="var(--accent)"><path d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>}
            right={
              <button onClick={() => { if (!pinEnabled) { openPinSetup() } else { setDisablingPin(v => !v); setPinSetupStep(null); setDisablePassword(''); setDisableError(null) } }}
                style={{ width: 48, height: 28, borderRadius: 14, border: 'none', background: pinEnabled ? '#22c55e' : 'var(--border-strong, #555)', position: 'relative', cursor: 'pointer', transition: 'background 0.2s', flexShrink: 0 }}>
                <span style={{ position: 'absolute', top: 3, left: pinEnabled ? 23 : 3, width: 22, height: 22, borderRadius: '50%', background: 'white', boxShadow: '0 1px 3px rgba(0,0,0,0.3)', transition: 'left 0.2s', display: 'block' }} />
              </button>
            }
          />
          <AnimatePresence>
            {pinSetupStep && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '16px 16px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  {pinSetupStep === 'enter' && !pinFirstEntry && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', marginBottom: 16 }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {[4, 6].map(len => (
                          <button key={len} onClick={() => setPinLength(len)} style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid', borderColor: pinLength === len ? 'var(--accent)' : 'var(--border)', background: pinLength === len ? 'var(--accent-muted)' : 'var(--bg-tertiary)', color: pinLength === len ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>{t(`settings.pinDigits.${len}`)}</button>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        {['numeric', 'alphanumeric'].map(id => (
                          <button key={id} onClick={() => setPinType(id)} style={{ flex: 1, padding: '9px', borderRadius: 10, border: '1.5px solid', borderColor: pinType === id ? 'var(--accent)' : 'var(--border)', background: pinType === id ? 'var(--accent-muted)' : 'var(--bg-tertiary)', color: pinType === id ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t(`settings.pinType.${id}`)}</button>
                        ))}
                      </div>
                    </div>
                  )}
                  <p style={{ margin: '0 0 12px', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)' }}>{pinSetupStep === 'enter' ? t('settings.pinEnter') : t('settings.pinConfirm')}</p>
                  <div style={{ display: 'flex', gap: 12, justifyContent: 'center', marginBottom: 16 }}>
                    {Array.from({ length: pinLength }).map((_, i) => (
                      <div key={i} style={{ width: 12, height: 12, borderRadius: '50%', background: i < pinSetupDigits.length ? 'var(--text-primary)' : 'transparent', border: '2px solid', borderColor: i < pinSetupDigits.length ? 'var(--text-primary)' : 'var(--border-strong)', transition: 'background 0.15s' }} />
                    ))}
                  </div>
                  {pinType === 'numeric' ? (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 60px)', gap: 8, justifyContent: 'center' }}>
                      {['1','2','3','4','5','6','7','8','9','','0','⌫'].map((k, i) => k === '' ? <div key={i} /> : (
                        <motion.button key={i} whileTap={{ scale: 0.85 }} onClick={() => !pinSaving && handlePinSetupKey(k)} style={{ width: 60, height: 60, borderRadius: '50%', border: '0.5px solid var(--glass-card-stroke)', background: 'var(--bg-tertiary)', fontSize: k === '⌫' ? 16 : 20, fontWeight: 300, color: 'var(--text-primary)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{k}</motion.button>
                      ))}
                    </div>
                  ) : (
                    <input type="text" autoFocus autoCapitalize="none" autoCorrect="off" spellCheck={false} maxLength={pinLength} value={pinSetupDigits.join('')} onChange={e => {
                      const val = e.target.value.slice(0, pinLength); const digits = val.split(''); setPinSetupDigits(digits)
                      if (val.length === pinLength) {
                        if (pinSetupStep === 'enter') { setPinFirstEntry(val); setPinSetupStep('confirm'); setPinSetupDigits([]) }
                        else { if (val === pinFirstEntry) { handlePinSave(val) } else { setPinSetupError(t('settings.pinMismatch')); setPinFirstEntry(''); setPinSetupStep('enter'); setPinSetupDigits([]) } }
                      }
                    }} className="input" style={{ fontSize: 22, letterSpacing: 8, textAlign: 'center', width: '100%', fontWeight: 700 }} />
                  )}
                  {pinSetupError && <p style={{ margin: '12px 0 0', fontSize: 13, color: 'var(--wrong)', fontWeight: 500, textAlign: 'center' }}>{pinSetupError}</p>}
                  {pinSaving && <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 0.9, ease: 'linear' }} style={{ width: 18, height: 18, borderRadius: '50%', border: '2px solid var(--border)', borderTopColor: 'var(--accent)', marginTop: 12 }} />}
                  <motion.button whileTap={{ scale: 0.96 }} onClick={() => { setPinSetupStep(null); setPinSetupDigits([]); setPinFirstEntry(''); setPinEnabled(!!pinConfig) }} style={{ marginTop: 14, background: 'none', border: 'none', fontSize: 14, color: 'var(--text-secondary)', cursor: 'pointer', fontWeight: 500 }}>{t('btn.cancel')}</motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {pinEnabled && !pinSetupStep && !disablingPin && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {[4, 6].map(len => <button key={len} onClick={() => { if (pinLength !== len) openPinSetup(len, pinType) }} style={{ flex: 1, padding: '8px', borderRadius: 10, border: '1.5px solid', borderColor: pinLength === len ? 'var(--accent)' : 'var(--border)', background: pinLength === len ? 'var(--accent-muted)' : 'var(--bg-tertiary)', color: pinLength === len ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>{t(`settings.pinDigits.${len}`)}</button>)}
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    {['numeric', 'alphanumeric'].map(id => <button key={id} onClick={() => { if (pinType !== id) openPinSetup(pinLength, id) }} style={{ flex: 1, padding: '8px', borderRadius: 10, border: '1.5px solid', borderColor: pinType === id ? 'var(--accent)' : 'var(--border)', background: pinType === id ? 'var(--accent-muted)' : 'var(--bg-tertiary)', color: pinType === id ? 'var(--accent)' : 'var(--text-secondary)', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{t(`settings.pinType.${id}`)}</button>)}
                  </div>
                  <motion.button whileTap={{ scale: 0.96 }} onClick={() => openPinSetup(pinLength, pinType)} style={{ padding: '9px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', fontSize: 13, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>{t('settings.pinChange')}</motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <AnimatePresence>
            {disablingPin && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 13, color: 'var(--text-secondary)', lineHeight: 1.5 }}>{t('settings.pinDisablePrompt')}</p>
                  <input type="password" placeholder={t('settings.oldPassword')} value={disablePassword} onChange={e => setDisablePassword(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleDisablePin()} autoFocus className="input" style={{ fontSize: 15 }} />
                  {disableError && <p style={{ margin: 0, fontSize: 13, color: 'var(--wrong)', fontWeight: 500 }}>{disableError}</p>}
                  <div style={{ display: 'flex', gap: 8 }}>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={() => { setDisablingPin(false); setDisablePassword(''); setDisableError(null) }} style={{ flex: 1, padding: '11px', borderRadius: 12, border: 'none', background: 'var(--bg-tertiary)', fontSize: 14, fontWeight: 600, color: 'var(--text-secondary)', cursor: 'pointer' }}>{t('btn.cancel')}</motion.button>
                    <motion.button whileTap={{ scale: 0.96 }} onClick={handleDisablePin} disabled={!disablePassword || disableSaving} style={{ flex: 2, padding: '11px', borderRadius: 12, border: 'none', background: '#ef4444', fontSize: 14, fontWeight: 700, color: 'white', cursor: !disablePassword || disableSaving ? 'default' : 'pointer', opacity: !disablePassword || disableSaving ? 0.5 : 1 }}>{disableSaving ? t('settings.pinDeactivating') : t('settings.pinDeactivate')}</motion.button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        {/* Delete account */}
        <Section title={t('settings.deleteAccount')}>
          <Row
            label={t('settings.deleteAccount')}
            destructive
            divider={confirmDelete}
            icon={<svg width="16" height="16" viewBox="0 0 24 24" fill="#ef4444"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>}
            onTap={confirmDelete ? undefined : handleDeleteAccount}
          />
          <AnimatePresence>
            {confirmDelete && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} style={{ overflow: 'hidden' }}>
                <div style={{ padding: '12px 16px 16px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                  <p style={{ margin: 0, fontSize: 13, color: '#ef4444', fontWeight: 500 }}>{t('settings.deleteWarning')}</p>
                  <input autoFocus className="input" placeholder="DELETE" value={deleteInput} onChange={e => setDeleteInput(e.target.value)} style={{ fontSize: 13, padding: '9px 12px', borderColor: deleteInput === 'DELETE' ? '#ef4444' : undefined }} />
                  <div style={{ display: 'flex', gap: 8 }}>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={() => { setConfirmDelete(false); setDeleteInput(''); setDeleteError(null) }} style={{ flex: 1, padding: '10px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--bg-tertiary)', color: 'var(--text-primary)', fontSize: 14, fontWeight: 500, cursor: 'pointer' }}>{t('btn.cancel')}</motion.button>
                    <motion.button whileTap={{ scale: 0.97 }} onClick={handleDeleteAccount} disabled={deleteInput !== 'DELETE' || deleting} style={{ flex: 1, padding: '10px', borderRadius: 10, border: 'none', background: deleteInput === 'DELETE' ? '#ef4444' : 'rgba(239,68,68,0.25)', color: 'white', fontSize: 14, fontWeight: 600, cursor: deleteInput === 'DELETE' ? 'pointer' : 'default', transition: 'background 0.15s' }}>{deleting ? t('settings.deleting') : t('btn.delete')}</motion.button>
                  </div>
                  {deleteError && <p style={{ margin: 0, fontSize: 12, color: '#ef4444' }}>{deleteError}</p>}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

      </div>
    </div>
  )
}
