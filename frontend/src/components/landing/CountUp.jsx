import { useRef } from 'react'
import { MOTION_OK, gsap, useGSAP } from '../../lib/gsap.js'

/**
 * Número que entra con aceleración natural (`power2.out`) al aparecer en pantalla.
 *
 * Escribe directamente en el nodo (sin re-render de React por frame) y usa `tabular-nums`
 * para que los dígitos no desplacen el layout. Con movimiento reducido muestra el valor final.
 * Los lectores de pantalla leen solo el valor final (copia `sr-only`), nunca los intermedios.
 */
export default function CountUp({ value, decimals = 0, from, duration = 1.1, prefix = '', suffix = '', className = '' }) {
  const ref = useRef(null)
  const format = (n) =>
    `${prefix}${n.toLocaleString('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}${suffix}`

  useGSAP(
    () => {
      const el = ref.current
      if (!el || typeof value !== 'number' || Number.isNaN(value)) return
      el.textContent = format(value)

      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const counter = { n: from ?? value * 0.85 }
        el.textContent = format(counter.n)
        gsap.to(counter, {
          n: value,
          duration,
          ease: 'power2.out',
          onUpdate: () => {
            el.textContent = format(counter.n)
          },
          scrollTrigger: { trigger: el, start: 'top 92%', once: true },
        })
        return () => {
          el.textContent = format(value)
        }
      })
      return () => mm.revert()
    },
    { dependencies: [value, decimals], revertOnUpdate: true },
  )

  return (
    <span className={`tabular-nums ${className}`}>
      <span ref={ref} aria-hidden="true">{format(value)}</span>
      <span className="sr-only">{format(value)}</span>
    </span>
  )
}
