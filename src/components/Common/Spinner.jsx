// Full-screen loading plate. Used where a gate must keep app content hidden
// (the PIN overlay) but the boot loader has already been dismissed — the ring
// matches the inline #boot-loader spinner in index.html exactly.
// Pass `label` for a caption under the ring (the PWA update overlay); without
// it the plate stays pixel-identical to the boot loader.
export default function LoadingPlate({ zIndex = 500, label }) {
  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      zIndex,
      background: 'var(--bg-primary)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 18,
    }}>
      <div className="app-spinner" />
      {label && (
        <p style={{ margin: 0, fontSize: 14, fontWeight: 500, color: 'var(--text-secondary)', letterSpacing: -0.1 }}>
          {label}
        </p>
      )}
    </div>
  )
}
