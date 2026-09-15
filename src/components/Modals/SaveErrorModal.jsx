import { useState } from 'react'
import { motion } from 'framer-motion'
import { useLanguage } from '../../context/LanguageContext.jsx'

// Shown when an optimistic background save fails after its sheet already
// closed. onRetry may be async; the modal closes itself once it succeeds.
export default function SaveErrorModal({ onRetry, onClose }) {
  const { t } = useLanguage()
  const [retrying, setRetrying] = useState(false)

  async function handleRetry() {
    setRetrying(true)
    try {
      await onRetry()
      onClose()
    } catch (e) {
      console.error('Retry failed:', e)
    } finally {
      setRetrying(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <motion.div
        className="modal-sheet"
        role="alertdialog"
        aria-labelledby="save-error-title"
        initial={{ opacity: 0, scale: 0.96, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ type: 'spring', damping: 26, stiffness: 340 }}
        onClick={e => e.stopPropagation()}
        style={{ textAlign: 'center' }}
      >
        <div style={{
          width: 52, height: 52, borderRadius: '50%', margin: '4px auto 14px',
          background: 'rgba(239,68,68,0.12)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 9v4M12 17h.01" />
            <path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z" />
          </svg>
        </div>
        <h2 id="save-error-title" style={{ margin: '0 0 8px', fontSize: 19, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: -0.3 }}>
          {t('widget.err.title')}
        </h2>
        <p style={{ margin: '0 0 20px', fontSize: 14, color: 'var(--text-secondary)', lineHeight: 1.4 }}>
          {t('widget.err.saveBody')}
        </p>
        {onRetry && (
          <motion.button whileTap={{ scale: 0.97 }} className="btn btn-primary"
            style={{ width: '100%', marginBottom: 10 }} onClick={handleRetry} disabled={retrying}>
            {retrying ? t('widget.saving') : t('widget.err.retry')}
          </motion.button>
        )}
        <motion.button whileTap={{ scale: 0.97 }} className="btn btn-secondary"
          style={{ width: '100%' }} onClick={onClose}>
          {t('widget.err.dismiss')}
        </motion.button>
      </motion.div>
    </div>
  )
}
