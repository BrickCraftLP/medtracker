// The red "it is now" line. Ticks once a minute, and re-syncs when the app
// comes back to the foreground — a backgrounded PWA has its timers throttled,
// so without the visibility hook the line can be an hour stale on return.

import { useEffect, useState } from 'react'
import { nowMinutes } from '../../utils/calendar/gridGeometry.js'

export default function NowIndicator({ geo, leftOffset = 0 }) {
  const [minutes, setMinutes] = useState(nowMinutes)

  useEffect(() => {
    const tick = () => setMinutes(nowMinutes())
    const id = setInterval(tick, 60000)
    const onVisible = () => { if (document.visibilityState === 'visible') tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', onVisible) }
  }, [])

  return (
    <div
      aria-hidden
      style={{
        position: 'absolute',
        top: geo.minutesToY(minutes),
        left: leftOffset,
        right: 0,
        height: 0,
        borderTop: '1.5px solid #ef4444',
        pointerEvents: 'none',
        zIndex: 6,
      }}
    >
      <span style={{
        position: 'absolute', left: -4, top: -4, width: 8, height: 8,
        borderRadius: '50%', background: '#ef4444',
      }} />
    </div>
  )
}
