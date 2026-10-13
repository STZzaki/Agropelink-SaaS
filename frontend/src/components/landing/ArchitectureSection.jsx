import {
  BrainCircuit,
  Calculator,
  CloudSun,
  Database,
  DatabaseZap,
  FlaskConical,
  Gauge,
  Link2,
  ListChecks,
  Network,
  RadioTower,
  Server,
  Workflow,
} from 'lucide-react'
import { useEffect, useRef } from 'react'
import Reveal from './Reveal.jsx'
import SectionHeading from './SectionHeading.jsx'

/**
 * Diagrama de flujo de datos de Agropelink (esquema MBSE):
 *   Entradas → API Core · API Core ⇄ IA · API Core ⇄ MBSE → Procesos metodizados ·
 *   API Core → Salidas (con la BBDD organizada e indexada en ambos sentidos).
 *
 * - Nodos en HTML (texto nítido y accesible) posicionados en % sobre un SVG con las conexiones.
 * - Conexiones declaradas en `LINKS` (origen → destino). Las de ida y vuelta son dos curvas paralelas
 *   (desplazadas con `offset`) con pulsos en sentidos opuestos.
 * - «Pulsos de datos»: un trazo corto que recorre cada curva animando `stroke-dashoffset` (CSS, sin JS por frame).
 *   `pathLength="200"` normaliza todas las curvas: un mismo keyframe sirve para cualquier longitud.
 * - Dos composiciones: horizontal (≥ md) y vertical (móvil), con las mismas piezas.
 * - Fuera de pantalla la animación se pausa (IntersectionObserver): cero trabajo mientras no se ve.
 */

const NODES = {
  // Entradas
  farmdb: { group: 'in', icon: DatabaseZap, title: 'BBDD del Agricultor', detail: 'Hojas, ERP y cuadernos de campo' },
  iot: { group: 'in', icon: RadioTower, title: 'Sensores IoT', detail: 'Cualquier marca y protocolo' },
  apis: { group: 'in', icon: CloudSun, title: 'APIs Externas', detail: 'Clima, lonjas y carburante' },
  labs: { group: 'in', icon: FlaskConical, title: 'Labs y Certificaciones', detail: 'Análisis de suelo e insumos' },
  // Núcleo y cerebro
  ai: { group: 'brain', icon: BrainCircuit, title: 'Motor de IA', detail: 'Patrones, predicción y decisiones' },
  core: { group: 'core', icon: Server, title: 'API Core', detail: 'Validación · RBAC · Orquestación' },
  mbse: { group: 'brain', icon: Network, title: 'Modelado MBSE', detail: 'Modelo vivo de tu explotación' },
  proc: { group: 'brain', icon: Workflow, title: 'Procesos Metodizados', detail: 'Protocolos estándar y de emergencia' },
  // Salidas
  db: { group: 'out', icon: Database, title: 'BBDD Organizada e Indexada', detail: 'Datos limpios y trazables' },
  econ: { group: 'out', icon: Calculator, title: 'Gestión Económica', detail: 'Márgenes en tiempo real' },
  tasks: { group: 'out', icon: ListChecks, title: 'Tareas', detail: 'Motor PCP · Planificación óptima' },
  opt: { group: 'out', icon: Gauge, title: 'Optimización', detail: 'Agua, insumos y maquinaria' },
  cert: { group: 'out', icon: Link2, title: 'Certificación Blockchain', detail: 'Polygon L2 · Anclaje inmutable' },
}

const INPUTS = ['farmdb', 'iot', 'apis', 'labs']
const OUTPUTS = ['db', 'econ', 'tasks', 'opt', 'cert']

// Flujo: { from, to, tone, offset }. `offset` separa en paralelo las conexiones de ida y vuelta.
const LINKS = [
  ...INPUTS.map((id) => ({ from: id, to: 'core', tone: 'in' })),
  // API Core ⇄ IA
  { from: 'core', to: 'ai', tone: 'brain', offset: -14 },
  { from: 'ai', to: 'core', tone: 'brain', offset: 14 },
  // API Core ⇄ MBSE, y MBSE → procesos metodizados
  { from: 'core', to: 'mbse', tone: 'brain', offset: -14 },
  { from: 'mbse', to: 'core', tone: 'brain', offset: 14 },
  { from: 'mbse', to: 'proc', tone: 'brain' },
  // API Core → salidas (con la BBDD indexada en ambos sentidos)
  { from: 'core', to: 'db', tone: 'out', offset: -9 },
  { from: 'db', to: 'core', tone: 'out', offset: 9 },
  ...OUTPUTS.slice(1).map((id) => ({ from: 'core', to: id, tone: 'out' })),
]

const TONE_CLASS = { in: 'data-pulse--in', brain: 'data-pulse--brain', out: 'data-pulse--out' }
// Desfase por etapa: los pulsos «avanzan» de la ingesta al cerebro y de ahí a las salidas.
const TONE_DELAY = { in: 0, brain: 0.9, out: 1.8 }

// Coordenadas de cada nodo en el sistema del viewBox de su composición; `axisFor` fuerza el eje de algún enlace.
const LAYOUTS = {
  // Escritorio: misma disposición que el boceto (entradas · IA / API / MBSE / procesos · salidas).
  wide: {
    w: 1000,
    h: 840,
    axis: 'x',
    axisFor: { 'core>ai': 'y', 'ai>core': 'y', 'core>mbse': 'y', 'mbse>core': 'y', 'mbse>proc': 'y' },
    columns: [
      [110, 'Entradas'],
      [480, 'Cerebro · IA + MBSE'],
      [880, 'Salidas'],
    ],
    pos: {
      farmdb: [110, 200], iot: [110, 345], apis: [110, 490], labs: [110, 635],
      ai: [480, 170], core: [480, 410], mbse: [480, 625], proc: [480, 780],
      db: [880, 150], econ: [880, 305], tasks: [880, 460], opt: [880, 615], cert: [880, 770],
    },
  },
  // Móvil: entradas arriba, API Core, IA y MBSE a los lados, procesos bajo el MBSE y salidas en dos filas.
  tall: {
    w: 360,
    h: 1060,
    axis: 'y',
    axisFor: {},
    columns: [],
    pos: {
      farmdb: [45, 60], iot: [135, 60], apis: [225, 60], labs: [315, 60],
      core: [180, 280],
      ai: [80, 480], mbse: [280, 480], proc: [280, 650],
      db: [70, 830], econ: [180, 830], tasks: [290, 830], opt: [125, 975], cert: [235, 975],
    },
  },
}

/** Curva suave entre dos nodos, tangente al eje del flujo; `offset` la desplaza en paralelo. */
function curve([x1, y1], [x2, y2], axis, offset = 0) {
  if (axis === 'x') {
    const [a, b] = [y1 + offset, y2 + offset]
    const mx = (x1 + x2) / 2
    return `M${x1} ${a} C${mx} ${a}, ${mx} ${b}, ${x2} ${b}`
  }
  const [a, b] = [x1 + offset, x2 + offset]
  const my = (y1 + y2) / 2
  return `M${a} ${y1} C${a} ${my}, ${b} ${my}, ${b} ${y2}`
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

const ACCENT = {
  in: 'text-secondary-300 bg-secondary-500/10 ring-secondary-400/30',
  core: 'text-white bg-gradient-to-br from-primary-500/30 to-secondary-500/30 ring-secondary-300/50',
  brain: 'text-emerald-300 bg-emerald-500/10 ring-emerald-400/40',
  out: 'text-primary-300 bg-primary-500/10 ring-primary-400/30',
}

function Node({ id, x, y, layout, compact }) {
  const { icon: Icon, title, detail, group } = NODES[id]
  const core = group === 'core'
  const brain = group === 'brain'
  return (
    <div
      className="absolute -translate-x-1/2 -translate-y-1/2"
      style={{ left: `${(x / layout.w) * 100}%`, top: `${(y / layout.h) * 100}%` }}
    >
      <div
        className={`relative rounded-2xl bg-slate-900/90 shadow-surface ring-1 ring-inset ${
          core ? 'ring-secondary-300/40' : brain ? 'ring-emerald-400/25 shadow-[0_0_18px_rgba(16,185,129,0.12)]' : 'ring-white/10'
        } ${
          compact
            ? core
              ? 'w-44 p-3 text-center'
              : brain
                ? 'flex h-[5.5rem] w-[7.5rem] items-center justify-center px-2 py-2 text-center'
                : 'flex h-[5.5rem] w-[4.6rem] items-center justify-center px-1 py-2 text-center'
            : core
              ? 'w-56 p-5'
              : 'w-52 p-4'
        }`}
      >
        {core && (
          // Latido del núcleo: un anillo que se expande (solo transform/opacity, en el compositor).
          <span className="pointer-events-none absolute inset-0 rounded-2xl ring-2 ring-secondary-300/40 motion-ok:animate-[core-beat_2.8s_ease-out_infinite]" aria-hidden="true" />
        )}
        <div className={`flex ${compact ? 'flex-col items-center gap-1.5' : core ? 'flex-col items-center gap-3 text-center' : 'items-center gap-3'}`}>
          <span className={`inline-flex shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ${ACCENT[group]} ${compact ? 'h-8 w-8' : core ? 'h-12 w-12' : 'h-10 w-10'}`}>
            <Icon className={compact ? 'h-4 w-4' : core ? 'h-6 w-6' : 'h-5 w-5'} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <p className={`font-semibold leading-tight text-white ${compact ? (core || brain ? 'text-[11px]' : 'text-[10px]') : core ? 'text-base' : 'text-sm'}`}>{title}</p>
            <p className={`mt-0.5 leading-snug text-slate-400 ${compact ? (core ? 'text-[11px]' : 'hidden') : 'text-xs'}`}>{detail}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

function Diagram({ layout, compact, className }) {
  const { pos, w, h } = layout
  const indexByTone = { in: 0, brain: 0, out: 0 }
  return (
    <div className={`relative w-full ${className}`} style={{ aspectRatio: `${w} / ${h}` }}>
      <svg className="absolute inset-0 h-full w-full" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" aria-hidden="true" focusable="false">
        {LINKS.map(({ from, to, tone, offset }) => {
          const i = indexByTone[tone]++
          const axis = layout.axisFor[`${from}>${to}`] ?? layout.axis
          return <Link key={`${from}>${to}`} d={curve(pos[from], pos[to], axis, offset)} tone={TONE_CLASS[tone]} delay={TONE_DELAY[tone] - i * 0.35} />
        })}
      </svg>
      {/* Rótulos de columna (solo en la composición horizontal) */}
      {layout.columns.map(([x, label]) => (
        <span
          key={label}
          className="absolute top-0 -translate-x-1/2 whitespace-nowrap text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-500"
          style={{ left: `${(x / w) * 100}%` }}
        >
          {label}
        </span>
      ))}
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
          eyebrow="Arquitectura Core · Flujo MBSE"
          title="Cualquier dato entra. Decisiones optimizadas salen."
          description="Agropelink unifica tus fuentes en su API Core, que dialoga en ambos sentidos con un motor de IA y con el modelo MBSE de tu explotación —convertido en procesos metodizados— y lo transforma en datos organizados, economía, tareas, optimización y certificación."
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
              <Diagram layout={LAYOUTS.wide} className="hidden md:block" />
              <Diagram layout={LAYOUTS.tall} compact className="md:hidden" />
            </div>
            <figcaption className="sr-only">
              Flujo de datos: la base de datos del agricultor, los sensores IoT, las APIs externas y los laboratorios y
              certificaciones entran en el API Core. El API Core se comunica en ambos sentidos con el motor de IA y con el
              modelado MBSE, y el MBSE genera los procesos metodizados. El API Core envía datos a la gestión económica, las
              tareas, la optimización y la certificación blockchain, y se comunica en ambos sentidos con la base de datos
              organizada e indexada.
            </figcaption>
          </figure>
        </Reveal>
      </div>
    </section>
  )
}
