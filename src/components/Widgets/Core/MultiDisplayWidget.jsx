import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { renderWidgetContent } from '../widgetRegistry.jsx'
import { useLanguage } from '../../../context/LanguageContext.jsx'

export default function MultiDisplayWidget({ subWidgets = [], size }) {
  const { t } = useLanguage()
  const [currentIndex, setCurrentIndex] = useState(0)
  const [direction, setDirection] = useState(1)
  const touchStartX = useRef(null)

  const validSubs = subWidgets.filter(Boolean)
  const count = validSubs.length

  useEffect(() => {
    if (count <= 1) return
    const interval = setInterval(() => {
      setDirection(1)
      setCurrentIndex(prev => (prev + 1) % count)
    }, 4000)
    return () => clearInterval(interval)
  }, [count])

  function handleTouchStart(e) {
    touchStartX.current = e.touches[0].clientX
  }

  function handleTouchEnd(e) {
    if (touchStartX.current === null) return
    const delta = e.changedTouches[0].clientX - touchStartX.current
    touchStartX.current = null
    if (Math.abs(delta) < 40) return
    if (delta < 0) {
      setDirection(1)
      setCurrentIndex(prev => (prev + 1) % count)
    } else {
      setDirection(-1)
      setCurrentIndex(prev => (prev - 1 + count) % count)
    }
  }

  if (count === 0) {
    return (
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        color: 'var(--text-tertiary)',
        fontSize: 13,
        flexDirection: 'column',
        gap: 8,
      }}>
        <span style={{ fontSize: 28 }}>🔀</span>
        <span>{t('widget.noSubWidgets')}</span>
      </div>
    )
  }

  const variants = {
    enter: (d) => ({ x: d > 0 ? '100%' : '-100%', opacity: 0 }),
    center: { x: 0, opacity: 1 },
    exit: (d) => ({ x: d > 0 ? '-100%' : '100%', opacity: 0 }),
  }

  return (
    <div
      style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <AnimatePresence custom={direction} initial={false}>
        <motion.div
          key={currentIndex}
          custom={direction}
          variants={variants}
          initial="enter"
          animate="center"
          exit="exit"
          transition={{ type: 'spring', damping: 28, stiffness: 280 }}
          style={{ position: 'absolute', inset: 0 }}
        >
          {renderWidgetContent(validSubs[currentIndex], size)}
        </motion.div>
      </AnimatePresence>

      {/* Dot indicators */}
      {count > 1 && (
        <div style={{
          position: 'absolute',
          bottom: 8,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 5,
          zIndex: 5,
        }}>
          {Array.from({ length: count }).map((_, i) => (
            <motion.div
              key={i}
              animate={{ scale: i === currentIndex ? 1.3 : 1, opacity: i === currentIndex ? 1 : 0.4 }}
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                background: 'var(--text-primary)',
              }}
            />
          ))}
        </div>
      )}
    </div>
  )
}
