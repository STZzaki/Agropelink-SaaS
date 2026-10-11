import { useId, useState } from 'react'
import { Link } from 'react-router-dom'
import FarmSelect from '../../features/farms/FarmSelect.jsx'
import Button from '../ui/Button.jsx'
import { inputClass } from '../ui/FormField.jsx'

function tomorrowISO() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/**
 * Tarjeta Human-in-the-Loop: la acción propuesta por el agente solo se ejecuta
 * si el agricultor la aprueba. Antes debe completar los datos que el modelo no conoce
 * (granja y fecha).
 *
 * `status`: 'pending' | 'submitting' | 'approved' | 'rejected'
 */
export default function ConfirmationCard({ action, status, error, farms, farmsLoading, onApprove, onReject }) {
  const [farmId, setFarmId] = useState(farms.length === 1 ? String(farms[0].id) : '')
  const [date, setDate] = useState(tomorrowISO())
  const uid = useId()

  const resolved = status === 'approved' || status === 'rejected'
  const submitting = status === 'submitting'
  const effectiveFarmId = farmId || (farms.length === 1 ? String(farms[0].id) : '')
  const canApprove = effectiveFarmId && date && !submitting

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-accent-400/30 bg-white/[0.035] text-slate-100 shadow-sm">
      <div className="flex items-center gap-2 border-b border-accent-400/20 bg-accent-500/10 px-3 py-2">
        <svg className="h-4 w-4 text-accent-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
        </svg>
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-200">Confirmación requerida</p>
      </div>

      <div className="space-y-3 px-3 py-3">
        <div>
          <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">Crear tarea</p>
          <p className="text-sm font-semibold text-white">{action.title}</p>
          {action.description && <p className="mt-1 text-xs leading-relaxed text-slate-300">{action.description}</p>}
        </div>

        {status === 'approved' && (
          <p className="rounded-lg bg-primary-500/10 px-3 py-2 text-xs font-semibold text-primary-200 ring-1 ring-inset ring-primary-400/30">
            Tarea creada.{' '}
            <Link to="/tasks" className="underline underline-offset-2">Ver tareas</Link>
          </p>
        )}
        {status === 'rejected' && (
          <p className="inline-flex rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs font-semibold text-slate-300 ring-1 ring-inset ring-white/10">
            Acción rechazada
          </p>
        )}

        {!resolved && (
          <>
            {farmsLoading ? (
              <p className="text-xs text-slate-400">Cargando granjas…</p>
            ) : farms.length === 0 ? (
              <p className="text-xs font-medium text-accent-300">
                Necesitas registrar una granja en el <Link to="/dashboard" className="underline">resumen</Link> antes de crear tareas.
              </p>
            ) : (
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <div>
                  <label htmlFor={`${uid}-farm`} className="mb-0.5 block text-[11px] font-medium text-slate-400">Granja</label>
                  <FarmSelect id={`${uid}-farm`} farms={farms} value={effectiveFarmId} onChange={setFarmId} disabled={submitting} />
                </div>
                <div>
                  <label htmlFor={`${uid}-date`} className="mb-0.5 block text-[11px] font-medium text-slate-400">Fecha</label>
                  <input id={`${uid}-date`} type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputClass} disabled={submitting} />
                </div>
              </div>
            )}

            {error && <p role="alert" className="text-xs font-medium text-accent-300">{error}</p>}

            <div className="flex gap-2">
              <Button
                className="flex-1 !px-3 !py-1.5 text-xs"
                loading={submitting}
                disabled={!canApprove}
                onClick={() => onApprove({ farm_id: Number(effectiveFarmId), date })}
              >
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
