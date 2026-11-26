// Central+ · service worker
// Recebe as notificações com o app fechado (iPhone pela Tela de Início,
// Chrome, Edge, Firefox) e abre o Central+ quando a pessoa toca no aviso.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let dados = {}
  try {
    dados = event.data ? event.data.json() : {}
  } catch {
    dados = { titulo: 'Central+', corpo: event.data ? event.data.text() : '' }
  }

  event.waitUntil(
    self.registration.showNotification(dados.titulo || 'Central+', {
      body: dados.corpo || '',
      icon: 'icon-192.png',
      badge: 'icon-192.png',
      tag: dados.tag || undefined,
      renotify: Boolean(dados.tag),
      data: { url: dados.url || '/' },
    }),
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const destino = new URL(event.notification.data?.url || '/', self.location.origin).href

  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      // Se o Central+ já está aberto, só traz para a frente
      for (const janela of janelas) {
        if (janela.url.startsWith(self.location.origin) && 'focus' in janela) return janela.focus()
      }
      return self.clients.openWindow(destino)
    }),
  )
})
