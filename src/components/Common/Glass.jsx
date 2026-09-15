export function GlassCard({ children, style, cornerRadius = 18, as: Component = 'div', ...rest }) {
  return (
    <Component
      style={{
        background: 'var(--glass-card-bg)',
        backdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
        WebkitBackdropFilter: 'blur(60px) saturate(200%) brightness(1.06)',
        border: '0.5px solid var(--glass-card-stroke)',
        boxShadow: 'var(--glass-card-shadow)',
        borderRadius: cornerRadius,
        ...style,
      }}
      {...rest}
    >
      {children}
    </Component>
  )
}

export default GlassCard
