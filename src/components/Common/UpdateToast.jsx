import { motion, AnimatePresence } from 'framer-motion'
import { useUpdate } from '../../context/UpdateContext.jsx'
import { useLanguage } from '../../context/LanguageContext.jsx'

// Glass pill announcing a waiting build. Geometry, blur and the spring entrance
// mirror SyncIndicator in App.jsx so the two read as the same surface — the
// difference is that this one is interactive.
export default function UpdateToast() {
  const { needRefresh, updating, dismissed, setDismissed, applyUpdate } = useUpdate()
  const { t } = useLanguage()

  const visible = needRefresh && !dismissed && !updating

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, display: 'flex', justifyContent: 'center', paddingTop: 'max(calc(env(safe-area-inset-top, 0px) + 10px), 10px)', zIndex: 320, pointerEvents: 'none' }}>
      <AnimatePresence>
        {visible && (
          <motion.div
            initial={{ opacity: 0, y: -14, scale: 0.82 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.88 }}
            transition={{ type: 'spring', damping: 20, stiffness: 340 }}
            style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 8, padding: '5px 6px 5px 12px', borderRadius: 9999, background: 'var(--glass-card-bg)', backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)', WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)', border: '0.5px solid var(--glass-card-stroke)', boxShadow: 'var(--glass-card-shadow)', maxWidth: 'calc(100vw - 24px)' }}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" style={{ flexShrink: 0 }}>
              <path d="M12 3v11m0 0 4-4m-4 4-4-4" stroke="var(--accent)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M4 16v2.5A2.5 2.5 0 0 0 6.5 21h11a2.5 2.5 0 0 0 2.5-2.5V16" stroke="var(--text-secondary)" strokeWidth="1.8" strokeLinecap="round" />
            </svg>

            <span style={{ fontSize: 12.5, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: -0.1, whiteSpace: 'nowrap' }}>
              {t('update.available')}
            </span>

            <motion.button
              type="button"
              whileTap={{ scale: 0.94 }}
              onClick={applyUpdate}
              style={{ border: 'none', cursor: 'pointer', padding: '5px 12px', borderRadius: 9999, background: 'var(--accent)', color: 'white', fontSize: 12.5, fontWeight: 600, letterSpacing: -0.1, whiteSpace: 'nowrap', flexShrink: 0 }}
            >
              {t('update.action')}
            </motion.button>

            <motion.button
              type="button"
              aria-label={t('update.dismiss')}
              whileTap={{ scale: 0.9 }}
              onClick={() => setDismissed(true)}
              style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: '4px 6px 4px 2px', display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none">
                <path d="M6 6l12 12M18 6 6 18" stroke="var(--text-tertiary)" strokeWidth="2" strokeLinecap="round" />
              </svg>
            </motion.button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
