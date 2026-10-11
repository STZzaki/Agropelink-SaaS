/**
 * Smooth scrolling con Lenis, sincronizado con GSAP/ScrollTrigger.
 *
 * Rendimiento: un único bucle de animación (el ticker de GSAP, que ya existía) en lugar de un rAF propio;
 * Lenis solo interpola el desplazamiento de la rueda/trackpad. En táctil se usa el scroll nativo.
 * Accesibilidad: con "reducir movimiento" real (no forzado en desarrollo) no se activa.
 */
import Lenis from 'lenis'
import { ScrollTrigger, gsap, prefersReducedMotion } from './gsap.js'

let lenis = null

export function getLenis() {
  return lenis
}

export function startSmoothScroll() {
  if (lenis || typeof window === 'undefined' || prefersReducedMotion()) return () => {}

  lenis = new Lenis({
    autoRaf: false,
    lerp: 0.12, // inercia corta: suave sin sensación de "arrastre"
    smoothWheel: true,
    // Los paneles con su propio scroll (chat, menús, tablas, diálogos) llevan `data-lenis-prevent`.
    prevent: (node) => node.closest?.('dialog, [data-lenis-prevent]') !== null,
  })
  lenis.on('scroll', ScrollTrigger.update)
  const tick = (time) => lenis?.raf(time * 1000)
  gsap.ticker.add(tick)
  gsap.ticker.lagSmoothing(0)

  return () => {
    gsap.ticker.remove(tick)
    lenis?.destroy()
    lenis = null
  }
}

/** Desplazamiento compatible con Lenis (o nativo si está desactivado). */
export function scrollToTop() {
  if (lenis) lenis.scrollTo(0, { immediate: true })
  else window.scrollTo(0, 0)
}
