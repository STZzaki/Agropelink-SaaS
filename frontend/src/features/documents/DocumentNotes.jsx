import { BellRing, Check, Pencil, RotateCcw, Trash2 } from 'lucide-react'
import { useId, useState } from 'react'
import { documentsApi, getErrorMessage } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import { inputClass } from '../../components/ui/FormField.jsx'
import { LoadingBlock } from '../../components/ui/Spinner.jsx'
import useApi from '../../hooks/useApi.js'

const MAX = 2000
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}
const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

/** Texto + fecha opcional. Se usa para crear y para editar una nota. */
function NoteForm({ initial = { body: '', remind_on: '' }, submitLabel, onSubmit, onCancel }) {
  const id = useId()
  const [body, setBody] = useState(initial.body)
  const [remindOn, setRemindOn] = useState(initial.remind_on ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    if (!body.trim()) return setError('Escribe la nota.')
    setBusy(true)
    setError(null)
    try {
      await onSubmit({ body: body.trim(), remind_on: remindOn || null })
      if (!onCancel) {
        setBody('')
        setRemindOn('')
      }
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-2">
      <label htmlFor={`${id}-body`} className="sr-only">Texto de la nota</label>
      <textarea id={`${id}-body`} rows={3} maxLength={MAX} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Ej.: llamar al proveedor para el abono; pagar antes del día 30…" className={`${inputClass} resize-y`} aria-invalid={error ? true : undefined} />
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${id}-date`} className="inline-flex items-center gap-1.5 text-xs text-slate-400"><BellRing className="h-3.5 w-3.5" aria-hidden="true" /> Recordarme el</label>
        <input id={`${id}-date`} type="date" value={remindOn} min={initial.remind_on ? undefined : todayISO()} onChange={(e) => setRemindOn(e.target.value)} className={`${inputClass} !w-auto py-1.5`} />
        {remindOn && <button type="button" onClick={() => setRemindOn('')} className="text-xs text-slate-400 hover:text-white">Sin fecha</button>}
        <span className="ml-auto text-[11px] tabular-nums text-slate-500">{body.length}/{MAX}</span>
        {onCancel && <Button variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>}
        <Button type="submit" loading={busy}>{submitLabel}</Button>
      </div>
      {error && <p role="alert" className="text-xs font-medium text-accent-300">{error}</p>}
    </form>
  )
}

/** Notas personales de un documento (recordatorios con fecha opcional). Solo las ve el titular. */
export default function DocumentNotes({ document, onChanged }) {
  // También se recarga si el resumen de la fila cambia desde fuera (p. ej. «Hecho» en el panel de recordatorios).
  const notes = useApi((signal) => documentsApi.notes(document.id, { signal }), [document.id, document.note_count, document.next_reminder])
  const [editing, setEditing] = useState(null)
  const [error, setError] = useState(null)
  const today = todayISO()

  async function run(action) {
    setError(null)
    try {
      await action()
      notes.reload()
      onChanged()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const list = notes.data ?? []
  return (
    <section aria-label={`Notas de ${document.reference}`} className="rounded-xl bg-white/[0.02] p-4 ring-1 ring-inset ring-white/[0.06]">
      {notes.loading && !notes.data ? (
        <LoadingBlock label="Cargando notas…" />
      ) : notes.error ? (
        <Alert variant="error" onRetry={notes.reload}>{notes.error}</Alert>
      ) : (
        <>
          {list.length > 0 && (
            <ul className="mb-4 space-y-2">
              {list.map((n) => {
                const overdue = !n.done && n.remind_on && n.remind_on < today
                return (
                  <li key={n.id} className={`rounded-lg px-3 py-2.5 ${n.done ? 'bg-white/[0.02]' : 'bg-white/[0.04]'}`}>
                    {editing === n.id ? (
                      <NoteForm initial={{ body: n.body, remind_on: n.remind_on ?? '' }} submitLabel="Guardar" onCancel={() => setEditing(null)}
                        onSubmit={async (payload) => { await documentsApi.updateNote(document.id, n.id, payload); setEditing(null); notes.reload(); onChanged() }} />
                    ) : (
                      <div className="flex items-start gap-3">
                        <div className="min-w-0 flex-1">
                          <p className={`whitespace-pre-line break-words text-sm ${n.done ? 'text-slate-500 line-through' : 'text-slate-200'}`}>{n.body}</p>
                          <p className="mt-1 text-[11px] text-slate-500">
                            {n.remind_on && (
                              <span className={`mr-2 inline-flex items-center gap-1 font-semibold ${n.done ? '' : overdue ? 'text-accent-200' : 'text-secondary-200'}`}>
                                <BellRing className="h-3 w-3" aria-hidden="true" />{overdue ? 'Vencido · ' : ''}{day(n.remind_on)}
                              </span>
                            )}
                            Actualizada {new Date(n.updated_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-0.5">
                          <button type="button" onClick={() => run(() => documentsApi.updateNote(document.id, n.id, { done: !n.done }))} aria-label={n.done ? 'Marcar como pendiente' : 'Marcar como hecha'} title={n.done ? 'Reabrir' : 'Hecha'}
                            className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-primary-200">
                            {n.done ? <RotateCcw className="h-4 w-4" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}
                          </button>
                          <button type="button" onClick={() => setEditing(n.id)} aria-label="Editar nota" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                          <button type="button" onClick={() => run(() => documentsApi.removeNote(document.id, n.id))} aria-label="Borrar nota" className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-200"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                        </div>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          {error && <div className="mb-3"><Alert variant="error">{error}</Alert></div>}
          {list.length < 50 && (
            <NoteForm submitLabel="Guardar nota" onSubmit={async (payload) => { await documentsApi.addNote(document.id, payload); notes.reload(); onChanged() }} />
          )}
        </>
      )}
    </section>
  )
}
