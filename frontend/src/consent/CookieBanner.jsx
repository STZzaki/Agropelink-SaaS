import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { CONSENT_CATEGORIES, useConsent } from './ConsentContext.jsx'

function Toggle({ id, checked, disabled, onChange, label }) {
  return (
    <button
      id={id}
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400 disabled:cursor-not-allowed disabled:opacity-60 ${
        checked ? 'bg-secondary-500' : 'bg-white/15'
      }`}
    >
      <span className={`inline-block h-5 w-5 rounded-full bg-white shadow transition-transform ${checked ? 'translate-x-5' : 'translate-x-0.5'}`} />
    </button>
  )
}

/**
 * Banner de consentimiento. "Rechazar" y "Aceptar" tienen el mismo peso visual (criterio AEPD)
 * y la configuración por categorías está a un clic. Se puede reabrir desde el pie ("Configurar cookies").
 */
export default function CookieBanner() {
  const { consent, hasDecided, acceptAll, rejectAll, save, settingsOpen, openSettings, closeSettings } = useConsent()
  const [draft, setDraft] = useState({ analytics: false, external: false })
  const panelRef = useRef(null)

  const showSettings = settingsOpen
  const visible = !hasDecided || settingsOpen

  useEffect(() => {
    if (showSettings) {
      setDraft({ analytics: consent?.analytics ?? false, external: consent?.external ?? false })
      panelRef.current?.focus()
    }
  }, [showSettings, consent])

  if (!visible) return null

  const btn = 'inline-flex h-10 flex-1 items-center justify-center rounded-full px-3 text-xs font-semibold transition-colors sm:h-11 sm:flex-none sm:px-5 sm:text-sm'

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-[70] p-2 sm:p-5">
      <section
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="false"
        aria-labelledby="cookie-title"
        aria-describedby="cookie-desc"
        className="pointer-events-auto mx-auto max-w-3xl rounded-3xl border border-white/10 bg-slate-900/[0.98] text-slate-200 shadow-2xl shadow-black/60 focus:outline-none motion-ok:animate-[fade-up_300ms_ease-out_both] max-h-[85dvh] overflow-y-auto p-4 sm:p-6"
      >
        <h2 id="cookie-title" className="text-sm font-semibold text-white sm:text-base">
          {showSettings ? 'Configurar cookies' : 'Tu privacidad, tu decisión'}
        </h2>
        <p id="cookie-desc" className="mt-1.5 text-xs leading-relaxed text-slate-400 sm:mt-2 sm:text-sm">
          Usamos cookies necesarias para que la plataforma funcione y, con tu permiso, analítica y contenido de
          terceros (Instagram).<span className="hidden sm:inline"> Puedes cambiar tu elección cuando quieras desde «Configurar cookies» al pie de la página.</span>{' '}
          <Link to="/privacidad#cookies" className="font-medium text-slate-200 underline underline-offset-2">Más información</Link>
        </p>

        {showSettings && (
          <ul className="mt-5 space-y-3">
            {CONSENT_CATEGORIES.map((cat) => {
              const checked = cat.locked ? true : draft[cat.id]
              return (
                <li key={cat.id} className="flex items-start justify-between gap-4 rounded-2xl border border-white/10 bg-white/[0.03] p-4">
                  <div>
                    <label htmlFor={`consent-${cat.id}`} className="text-sm font-semibold text-white">
                      {cat.label} {cat.locked && <span className="ml-1 text-xs font-normal text-slate-500">(siempre activas)</span>}
                    </label>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{cat.description}</p>
                  </div>
                  <Toggle
                    id={`consent-${cat.id}`}
                    label={cat.label}
                    checked={checked}
                    disabled={cat.locked}
                    onChange={(v) => setDraft((d) => ({ ...d, [cat.id]: v }))}
                  />
                </li>
              )
            })}
          </ul>
        )}

        <div className="mt-3 flex flex-wrap gap-2 sm:mt-5 sm:justify-end">
          {showSettings ? (
            <>
              {hasDecided && (
                <button type="button" onClick={closeSettings} className={`${btn} text-slate-400 hover:text-white`}>
                  Cancelar
                </button>
              )}
              <button type="button" onClick={() => save(draft)} className={`${btn} border border-white/15 text-white hover:bg-white/5`}>
                Guardar selección
              </button>
              <button type="button" onClick={acceptAll} className={`${btn} bg-white text-slate-950 hover:bg-slate-200`}>
                Aceptar todas
              </button>
            </>
          ) : (
            <>
              <button type="button" onClick={openSettings} className={`${btn} text-slate-300 underline-offset-2 hover:text-white hover:underline`}>
                Configurar
              </button>
              <button type="button" onClick={rejectAll} className={`${btn} border border-white/20 bg-white/5 text-white hover:bg-white/10`}>
                Rechazar
              </button>
              <button type="button" onClick={acceptAll} className={`${btn} border border-white/20 bg-white/5 text-white hover:bg-white/10`}>
                Aceptar
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  )
}

/** Enlace para reabrir la configuración (pie de página). */
export function CookieSettingsLink({ className = '' }) {
  const { openSettings } = useConsent()
  return (
    <button type="button" onClick={openSettings} className={className}>
      Configurar cookies
    </button>
  )
}
