self.addEventListener('push', (event) => {
  if (!event.data) return
  const { title, body, eventId } = event.data.json()
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: '/favicon.svg',
      badge: '/favicon.svg',
      tag: eventId,
      renotify: false,
    })
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    clients
      .matchAll({ type: 'window', includeUncontrolled: true })
      .then((list) => (list.length > 0 ? list[0].focus() : clients.openWindow('/')))
  )
})
