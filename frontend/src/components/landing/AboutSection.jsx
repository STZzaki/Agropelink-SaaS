import { Cpu, GraduationCap, MapPin, Rocket, Settings2 } from 'lucide-react'
import Reveal from './Reveal.jsx'
import SectionHeading from './SectionHeading.jsx'
import { ChartIcon, SensorIcon, ShieldIcon, SparkIcon } from './icons.jsx'

// Quiénes somos: solo hechos confirmados por el equipo (origen, formación y propósito).
const ORIGIN = [
  { icon: MapPin, label: 'Origen', value: 'Nacidos en Almería, la huerta de Europa' },
  { icon: GraduationCap, label: 'Formación', value: 'Ingeniería de Organización Industrial · ETSI, Universidad de Sevilla' },
]

const PURPOSE = [
  { icon: Cpu, verb: 'Digitalizar', text: 'Llevar el dato del campo a una sola plataforma, sin papeles ni hojas sueltas.' },
  { icon: Settings2, verb: 'Optimizar', text: 'Aplicar la ingeniería de procesos al riego, los insumos y el trabajo diario.' },
  { icon: Rocket, verb: 'Modernizar', text: 'Acercar sensores e IA a cualquier explotación, sea cual sea su tamaño.' },
]

function WhoWeAre() {
  return (
    <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:gap-16">
      <Reveal>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-300">Quiénes somos</p>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Un equipo joven de Almería, con la vista puesta en el campo</h2>
        <p className="mt-5 text-base leading-relaxed text-slate-300">
          Somos estudiantes de Ingeniería de Organización Industrial en la Escuela Técnica Superior de Ingeniería de la Universidad de Sevilla.
          Crecimos rodeados de invernaderos y sabemos lo que cuesta sacar adelante una campaña.
        </p>
        <p className="mt-4 text-base leading-relaxed text-slate-400">
          Agropelink nace con un propósito claro: digitalizar, optimizar y modernizar el sector agrícola, poniendo la ingeniería al servicio de quien trabaja la tierra.
        </p>
        <dl className="mt-8 space-y-3">
          {ORIGIN.map((o) => (
            <div key={o.label} className="flex items-start gap-3 rounded-2xl bg-white/[0.03] p-4 shadow-surface-sm">
              <o.icon className="mt-0.5 h-5 w-5 shrink-0 text-secondary-300" aria-hidden="true" strokeWidth={1.75} />
              <div>
                <dt className="text-xs font-medium text-slate-500">{o.label}</dt>
                <dd className="text-sm font-medium text-slate-100">{o.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </Reveal>

      <ol className="grid content-center gap-4" aria-label="Nuestro propósito">
        {PURPOSE.map((p, i) => (
          <Reveal as="li" key={p.verb} delay={i * 80} className="surface flex gap-4 rounded-2xl p-5 sm:p-6">
            <span className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500/20 to-secondary-500/20 text-secondary-200 ring-1 ring-inset ring-white/10">
              <p.icon className="h-5 w-5" aria-hidden="true" strokeWidth={1.75} />
            </span>
            <div>
              <p className="font-semibold text-white"><span className="mr-2 tabular-nums text-slate-500">0{i + 1}</span>{p.verb}</p>
              <p className="mt-1 text-sm leading-relaxed text-slate-400">{p.text}</p>
            </div>
          </Reveal>
        ))}
      </ol>
    </div>
  )
}

const PILLARS = [
  {
    icon: SensorIcon,
    title: 'Sensorización de campo',
    text: 'Telemetría de suelo, clima y riego centralizada por parcela, accesible desde el móvil.',
  },
  {
    icon: SparkIcon,
    title: 'IA agronómica supervisada',
    text: 'Un asistente que interpreta los datos y propone labores. Ninguna acción se ejecuta sin tu aprobación.',
  },
  {
    icon: ChartIcon,
    title: 'Inteligencia de mercado',
    text: 'Costes de explotación y cotizaciones de lonja en un mismo panel para proteger tu margen.',
  },
  {
    icon: ShieldIcon,
    title: 'Seguridad por diseño',
    text: 'Datos cifrados en tránsito, almacenamiento privado y control total sobre quién accede a tu información.',
  },
]

const COMPARISON = [
  ['Cuaderno de campo en papel o Excel', 'Registro digital centralizado por parcela'],
  ['Riego por calendario fijo', 'Riego según humedad real del suelo'],
  ['Decisiones basadas en intuición', 'Recomendaciones de IA con aprobación humana'],
  ['Precio conocido tras la venta', 'Cotizaciones de referencia antes de cortar'],
]

const INSTITUTIONS = [
  {
    src: '/assets/EN_Co-fundedbytheEU_RGB_Monochrome.png',
    alt: 'Emblema de la Unión Europea con el texto Co-funded by the European Union',
    title: 'Co-fundado por la Unión Europea',
    text: 'Proyecto cofinanciado con fondos europeos para impulsar la transformación digital del sector agroalimentario.',
  },
  {
    src: '/assets/Give A Chance PNG 2.png',
    alt: 'Logotipo del programa Give a Chance',
    title: 'Soportado por el programa Give a Chance',
    text: 'Acompañamiento al emprendimiento y desarrollo del proyecto dentro del programa Give a Chance.',
  },
]

export default function AboutSection() {
  return (
    <section id="nosotros" className="relative scroll-mt-24 border-t border-white/5 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <WhoWeAre />

        <hr className="my-20 border-white/5 sm:my-28" />
        <SectionHeading
          eyebrow="Qué es Agropelink"
          title="La capa digital que le faltaba a la agricultura intensiva"
          description="Unificamos sensores, gestión de explotación e inteligencia de mercado en una plataforma diseñada para técnicos y agricultores del sureste español."
        />

        <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p, i) => (
            <Reveal
              key={p.title}
              delay={i * 80}
              className="surface-interactive group rounded-2xl p-6"
            >
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-primary-500/20 to-secondary-500/20 text-secondary-300 ring-1 ring-inset ring-white/10">
                <p.icon />
              </span>
              <h3 className="mt-5 font-semibold text-white">{p.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-slate-400">{p.text}</p>
            </Reveal>
          ))}
        </div>

        <Reveal className="mt-16 overflow-hidden rounded-2xl shadow-surface">
          <div className="grid grid-cols-2 border-b border-white/10 bg-white/[0.03] text-xs font-semibold uppercase tracking-wider">
            <p className="px-4 py-3 text-slate-500 sm:px-6">Gestión tradicional</p>
            <p className="border-l border-white/10 px-4 py-3 text-secondary-300 sm:px-6">Con Agropelink</p>
          </div>
          <ul>
            {COMPARISON.map(([before, after]) => (
              <li key={before} className="grid grid-cols-2 border-b border-white/5 text-sm last:border-0">
                <p className="px-4 py-4 text-slate-500 line-through decoration-slate-700 sm:px-6">{before}</p>
                <p className="border-l border-white/10 px-4 py-4 font-medium text-slate-200 sm:px-6">{after}</p>
              </li>
            ))}
          </ul>
        </Reveal>

        {/* Respaldo institucional: logos sobre fondo blanco, sin alterar proporciones ni colores. */}
        <Reveal className="mt-16 rounded-3xl bg-gradient-to-br from-white/[0.06] to-white/[0.01] p-6 shadow-surface sm:p-10">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-primary-300">Respaldo institucional</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Un proyecto con respaldo europeo</h3>
            </div>
            <p className="max-w-md text-sm text-slate-400">
              Agradecemos el apoyo de las instituciones que hacen posible Agropelink.
            </p>
          </div>

          <ul className="mt-8 grid gap-4 md:grid-cols-2">
            {INSTITUTIONS.map((inst) => (
              <li key={inst.src} className="flex flex-col overflow-hidden rounded-2xl bg-slate-900/60 shadow-surface-sm">
                <div className="flex h-32 items-center justify-center bg-white px-6 sm:h-36">
                  <img src={inst.src} alt={inst.alt} loading="lazy" className="max-h-16 w-auto max-w-full object-contain sm:max-h-20" />
                </div>
                <div className="p-5">
                  <p className="font-semibold text-white">{inst.title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-slate-400">{inst.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </Reveal>
      </div>
    </section>
  )
}
