/**
 * Punto único de configuración de GSAP y de la política de movimiento de Agropelink.
 */
import { useGSAP } from '@gsap/react'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'

gsap.registerPlugin(useGSAP, ScrollTrigger)

// Aceleración natural por defecto y duraciones contenidas.
gsap.defaults({ ease: 'power2.out', duration: 0.7 })

/**
 * Política de movimiento:
 * - Producción: se respeta `prefers-reduced-motion: reduce` del sistema operativo (accesibilidad:
 *   el movimiento amplio puede provocar mareo a personas con trastornos vestibulares).
 * - Desarrollo: las animaciones se fuerzan siempre, para poder diseñarlas aunque el equipo tenga
 *   activado "reducir movimiento" (en Windows: Accesibilidad → Efectos visuales → Efectos de animación).
 * Ambos comportamientos se pueden cambiar con VITE_MOTION = 'force' | 'respect'.
 */
const MOTION_MODE = import.meta.env.VITE_MOTION || (import.meta.env.DEV ? 'force' : 'respect')
export const FORCE_MOTION = MOTION_MODE === 'force'

/** Media query para `gsap.matchMedia()`: con movimiento forzado coincide siempre. */
export const MOTION_OK = FORCE_MOTION ? 'all' : '(prefers-reduced-motion: no-preference)'

export const prefersReducedMotion = () =>
  !FORCE_MOTION && typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

// Marca el documento para que las reglas CSS de movimiento reducido no apliquen al forzarlo.
if (typeof document !== 'undefined' && FORCE_MOTION) {
  document.documentElement.classList.add('force-motion')
}

// Vídeos e imágenes cambian la altura de la página al cargar: recalcula los disparadores una vez.
if (typeof window !== 'undefined') {
  window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true })
}

export { gsap, ScrollTrigger, useGSAP }
