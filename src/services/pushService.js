// Browser side of Web Push: permission, PushManager subscription and
// registering the device with Supabase. Delivery itself happens server-side
// (supabase/functions/push-dispatch).

import { registerPushSubscription, unregisterPushSubscription } from './dbInterface.js'

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
}

function isStandalone() {
  return window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone === true
}

// 'granted' | 'default' | 'denied' | 'needsInstall' | 'unsupported' | 'notConfigured'
export function getPushStatus() {
  // Build-time setup problem, not a device problem — VITE_VAPID_PUBLIC_KEY
  // was missing from .env when the app was built.
  if (!VAPID_PUBLIC_KEY) return 'notConfigured'
  // iOS only exposes Web Push to apps added to the Home Screen.
  if (isIos() && !isStandalone()) return 'needsInstall'
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window)) {
    return 'unsupported'
  }
  return Notification.permission
}

function urlBase64ToUint8Array(base64) {
  const padded = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/')
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0))
}

// `serviceWorker.ready` never settles when no worker is registered (e.g. `vite dev`).
function serviceWorkerReady(timeoutMs = 10000) {
  return Promise.race([
    navigator.serviceWorker.ready,
    new Promise((_, reject) => setTimeout(() => reject(new Error('Service worker not available')), timeoutMs)),
  ])
}

function sameKey(buffer, key) {
  if (!buffer) return false
  const a = new Uint8Array(buffer)
  return a.length === key.length && a.every((b, i) => b === key[i])
}

async function ensureSubscription(reg) {
  const key = urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
  const existing = await reg.pushManager.getSubscription()
  if (existing && sameKey(existing.options?.applicationServerKey, key)) return existing
  // Subscribed with an old VAPID key — subscribe() would throw until it's dropped.
  if (existing) await existing.unsubscribe().catch(() => {})
  return reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
}

async function register(sub) {
  const { endpoint, keys } = sub.toJSON()
  await registerPushSubscription({ endpoint, p256dh: keys.p256dh, auth: keys.auth })
}

// Must be called directly from the tap handler: iOS only shows the permission
// prompt in response to a user gesture, so requestPermission() comes first.
export async function enablePush() {
  const status = getPushStatus()
  if (status === 'needsInstall' || status === 'unsupported' || status === 'notConfigured') return status

  const permission = await Notification.requestPermission()
  if (permission !== 'granted') return permission

  const reg = await serviceWorkerReady()
  await register(await ensureSubscription(reg))
  return 'granted'
}

export async function disablePush() {
  const reg = await navigator.serviceWorker?.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (!sub) return
  await unregisterPushSubscription(sub.endpoint).catch(() => {})
  await sub.unsubscribe()
}

// On every launch: iOS may rotate the endpoint, and the row may have been
// pruned after a failed delivery. Returns the current permission status.
export async function refreshSubscription() {
  const status = getPushStatus()
  if (status !== 'granted') return status
  const reg = await serviceWorkerReady()
  await register(await ensureSubscription(reg))
  return status
}

// On logout: stop this device from receiving the previous account's reminders.
// The browser subscription is kept so the next login can re-register it.
export async function detachDevice() {
  const reg = await navigator.serviceWorker?.getRegistration()
  const sub = await reg?.pushManager.getSubscription()
  if (sub) await unregisterPushSubscription(sub.endpoint)
}
