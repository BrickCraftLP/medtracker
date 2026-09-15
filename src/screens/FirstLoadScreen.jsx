import { useEffect, useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { useLanguage } from '../context/LanguageContext.jsx'
import { hideBootLoader } from '../utils/bootLoader.js'

// Shown for exactly one moment: a genuine cold start on this device, when
// DataProvider has neither a cached snapshot nor local IndexedDB data yet
// (see DataContext.jsx `dataLoading`). Purely presentational — no data logic
// lives here.

const TIP_INTERVAL_MS = 2600

export default function FirstLoadScreen() {
  const { t } = useLanguage()

  // This screen carries its own cloud-sync loader — hand off from the inline
  // boot loader so the two never overlap.
  useEffect(() => { hideBootLoader() }, [])

  const tips = useMemo(() => {
    const pool = t('firstLoad.tips')
    return Array.isArray(pool) ? pool : [pool]
  }, [t])

  const [tipIndex, setTipIndex] = useState(0)

  useEffect(() => {
    if (tips.length < 2) return
    const id = setInterval(() => {
      setTipIndex(i => (i + 1) % tips.length)
    }, TIP_INTERVAL_MS)
    return () => clearInterval(id)
  }, [tips.length])

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 400,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 32px',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Wordmark */}
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        style={{ textAlign: 'center', marginBottom: 4 }}
      >
        <div style={{ fontSize: 32, marginBottom: 4 }}>🏥</div>
        <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--text-primary)', letterSpacing: -0.4 }}>
          MedTracker
        </h1>
      </motion.div>

      {/* Cloud-sync loader — adapted from a Uiverse.io loader by andrew-manzyk */}
      <div className="first-load-loader" style={{ margin: '8px 0' }}>
        <svg id="cloud" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
          <defs>
            <filter id="firstLoadRoundness">
              <feGaussianBlur in="SourceGraphic" stdDeviation="1.5"></feGaussianBlur>
              <feColorMatrix values="1 0 0 0 0 0 1 0 0 0 0 0 1 0 0 0 0 0 20 -10"></feColorMatrix>
            </filter>
            <mask id="shapes">
              <g fill="white">
                <polygon points="50 37.5 80 75 20 75 50 37.5"></polygon>
                <circle cx="20" cy="60" r="15"></circle>
                <circle cx="80" cy="60" r="15"></circle>
                <g>
                  <circle cx="20" cy="60" r="15"></circle>
                  <circle cx="20" cy="60" r="15"></circle>
                  <circle cx="20" cy="60" r="15"></circle>
                </g>
              </g>
            </mask>
            <mask id="clipping" clipPathUnits="userSpaceOnUse">
              {/* Coordinates are pre-rotated -65deg around each line's own
                  center (rather than rotated live via CSS `rotate`) — Chromium
                  fails to clip a mask whose target has CSS-transformed children
                  once their untransformed bounding box is this large, so the
                  rotation is baked into the geometry instead. */}
              <g id="lines" filter="url(#firstLoadRoundness)">
                <g mask="url(#shapes)" stroke="white">
                  <line x1="7.74" y1="50.63" x2="92.26" y2="-130.63"></line>
                  <line x1="7.74" y1="59.63" x2="92.26" y2="-121.63"></line>
                  <line x1="7.74" y1="68.63" x2="92.26" y2="-112.63"></line>
                  <line x1="7.74" y1="77.63" x2="92.26" y2="-103.63"></line>
                  <line x1="7.74" y1="86.63" x2="92.26" y2="-94.63"></line>
                  <line x1="7.74" y1="95.63" x2="92.26" y2="-85.63"></line>
                  <line x1="7.74" y1="104.63" x2="92.26" y2="-76.63"></line>
                  <line x1="7.74" y1="113.63" x2="92.26" y2="-67.63"></line>
                  <line x1="7.74" y1="122.63" x2="92.26" y2="-58.63"></line>
                  <line x1="7.74" y1="131.63" x2="92.26" y2="-49.63"></line>
                  <line x1="7.74" y1="140.63" x2="92.26" y2="-40.63"></line>
                  <line x1="7.74" y1="149.63" x2="92.26" y2="-31.63"></line>
                  <line x1="7.74" y1="158.63" x2="92.26" y2="-22.63"></line>
                  <line x1="7.74" y1="167.63" x2="92.26" y2="-13.63"></line>
                  <line x1="7.74" y1="176.63" x2="92.26" y2="-4.63"></line>
                  <line x1="7.74" y1="185.63" x2="92.26" y2="4.37"></line>
                  <line x1="7.74" y1="194.63" x2="92.26" y2="13.37"></line>
                  <line x1="7.74" y1="203.63" x2="92.26" y2="22.37"></line>
                  <line x1="7.74" y1="212.63" x2="92.26" y2="31.37"></line>
                  <line x1="7.74" y1="221.63" x2="92.26" y2="40.37"></line>
                </g>
              </g>
            </mask>
          </defs>
          <rect x="0" y="0" width="100" height="100" rx="0" ry="0" mask="url(#clipping)"></rect>
          <g>
            <path d="M33.52,68.12 C35.02,62.8 39.03,58.52 44.24,56.69 C49.26,54.93 54.68,55.61 59.04,58.4 C59.04,58.4 56.24,60.53 56.24,60.53 C55.45,61.13 55.68,62.37 56.63,62.64 C56.63,62.64 67.21,65.66 67.21,65.66 C67.98,65.88 68.75,65.3 68.74,64.5 C68.74,64.5 68.68,53.5 68.68,53.5 C68.67,52.51 67.54,51.95 66.75,52.55 C66.75,52.55 64.04,54.61 64.04,54.61 C57.88,49.79 49.73,48.4 42.25,51.03 C35.2,53.51 29.78,59.29 27.74,66.49 C27.29,68.08 28.22,69.74 29.81,70.19 C30.09,70.27 30.36,70.31 30.63,70.31 C31.94,70.31 33.14,69.44 33.52,68.12Z"></path>
            <path d="M69.95,74.85 C68.35,74.4 66.7,75.32 66.25,76.92 C64.74,82.24 60.73,86.51 55.52,88.35 C50.51,90.11 45.09,89.43 40.73,86.63 C40.73,86.63 43.53,84.51 43.53,84.51 C44.31,83.91 44.08,82.67 43.13,82.4 C43.13,82.4 32.55,79.38 32.55,79.38 C31.78,79.16 31.02,79.74 31.02,80.54 C31.02,80.54 31.09,91.54 31.09,91.54 C31.09,92.53 32.22,93.09 33.01,92.49 C33.01,92.49 35.72,90.43 35.72,90.43 C39.81,93.63 44.77,95.32 49.84,95.32 C52.41,95.32 55,94.89 57.51,94.01 C64.56,91.53 69.99,85.75 72.02,78.55 C72.47,76.95 71.54,75.3 69.95,74.85Z"></path>
          </g>
        </svg>
      </div>

      {/* Title */}
      <p style={{ margin: '4px 0 0', fontSize: 15, fontWeight: 600, color: 'var(--text-primary)', textAlign: 'center' }}>
        {t('firstLoad.title')}
      </p>

      {/* Rotating tip */}
      <div style={{ height: 34, display: 'flex', alignItems: 'flex-start', justifyContent: 'center', marginTop: 6, maxWidth: 280 }}>
        <AnimatePresence mode="wait">
          <motion.p
            key={tipIndex}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.3 }}
            style={{ margin: 0, fontSize: 13, lineHeight: 1.4, color: 'var(--text-secondary)', textAlign: 'center' }}
          >
            {tips[tipIndex]}
          </motion.p>
        </AnimatePresence>
      </div>
    </div>
  )
}
