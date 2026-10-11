/**
 * Capa de analítica con consentimiento previo (RGPD / LSSI art. 22.2).
 *
 * No se carga NINGÚN script de medición hasta que el usuario acepta la categoría "Analítica".
 * Proveedor configurable por variables públicas de Vite (sin claves secretas):
 *   VITE_ANALYTICS_PROVIDER = 'plausible' | 'ga4'   (vacío → desactivada)
 *   VITE_PLAUSIBLE_DOMAIN   = 'agropelink.es'
 *   VITE_GA4_ID             = 'G-XXXXXXX'
 */
const PROVIDER = import.meta.env.VITE_ANALYTICS_PROVIDER || ''
const PLAUSIBLE_DOMAIN = import.meta.env.VITE_PLAUSIBLE_DOMAIN || 'agropelink.es'
const GA4_ID = import.meta.env.VITE_GA4_ID || ''

// Rutas privadas que nunca se miden (datos de la explotación del usuario).
// Zonas privadas y de credenciales: nunca se miden (el enlace de recuperación lleva un token en la URL).
const EXCLUDED_PREFIXES = ['/dashboard', '/tasks', '/documents', '/admin', '/portal', '/panel', '/cuenta', '/login', '/register', '/forgot-password', '/reset-password']

let loaded = false // script del proveedor inyectado
let active = false // consentimiento vigente en esta sesión

function injectScript(src, attrs = {}) {
  const script = document.createElement('script')
  script.src = src
  script.async = true
  Object.entries(attrs).forEach(([k, v]) => script.setAttribute(k, v))
  document.head.appendChild(script)
}

export const analyticsEnabled = () => PROVIDER === 'plausible' || (PROVIDER === 'ga4' && /^G-[A-Z0-9]+$/.test(GA4_ID))

/** Carga el proveedor. Llamar solo con consentimiento de analítica. */
export function initAnalytics() {
  if (!analyticsEnabled()) return
  active = true
  if (PROVIDER === 'ga4') window[`ga-disable-${GA4_ID}`] = false
  if (loaded) return
  loaded = true
  if (PROVIDER === 'plausible') {
    // Pageviews manuales para la SPA: data-domain + script "manual".
    window.plausible = window.plausible || function plausibleQueue(...args) { (window.plausible.q = window.plausible.q || []).push(args) }
    injectScript('https://plausible.io/js/script.manual.js', { 'data-domain': PLAUSIBLE_DOMAIN, defer: '' })
  } else {
    window.dataLayer = window.dataLayer || []
    window.gtag = function gtag() { window.dataLayer.push(arguments) } // eslint-disable-line prefer-rest-params
    window.gtag('js', new Date())
    window.gtag('config', GA4_ID, { anonymize_ip: true, send_page_view: false })
    injectScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(GA4_ID)}`)
  }
}

/** Retira el consentimiento: deja de enviar datos en esta sesión (GA4 se desactiva explícitamente). */
export function disableAnalytics() {
  active = false
  if (PROVIDER === 'ga4' && GA4_ID) window[`ga-disable-${GA4_ID}`] = true
}

export function trackPageview(path) {
  if (!active || EXCLUDED_PREFIXES.some((p) => path.startsWith(p))) return
  if (PROVIDER === 'plausible') window.plausible?.('pageview', { u: `${window.location.origin}${path}` })
  else if (PROVIDER === 'ga4') window.gtag?.('event', 'page_view', { page_path: path })
}
