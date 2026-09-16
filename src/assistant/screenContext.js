// What is on screen, for the assistant: screens publish a small description
// ({ screen: 'calendar', view: 'day', date: '2026-09-18', openEventId }) and
// the assistant reads it when a question is asked — "was steht an?" then
// means the day being looked at, "wie läuft das?" the open topic.
//
// A tiny external store (no context re-renders): publishing never makes the
// assistant or the screen render again.

import { useEffect } from 'react'

const layers = new Map()   // source → description; later layers (a modal) win
let order = 0
const listeners = new Set()

export function setScreen(source, info) {
  if (info) layers.set(source, { ...info, order: layers.get(source)?.order ?? ++order })
  else layers.delete(source)
  for (const fn of listeners) fn()
}

// The merged description: the route baseline, then screens, then modals.
export function getScreen() {
  const merged = {}
  for (const layer of [...layers.values()].sort((a, b) => a.order - b.order)) {
    for (const [k, v] of Object.entries(layer)) if (k !== 'order' && v !== undefined) merged[k] = v
  }
  return merged
}

export function subscribeScreen(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// Screens call this with what they show; it is removed when they unmount.
// Pass plain values (ids, day keys), never rows.
export function useAssistantScreen(source, info) {
  const key = JSON.stringify(info ?? null)
  useEffect(() => {
    setScreen(source, info)
    return () => setScreen(source, null)
  }, [source, key]) // eslint-disable-line react-hooks/exhaustive-deps
}

// Route → screen name, the baseline every page gets without doing anything.
export function screenOfPath(pathname = '') {
  const p = String(pathname)
  if (p.startsWith('/settings/assistant')) return 'assistant-settings'
  if (p.startsWith('/settings')) return 'settings'
  if (p.startsWith('/calendar')) return 'calendar'
  if (p.startsWith('/topic-stats')) return 'topic-stats'
  if (p.startsWith('/topics')) return 'topics'
  if (p.startsWith('/exams')) return 'exams'
  if (p.startsWith('/statistics')) return 'statistics'
  if (p.startsWith('/session')) return 'session'
  if (p.startsWith('/summary')) return 'session-summary'
  if (p.startsWith('/home')) return 'home'
  return null
}
