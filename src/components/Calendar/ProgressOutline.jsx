// An assignment's outline IS its progress bar.
//
// The trick is SVG's `pathLength`: setting it to 1 renormalises the rounded
// rect's perimeter to a length of 1, so strokeDasharray takes the completion
// ratio directly — no perimeter arithmetic, and the corners get exactly their
// share of the arc. A conic-gradient would sweep by *angle about the centre*,
// so on a tall thin block 50% would not sit halfway along the outline.
//
// w/h are passed in pixels by the layout rather than measured here: inside a
// viewBox the corner radius would stretch with the block's aspect ratio.

export default function ProgressOutline({ w, h, radius = 10, progress = 0, color, stroke = 2 }) {
  if (!(w > 0 && h > 0)) return null
  const p = Math.max(0, Math.min(1, progress))
  const inset = stroke / 2
  const rect = {
    x: inset,
    y: inset,
    width: Math.max(0, w - stroke),
    height: Math.max(0, h - stroke),
    rx: Math.max(0, radius - inset),
    ry: Math.max(0, radius - inset),
    fill: 'none',
    strokeWidth: stroke,
    pathLength: 1,
  }

  return (
    <svg
      width={w}
      height={h}
      aria-hidden
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none', overflow: 'visible' }}
    >
      <rect {...rect} stroke="var(--border-strong)" opacity={0.45} />
      {p > 0 && (
        <rect
          {...rect}
          stroke={color}
          strokeLinecap="round"
          strokeDasharray={`${p} ${1 - p}`}
          style={{ transition: 'stroke-dasharray 0.4s cubic-bezier(0.32, 0.72, 0, 1)' }}
        />
      )}
    </svg>
  )
}

// Month chips and agenda rows are 16–22px tall, where a perimeter stroke is
// illegible — they get a bottom underline instead. Deliberately a different
// shape, not an oversight: don't "unify" these two.
export function ProgressUnderline({ progress = 0, color }) {
  const p = Math.max(0, Math.min(1, progress))
  return (
    <span
      aria-hidden
      style={{
        position: 'absolute', left: 0, right: 0, bottom: 0, height: 2,
        borderRadius: 2, background: 'var(--border)', overflow: 'hidden',
      }}
    >
      <span style={{
        display: 'block', height: '100%', width: `${p * 100}%`,
        background: color, transition: 'width 0.35s cubic-bezier(0.32, 0.72, 0, 1)',
      }} />
    </span>
  )
}
