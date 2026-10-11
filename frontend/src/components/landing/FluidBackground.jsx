import { useEffect, useRef } from 'react'

/**
 * Fondo "Emerald & Cyan Wave" — versión optimizada.
 *
 * Coste mínimo por diseño:
 * - Solo 2 elementos animados (las dos ondas), movidos exclusivamente con `transform: translate3d`
 *   en un único keyframe cada uno (flujo horizontal + oleaje vertical): el compositor de la GPU
 *   desplaza capas ya rasterizadas y no hay repintado ni recálculo de layout por frame.
 * - Cero `filter` y cero `backdrop-filter`: el difuminado de los focos de luz es un `radial-gradient`
 *   estático (se pinta una vez y no se anima).
 * - Pausa automática con la pestaña en segundo plano (`visibilitychange`).
 * - Con movimiento reducido real (ver src/lib/gsap.js) las ondas quedan quietas.
 */

const WIDTH = 2880 // dos tramos idénticos de 1440 px → desplazar -50 % es un bucle sin costuras
const HEIGHT = 320

function sinePath({ amplitude, periodsPerTile, baseline, phase = 0, closed = true }) {
  const steps = 180
  const points = []
  for (let i = 0; i <= steps; i += 1) {
    const x = (i / steps) * WIDTH
    const y = baseline + amplitude * Math.sin(((x / (WIDTH / 2)) * periodsPerTile + phase) * 2 * Math.PI)
    points.push(`${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
  }
  return closed ? `${points.join(' ')} L${WIDTH} ${HEIGHT} L0 ${HEIGHT} Z` : points.join(' ')
}

const WAVES = [
  { id: 'cyan', amplitude: 32, periodsPerTile: 1, baseline: 160, phase: 0.3, from: '#0d9488', to: '#06b6d4', crest: '#67e8f9', className: 'fluid-wave--cyan' },
  { id: 'emerald', amplitude: 28, periodsPerTile: 2, baseline: 200, phase: 0, from: '#10b981', to: '#059669', crest: '#6ee7b7', className: 'fluid-wave--emerald' },
].map((w) => ({ ...w, fill: sinePath(w), line: sinePath({ ...w, closed: false }) }))

function Wave({ wave }) {
  return (
    <svg className={`fluid-wave ${wave.className}`} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
      <defs>
        <linearGradient id={`wave-${wave.id}`} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%" stopColor={wave.from} />
          <stop offset="50%" stopColor={wave.to} />
          <stop offset="100%" stopColor={wave.from} />
        </linearGradient>
        {/* Desvanecido vertical pre-renderizado: sustituye al blur sin coste por frame */}
        <linearGradient id={`wave-${wave.id}-fade`} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="1" />
          <stop offset="100%" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <mask id={`wave-${wave.id}-mask`}>
          <rect width={WIDTH} height={HEIGHT} fill={`url(#wave-${wave.id}-fade)`} />
        </mask>
      </defs>
      <path d={wave.fill} fill={`url(#wave-${wave.id})`} mask={`url(#wave-${wave.id}-mask)`} />
      <path d={wave.line} fill="none" stroke={wave.crest} strokeOpacity="0.65" strokeWidth="2" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}

export default function FluidBackground() {
  const ref = useRef(null)

  // En segundo plano no tiene sentido animar: se pausa explícitamente (CSS animation-play-state).
  useEffect(() => {
    const el = ref.current
    const sync = () => el?.toggleAttribute('data-paused', document.visibilityState === 'hidden')
    sync()
    document.addEventListener('visibilitychange', sync)
    return () => document.removeEventListener('visibilitychange', sync)
  }, [])

  return (
    <div ref={ref} className="fluid-bg pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden="true">
      {/* Focos de luz estáticos: degradados radiales (sin filtros, sin animación) */}
      <div className="fluid-glow" />
      {WAVES.map((w) => (
        <Wave key={w.id} wave={w} />
      ))}
    </div>
  )
}
