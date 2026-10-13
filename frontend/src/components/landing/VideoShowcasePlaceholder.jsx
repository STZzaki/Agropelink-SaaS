import { Play } from 'lucide-react'
import { Suspense, lazy, useState } from 'react'
import ErrorBoundary from '../ui/ErrorBoundary.jsx'
import Reveal from './Reveal.jsx'

// Remotion + la composición van en su propio chunk: solo se descargan al pulsar Play.
const PromoPlayer = lazy(() => import('../../video/PromoPlayer.jsx'))

function Poster({ onPlay }) {
  return (
    <button
      type="button"
      onClick={onPlay}
      className="group relative flex h-full w-full flex-col items-center justify-center gap-5 px-6 text-center focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/60"
      aria-label="Reproducir el vídeo: descubre cómo unificamos tu campo"
    >
      <span className="relative inline-flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20" aria-hidden="true">
        <span className="absolute inset-0 rounded-full bg-emerald-400/20 motion-ok:animate-pulse" />
        <span className="relative inline-flex h-12 w-12 items-center justify-center rounded-full border border-emerald-400/40 bg-black/60 shadow-[0_0_25px_rgba(16,185,129,0.35)] transition-transform duration-300 group-hover:scale-110 sm:h-16 sm:w-16">
          <Play className="ml-0.5 h-5 w-5 fill-emerald-300 text-emerald-300 sm:h-6 sm:w-6" />
        </span>
      </span>
      <span>
        <span id="video-title" className="block text-lg font-semibold tracking-tight text-white sm:text-2xl">
          Descubre cómo unificamos tu campo
        </span>
        <span className="mt-2 block text-xs font-medium uppercase tracking-[0.18em] text-slate-500">Vídeo · 2:30 min</span>
      </span>
    </button>
  )
}

/** Vídeo promocional (composición Remotion `AgropelinkPromo`) bajo el Hero: póster ligero → reproductor al pulsar. */
export default function VideoShowcasePlaceholder() {
  const [playing, setPlaying] = useState(false)

  return (
    <section id="video" aria-labelledby="video-title" className="relative scroll-mt-24 py-16 sm:py-24">
      <div className="pointer-events-none absolute inset-x-0 top-1/2 mx-auto h-72 max-w-4xl -translate-y-1/2 glow-secondary" aria-hidden="true" />
      <div className="relative mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <Reveal>
          <div className="relative aspect-video overflow-hidden rounded-[2rem] border border-white/10 bg-black/40 shadow-[0_0_40px_rgba(16,185,129,0.1)] backdrop-blur-md">
            {!playing && (
              <>
                {/* Retícula técnica y luz cenital del póster */}
                <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_75%)]" aria-hidden="true" />
                <div className="pointer-events-none absolute -top-24 left-1/2 h-64 w-[36rem] -translate-x-1/2 glow-primary" aria-hidden="true" />
              </>
            )}
            <div className="pointer-events-none absolute inset-0 z-10 rounded-[2rem] ring-1 ring-inset ring-emerald-400/10" aria-hidden="true" />

            <div className="relative h-full w-full">
              {playing ? (
                <ErrorBoundary name="PromoPlayer" fallback={<p className="flex h-full items-center justify-center text-sm text-slate-400">No se pudo cargar el vídeo.</p>}>
                  <Suspense fallback={<div className="h-full w-full skeleton" aria-label="Cargando vídeo" />}>
                    <PromoPlayer />
                  </Suspense>
                </ErrorBoundary>
              ) : (
                <Poster onPlay={() => setPlaying(true)} />
              )}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  )
}
