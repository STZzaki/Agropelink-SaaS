/**
 * Registra el Service Worker solo en producción: en desarrollo la caché
 * interferiría con la recarga en caliente de Vite.
 */
export default function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  if (!import.meta.env.PROD) {
    // Si se probó un build de producción en este mismo origen (localhost:5173), su SW
    // seguiría sirviendo archivos cacheados en desarrollo: se elimina junto con su caché.
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()))
    if ('caches' in window) {
      caches.keys().then((keys) => keys.filter((k) => k.startsWith('agropelink-')).forEach((k) => caches.delete(k)))
    }
    return
  }

  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch((error) => {
      console.error('No se pudo registrar el Service Worker:', error)
    })
  })
}
