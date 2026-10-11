import { useEffect, useRef, useState } from 'react'
import { MOTION_OK, gsap, useGSAP } from '../../lib/gsap.js'
import SectionHeading from './SectionHeading.jsx'

// Archivos en `public/media/` (MP4 H.264 con el índice al inicio para empezar a reproducir sin descargar entero).
const VIDEOS = [
  { src: '/media/campo-1.mp4', title: 'Labores con maquinaria conectada', caption: 'Cada pasada registrada por parcela, sin papeles' },
  { src: '/media/campo-2.mp4', title: 'Tratamientos de precisión', caption: 'Planificados con IA y aprobados por el agricultor' },
]

function PanoramicVideo({ src, title, caption }) {
  const videoRef = useRef(null)
  const [playing, setPlaying] = useState(false)
  const userPausedRef = useRef(false)

  // Fuera de pantalla se pausa (batería y datos en móvil); al volver se reanuda salvo pausa manual.
  useEffect(() => {
    const video = videoRef.current
    if (!video || !('IntersectionObserver' in window)) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting && !userPausedRef.current) video.play().catch(() => {})
        else if (!entry.isIntersecting) video.pause()
      },
      { threshold: 0.25 },
    )
    observer.observe(video)
    return () => observer.disconnect()
  }, [])

  function toggle() {
    const video = videoRef.current
    if (!video) return
    if (video.paused) {
      userPausedRef.current = false
      video.play().catch(() => {})
    } else {
      userPausedRef.current = true
      video.pause()
    }
  }

  return (
    <figure data-video-frame className="group relative overflow-hidden rounded-3xl bg-slate-900 shadow-overlay">
      {/* Fondo de marca visible mientras el vídeo carga el primer fotograma */}
      <div className="relative aspect-[16/9] bg-gradient-to-br from-secondary-900 via-slate-900 to-primary-900/60 sm:aspect-[21/9]">
        <video
          ref={videoRef}
          data-parallax
          className="absolute inset-0 h-full w-full object-cover"
          src={src}
          autoPlay
          muted
          loop
          playsInline
          preload="auto"
          aria-label={`${title}. ${caption}`}
          onPlay={() => setPlaying(true)}
          onPause={() => setPlaying(false)}
        />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/10 to-transparent" aria-hidden="true" />
      </div>

      <figcaption className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-4 p-6 sm:p-8">
        <div>
          <p className="text-base font-semibold text-white sm:text-xl">{title}</p>
          <p className="mt-1 text-xs text-slate-300 sm:text-sm">{caption}</p>
        </div>
        <button
          type="button"
          onClick={toggle}
          aria-label={playing ? `Pausar vídeo: ${title}` : `Reproducir vídeo: ${title}`}
          className="relative inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-slate-950/70 text-white shadow-surface-sm transition-[background-color,opacity,transform] duration-200 ease-out hover:bg-slate-950/80 focus-visible:opacity-100 active:scale-[0.96] sm:opacity-70 sm:group-hover:opacity-100"
        >
          {/* Cruce de iconos: ambos montados; opacidad + escala + desenfoque (sin saltos al alternar). */}
          <svg
            className={`absolute h-4 w-4 transition-[opacity,transform,filter] duration-200 ease-out ${playing ? 'scale-100 opacity-100 blur-0' : 'scale-[0.25] opacity-0 blur-[4px]'}`}
            viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
          >
            <path d="M7 5h3.5v14H7zM13.5 5H17v14h-3.5z" />
          </svg>
          <svg
            className={`absolute ml-0.5 h-4 w-4 transition-[opacity,transform,filter] duration-200 ease-out ${playing ? 'scale-[0.25] opacity-0 blur-[4px]' : 'scale-100 opacity-100 blur-0'}`}
            viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"
          >
            <path d="M8 5.5v13a1 1 0 001.5.86l10.5-6.5a1 1 0 000-1.72L9.5 4.64A1 1 0 008 5.5z" />
          </svg>
        </button>
      </figcaption>
    </figure>
  )
}

export default function VideoShowcase() {
  const sectionRef = useRef(null)

  // Revelado guiado por scroll (el marco se abre) + parallax sutil del vídeo. Sin pin: no secuestra el scroll.
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.utils.toArray('[data-video-frame]').forEach((frame) => {
          gsap.fromTo(
            frame,
            { clipPath: 'inset(5% 4% 5% 4% round 40px)' },
            {
              clipPath: 'inset(0% 0% 0% 0% round 24px)',
              ease: 'none',
              scrollTrigger: { trigger: frame, start: 'top 95%', end: 'top 50%', scrub: 0.6 },
            },
          )
          gsap.fromTo(
            frame.querySelector('[data-parallax]'),
            { yPercent: -6, scale: 1.14 },
            {
              yPercent: 6,
              scale: 1.14,
              ease: 'none',
              scrollTrigger: { trigger: frame, start: 'top bottom', end: 'bottom top', scrub: 0.6 },
            },
          )
        })
      })
      return () => mm.revert()
    },
    { scope: sectionRef },
  )

  return (
    <section ref={sectionRef} aria-labelledby="showcase-title" className="relative border-t border-white/5 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading eyebrow="En el campo" title={<span id="showcase-title">Tecnología que se ve sobre el terreno</span>} />
        <div className="mt-12 space-y-8">
          {VIDEOS.map((v) => (
            <PanoramicVideo key={v.src} {...v} />
          ))}
        </div>
      </div>
    </section>
  )
}
