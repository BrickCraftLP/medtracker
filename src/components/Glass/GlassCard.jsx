import LiquidPanel from './LiquidPanel.jsx'

// Content-sized liquid-glass card. The glass sits behind the children as an
// absolute layer (LiquidPanel needs a sized parent), while the children stay
// in flow and set the height. .liquid-scope gives them the panel palette.
export default function GlassCard({ radius = 18, className = '', style, children }) {
  return (
    <div className={`glass-card-frame liquid-scope ${className}`} style={{ borderRadius: radius, ...style }}>
      <div className="glass-card-frame__glass" aria-hidden="true">
        <LiquidPanel radius={radius} />
      </div>
      <div className="glass-card-frame__content">{children}</div>
    </div>
  )
}
