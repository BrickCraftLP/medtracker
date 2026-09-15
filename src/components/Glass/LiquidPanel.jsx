import { useEffect, useRef } from 'react'
import LiquidGlass from 'liquid-glass-react'
import { GLASS_PROPS, GLASS_CENTERED, remeasureGlass } from './glassConfig.js'

// White liquid glass filling its parent. Palette, tint and the extra blur
// live on .liquid-panel (index.css); the glass settings in glassConfig.js.
export default function LiquidPanel({ radius, className = '', children }) {
  const frameRef = useRef(null)

  // Re-fit the glass whenever the frame's size changes without a window
  // resize (widget size edits, navbar moved to a side rail, …).
  useEffect(() => {
    const observer = new ResizeObserver(remeasureGlass)
    observer.observe(frameRef.current)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={frameRef} className={`liquid-panel ${className}`} style={{ '--panel-radius': `${radius}px` }}>
      <LiquidGlass className="liquid-fill" style={GLASS_CENTERED} cornerRadius={radius} {...GLASS_PROPS}>
        <div className="liquid-panel__body">{children}</div>
      </LiquidGlass>
    </div>
  )
}
