// The one place that converts between pixels and minutes in the time grid.
//
// Everything on screen — an event block's top and height, the now-line, the
// slot under the user's finger — derives from this, so a single hourHeight
// change (or a future pinch-zoom) can't leave two of them disagreeing.

import { MINUTES_PER_DAY } from './eventModel.js'

export const DEFAULT_HOUR_HEIGHT = 56
export const DEFAULT_SNAP_MINUTES = 15
export const GUTTER_WIDTH = 52

export function makeGeometry({
  hourHeight = DEFAULT_HOUR_HEIGHT,
  snapMinutes = DEFAULT_SNAP_MINUTES,
  gutter = GUTTER_WIDTH,
} = {}) {
  const pxPerMinute = hourHeight / 60

  return {
    hourHeight,
    snapMinutes,
    gutter,
    pxPerMinute,
    height: MINUTES_PER_DAY * pxPerMinute,

    minutesToY: m => m * pxPerMinute,
    yToMinutes: y => y / pxPerMinute,
    clamp: m => Math.max(0, Math.min(MINUTES_PER_DAY, m)),
    snap: m => Math.round(m / snapMinutes) * snapMinutes,

    // Column widths are fractional so the grid stays resolution-independent;
    // the caller multiplies by its own measured width.
    columnWidth: (totalWidth, dayCount) => (totalWidth - gutter) / dayCount,
    columnFromX: (clientX, rect, dayCount) => Math.max(0, Math.min(
      dayCount - 1,
      Math.floor((clientX - rect.left - gutter) / ((rect.width - gutter) / dayCount)),
    )),
  }
}

// Minutes since midnight, right now. Used by the now-indicator and by
// "scroll to a sensible hour" on mount.
export function nowMinutes() {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}
