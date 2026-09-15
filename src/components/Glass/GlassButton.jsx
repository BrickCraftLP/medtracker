import LiquidGlass from 'liquid-glass-react'
import { GLASS_CENTERED } from './constants.js'

const noop = () => {}

// Elastic liquid-glass button. The library only draws its hover/press
// highlights when it gets an onClick, so it receives a no-op while the real
// handler sits on a native <button> (keyboard + screen reader friendly).
// `size` makes a round icon button; otherwise pass `height` (+ width/flex).
// `tint` / `ink` override the label's background and text colour. Without a
// width the button sizes to its content via a hidden in-flow copy of it.
export default function GlassButton({ children, onClick, size, height = size ?? 44, width = size, variant, tint, ink, fontSize, disabled, ariaLabel, style }) {
  const className = ['glass-button', size && 'glass-button--round', variant && `glass-button--${variant}`]
    .filter(Boolean)
    .join(' ')

  return (
    <span className={className}
      style={{ width, height, '--glass-tint': tint, '--glass-ink': ink, '--glass-font': fontSize && `${fontSize}px`, ...style }}>
      {!size && <span className="glass-button__sizer" aria-hidden>{children}</span>}
      <LiquidGlass
        className="liquid-fill"
        style={GLASS_CENTERED}
        cornerRadius={height / 2}
        padding="0"
        displacementScale={28}
        blurAmount={0.06}
        saturation={140}
        aberrationIntensity={1.2}
        elasticity={0.3}
        onClick={disabled ? undefined : noop}
      >
        <button type="button" className="glass-button__label" onClick={onClick} disabled={disabled} aria-label={ariaLabel}>
          {children}
        </button>
      </LiquidGlass>
    </span>
  )
}
