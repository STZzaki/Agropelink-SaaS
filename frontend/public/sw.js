/* Service Worker básico de Agropelink.
 *
 * - Precachea el "app shell" para que la app arranque sin conexión.
 * - Navegación: red primero, con index.html cacheado como respaldo (SPA).
 * - Estáticos del mismo origen: caché primero.
 * - Nunca cachea la API ni peticiones que no sean GET: los datos siempre vienen del servidor.
 */
const CACHE_NAME = 'agropelink-v3'

const APP_SHELL = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/brand/logo-white.png',
  '/assets/Logo sin texto blanco sin fondo.png',
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  const url = new URL(request.url)

  // Solo GET del propio origen; la API (otro origen o /api) siempre va a red.
  // Los vídeos se piden por rangos (respuestas 206), que la Cache API no admite: siempre a red.
  if (
    request.method !== 'GET' ||
    url.origin !== self.location.origin ||
    url.pathname.startsWith('/api') ||
    url.pathname.startsWith('/media/') ||
    request.headers.has('range')
  ) {
    return
  }

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match('/index.html')))
    return
  }

  event.respondWith(
    caches.match(request).then(
      (cached) =>
        cached ||
        fetch(request).then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone()
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
          }
          return response
        }),
    ),
  )
})
