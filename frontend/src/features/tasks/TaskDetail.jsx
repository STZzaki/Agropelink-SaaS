import { CalendarDays, FileText, MapPin, Paperclip, Trash2, User, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getErrorMessage, tasksApi } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import { money } from '../economy/economyMeta.js'
import { checkAttachment } from './TaskForm.jsx'
import { TASK_STATUS } from './taskStatus.jsx'
import { formatSpan, positionLabel, taskCategory } from './taskMeta.js'

const STATUSES = ['pending', 'in_progress', 'done']

/**
 * Ficha de una tarea (diálogo nativo: foco atrapado, Esc para cerrar). `readOnly` + `attachmentUrl` permiten
 * reutilizarla en el portal del trabajador, que solo cambia el estado.
 */
export default function TaskDetail({ task, farmName, worker, onClose, onChanged, onDeleted, onStatus, attachmentUrl = tasksApi.attachmentUrl, readOnly = false }) {
  const dialogRef = useRef(null)
  const fileRef = useRef(null)
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (task && dialog && !dialog.open) {
      setError(null)
      setConfirmDelete(false)
      dialog.showModal()
    }
    if (!task && dialog?.open) dialog.close()
  }, [task])

  async function run(key, action) {
    setBusy(key)
    setError(null)
    try {
      await action()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  async function upload(list) {
    for (const file of [...list]) {
      const problem = checkAttachment(file)
      if (problem) {
        setError(problem)
        continue
      }
      await run('upload', async () => onChanged(await tasksApi.addAttachment(task.id, file)))
    }
  }

  const cat = task ? taskCategory(task.category) : null
  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()}
      aria-labelledby="task-detail-title"
      className="dialog-animated w-[calc(100%-2rem)] max-w-2xl rounded-3xl bg-slate-900 p-0 text-slate-200 shadow-overlay backdrop:bg-slate-950/85"
    >
      {task && (
        <div className="max-h-[85vh] overflow-y-auto p-6 sm:p-8" data-lenis-prevent>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold" style={{ color: cat.color }}>
                <span className="h-2.5 w-2.5 rounded-sm" style={{ background: cat.color }} aria-hidden="true" />{cat.label}
              </p>
              <h2 id="task-detail-title" className="mt-1 text-xl font-semibold text-white">{task.title}</h2>
            </div>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>

          <dl className="mt-4 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div className="flex items-center gap-2 text-slate-300"><CalendarDays className="h-4 w-4 text-slate-500" aria-hidden="true" /><dt className="sr-only">Periodo</dt><dd>{formatSpan(task)}</dd></div>
            {farmName && <div className="flex items-center gap-2 text-slate-300"><MapPin className="h-4 w-4 text-slate-500" aria-hidden="true" /><dt className="sr-only">Granja</dt><dd>{farmName}</dd></div>}
            <div className="flex items-center gap-2 text-slate-300"><User className="h-4 w-4 text-slate-500" aria-hidden="true" /><dt className="sr-only">Asignada a</dt><dd>{worker ? `${worker.name} · ${positionLabel(worker.position)}` : 'Sin asignar'}</dd></div>
            {!readOnly && task.direct_cost > 0 && <div className="flex items-center gap-2 text-slate-300"><dt className="text-slate-500">Gastos directos</dt><dd className="font-semibold tabular-nums text-white">{money(task.direct_cost)}</dd></div>}
          </dl>

          <div className="mt-5" role="group" aria-label="Estado de la tarea">
            <div className="inline-flex gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/10">
              {STATUSES.map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={task.status === s}
                  disabled={busy !== null}
                  onClick={() => task.status !== s && run('status', async () => onChanged(await (onStatus ? onStatus(task, s) : tasksApi.update(task.id, { status: s }))))}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-300 ${task.status === s ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                  {TASK_STATUS[s].label}
                </button>
              ))}
            </div>
          </div>

          {task.description && <p className="mt-5 whitespace-pre-line text-sm leading-relaxed text-slate-300">{task.description}</p>}

          <section className="mt-6" aria-labelledby="task-files-title">
            <div className="mb-2 flex items-center justify-between">
              <h3 id="task-files-title" className="text-sm font-semibold text-slate-200">Fotos y archivos <span className="font-normal text-slate-500">({task.attachments.length})</span></h3>
              {!readOnly && task.attachments.length < 10 && (
                <Button variant="outline" loading={busy === 'upload'} onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" aria-hidden="true" /> Adjuntar</Button>
              )}
            </div>
            <input ref={fileRef} type="file" multiple accept="image/png,image/jpeg,image/webp,application/pdf" className="sr-only" tabIndex={-1} onChange={(e) => { upload(e.target.files ?? []); e.target.value = '' }} />
            {task.attachments.length === 0 ? (
              <p className="text-sm text-slate-500">Sin adjuntos.</p>
            ) : (
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                {task.attachments.map((a) => (
                  <li key={a.id} className="group relative overflow-hidden rounded-xl bg-white/[0.03] ring-1 ring-inset ring-white/[0.08]">
                    <a href={attachmentUrl(task.id, a.id)} target="_blank" rel="noopener noreferrer" className="block">
                      {a.kind === 'image' ? (
                        <img src={attachmentUrl(task.id, a.id)} alt={a.original_name} loading="lazy" className="aspect-[4/3] w-full object-cover" />
                      ) : (
                        <span className="flex aspect-[4/3] w-full flex-col items-center justify-center gap-1 text-slate-400"><FileText className="h-8 w-8" aria-hidden="true" /><span className="text-[11px]">PDF</span></span>
                      )}
                      <span className="block truncate px-2 py-1.5 text-[11px] text-slate-400" title={a.original_name}>{a.original_name}</span>
                    </a>
                    {!readOnly && (
                      <button type="button" onClick={() => run(`att-${a.id}`, async () => { await tasksApi.removeAttachment(task.id, a.id); onChanged({ ...task, attachments: task.attachments.filter((x) => x.id !== a.id) }) })} aria-label={`Quitar ${a.original_name}`} className="absolute right-1.5 top-1.5 rounded-lg bg-slate-950/70 p-1 text-slate-300 opacity-0 transition-opacity hover:text-red-200 focus:opacity-100 group-hover:opacity-100">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {error && <div className="mt-4"><Alert variant="error">{error}</Alert></div>}

          {!readOnly && (
            <div className="mt-6 flex justify-end border-t border-white/[0.06] pt-4">
              {confirmDelete ? (
                <div className="flex flex-wrap items-center justify-end gap-2 text-xs text-slate-300">
                  ¿Eliminar la tarea y sus adjuntos? Sus gastos se conservan en Economía.
                  <Button variant="danger" loading={busy === 'delete'} onClick={() => run('delete', async () => { await tasksApi.remove(task.id); onDeleted(task); dialogRef.current?.close() })}>Eliminar</Button>
                  <Button variant="outline" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
                </div>
              ) : (
                <button type="button" onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-400 hover:bg-red-500/10 hover:text-red-200"><Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Eliminar tarea</button>
              )}
            </div>
          )}
        </div>
      )}
    </dialog>
  )
}
