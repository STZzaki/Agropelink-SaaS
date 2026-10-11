import Reveal from './Reveal.jsx'
import SectionHeading from './SectionHeading.jsx'
import { ChartIcon, SensorIcon, ShieldIcon, SparkIcon } from './icons.jsx'

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
