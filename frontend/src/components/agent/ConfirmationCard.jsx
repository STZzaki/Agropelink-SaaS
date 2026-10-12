import { ShieldCheck } from 'lucide-react'
import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import { EXPENSE_CATEGORIES, money } from '../../features/economy/economyMeta.js'
import FarmSelect from '../../features/farms/FarmSelect.jsx'
import { TASK_CATEGORIES, positionLabel, taskCategory } from '../../features/tasks/taskMeta.js'
import Button from '../ui/Button.jsx'
import { inputClass, optionClass } from '../ui/FormField.jsx'

function tomorrowISO() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const label = 'mb-0.5 block text-[11px] font-medium text-slate-400'

/**
 * Tarjeta Human-in-the-Loop: la acción propuesta por el agente solo se ejecuta si el agricultor la aprueba.
 * Llega prerrellenada con lo que el agente entendió (fechas, finca, trabajador, importe) y todo es editable.
 *
 * `status`: 'pending' | 'submitting' | 'approved' | 'rejected'
 */
export default function ConfirmationCard({ action, status, error, farms, workers = [], farmsLoading, onApprove, onReject }) {
  const uid = useId()
  const isExpense = action.type === 'register_expense'
  const [farmId, setFarmId] = useState(action.farm_id ? String(action.farm_id) : farms.length === 1 ? String(farms[0].id) : '')
  const [date, setDate] = useState(action.date ?? action.incurred_on ?? tomorrowISO())
  const [endDate, setEndDate] = useState(action.end_date ?? '')
  const [category, setCategory] = useState(action.category ?? (isExpense ? 'other' : 'other'))
  const [workerId, setWorkerId] = useState(action.worker_id ? String(action.worker_id) : '')

  const resolved = status === 'approved' || status === 'rejected'
  const submitting = status === 'submitting'
  const effectiveFarmId = farmId || (farms.length === 1 ? String(farms[0].id) : '')
  const canApprove = effectiveFarmId && date && !submitting && (!endDate || endDate >= date)
  const cat = isExpense ? null : taskCategory(category)

  function approve() {
    const base = { farm_id: Number(effectiveFarmId), category }
    onApprove(isExpense ? { ...base, incurred_on: date } : { ...base, date, end_date: endDate || null, worker_id: workerId ? Number(workerId) : null })
  }

  return (
    <div className="mt-3 overflow-hidden whitespace-normal rounded-xl border border-accent-400/30 bg-white/[0.035] text-slate-100 shadow-sm">
      <div className="flex items-center gap-2 border-b border-accent-400/20 bg-accent-500/10 px-3 py-2">
        <ShieldCheck className="h-4 w-4 text-accent-300" aria-hidden="true" />
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-200">Confirmación requerida</p>
      </div>

      <div className="space-y-3 px-3 py-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">{isExpense ? 'Registrar gasto' : 'Crear tarea'}</p>
          {isExpense ? (
            <p className="text-sm font-semibold text-white">{action.concept} · <span className="tabular-nums">{money(action.amount)}</span></p>
          ) : (
            <p className="flex items-center gap-1.5 text-sm font-semibold text-white">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: cat.color }} aria-hidden="true" />
              {action.title}
            </p>
          )}
        </div>

        {status === 'approved' && (
          <p className="rounded-lg bg-primary-500/10 px-3 py-2 text-xs font-semibold text-primary-200 ring-1 ring-inset ring-primary-400/30">
            {isExpense ? 'Gasto registrado.' : 'Tarea creada.'}{' '}
            <Link to={isExpense ? '/economia' : '/tasks'} className="underline underline-offset-2">{isExpense ? 'Ver economía' : 'Ver tareas'}</Link>
          </p>
        )}
        {status === 'rejected' && (
          <p className="inline-flex rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs font-semibold text-slate-300 ring-1 ring-inset ring-white/10">Acción rechazada</p>
        )}

        {!resolved && (
          <>
            {farmsLoading ? (
              <p className="text-xs text-slate-400">Cargando granjas…</p>
            ) : farms.length === 0 ? (
              <p className="text-xs font-medium text-accent-300">
                Necesitas registrar una granja en el <Link to="/dashboard" className="underline">resumen</Link> primero.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label htmlFor={`${uid}-farm`} className={label}>Granja</label>
                  <FarmSelect id={`${uid}-farm`} farms={farms} value={effectiveFarmId} onChange={setFarmId} disabled={submitting} />
                </div>
                <div>
                  <label htmlFor={`${uid}-cat`} className={label}>{isExpense ? 'Categoría' : 'Tipo de labor'}</label>
                  <select id={`${uid}-cat`} value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass} disabled={submitting}>
                    {(isExpense ? EXPENSE_CATEGORIES : TASK_CATEGORIES).map((c) => <option className={optionClass} key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${uid}-date`} className={label}>{isExpense ? 'Fecha del gasto' : 'Inicio'}</label>
                  <input id={`${uid}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} disabled={submitting} />
                </div>
                {!isExpense && (
                  <>
                    <div>
                      <label htmlFor={`${uid}-end`} className={label}>Fin (opcional)</label>
                      <input id={`${uid}-end`} type="date" min={date} value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputClass} disabled={submitting} />
                    </div>
                    <div>
                      <label htmlFor={`${uid}-worker`} className={label}>Asignar a</label>
                      <select id={`${uid}-worker`} value={workerId} onChange={(e) => setWorkerId(e.target.value)} className={inputClass} disabled={submitting || !workers.length}>
                        <option className={optionClass} value="">Sin asignar</option>
                        {workers.filter((w) => w.active).map((w) => <option className={optionClass} key={w.id} value={w.id}>{w.name} · {positionLabel(w.position)}</option>)}
                      </select>
                    </div>
                  </>
                )}
              </div>
            )}

            {error && <p role="alert" className="text-xs font-medium text-accent-300">{error}</p>}

            <div className="flex gap-2">
              <Button className="flex-1 !px-3 !py-1.5 text-xs" loading={submitting} disabled={!canApprove} onClick={approve}>
                Aprobar acción
              </Button>
              <Button variant="outline" className="flex-1 !px-3 !py-1.5 text-xs" disabled={submitting} onClick={onReject}>
                Rechazar
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
