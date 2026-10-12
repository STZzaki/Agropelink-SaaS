import { Pencil, Plus, Trash2 } from 'lucide-react'
import { useState } from 'react'
import { economyApi, farmsApi, getErrorMessage } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import Card from '../../components/ui/Card.jsx'
import HarvestFields, { EMPTY_HARVEST, harvestPayload, harvestToForm, validateHarvest } from './HarvestFields.jsx'

const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 })
const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

function HarvestEditor({ farmId, harvest, onDone, onCancel }) {
  const [value, setValue] = useState(harvest ? harvestToForm(harvest) : { ...EMPTY_HARVEST })
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState(null)

  async function save(e) {
    e.preventDefault()
    const found = validateHarvest(value)
    setErrors(found)
    if (Object.keys(found).length) return
    setBusy(true)
    setServerError(null)
    try {
      if (harvest) await economyApi.updateHarvest(farmId, harvest.id, harvestPayload(value))
      else await economyApi.createHarvest(farmId, harvestPayload(value))
      onDone()
    } catch (err) {
      setServerError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <form onSubmit={save} noValidate className="rounded-2xl bg-white/[0.02] p-4 ring-1 ring-inset ring-secondary-400/20">
      <HarvestFields idPrefix={`hv-${harvest?.id ?? 'new'}`} value={value} onChange={setValue} errors={errors} />
      {serverError && <div className="mt-3"><Alert variant="error">{serverError}</Alert></div>}
      <div className="mt-4 flex justify-end gap-2">
        <Button variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>
        <Button type="submit" loading={busy}>{harvest ? 'Guardar cambios' : 'Añadir cosecha'}</Button>
      </div>
    </form>
  )
}

/** Cosechas de la finca: modo único/múltiple, ficha de cada cosecha y alta/edición/borrado. */
export default function HarvestsPanel({ farm, harvests, onChanged }) {
  const [editing, setEditing] = useState(null) // id | 'new' | null
  const [confirm, setConfirm] = useState(null)
  const [error, setError] = useState(null)
  const multiple = farm.harvest_mode === 'multiple'
  const canAdd = multiple ? harvests.length < 20 : harvests.length === 0

  async function run(action) {
    setError(null)
    try {
      await action()
      setConfirm(null)
      onChanged()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const done = () => { setEditing(null); onChanged() }
  return (
    <Card
      title="Cosechas"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="Modo de cosecha" className="flex gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/10">
            {[['single', 'Única'], ['multiple', 'Varias']].map(([mode, label]) => (
              <button
                key={mode}
                type="button"
                aria-pressed={farm.harvest_mode === mode}
                onClick={() => farm.harvest_mode !== mode && run(() => farmsApi.update(farm.id, { harvest_mode: mode }))}
                className={`rounded-lg px-3 py-1 text-xs font-semibold transition-colors duration-300 ${farm.harvest_mode === mode ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
              >
                {label}
              </button>
            ))}
          </div>
          {canAdd && editing !== 'new' && (
            <Button variant="secondary" onClick={() => setEditing('new')}><Plus className="h-4 w-4" aria-hidden="true" /> Cosecha</Button>
          )}
        </div>
      }
    >
      {error && <div className="mb-4"><Alert variant="error">{error}</Alert></div>}
      {editing === 'new' && <div className="mb-4"><HarvestEditor farmId={farm.id} onDone={done} onCancel={() => setEditing(null)} /></div>}
      {harvests.length === 0 && editing !== 'new' ? (
        <p className="text-sm text-slate-400">Aún no hay cosechas definidas para esta finca.</p>
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {harvests.map((h) =>
            editing === h.id ? (
              <li key={h.id} className="lg:col-span-2"><HarvestEditor farmId={farm.id} harvest={h} onDone={done} onCancel={() => setEditing(null)} /></li>
            ) : (
              <li key={h.id} className="rounded-2xl bg-white/[0.03] p-4 shadow-surface-sm">
                <div className="flex items-start justify-between gap-3">
                  <p className="font-semibold text-white">{h.name}</p>
                  <div className="flex shrink-0 gap-1">
                    <button type="button" onClick={() => setEditing(h.id)} aria-label={`Editar ${h.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><Pencil className="h-4 w-4" aria-hidden="true" /></button>
                    {confirm === h.id ? (
                      <span className="inline-flex gap-1">
                        <button type="button" onClick={() => run(() => economyApi.removeHarvest(farm.id, h.id))} className="rounded-lg bg-red-500/20 px-2 py-1 text-xs font-semibold text-red-100 hover:bg-red-500/30">Borrar</button>
                        <button type="button" onClick={() => setConfirm(null)} className="rounded-lg px-2 py-1 text-xs text-slate-300 hover:bg-white/10">No</button>
                      </span>
                    ) : (
                      <button type="button" onClick={() => setConfirm(h.id)} aria-label={`Borrar ${h.name}`} className="rounded-lg p-1.5 text-slate-400 hover:bg-red-500/10 hover:text-red-200"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
                    )}
                  </div>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div><dt className="text-slate-500">Superficie</dt><dd className="tabular-nums text-slate-200">{h.surface_ha ? `${nf.format(h.surface_ha)} ha` : '—'}</dd></div>
                  <div><dt className="text-slate-500">Dimensiones</dt><dd className="tabular-nums text-slate-200">{h.length_m && h.width_m ? `${nf.format(h.length_m)} × ${nf.format(h.width_m)} m` : '—'}</dd></div>
                  <div><dt className="text-slate-500">Plantas</dt><dd className="tabular-nums text-slate-200">{h.plant_count !== null ? nf.format(h.plant_count) : '—'}</dd></div>
                  <div className="col-span-3"><dt className="text-slate-500">Periodo</dt><dd className="text-slate-200">{h.start_date && h.end_date ? `${day(h.start_date)} → ${day(h.end_date)} · ${h.duration_days} días` : h.start_date ? `Desde ${day(h.start_date)}` : '—'}</dd></div>
                </dl>
                {h.description && <p className="mt-3 whitespace-pre-line text-sm leading-relaxed text-slate-400">{h.description}</p>}
                {confirm === h.id && <p className="mt-2 text-[11px] text-slate-500">Sus costes se conservan como «sin cosecha asignada».</p>}
              </li>
            ),
          )}
        </ul>
      )}
    </Card>
  )
}
