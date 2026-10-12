import { Copy, KeyRound, Link2Off, Pencil, Plus, Trash2, UserCheck } from 'lucide-react'
import { useState } from 'react'
import { getErrorMessage, workersApi } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import FormField, { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import { LoadingBlock } from '../../components/ui/Spinner.jsx'
import { money, parseAmount } from '../economy/economyMeta.js'
import { WEEKDAYS, WORKER_POSITIONS, positionLabel } from '../tasks/taskMeta.js'

const EMPTY = { name: '', position: 'laborer', monthly_salary: '', hourly_cost: '', days: ['mon', 'tue', 'wed', 'thu', 'fri'], start: '08:00', end: '15:00', active: true }

const toForm = (w) => ({
  name: w.name,
  position: w.position,
  monthly_salary: w.monthly_salary ?? '',
  hourly_cost: w.hourly_cost ?? '',
  days: w.schedule?.days ?? [],
  start: w.schedule?.start ?? '08:00',
  end: w.schedule?.end ?? '15:00',
  active: w.active,
})

function WorkerForm({ worker, onSaved, onCancel }) {
  const [v, setV] = useState(worker ? toForm(worker) : EMPTY)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState(null)
  const set = (k) => (e) => setV((x) => ({ ...x, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }))
  const toggleDay = (d) => setV((x) => ({ ...x, days: x.days.includes(d) ? x.days.filter((y) => y !== d) : [...x.days, d] }))

  async function submit(e) {
    e.preventDefault()
    const salary = parseAmount(v.monthly_salary)
    const hourly = parseAmount(v.hourly_cost)
    const found = {}
    if (!v.name.trim()) found.name = 'Indica el nombre.'
    if (salary !== null && !(salary >= 0)) found.monthly_salary = 'Importe no válido.'
    if (hourly !== null && !(hourly >= 0)) found.hourly_cost = 'Importe no válido.'
    if (v.days.length && v.end <= v.start) found.end = 'Debe ser posterior a la entrada.'
    setErrors(found)
    if (Object.keys(found).length) return
    setBusy(true)
    setServerError(null)
    const payload = {
      name: v.name.trim(),
      position: v.position,
      monthly_salary: salary,
      hourly_cost: hourly,
      // Orden natural de la semana, sea cual sea el orden de clic.
      schedule: v.days.length ? { days: WEEKDAYS.map((d) => d.id).filter((d) => v.days.includes(d)), start: v.start, end: v.end } : null,
      active: v.active,
    }
    try {
      onSaved(worker ? await workersApi.update(worker.id, payload) : await workersApi.create(payload))
    } catch (err) {
      setServerError(getErrorMessage(err))
      setBusy(false)
    }
  }

  const aria = (k) => ({ 'aria-invalid': errors[k] ? true : undefined, 'aria-describedby': errors[k] ? `wk-${k}-error` : undefined })
  return (
    <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 rounded-2xl bg-white/[0.02] p-4 ring-1 ring-inset ring-secondary-400/20 sm:grid-cols-4">
      <FormField id="wk-name" label="Nombre" error={errors.name} className="sm:col-span-2">
        <input id="wk-name" value={v.name} onChange={set('name')} maxLength={100} className={inputClass} {...aria('name')} />
      </FormField>
      <FormField id="wk-position" label="Puesto" className="sm:col-span-2">
        <select id="wk-position" value={v.position} onChange={set('position')} className={inputClass}>
          {WORKER_POSITIONS.map((p) => <option className={optionClass} key={p.id} value={p.id}>{p.label}</option>)}
        </select>
      </FormField>
      <FormField id="wk-monthly_salary" label="Sueldo mensual (€)" error={errors.monthly_salary} className="sm:col-span-2">
        <input id="wk-monthly_salary" value={v.monthly_salary} onChange={set('monthly_salary')} inputMode="decimal" placeholder="1.450,00" className={inputClass} {...aria('monthly_salary')} />
      </FormField>
      <FormField id="wk-hourly_cost" label="Coste por hora (€)" error={errors.hourly_cost} className="sm:col-span-2">
        <input id="wk-hourly_cost" value={v.hourly_cost} onChange={set('hourly_cost')} inputMode="decimal" placeholder="13,50" className={inputClass} {...aria('hourly_cost')} />
      </FormField>
      <fieldset className="sm:col-span-4">
        <legend className="mb-1.5 text-sm font-medium text-slate-300">Horario</legend>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-1" role="group" aria-label="Días laborables">
            {WEEKDAYS.map((d) => (
              <button key={d.id} type="button" aria-pressed={v.days.includes(d.id)} aria-label={d.label} title={d.label} onClick={() => toggleDay(d.id)}
                className={`h-9 w-9 rounded-lg text-xs font-semibold ring-1 ring-inset transition-colors duration-200 ${v.days.includes(d.id) ? 'bg-secondary-500/20 text-secondary-100 ring-secondary-400/40' : 'text-slate-400 ring-white/10 hover:bg-white/5'}`}>
                {d.short}
              </button>
            ))}
          </div>
          <div>
            <label htmlFor="wk-start" className="mb-1 block text-[11px] text-slate-400">Entrada</label>
            <input id="wk-start" type="time" value={v.start} onChange={set('start')} className={`${inputClass} !w-28`} />
          </div>
          <div>
            <label htmlFor="wk-end" className="mb-1 block text-[11px] text-slate-400">Salida</label>
            <input id="wk-end" type="time" value={v.end} onChange={set('end')} className={`${inputClass} !w-28`} {...aria('end')} />
          </div>
        </div>
        {errors.end && <p id="wk-end-error" className="field-error mt-1 text-xs font-medium text-accent-300">{errors.end}</p>}
      </fieldset>
      <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-slate-300 sm:col-span-2">
        <input type="checkbox" checked={v.active} onChange={set('active')} className="h-4 w-4 rounded accent-secondary-400" /> En activo
      </label>
      <div className="flex justify-end gap-2 sm:col-span-2">
        <Button variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>
        <Button type="submit" loading={busy}>{worker ? 'Guardar' : 'Dar de alta'}</Button>
      </div>
      {serverError && <div className="sm:col-span-4"><Alert variant="error">{serverError}</Alert></div>}
    </form>
  )
}

const scheduleText = (s) => {
  if (!s) return 'Sin horario'
  const days = WEEKDAYS.filter((d) => s.days.includes(d.id)).map((d) => d.short).join(' ')
  return `${days} · ${s.start}–${s.end}`
}

/** Equipo del agricultor: alta y edición, coste y horario, y vinculación con la cuenta del trabajador. */
export default function WorkersPanel({ workers, loading, error, onReload }) {
  const [editing, setEditing] = useState(null) // id | 'new'
  const [invite, setInvite] = useState(null) // { workerId, code, expires_at }
  const [confirm, setConfirm] = useState(null)
  const [busyError, setBusyError] = useState(null)
  const [copied, setCopied] = useState(false)

  async function run(action) {
    setBusyError(null)
    try {
      await action()
      onReload()
    } catch (err) {
      setBusyError(getErrorMessage(err))
    }
  }

  async function makeInvite(w) {
    setBusyError(null)
    try {
      setInvite({ workerId: w.id, ...(await workersApi.invite(w.id)) })
      setCopied(false)
      onReload()
    } catch (err) {
      setBusyError(getErrorMessage(err))
    }
  }

  if (loading && !workers) return <LoadingBlock label="Cargando equipo…" />
  if (error) return <Alert variant="error" onRetry={onReload}>{error}</Alert>
  const list = workers ?? []

  return (
    <div className="space-y-4">
      <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
        <p className="max-w-2xl text-sm text-slate-400">
          Cada trabajador puede ver en su portal las tareas que le asignes: genera un código y que lo introduzca en su cuenta de Agropelink. Nunca verá costes ni sueldos.
        </p>
        {editing !== 'new' && <Button variant="secondary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" /> Trabajador</Button>}
      </div>
      {busyError && <Alert variant="error">{busyError}</Alert>}
      {editing === 'new' && <WorkerForm onSaved={() => { setEditing(null); onReload() }} onCancel={() => setEditing(null)} />}

      {list.length === 0 && editing !== 'new' ? (
        <p className="rounded-xl border border-dashed border-white/15 px-6 py-8 text-center text-sm text-slate-400">Aún no has dado de alta a tu equipo.</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {list.map((w) =>
            editing === w.id ? (
              <li key={w.id} className="lg:col-span-2"><WorkerForm worker={w} onSaved={() => { setEditing(null); onReload() }} onCancel={() => setEditing(null)} /></li>
            ) : (
              <li key={w.id} className={`rounded-2xl bg-white/[0.03] p-4 shadow-surface-sm ${w.active ? '' : 'opacity-60'}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">{w.name}{!w.active && <span className="ml-2 text-xs font-normal text-slate-500">(inactivo)</span>}</p>
                    <p className="text-xs text-slate-400">{positionLabel(w.position)} · {w.open_tasks} {w.open_tasks === 1 ? 'tarea abierta' : 'tareas abiertas'}</p>
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditing(w.id)} aria-label={`Editar ${w.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                    {confirm === w.id ? (
                      <span className="inline-flex gap-1">
                        <button type="button" onClick={() => run(() => workersApi.remove(w.id))} className="rounded-lg bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/30">Borrar</button>
                        <button type="button" onClick={() => setConfirm(null)} className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/10">No</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirm(w.id)} aria-label={`Borrar ${w.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-200"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    )}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-slate-500">Sueldo</dt><dd className="tabular-nums text-slate-200">{w.monthly_salary !== null ? `${money(w.monthly_salary)}/mes` : '—'}</dd></div>
                  <div><dt className="text-slate-500">Coste/hora</dt><dd className="tabular-nums text-slate-200">{w.hourly_cost !== null ? money(w.hourly_cost) : '—'}</dd></div>
                  <div><dt className="text-slate-500">Horario</dt><dd className="text-slate-200">{scheduleText(w.schedule)}</dd></div>
                </dl>
                <div className="mt-3 border-t border-white/[0.06] pt-3 text-xs">
                  {w.linked ? (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="inline-flex items-center gap-1.5 text-primary-200"><UserCheck className="h-4 w-4" aria-hidden="true" /> Vinculado con la cuenta de {w.linked_account_name}</span>
                      <button type="button" onClick={() => run(() => workersApi.unlink(w.id))} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-slate-400 hover:bg-white/5 hover:text-white"><Link2Off className="h-3.5 w-3.5" aria-hidden="true" /> Desvincular</button>
                    </div>
                  ) : invite?.workerId === w.id ? (
                    <div className="rounded-xl bg-secondary-500/10 p-3 ring-1 ring-inset ring-secondary-400/25">
                      <p className="text-slate-300">Código de vinculación (solo se muestra ahora; caduca el {new Date(invite.expires_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long' })}):</p>
                      <div className="mt-2 flex items-center gap-2">
                        <code className="rounded-lg bg-slate-950/60 px-3 py-1.5 font-mono text-base font-semibold tracking-[0.2em] text-white">{invite.code}</code>
                        <button type="button" onClick={async () => { try { await navigator.clipboard.writeText(invite.code); setCopied(true) } catch { setCopied(false) } }} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-slate-300 hover:bg-white/5"><Copy className="h-3.5 w-3.5" aria-hidden="true" /> {copied ? 'Copiado' : 'Copiar'}</button>
                      </div>
                      <p className="mt-2 text-slate-400">El trabajador lo introduce en «Mi portal → Mis tareas asignadas».</p>
                    </div>
                  ) : (
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-slate-500">{w.invite_pending ? 'Código generado, pendiente de canjear' : 'Sin cuenta vinculada'}</span>
                      {w.active && <button type="button" onClick={() => makeInvite(w)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 font-semibold text-secondary-200 hover:bg-white/5"><KeyRound className="h-3.5 w-3.5" aria-hidden="true" /> {w.invite_pending ? 'Nuevo código' : 'Generar código'}</button>}
                    </div>
                  )}
                </div>
              </li>
            ),
          )}
        </ul>
      )}
    </div>
  )
}
