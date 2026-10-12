import { AlertTriangle, X } from 'lucide-react'
import { useState } from 'react'
import { useAuth } from '../../auth/AuthContext.jsx'

const BAN_AT = 3

// Cerrar el aviso se recuerda solo en esta pestaña y para ESTE estado de faltas: una falta nueva lo vuelve a mostrar.
const storageKey = (user) => `strike-notice:${user.id}:${user.warnings_count}:${user.warnings_expire_at ?? ''}`
function readDismissed(key) {
  try {
    return sessionStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

/** Aviso en la parte superior del panel mientras la cuenta tiene faltas vigentes. El usuario puede cerrarlo. */
export default function StrikeNotice() {
  const { user } = useAuth()
  const key = user ? storageKey(user) : ''
  const [dismissed, setDismissed] = useState(null) // clave cerrada en esta sesión

  if (!user?.warnings_count || user.pending_warning_ack) return null // con advertencia sin aceptar manda el modal
  if (dismissed === key || readDismissed(key)) return null

  function dismiss() {
    try {
      sessionStorage.setItem(key, '1')
    } catch {
      /* almacenamiento no disponible: se cierra igualmente hasta recargar */
    }
    setDismissed(key)
  }

  const left = Math.max(0, BAN_AT - user.warnings_count)
  const expires = user.warnings_expire_at
    ? new Date(user.warnings_expire_at).toLocaleString('es-ES', { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div role="status" className="border-b border-accent-400/30 bg-accent-500/10">
      <div className="mx-auto flex max-w-6xl items-start gap-3 px-4 py-2.5 sm:px-6 lg:px-8">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-accent-300" aria-hidden="true" />
        <p className="flex-1 text-sm text-accent-100">
          <strong className="font-semibold">Advertencia vigente:</strong> tienes {user.warnings_count}{' '}
          {user.warnings_count === 1 ? 'falta' : 'faltas'} por incumplir las normas de la comunidad.{' '}
          {left === 1 ? 'Una más supondrá la suspensión permanente de la cuenta.' : `A la ${BAN_AT}.ª falta la cuenta se suspende de forma permanente.`}
          {expires && <> Si no hay nuevas infracciones, caducan el {expires}.</>}
        </p>
        <button type="button" onClick={dismiss} aria-label="Cerrar aviso" className="-mr-1 rounded-lg p-1 text-accent-200 transition-colors hover:bg-accent-500/20 hover:text-white">
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
