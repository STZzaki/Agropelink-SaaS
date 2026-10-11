import { useCallback, useEffect, useRef, useState } from 'react'
import { MOTION_OK, gsap, prefersReducedMotion, useGSAP } from '../../lib/gsap.js'
import { HERO_SLIDES } from './HeroSlides.jsx'
import { ChevronIcon } from './icons.jsx'

const AUTOPLAY_MS = 8000


export default function HeroCarousel() {
  const [index, setIndex] = useState(0)
  // Se pausa con hover/foco (para poder interactuar con los gráficos) y si se prefiere menos movimiento.
  const [paused, setPaused] = useState(prefersReducedMotion)
  const touchStart = useRef(null)
  const rootRef = useRef(null)
  const count = HERO_SLIDES.length

  // Coreografía al activar cada diapositiva: titular y KPIs entran en cascada con aceleración natural.
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const slide = `#slide-${HERO_SLIDES[index].id}`
        gsap.timeline({ defaults: { ease: 'power2.out', overwrite: 'auto' } })
          .from(`${slide} [data-slide-copy] > *`, { autoAlpha: 0, y: 12, duration: 0.55, stagger: 0.08, clearProps: 'transform,opacity,visibility' })
          .from(`${slide} [data-kpi]`, { autoAlpha: 0, y: 16, duration: 0.6, stagger: 0.1, clearProps: 'transform,opacity,visibility' }, '<0.15')
      })
      return () => mm.revert()
    },
    { scope: rootRef, dependencies: [index] },
  )

  const go = useCallback((i) => setIndex((i + count) % count), [count])

  useEffect(() => {
    if (paused) return
    const id = setTimeout(() => go(index + 1), AUTOPLAY_MS)
    return () => clearTimeout(id)
  }, [index, paused, go])

  return (
    <section
      aria-roledescription="carrusel"
      aria-label="Capacidades de Agropelink"
      ref={rootRef}
      className="relative"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(prefersReducedMotion())}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(prefersReducedMotion())}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight') go(index + 1)
        if (e.key === 'ArrowLeft') go(index - 1)
      }}
    >
      <div className="glow-secondary pointer-events-none absolute -inset-x-10 -inset-y-16" aria-hidden="true" />

      <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-b from-slate-900/95 to-slate-900/80 shadow-overlay">
        {/* Pestañas superiores con progreso */}
        <div className="grid grid-cols-3 border-b border-white/10" role="tablist" aria-label="Elegir diapositiva">
          {HERO_SLIDES.map((s, i) => {
            const active = i === index
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={active}
                aria-controls={`slide-${s.id}`}
                onClick={() => go(i)}
                className={`relative flex items-center justify-center gap-2 px-2 py-4 text-xs font-semibold transition-colors sm:justify-start sm:px-6 sm:text-sm ${active ? 'text-white' : 'text-slate-500 hover:text-slate-300'}`}
              >
                <s.icon className={`h-4 w-4 shrink-0 ${active ? 'text-secondary-300' : ''}`} />
                <span className="hidden truncate sm:inline">{s.tag}</span>
                <span className="absolute inset-x-0 bottom-0 h-0.5 bg-white/5">
                  <span
                    key={active ? `on-${index}-${paused}` : s.id}
                    className={`block h-full w-full origin-left bg-gradient-to-r from-primary-400 to-secondary-400 ${
                      active ? (paused ? 'scale-x-100' : 'animate-[carousel-progress_linear_forwards]') : 'scale-x-0'
                    }`}
                    style={active && !paused ? { animationDuration: `${AUTOPLAY_MS}ms` } : undefined}
                  />
                </span>
              </button>
            )
          })}
        </div>

        <div
          className="grid"
          onTouchStart={(e) => (touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY })}
          onTouchEnd={(e) => {
            if (!touchStart.current) return
            const dx = e.changedTouches[0].clientX - touchStart.current.x
            const dy = e.changedTouches[0].clientY - touchStart.current.y
            if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) go(index + (dx < 0 ? 1 : -1))
            touchStart.current = null
          }}
        >
          {HERO_SLIDES.map((s, i) => {
            const active = i === index
            return (
              <div
                key={s.id}
                id={`slide-${s.id}`}
                role="group"
                aria-roledescription="diapositiva"
                aria-label={`${i + 1} de ${count}: ${s.title}`}
                aria-hidden={!active}
                inert={active ? undefined : ''}
                className={`col-start-1 row-start-1 grid gap-8 p-6 transition-[opacity,transform] duration-500 ease-out sm:p-8 lg:grid-cols-[1fr_1.25fr] lg:gap-10 lg:p-10 ${
                  active ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-3 opacity-0'
                }`}
              >
                <div className="flex flex-col">
                  <div data-slide-copy>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary-300">{s.tag}</p>
                    <h2 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl lg:text-4xl">{s.title}</h2>
                    <p className="mt-4 text-sm leading-relaxed text-slate-400 sm:text-base">{s.text}</p>
                  </div>
                  <dl className="mt-auto grid grid-cols-3 gap-4 pt-8">
                    {s.kpis.map((k) => (
                      <div key={k.label} data-kpi className="rounded-2xl bg-white/[0.03] p-4 shadow-surface-sm">
                        <dd className="text-lg font-semibold tabular-nums text-white sm:text-2xl">{k.value}</dd>
                        <dt className="mt-1 text-[11px] leading-snug text-slate-400 sm:text-xs">{k.label}</dt>
                      </div>
                    ))}
                  </dl>
                </div>
                <div className="min-w-0 self-center">
                  <s.Visual />
                </div>
              </div>
            )
          })}
        </div>

        <div className="flex items-center justify-between border-t border-white/10 px-5 py-3 sm:px-8">
          <p className="text-xs tabular-nums text-slate-500" aria-live="polite">
            {String(index + 1).padStart(2, '0')} / {String(count).padStart(2, '0')}
            {paused && <span className="ml-2 text-slate-600">· en pausa</span>}
          </p>
          <div className="flex gap-2">
            <button type="button" onClick={() => go(index - 1)} aria-label="Diapositiva anterior" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-300 shadow-surface-sm transition-[color,background-color,transform] duration-200 ease-out hover:bg-white/[0.06] hover:text-white active:scale-[0.96]">
              <ChevronIcon direction="left" />
            </button>
            <button type="button" onClick={() => go(index + 1)} aria-label="Diapositiva siguiente" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-300 shadow-surface-sm transition-[color,background-color,transform] duration-200 ease-out hover:bg-white/[0.06] hover:text-white active:scale-[0.96]">
              <ChevronIcon />
            </button>
          </div>
        </div>
      </div>
    </section>
  )
}
