import { useState } from 'react'
import { forumApi, getErrorMessage, usersApi } from '../../api.js'

/**
 * Barra roja de herramientas de administración en cada mensaje (solo se muestra a `admin`; la API exige el rol).
 * Doble confirmación en el mismo sitio para evitar borrados o bloqueos accidentales.
 */
export default function AdminPostTools({ kind, postId, author, isSelf, onDeleted, onBanned }) {
  const [confirm, setConfirm] = useState(null) // delete | ban
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null) // { tone, text }

  async function run(action) {
    setBusy(true)
    setMessage(null)
    try {
      if (action === 'delete') {
        await forumApi.adminDelete(postId, kind)
        onDeleted?.()
        return
      }
      await usersApi.ban(author.id, reason.trim() || null)
      setMessage({ tone: 'ok', text: `${author.name} ha sido bloqueado. Todas sus peticiones se rechazan desde ahora.` })
      onBanned?.(author)
    } catch (err) {
      setMessage({ tone: 'error', text: getErrorMessage(err) })
    } finally {
      setBusy(false)
      setConfirm(null)
      setReason('')
    }
  }

  const btn = 'rounded-lg px-2.5 py-1 text-xs font-semibold transition-colors duration-300 disabled:opacity-50'
  return (
    <div className="mt-4 rounded-xl border border-red-500/30 bg-red-500/[0.07] px-3 py-2" role="group" aria-label="Herramientas de administrador">
      <div className="flex flex-wrap items-center gap-2">
        <span className="mr-auto text-[11px] font-bold uppercase tracking-wider text-red-300">Admin</span>
        {confirm === null && (
          <>
            <button type="button" onClick={() => setConfirm('delete')} className={`${btn} bg-red-500/15 text-red-200 hover:bg-red-500/25`}>
              Borrar mensaje
            </button>
            {!isSelf && (
              <button type="button" onClick={() => setConfirm('ban')} className={`${btn} bg-red-600 text-white hover:bg-red-500`}>
                Banear usuario
              </button>
            )}
          </>
        )}
        {confirm === 'delete' && (
          <>
            <span className="text-xs text-red-100">{kind === 'thread' ? '¿Borrar el tema completo con sus respuestas?' : '¿Borrar esta respuesta?'} No se puede deshacer.</span>
            <button type="button" disabled={busy} onClick={() => run('delete')} className={`${btn} bg-red-600 text-white hover:bg-red-500`}>Sí, borrar</button>
            <button type="button" disabled={busy} onClick={() => setConfirm(null)} className={`${btn} text-slate-300 hover:bg-white/10`}>Cancelar</button>
          </>
        )}
        {confirm === 'ban' && (
          <>
            <label htmlFor={`ban-${kind}-${postId}`} className="sr-only">Motivo del bloqueo</label>
            <input id={`ban-${kind}-${postId}`} autoFocus maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={`Motivo del bloqueo de ${author.name}`} className="min-w-[12rem] flex-1 rounded-lg border border-red-400/30 bg-slate-950/60 px-2.5 py-1 text-xs text-white placeholder:text-red-200/50 focus:border-red-300 focus:outline-none" />
            <button type="button" disabled={busy} onClick={() => run('ban')} className={`${btn} bg-red-600 text-white hover:bg-red-500`}>Confirmar bloqueo</button>
            <button type="button" disabled={busy} onClick={() => setConfirm(null)} className={`${btn} text-slate-300 hover:bg-white/10`}>Cancelar</button>
          </>
        )}
      </div>
      {message && <p role={message.tone === 'error' ? 'alert' : 'status'} className={`mt-1.5 text-xs ${message.tone === 'error' ? 'text-red-200' : 'text-primary-200'}`}>{message.text}</p>}
    </div>
  )
}
