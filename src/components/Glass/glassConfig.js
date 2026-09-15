// One look for every liquid glass surface (widgets, widget settings sheet).
export const GLASS_PROPS = {
  padding: '0',
  displacementScale: 70,
  blurAmount: 0.4,
  saturation: 140,
  aberrationIntensity: 2,
  elasticity: 0,
}

// liquid-glass-react renders its glass as a stack of sibling layers, each
// centred with top/left 50% + translate(-50%, -50%). They only line up when
// absolutely positioned inside a sized, relatively positioned frame.
export const GLASS_CENTERED = { position: 'absolute', top: '50%', left: '50%' }

// The library measures its glass only on mount and on window resize, so a
// size change of our own is announced as a resize. Batched to one per frame
// because every glass on screen re-measures on each event.
let pendingFrame = 0
export function remeasureGlass() {
  if (pendingFrame) return
  pendingFrame = requestAnimationFrame(() => {
    pendingFrame = 0
    window.dispatchEvent(new Event('resize'))
  })
}
