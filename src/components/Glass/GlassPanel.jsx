import { useEffect, useRef } from 'react'
import LiquidGlass from 'liquid-glass-react'
import { GLASS_CENTERED, remeasureGlass } from './constants.js'

// Content card backed by real liquid glass. The glass is an absolutely
// positioned layer behind the content, so the panel keeps its natural height
// (content is never refracted) and a ResizeObserver re-measures the glass
// whenever the panel grows or shrinks — accordions, charts, added rows.
export default function GlassPanel({
  children,
  cornerRadius = 18,
  tint = 'var(--glass-card-bg)',
  displacementScale = 40,
  blurAmount = 0.25,
  aberrationIntensity = 1.5,
  className,
  style,
  bodyStyle,
  ...rest
}) {
  const frameRef = useRef(null)

  useEffect(() => {
    const frame = frameRef.current
    if (!frame) return
    let first = true
    const observer = new ResizeObserver(() => {
      if (first) { first = false; return }
      remeasureGlass()
    })
    observer.observe(frame)
    // Screens mount mid page-transition; measure again once it has settled.
    const settle = setTimeout(remeasureGlass, 450)
    return () => { observer.disconnect(); clearTimeout(settle) }
  }, [])

  return (
    <div ref={frameRef} className={['glass-panel', className].filter(Boolean).join(' ')}
      style={{ borderRadius: cornerRadius, ...style }} {...rest}>
      <div className="glass-panel__glass" aria-hidden>
        <LiquidGlass
          className="liquid-fill"
          style={GLASS_CENTERED}
          cornerRadius={cornerRadius}
          padding="0"
          displacementScale={displacementScale}
          blurAmount={blurAmount}
          saturation={150}
          aberrationIntensity={aberrationIntensity}
          elasticity={0}
        >
          <div />
        </LiquidGlass>
      </div>
      <div className="glass-panel__body" style={{ background: tint, ...bodyStyle }}>
        {children}
      </div>
    </div>
  )
}
