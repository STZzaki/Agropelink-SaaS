import { BrainCircuit, Cloud, CloudSun, Database, FlaskConical, Link2, ListChecks, RadioTower, Server } from 'lucide-react'
import { useEffect, useRef } from 'react'
import Reveal from './Reveal.jsx'
import SectionHeading from './SectionHeading.jsx'

/**
 * Diagrama de flujo de datos de Agropelink: Fuentes → API Core → Persistencia / IA / Tareas / Certificación.
 *
 * - Nodos en HTML (texto nítido y accesible) posicionados en % sobre un SVG con las conexiones.
 * - «Pulsos de datos»: un trazo corto que recorre cada curva animando `stroke-dashoffset` (CSS, sin JS por frame).
 *   `pathLength="200"` normaliza todas las curvas, así un mismo keyframe sirve para cualquier longitud.
 * - Dos composiciones: horizontal (≥ md) y vertical (móvil), con las mismas piezas.
 * - Fuera de pantalla la animación se pausa (IntersectionObserver): cero trabajo mientras no se ve.
 */

const NODES = {
  s3: { group: 'in', icon: Cloud, title: 'AWS', detail: 'S3 · lotes y archivos históricos' },
  iot: { group: 'in', icon: RadioTower, title: 'Sensores IoT', detail: 'Humedad, CE, temperatura' },
  weather: { group: 'in', icon: CloudSun, title: 'APIs externas', detail: 'Clima, lonjas y carburante' },
  labs: { group: 'in', icon: FlaskConical, title: 'Insumos & Labs API', detail: 'Análisis de suelo y certificaciones' },
  core: { group: 'core', icon: Server, title: 'Agropelink API Core', detail: 'Validación · RBAC · Orquestación' },
  db: { group: 'out', icon: Database, title: 'Persistencia', detail: 'Series temporales y documentos' },
  ai: { group: 'out', icon: BrainCircuit, title: 'IA', detail: 'Motor cognitivo · Claude / Gemini' },
  actions: { group: 'out', icon: ListChecks, title: 'Tareas', detail: 'Motor PCP · Asignación y Planificación Óptima' },
  cert: { group: 'out', icon: Link2, title: 'Certificación L2', detail: 'Polygon Rollup · Anclaje Inmutable' },
}

const INPUTS = ['s3', 'iot', 'weather', 'labs']
const OUTPUTS = ['db', 'ai', 'actions', 'cert']

// Coordenadas de cada nodo en el sistema del viewBox de su composición.
const LAYOUTS = {
  wide: {
    w: 1000,
    h: 600,
    axis: 'x',
    pos: {
      s3: [130, 75], iot: [130, 225], weather: [130, 375], labs: [130, 525],
      core: [500, 300],
      db: [870, 75], ai: [870, 225], actions: [870, 375], cert: [870, 525],
    },
  },
  // Móvil: 4 fuentes en una fila arriba, el núcleo en el centro y 4 salidas en una fila abajo.
  tall: {
    w: 360,
    h: 660,
    axis: 'y',
    pos: {
      s3: [45, 70], iot: [135, 70], weather: [225, 70], labs: [315, 70],
      core: [180, 330],
      db: [45, 590], ai: [135, 590], actions: [225, 590], cert: [315, 590],
    },
  },
}

/** Curva suave entre dos nodos, tangente al eje del flujo. */
function curve([x1, y1], [x2, y2], axis) {
  if (axis === 'x') {
    const mx = (x1 + x2) / 2
    return `M${x1} ${y1} C${mx} ${y1}, ${mx} ${y2}, ${x2} ${y2}`
  }
  const my = (y1 + y2) / 2
  return `M${x1} ${y1} C${x1} ${my}, ${x2} ${my}, ${x2} ${y2}`
}

function Link({ d, tone, delay }) {
  return (
    <g>
      {/* Canal base, tenue */}
      <path d={d} pathLength="200" fill="none" stroke="rgb(255 255 255 / 0.09)" strokeWidth="2" vectorEffect="non-scaling-stroke" />
      {/* Halo del pulso (trazo ancho y translúcido: «brillo» sin filtros) */}
      <path d={d} pathLength="200" fill="none" className={`data-pulse ${tone}`} strokeWidth="8" strokeOpacity="0.18" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ animationDelay: `${delay}s` }} />
      {/* Núcleo del pulso, y un segundo pulso a medio ciclo para un flujo constante */}
      <path d={d} pathLength="200" fill="none" className={`data-pulse ${tone}`} strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ animationDelay: `${delay}s` }} />
      <path d={d} pathLength="200" fill="none" className={`data-pulse ${tone}`} strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" style={{ animationDelay: `${delay - 1.4}s` }} />
    </g>
  )
}

function Node({ id, x, y, layout, compact }) {
  const { icon: Icon, title, detail, group } = NODES[id]
  const core = group === 'core'
  const accent = group === 'in' ? 'text-secondary-300 bg-secondary-500/10 ring-secondary-400/30' : core ? 'text-white bg-gradient-to-br from-primary-500/30 to-secondary-500/30 ring-secondary-300/50' : 'text-primary-300 bg-primary-500/10 ring-primary-400/30'
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${(x / layout.w) * 100}%`, top: `${(y / layout.h) * 100}%` }}
    >
      <div
        className={`relative rounded-2xl bg-slate-900/90 shadow-surface ring-1 ring-inset ${core ? 'ring-secondary-300/40' : 'ring-white/10'} ${
          compact ? (core ? 'w-44 p-3 text-center' : 'flex h-[5.5rem] w-[4.6rem] items-center justify-center px-1 py-2 text-center') : core ? 'w-60 p-5' : 'w-52 p-4'
        }`}
      >
        {core && (
          // Latido del núcleo: un anillo que se expande (solo transform/opacity, en el compositor).
          <span className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-secondary-300/40 motion-ok:animate-[core-beat_2.8s_ease-out_infinite]" aria-hidden="true" />
        )}
        <div className={`flex ${compact ? 'flex-col items-center gap-1.5' : core ? 'flex-col items-center gap-3 text-center' : 'items-center gap-3'}`}>
          <span className={`inline-flex shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${accent} ${compact ? 'h-8 w-8' : core ? 'h-12 w-12' : 'h-10 w-10'}`}>
            <Icon className={compact ? 'h-4 w-4' : core ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className={`font-semibold leading-tight text-white ${compact ? (core ? 'text-[11px]' : 'text-[10px]') : core ? 'text-base' : 'text-sm'}`}>{title}</p>
            <p className={`mt-0.5 leading-snug text-slate-400 ${compact ? (core ? 'text-[11px]' : 'hidden') : 'text-xs'}`}>{detail}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Diagram({ layout, compact, className }) {
  const { pos, axis, w, h } = layout
  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: `${w} / ${h}` }}>
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {INPUTS.map((id, i) => (
          <Link key={id} d={curve(pos[id], pos.core, axis)} tone="data-pulse--in" delay={-i * 0.45} />
        ))}
        {OUTPUTS.map((id, i) => (
          // Las salidas arrancan medio ciclo después: el pulso «atraviesa» el API Core.
          <Link key={id} d={curve(pos.core, pos[id], axis)} tone="data-pulse--out" delay={1.4 - i * 0.45} />
        ))}
      </svg>
      {Object.keys(NODES).map((id) => (
        <Node key={id} id={id} x={pos[id][0]} y={pos[id][1]} layout={layout} compact={compact} />
      ))}
    </div>
  )
}

export default function ArchitectureSection() {
  const ref = useRef(null)

  // Pausa los pulsos cuando el diagrama no está en pantalla.
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return undefined
    const observer = new IntersectionObserver(([entry]) => el.toggleAttribute('data-offscreen', !entry.isIntersecting), { rootMargin: '120px' })
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <section id="arquitectura" className="relative scroll-mt-24 overflow-hidden border-t border-white/5 py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-1/4 mx-auto h-80 max-w-5xl glow-secondary" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Arquitectura Core · API-First"
          title="Del sensor a la decisión, en un único flujo"
          description="Agropelink es agnóstico de hardware: ingiere telemetría de cualquier fuente, la valida en su API Core y la convierte en registros persistentes, recomendaciones de IA y acciones de gestión."
        />

        <Reveal delay={100} className="mt-14">
          <figure ref={ref} className="data-flow overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 shadow-[0_0_40px_rgba(16,185,129,0.08)] backdrop-blur-md">
            {/* Barra de «consola»: aspecto de panel de control en producción. */}
            <div className="flex items-center justify-between gap-3 border-b border-white/[0.08] bg-white/[0.02] px-4 py-3 sm:px-6">
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                </span>
                <span className="truncate font-mono text-xs text-slate-400">core.agropelink / pipeline</span>
              </div>
              <span className="pill-neon">
                <span className="pill-neon-dot motion-ok:animate-pulse" aria-hidden="true" />
                Pipeline activo
              </span>
            </div>
            <div className="p-4 sm:p-8">
            <div className="mb-6 hidden grid-cols-3 text-xs font-semibold uppercase tracking-[0.18em] text-slate-500 md:grid">
              <span>Fuentes de datos</span>
              <span className="text-center">Cerebro</span>
              <span className="text-right">Persistencia · IA · Tareas · L2</span>
            </div>
            <Diagram layout={LAYOUTS.wide} className="hidden md:block" />
            <Diagram layout={LAYOUTS.tall} compact className="md:hidden" />
            </div>
            <figcaption className="sr-only">
              Flujo de datos: AWS, sensores IoT, APIs externas y la API de insumos y laboratorios envían datos al Agropelink API Core,
              que los distribuye a la capa de persistencia, al motor de IA, al motor PCP de tareas y a la certificación L2.
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  )
}
