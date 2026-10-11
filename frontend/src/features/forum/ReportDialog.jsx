import { useEffect, useRef, useState } from 'react'
import { forumApi, getErrorMessage } from '../../api.js'
import { Flag } from 'lucide-react'

const REASONS = [
  { id: 'spam', label: 'Spam' },
  { id: 'insults', label: 'Falta de respeto / Insultos' },
  { id: 'inappropriate', label: 'Contenido inapropiado' },
]

/** Denuncia de una publicación: crea un ticket para el equipo de moderación. `target`: { threadId, replyId?, author }. */
export default function ReportDialog({ target, onClose }) {
  const dialogRef = useRef(null)
  const [reason, setReason] = useState('')
  const [details, setDetails] = useState('')
  const [state, setState] = useState('idle') // idle | sending | sent
  const [error, setError] = useState(null)

  useEffect(() => {
    const dialog = dialogRef.current
    if (target && dialog && !dialog.open) {
      setReason('')
      setDetails('')
      setState('idle')
      setError(null)
      dialog.showModal()
    }
    if (!target && dialog?.open) dialog.close()
  }, [target])

  async function handleSubmit(e) {
    e.preventDefault()
    if (!reason) {
      setError('Elige un motivo.')
      return
    }
    setState('sending')
    setError(null)
    try {
      await forumApi.report({ thread_id: target.threadId, reply_id: target.replyId ?? null, reason, details: details.trim() || null })
      setState('sent')
    } catch (err) {
      setError(getErrorMessage(err))
      setState('idle')
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()}
      aria-labelledby="report-title"
      className="dialog-animated w-[calc(100%-2rem)] max-w-lg rounded-3xl bg-slate-900 p-0 text-slate-200 shadow-overlay backdrop:bg-slate-950/85"
    >
      {state === 'sent' ? (
        <div className="p-6 sm:p-8" role="status">
          <h2 id="report-title" className="text-xl font-semibold text-white">Denuncia enviada</h2>
          <p className="mt-2 text-sm text-slate-400">Gracias por ayudar a mantener el foro útil y respetuoso. El equipo de moderación la revisará.</p>
          <div className="mt-6 flex justify-end">
            <button type="button" onClick={() => dialogRef.current?.close()} className="btn-primary h-11 px-6 text-sm">Cerrar</button>
          </div>
        </div>
      ) : (
        <form onSubmit={handleSubmit} noValidate className="p-6 sm:p-8">
          <h2 id="report-title" className="flex items-center gap-2 text-xl font-semibold text-white"><Flag className="h-5 w-5 text-accent-300" aria-hidden="true" /> Reportar publicación</h2>
          {target && <p className="mt-1 text-sm text-slate-400">Publicación de {target.author}.</p>}

          <fieldset className="mt-5">
            <legend className="mb-2 text-sm font-medium text-slate-300">Motivo</legend>
            <div className="space-y-2">
              {REASONS.map((r) => (
                <label key={r.id} className={`flex cursor-pointer items-center gap-3 rounded-xl px-4 py-2.5 text-sm transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-secondary-400 ${reason === r.id ? 'bg-secondary-500/10 text-white shadow-[0_0_0_1px_rgb(75_194_168_/_0.45)]' : 'text-slate-400 shadow-surface-sm hover:bg-white/[0.04] hover:text-slate-200'}`}>
                  <input type="radio" name="report-reason" value={r.id} checked={reason === r.id} onChange={() => { setReason(r.id); setError(null) }} className="sr-only" />
                  {r.label}
                </label>
              ))}
            </div>
          </fieldset>

          <label htmlFor="report-details" className="mt-5 mb-1.5 flex justify-between text-sm font-medium text-slate-300">
            Motivo breve <span className="text-xs font-normal text-slate-500">opcional · {details.length}/500</span>
          </label>
          <textarea id="report-details" rows={3} maxLength={500} value={details} onChange={(e) => setDetails(e.target.value)} className="field resize-y" />

          {error && <p role="alert" className="mt-4 rounded-xl border border-accent-400/30 bg-accent-500/10 px-4 py-3 text-sm text-accent-100">{error}</p>}

          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button type="button" onClick={() => dialogRef.current?.close()} className="btn-secondary h-11 px-6 text-sm text-slate-200">Cancelar</button>
            <button type="submit" disabled={state === 'sending'} className="btn-primary h-11 px-6 text-sm">
              {state === 'sending' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" aria-hidden="true" />}
              Enviar denuncia
            </button>
          </div>
        </form>
      )}
    </dialog>
  )
}
