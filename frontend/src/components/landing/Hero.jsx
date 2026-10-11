import { Link } from 'react-router-dom'
import HeroCarousel from './HeroCarousel.jsx'
import { ArrowRightIcon } from './icons.jsx'

const HIGHLIGHTS = ['Sensorización IoT', 'IA agronómica supervisada', 'Datos de lonja y carburante']

export default function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden pt-20 sm:pt-36">
      {/* Fondo: rejilla sutil + degradados corporativos */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.04)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.04)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]" />
        <div className="absolute -top-40 left-1/2 h-[32rem] w-[56rem] -translate-x-1/2 glow-secondary" />
        <div className="absolute -left-40 top-[36rem] h-80 w-80 glow-primary" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-20 sm:px-6 lg:px-8 lg:pb-28">
        <div className="mx-auto max-w-4xl text-center motion-ok:animate-[fade-up_700ms_ease-out_both]">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-medium text-slate-300">
            <span className="h-1.5 w-1.5 rounded-full bg-primary-400" />
            AgTech · Co-fundado por la Unión Europea
          </p>
          <h1 className="mt-4 text-[2rem] font-semibold leading-[1.08] tracking-tight text-white sm:mt-6 sm:text-6xl lg:text-7xl">
            El campo, digitalizado.{' '}
            <span className="bg-gradient-to-r from-primary-300 via-secondary-300 to-secondary-400 bg-clip-text text-transparent">
              Cada decisión, optimizada con IA.
            </span>
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-[15px] leading-relaxed text-slate-400 sm:mt-6 sm:text-lg">
            Agropelink conecta sensores, datos de mercado e inteligencia artificial en una sola plataforma para que
            tu explotación ahorre agua, anticipe labores y venda con más margen.
          </p>

          <div className="mt-6 flex flex-col justify-center gap-3 sm:mt-9 sm:flex-row">
            <Link
              to="/panel"
              className="btn-primary group h-12 px-7 text-sm"
            >
              Acceso Plataforma
              <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </Link>
            <a
              href="#contacto"
              className="btn-secondary h-12 px-7 text-sm"
            >
              Solicitar demo
            </a>
          </div>

          <ul className="mt-10 flex flex-wrap justify-center gap-x-6 gap-y-2 text-sm text-slate-400">
            {HIGHLIGHTS.map((h) => (
              <li key={h} className="flex items-center gap-2">
                <svg className="h-4 w-4 text-primary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                </svg>
                {h}
              </li>
            ))}
          </ul>
        </div>

        <div className="mx-auto mt-16 max-w-6xl motion-ok:animate-[fade-up_800ms_ease-out_200ms_both] sm:mt-20">
          <HeroCarousel />
        </div>
      </div>
    </section>
  )
}
