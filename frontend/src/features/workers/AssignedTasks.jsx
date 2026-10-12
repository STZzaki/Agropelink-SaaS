import { KeyRound, LogOut, Paperclip } from 'lucide-react'
import { useState } from 'react'
import { assignedApi, getErrorMessage } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import Card from '../../components/ui/Card.jsx'
import FormField, { inputClass } from '../../components/ui/FormField.jsx'
import { LoadingBlock } from '../../components/ui/Spinner.jsx'
import useApi from '../../hooks/useApi.js'
import TaskDetail from '../tasks/TaskDetail.jsx'
import { StatusBadge } from '../tasks/taskStatus.jsx'
import { formatSpan, taskCategory, taskEnd, toISO } from '../tasks/taskMeta.js'

function RedeemForm({ onLinked }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const [done, setDone] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const clean = code.trim()
    if (clean.replace(/[^a-z0-9]/gi, '').length < 8) {
      setError('Introduce el código completo (10 caracteres).')
      return
    }
    setBusy(true)
    setError(null)
    try {
      const link = await assignedApi.redeem(clean)
      setDone(`Vinculado con ${link.employer_name}. Ya puedes ver tus tareas.`)
      setCode('')
      onLinked()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-wrap items-end gap-2">
      <FormField id="worker-code" label="Código de tu empleador" error={error} className="min-w-[12rem] flex-1">
        <input id="worker-code" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={32} autoComplete="off" spellCheck={false} placeholder="XXXXX-XXXXX" className={`${inputClass} font-mono tracking-[0.15em]`} aria-invalid={error ? true : undefined} aria-describedby={error ? 'worker-code-error' : undefined} />
      </FormField>
      <Button type="submit" loading={busy}><KeyRound className="h-4 w-4" aria-hidden="true" /> Vincular</Button>
      {done && <p role="status" className="basis-full text-sm text-primary-200">{done}</p>}
    </form>
  )
}

/** Portal del trabajador: vinculación por código y tareas asignadas (solo puede cambiar su estado). */
export default function AssignedTasks() {
  const links = useApi((signal) => assignedApi.links({ signal }))
  const tasks = useApi((signal) => assignedApi.tasks({ from: toISO(new Date(Date.now() - 30 * 86_400_000)) }, { signal }))
  const [open, setOpen] = useState(null)
  const [error, setError] = useState(null)

  const reload = () => { links.reload(); tasks.reload() }
  const replace = (task) => {
    tasks.setData((list) => (list ?? []).map((t) => (t.id === task.id ? task : t)))
    setOpen(task)
  }
  async function leave(workerId) {
    setError(null)
    try {
      await assignedApi.leave(workerId)
      reload()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const linked = links.data ?? []
  const today = toISO(new Date())
  const list = (tasks.data ?? []).slice().sort((a, b) => (a.status === 'done') - (b.status === 'done') || a.date.localeCompare(b.date))

  return (
    <Card title="Mis tareas asignadas">
      {links.loading && !links.data ? (
        <LoadingBlock label="Cargando…" />
      ) : (
        <div className="space-y-5">
          {error && <Alert variant="error">{error}</Alert>}
          {linked.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="Empleadores vinculados">
              {linked.map((l) => (
                <li key={l.worker_id} className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] py-1 pl-3 pr-1 text-xs text-slate-300 ring-1 ring-inset ring-white/10">
                  Trabajas para <span className="font-semibold text-white">{l.employer_name}</span>
                  <button type="button" onClick={() => leave(l.worker_id)} aria-label={`Desvincularme de ${l.employer_name}`} title="Desvincularme" className="rounded-full p-1 text-slate-400 hover:bg-white/10 hover:text-white"><LogOut className="h-3.5 w-3.5" aria-hidden="true" /></button>
                </li>
              ))}
            </ul>
          )}

          {linked.length > 0 && (
            tasks.loading && !tasks.data ? <LoadingBlock label="Cargando tareas…" /> : tasks.error ? <Alert variant="error" onRetry={tasks.reload}>{tasks.error}</Alert> : list.length === 0 ? (
              <p className="text-sm text-slate-400">No tienes tareas asignadas ahora mismo.</p>
            ) : (
              <ul className="divide-y divide-white/[0.06]">
                {list.map((t) => {
                  const cat = taskCategory(t.category)
                  const late = t.status !== 'done' && taskEnd(t) < today
                  return (
                    <li key={t.id}>
                      <button type="button" onClick={() => setOpen(t)} className="flex w-full items-start gap-3 py-3 text-left hover:bg-white/[0.02]">
                        <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: cat.color }} aria-hidden="true" />
                        <span className="min-w-0 flex-1">
                          <span className={`block font-semibold ${t.status === 'done' ? 'text-slate-400 line-through' : 'text-slate-100'}`}>{t.title}</span>
                          <span className="block text-xs text-slate-400">
                            {cat.label} · {formatSpan(t)} · {t.farm_name}{late && <span className="font-semibold text-accent-200"> · con retraso</span>}
                            {t.attachments.length > 0 && <span className="ml-1 inline-flex items-center gap-0.5"><Paperclip className="h-3 w-3" aria-hidden="true" />{t.attachments.length}</span>}
                          </span>
                        </span>
                        <StatusBadge status={t.status} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )
          )}

          <div className={linked.length ? 'border-t border-white/[0.06] pt-4' : ''}>
            <p className="mb-3 text-sm text-slate-400">
              {linked.length ? '¿Trabajas también para otro agricultor? Introduce su código.' : '¿Trabajas en una explotación que usa Agropelink? Pide a tu responsable el código de vinculación para ver aquí tus tareas.'}
            </p>
            <RedeemForm onLinked={reload} />
          </div>
        </div>
      )}

      <TaskDetail
        task={open}
        farmName={open?.farm_name}
        worker={null}
        readOnly
        attachmentUrl={assignedApi.attachmentUrl}
        onStatus={(task, status) => assignedApi.setStatus(task.id, status)}
        onChanged={replace}
        onClose={() => setOpen(null)}
      />
    </Card>
  )
}
