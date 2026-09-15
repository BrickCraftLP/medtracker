import { useCallback, useEffect, useRef } from 'react'

const LONG_PRESS_MS = 500
const DRAG_THRESHOLD_PX = 6

// Press handling for a dashboard widget.
// Normal mode: a 500ms hold calls onLongPress; a short press calls onTap.
// Wiggle mode: the overlay takes over — a still 500ms hold calls onTap (open
// settings), while moving first hands the pointer to onDragStart. A plain tap
// in wiggle mode is left to the parent's draggable wrapper.
export function useWidgetPress({ isWiggling, onLongPress, onTap, onDragStart }) {
  const timer = useRef(null)
  const pressed = useRef(false)
  const didLongPress = useRef(false)
  const moved = useRef(false)
  const start = useRef(null)

  const clear = useCallback(() => {
    pressed.current = false
    clearTimeout(timer.current)
  }, [])

  useEffect(() => clear, [clear])

  const frameHandlers = {
    onPointerDown(e) {
      if (isWiggling) return
      e.stopPropagation()
      pressed.current = true
      didLongPress.current = false
      timer.current = setTimeout(() => {
        if (!pressed.current) return
        didLongPress.current = true
        onLongPress?.()
      }, LONG_PRESS_MS)
    },
    onPointerUp() { if (!isWiggling) clear() },
    onPointerLeave() { if (!isWiggling) clear() },
    onClick(e) {
      e.stopPropagation()
      if (!isWiggling && !didLongPress.current) onTap?.()
    },
  }

  const overlayHandlers = {
    onPointerDown(e) {
      e.stopPropagation()
      pressed.current = true
      moved.current = false
      start.current = { x: e.clientX, y: e.clientY }
      timer.current = setTimeout(() => {
        if (pressed.current && !moved.current) onTap?.()
      }, LONG_PRESS_MS)
    },
    onPointerMove(e) {
      if (!pressed.current || moved.current) return
      if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) <= DRAG_THRESHOLD_PX) return
      moved.current = true
      clear()
      onDragStart?.(e)
    },
    onPointerUp: clear,
    onPointerLeave: clear,
  }

  return { frameHandlers, overlayHandlers }
}
