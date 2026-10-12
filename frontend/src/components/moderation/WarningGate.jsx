import { useEffect, useRef, useState } from 'react'
import { getErrorMessage, usersApi } from '../../api.js'
import { useAuth } from '../../auth/AuthContext.jsx'

export const WARNING_TEXT =
  'Has recibido una advertencia oficial por incumplimiento de las normas de la comunidad. A la tercera falta la cuenta se suspende de forma permanente; las faltas caducan tras 72 horas sin infracciones.'

/**
 * Modal obligatorio de advertencia oficial. Mientras `pending_warning_ack` sea true, `showModal()` deja el resto
 * de la página inerte (sin clics, foco ni navegación) y no se puede cerrar con Esc ni haciendo clic fuera:
 * solo aceptando. El backend, además, rechaza nuevas publicaciones hasta que se acepte.
 */
export default function WarningGate() {
  const { user, setUser } = useAuth()
  const dialogRef = useRef(null)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)
  const pending = Boolean(user?.pending_warning_ack)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (pending && !dialog.open) dialog.showModal()
    if (!pending && dialog.open) dialog.close()
  }, [pending])

  async function acknowledge() {
    setSending(true)
    setError(null)
    try {
      setUser(await usersApi.acknowledgeWarning())
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  if (!user) return null

  return (
    <dialog
      ref={dialogRef}
      onCancel={(e) => e.preventDefault()} // Esc no cierra: la aceptación es obligatoria
      aria-labelledby="warning-title"
      aria-describedby="warning-text"
      className="dialog-animated w-[calc(100%-2rem)] max-w-lg rounded-3xl bg-slate-900 p-0 text-slate-200 shadow-overlay backdrop:bg-slate-950/90"
    >
      <div className="p-6 sm:p-8">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent-500/15 text-accent-300" aria-hidden="true">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
          </svg>
        </div>
        <h2 id="warning-title" className="mt-5 text-xl font-semibold text-white">Advertencia oficial</h2>
        <p id="warning-text" className="mt-3 text-sm leading-relaxed text-slate-300">{WARNING_TEXT}</p>
        <p className="mt-3 text-xs text-slate-500">
          Faltas vigentes: {user.warnings_count} de 3. Puedes consultar las normas en las{' '}
          <a href="/terminos" target="_blank" rel="noopener" className="underline underline-offset-2 hover:text-slate-300">condiciones de uso</a>.
        </p>
        {error && <p role="alert" className="mt-4 rounded-xl border border-accent-400/30 bg-accent-500/10 px-4 py-3 text-sm text-accent-100">{error}</p>}
        <button type="button" onClick={acknowledge} disabled={sending} className="btn-primary mt-6 h-12 w-full rounded-xl text-sm" autoFocus>
          {sending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" aria-hidden="true" />}
          He leído y acepto la advertencia
        </button>
      </div>
    </dialog>
  )
}
