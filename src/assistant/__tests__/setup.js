// Browser globals the assistant engine touches, for plain Node.
import { beforeEach, vi } from 'vitest'
import { resetUserStoreCache } from '../engine/userStore.js'

class MemoryStorage {
  constructor() { this.map = new Map() }
  getItem(k) { return this.map.has(k) ? this.map.get(k) : null }
  setItem(k, v) { this.map.set(k, String(v)) }
  removeItem(k) { this.map.delete(k) }
  clear() { this.map.clear() }
}

globalThis.localStorage = new MemoryStorage()
if (typeof globalThis.window === 'undefined') {
  const target = new EventTarget()
  globalThis.window = {
    addEventListener: target.addEventListener.bind(target),
    removeEventListener: target.removeEventListener.bind(target),
    dispatchEvent: target.dispatchEvent.bind(target),
  }
}

// Wednesday 2026-09-16, 10:00 local — every test sees the same clock.
export const NOW = new Date(2026, 8, 16, 10, 0, 0)

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
  globalThis.localStorage.clear()
  resetUserStoreCache()
})
