import { useState, useCallback } from 'react'
import { useData } from '../context/DataContext.jsx'

export function useWidgets() {
  const { widgets, updateWidgets, removeWidget } = useData()
  const [isWiggleMode, setIsWiggleMode] = useState(false)
  const [editingWidget, setEditingWidget] = useState(null)

  const enterWiggleMode = useCallback(() => {
    setIsWiggleMode(true)
  }, [])

  const exitWiggleMode = useCallback(() => {
    setIsWiggleMode(false)
    setEditingWidget(null)
  }, [])

  // Called by WidgetShell only after a confirmed 500ms long-press
  const handleLongPress = useCallback(() => {
    setIsWiggleMode(true)
  }, [])

  // Called on a short tap — only opens editor when already in wiggle mode
  const handleWidgetTap = useCallback((widget) => {
    if (isWiggleMode) {
      setEditingWidget(widget)
    }
  }, [isWiggleMode])

  async function addWidget(widgetConfig) {
    const nextPosition = getNextAvailablePosition()
    if (nextPosition === null) return
    // Assign a client-side UUID so React keys stay stable across position reassignment.
    // The DB column `id uuid primary key default gen_random_uuid()` accepts our value.
    const newWidget = {
      ...widgetConfig,
      position: nextPosition,
      id: widgetConfig.id ?? (crypto.randomUUID?.() ?? `local-${Date.now()}-${Math.random().toString(36).slice(2)}`),
    }
    await updateWidgets([...widgets, newWidget])
  }

  async function updateWidget(position, changes) {
    const newWidgets = widgets.map(w =>
      w.position === position ? { ...w, ...changes } : w
    )
    await updateWidgets(newWidgets)
  }

  async function deleteWidget(position) {
    await removeWidget(position)
  }

  // Called with the reordered flat widget array after a drag session ends
  async function reorderWidgets(orderedWidgets) {
    const reassigned = orderedWidgets.map((w, i) => ({ ...w, position: i }))
    await updateWidgets(reassigned)
  }

  function getNextAvailablePosition() {
    const used = new Set(widgets.map(w => w.position))
    for (let i = 0; i < 10; i++) {
      if (!used.has(i)) return i
    }
    return null
  }

  return {
    widgets,
    isWiggleMode,
    editingWidget,
    enterWiggleMode,
    exitWiggleMode,
    handleLongPress,
    handleWidgetTap,
    addWidget,
    updateWidget,
    deleteWidget,
    reorderWidgets,
    canAddWidget: widgets.length < 10,
    setEditingWidget,
  }
}
