import { useInView } from 'framer-motion'
import { useAnimate } from 'framer-motion/mini'
import { useEffect, useLayoutEffect } from 'react'
import { prefersReducedMotion } from '../../lib/gsap.js'

const EASE = [0.2, 0, 0, 1]

/**
 * "Fade Up" sutil con Framer Motion al entrar en pantalla, sobre el fondo 3D.
 *
 * Rendimiento: `framer-motion/mini` anima con la Web Animations API (opacidad y transform corren en el
 * compositor, sin trabajo de JS por frame) y `useInView` usa un IntersectionObserver: nada escucha el scroll.
 * - `stagger` revela los hijos directos en secuencia (100 ms) sin envolverlos (no altera rejillas ni flex).
 * - Una sola reproducción (`once`); con movimiento reducido real, el contenido aparece sin animación.
 */
export default function Reveal({ as: Tag = 'div', delay = 0, stagger = false, y = 24, className = '', children, ...props }) {
  const [scope, animate] = useAnimate()
  const inView = useInView(scope, { once: true, margin: '0px 0px -10% 0px' })
  const enabled = !prefersReducedMotion()

  const targets = () => (stagger ? Array.from(scope.current?.children ?? []) : scope.current ? [scope.current] : [])

  // Estado inicial antes del primer pintado (sin parpadeo). Sin JS, el contenido es visible.
  useLayoutEffect(() => {
    if (!enabled) return
    for (const el of targets()) {
      el.style.opacity = '0'
      el.style.transform = `translate3d(0, ${y}px, 0)`
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!enabled || !inView) return
    targets().forEach((el, i) => {
      // Las tarjetas con `transition: transform` (hover) interferirían: se anula solo durante la entrada.
      const previous = el.style.transition
      el.style.transition = 'none'
      animate(
        el,
        { opacity: [0, 1], transform: [`translate3d(0, ${y}px, 0)`, 'translate3d(0, 0, 0)'] },
        { duration: 0.7, delay: delay / 1000 + (stagger ? i * 0.1 : 0), ease: EASE },
      ).then(() => {
        el.style.opacity = ''
        el.style.transform = ''
        el.style.transition = previous
      })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inView])

  return (
    <Tag ref={scope} className={className} {...props}>
      {children}
    </Tag>
  )
}
