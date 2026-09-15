// liquid-glass-react renders its glass as a stack of sibling layers, each
// centred with top/left 50% + translate(-50%, -50%). They only line up when
// absolutely positioned inside a sized, relatively positioned frame.
export const GLASS_CENTERED = { position: 'absolute', top: '50%', left: '50%' }

// liquid-glass-react measures its glass only on mount and on window resize.
// Coalesce re-measure requests from many instances into one resize per frame.
let pending = false
export function remeasureGlass() {
  if (pending) return
  pending = true
  requestAnimationFrame(() => {
    pending = false
    window.dispatchEvent(new Event('resize'))
  })
}
