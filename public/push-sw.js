// Web Push handlers — pulled into the Workbox-generated sw.js through
// `workbox.importScripts` in vite.config.js.

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : '' }
  }

  // Always show something: iOS revokes the subscription after pushes that
  // don't display a notification.
  event.waitUntil(
    self.registration.showNotification(data.title || 'MedTracker', {
      body: data.body || '',
      tag: data.tag,
      icon: '/icon-192.png',
      badge: '/icon-192.png',
      data: { url: data.url || '/' },
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
    const client = windows.find((c) => c.url.startsWith(self.location.origin))
    if (client) {
      await client.focus()
      if (client.url !== url && 'navigate' in client) await client.navigate(url).catch(() => {})
      return
    }
    await self.clients.openWindow(url)
  })())
})
