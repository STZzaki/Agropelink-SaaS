import { useEffect, useRef, useState } from 'react'
import { SITE } from '../../config/site.js'
import { useConsent } from '../../consent/ConsentContext.jsx'
import Reveal from './Reveal.jsx'
import { InstagramIcon } from './icons.jsx'
import ErrorBoundary from '../ui/ErrorBoundary.jsx'

// Widget de Instagram de Elfsight (configurado en el panel de Elfsight, sin claves en el frontend).
const ELFSIGHT_SCRIPT_SRC = 'https://elfsightcdn.com/platform.js'
const ELFSIGHT_APP_CLASS = 'elfsight-app-6563112f-789f-4baa-9b2c-93c9ab335a66'
// Si el feed no aparece en este tiempo desde que la sección es visible (bloqueador, red caída…),
// se muestra el enlace al perfil. Si el widget llega más tarde, sustituye al aviso.
const FALLBACK_AFTER_MS = 12000

function loadElfsightScript() {
  if (document.querySelector(`script[src="${ELFSIGHT_SCRIPT_SRC}"]`)) return null
  const script = document.createElement('script')
  script.src = ELFSIGHT_SCRIPT_SRC
  script.async = true
  // Solo el origen (no la ruta) como Referer hacia el CDN de terceros.
  script.referrerPolicy = 'strict-origin-when-cross-origin'
  document.body.appendChild(script)
  return script
}

/** ¿El error viene del widget de Elfsight (su script o su styled-components interno)? */
function isElfsightError(source = '', message = '', stack = '') {
  const text = `${source} ${message} ${stack}`.toLowerCase()
  return text.includes('elfsight') || text.includes('styled-components') || text.includes('instagram')
}

function FeedSkeleton() {
  return (
    <div role="status" aria-label="Cargando publicaciones de Instagram" className="grid grid-cols-2 gap-4 lg:grid-cols-3">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} className="skeleton relative aspect-square rounded-2xl" style={{ animationDelay: `${i * 90}ms` }}>
          <InstagramIcon className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-1/2 text-white/10" />
        </div>
      ))}
    </div>
  )
}

function FeedUnavailable() {
  return (
    <div className="flex flex-col items-center justify-center rounded-3xl border border-dashed border-white/15 px-6 py-14 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#515bd4] text-white">
        <InstagramIcon className="h-6 w-6" />
      </span>
      <p className="mt-4 font-medium text-white">Mira nuestras últimas publicaciones directamente en Instagram</p>
      <p className="mt-1 text-sm text-slate-400">El feed no se ha podido cargar en este navegador.</p>
      <a
        href={SITE.instagramUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="btn-secondary mt-6 h-11 gap-2 px-5 text-sm"
      >
        Abrir {SITE.instagramHandle}
      </a>
    </div>
  )
}

function ConsentGate() {
  const { consent, save } = useConsent()
  return (
    <div className="surface flex flex-col items-center justify-center px-6 py-16 text-center">
      <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#515bd4] text-white">
        <InstagramIcon className="h-6 w-6" />
      </span>
      <p className="mt-4 max-w-md font-medium text-white">El feed de Instagram lo proporciona un servicio externo (Elfsight) que puede usar cookies.</p>
      <p className="mt-1 max-w-md text-sm text-slate-400">Solo se cargará si lo aceptas. También puedes ver las publicaciones directamente en Instagram.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button
          type="button"
          onClick={() => save({ analytics: consent?.analytics ?? false, external: true })}
          className="inline-flex h-11 items-center rounded-full bg-white px-5 text-sm font-semibold text-slate-950 hover:bg-slate-200"
        >
          Mostrar publicaciones
        </button>
        <a href={SITE.instagramUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary h-11 px-5 text-sm">
          Abrir {SITE.instagramHandle}
        </a>
      </div>
    </div>
  )
}

/**
 * Feed de Elfsight aislado de React: React solo pinta un contenedor vacío (`hostRef`) y el nodo del widget se crea
 * y se retira a mano. Así React nunca reconcilia el DOM que manipula el tercero, y cualquier fallo de su script
 * (red, bloqueador, error interno de styled-components en producción…) solo cambia esta sección al enlace de
 * respaldo: nunca tira la página principal.
 */
function ElfsightFeed() {
  const hostRef = useRef(null)
  const [state, setState] = useState('loading') // loading | ready | unavailable

  useEffect(() => {
    const host = hostRef.current
    if (!host) return undefined
    const fail = () => setState('unavailable')

    let widget = null
    let script = null
    let observer = null
    let visibility = null
    let timer
    // Errores globales del script de terceros (no llegan a React ni a un try/catch: son asíncronos).
    const onWindowError = (event) => {
      if (isElfsightError(event?.filename, event?.message, event?.error?.stack)) fail()
    }
    const onRejection = (event) => {
      const reason = event?.reason
      if (isElfsightError('', reason?.message ?? String(reason ?? ''), reason?.stack)) fail()
    }
    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onRejection)

    try {
      widget = document.createElement('div')
      widget.className = ELFSIGHT_APP_CLASS
      widget.setAttribute('data-elfsight-app-lazy', '')
      host.appendChild(widget)

      script = loadElfsightScript()
      script?.addEventListener('error', fail)

      // Elfsight inyecta el feed dentro del contenedor: en cuanto aparece contenido, se oculta el esqueleto.
      const markReady = () => widget.childElementCount > 0 && setState((s) => (s === 'unavailable' ? s : 'ready'))
      observer = new MutationObserver(markReady)
      observer.observe(widget, { childList: true, subtree: true })
      markReady()

      // El widget es lazy: solo carga al entrar en pantalla; el plazo de espera cuenta desde ese momento.
      visibility = new IntersectionObserver(([entry]) => {
        if (!entry?.isIntersecting) return
        visibility.disconnect()
        timer = setTimeout(() => setState((s) => (s === 'loading' ? 'unavailable' : s)), FALLBACK_AFTER_MS)
      })
      visibility.observe(host)
    } catch (err) {
      console.error('[Instagram] No se pudo iniciar el feed:', err?.name, err?.message)
      fail()
    }

    return () => {
      window.removeEventListener('error', onWindowError)
      window.removeEventListener('unhandledrejection', onRejection)
      observer?.disconnect()
      visibility?.disconnect()
      clearTimeout(timer)
      script?.removeEventListener('error', fail)
      try {
        widget?.remove() // el nodo del tercero lo retiramos nosotros, no React
      } catch {
        /* nada que limpiar */
      }
    }
  }, [])

  return (
    <>
      {state === 'loading' && <FeedSkeleton />}
      {state === 'unavailable' && <FeedUnavailable />}
      {/* Contenedor siempre montado (vacío mide 0 px) para que la carga diferida de Elfsight detecte su entrada en
          pantalla. Si el widget falla, se oculta para que no quede a medias junto al enlace de respaldo. */}
      <div ref={hostRef} hidden={state === 'unavailable'} />
    </>
  )
}

export default function InstagramFeed() {
  const { consent } = useConsent()

  return (
    <section aria-labelledby="instagram-title" className="relative border-t border-white/5 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl px-4">
        <Reveal className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div className="max-w-2xl">
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary-400">Instagram</p>
            <h2 id="instagram-title" className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">
              Síguenos en Instagram{' '}
              <a
                href={SITE.instagramUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8a6cf0] bg-clip-text text-transparent hover:opacity-80"
              >
                ({SITE.instagramHandle})
              </a>
            </h2>
            <p className="mt-4 text-base leading-relaxed text-slate-400 sm:text-lg">
              Casos reales de campo, consejos agronómicos y novedades de la plataforma.
            </p>
          </div>
          <a
            href={SITE.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex h-12 shrink-0 items-center gap-2.5 whitespace-nowrap rounded-full bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#515bd4] px-6 text-sm font-semibold text-white shadow-lg shadow-[#dd2a7b]/20 transition-[transform,box-shadow] duration-200 ease-out hover:scale-[1.02] hover:shadow-[#dd2a7b]/35 active:scale-[0.96]"
          >
            <InstagramIcon /> Seguir en Instagram
          </a>
        </Reveal>

        <Reveal delay={100} className="mt-12">
          {/* Contenido de terceros: el script de Elfsight no se descarga sin consentimiento expreso. */}
          <ErrorBoundary name="instagram" fallback={<FeedUnavailable />}>
            {consent?.external ? <ElfsightFeed /> : <ConsentGate />}
          </ErrorBoundary>
        </Reveal>
      </div>
    </section>
  )
}
