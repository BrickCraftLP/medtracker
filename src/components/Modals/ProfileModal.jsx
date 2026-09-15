import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useAuth } from '../../context/AuthContext.jsx'
import { supabase } from '../../services/supabaseConfig.js'

export default function ProfileModal({ onClose }) {
  const { user, logout } = useAuth()

  const displayName = user?.user_metadata?.display_name ?? user?.email?.split('@')[0] ?? ''
  const email = user?.email ?? ''
  const initial = displayName[0]?.toUpperCase() ?? '?'

  const [editingName, setEditingName] = useState(false)
  const [nameValue, setNameValue] = useState(displayName)
  const [savingName, setSavingName] = useState(false)

  const [confirmLogout, setConfirmLogout] = useState(false)
  const [loggingOut, setLoggingOut] = useState(false)

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

  async function handleLogout() {
    if (!confirmLogout) { setConfirmLogout(true); return }
    setLoggingOut(true)
    try {
      await logout()
      onClose()
    } catch (e) {
      console.error(e)
      setLoggingOut(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-sheet"
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        onClick={e => e.stopPropagation()}
        style={{ paddingBottom: 40 }}
      >
        <div className="modal-handle" />

        {/* Avatar + name header */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 28 }}>
          <div style={{
            width: 72,
            height: 72,
            borderRadius: '50%',
            background: 'linear-gradient(135deg, #007AFF, #5AC8FA)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: 'white',
            fontWeight: 700,
            fontSize: 30,
            marginBottom: 12,
            boxShadow: '0 4px 20px rgba(0, 122, 255, 0.32)',
          }}>
            {initial}
          </div>

          {/* Editable name */}
          <AnimatePresence mode="wait">
            {editingName ? (
              <motion.div
                key="editing"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <input
                  autoFocus
                  value={nameValue}
                  onChange={e => setNameValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: '2px solid var(--accent)',
                    borderRadius: 10,
                    padding: '7px 12px',
                    fontSize: 17,
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    outline: 'none',
                    width: 180,
                    textAlign: 'center',
                  }}
                />
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={handleSaveName}
                  disabled={savingName}
                  style={{
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 8,
                    padding: '7px 12px',
                    color: 'white',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {savingName ? '…' : 'OK'}
                </motion.button>
              </motion.div>
            ) : (
              <motion.div
                key="display"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                style={{ display: 'flex', alignItems: 'center', gap: 8 }}
              >
                <span style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-primary)' }}>
                  {displayName}
                </span>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={() => setEditingName(true)}
                  style={{
                    background: 'var(--bg-tertiary)',
                    border: 'none',
                    borderRadius: 7,
                    padding: '5px 7px',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--text-secondary)">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                  </svg>
                </motion.button>
              </motion.div>
            )}
          </AnimatePresence>

          <span style={{ fontSize: 14, color: 'var(--text-secondary)', marginTop: 4 }}>{email}</span>
        </div>

        {/* Info rows */}
        <div style={{
          background: 'var(--bg-tertiary)',
          borderRadius: 16,
          overflow: 'hidden',
          marginBottom: 20,
        }}>
          <InfoRow label="Name" value={displayName} />
          <div style={{ height: 1, background: 'var(--border)', margin: '0 14px' }} />
          <InfoRow label="E-Mail" value={email} />
        </div>

        {/* Logout */}
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleLogout}
          disabled={loggingOut}
          style={{
            width: '100%',
            padding: '15px',
            borderRadius: 16,
            border: 'none',
            background: confirmLogout ? 'var(--wrong)' : 'var(--bg-tertiary)',
            color: confirmLogout ? 'white' : '#ef4444',
            fontSize: 16,
            fontWeight: 700,
            cursor: 'pointer',
            transition: 'background 0.2s, color 0.2s',
          }}
        >
          {loggingOut ? 'Abmelden…' : confirmLogout ? 'Wirklich abmelden?' : 'Abmelden'}
        </motion.button>
      </motion.div>
    </div>
  )
}

function InfoRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '13px 14px' }}>
      <span style={{ fontSize: 14, color: 'var(--text-secondary)', fontWeight: 500 }}>{label}</span>
      <span style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600, maxWidth: '60%', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {value}
      </span>
    </div>
  )
}
