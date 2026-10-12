import { Plus, RefreshCw } from 'lucide-react'
import { useCallback, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { getErrorMessage, sensorsApi } from '../../api.js'
import FuelWidget from '../../components/landing/FuelWidget.jsx'
import WeatherWidget, { placeFromText } from '../../components/landing/WeatherWidget.jsx'
import Alert from '../../components/ui/Alert.jsx'
import { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import usePolling from '../../hooks/usePolling.js'
import AddSensorForm from './AddSensorForm.jsx'
import SensorCard from './SensorCard.jsx'
import SensorDetail from './SensorDetail.jsx'
import { POLL_MS, WINDOWS, demoData } from './sensorMeta.js'

function LiveBadge({ updatedAt, failed, demo }) {
  if (demo) {
    return <span className="inline-flex items-center gap-2 text-xs text-accent-300"><span className="h-2 w-2 rounded-full bg-accent-400" aria-hidden="true" />Datos de ejemplo · sin conexión a sensores</span>
  }
  if (failed) {
    return <span className="inline-flex items-center gap-2 text-xs text-accent-200"><span className="h-2 w-2 rounded-full bg-accent-400" aria-hidden="true" />Sin conexión · reintentando</span>
  }
  return (
    <span className="pill-neon normal-case tracking-normal">
      <span className="pill-neon-dot animate-pulse" aria-hidden="true" />
      {updatedAt ? `En directo · ${updatedAt.toLocaleTimeString('es-ES')}` : 'Conectando…'}
    </span>
  )
}

/**
 * Sensorización en directo de una finca: tarjetas por sensor, gráfica detallada del seleccionado y, en la
 * misma vista, el clima local (Open-Meteo, solo coordenadas de la capital) y el gasóleo (vía nuestro backend).
 * Sondeo cada 30 s solo con la pestaña visible; el servidor envía las series ya agregadas.
 */
export default function SensorDashboard({ farms }) {
  const [farmId, setFarmId] = useState(() => farms[0]?.id ?? null)
  const [hours, setHours] = useState(24)
  const [live, setLive] = useState(null) // { sensors, series } reales
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [updatedAt, setUpdatedAt] = useState(null)
  const [selectedId, setSelectedId] = useState(null)
  const [adding, setAdding] = useState(false)
  const [demo, setDemo] = useState(false)
  const [version, setVersion] = useState(0)

  const farm = farms.find((f) => f.id === farmId) ?? null

  const poll = useCallback(
    async (signal) => {
      if (!farmId) return
      try {
        const [sensors, series] = await Promise.all([sensorsApi.list(farmId, { signal }), sensorsApi.series(farmId, hours, { signal })])
        setLive({ sensors, series })
        setUpdatedAt(new Date())
        setError(null)
      } catch (err) {
        // Un fallo puntual no borra lo que ya se ve: se avisa y el siguiente sondeo lo reintenta.
        const message = getErrorMessage(err)
        if (message) setError(message)
      } finally {
        if (!signal.aborted) setLoading(false)
      }
    },
    [farmId, hours],
  )
  usePolling(poll, POLL_MS, [farmId, hours, version])

  const refresh = () => setVersion((v) => v + 1)
  const view = useMemo(() => (demo ? demoData(hours) : live), [demo, hours, live])
  const sensors = view?.sensors ?? []
  const pointsById = useMemo(() => new Map((view?.series.series ?? []).map((s) => [s.sensor_id, s.points])), [view])
  const selected = sensors.find((s) => s.id === selectedId) ?? sensors[0] ?? null
  const now = updatedAt?.getTime() ?? Date.now()
  const hasRealSensors = (live?.sensors.length ?? 0) > 0

  function changeFarm(id) {
    setFarmId(Number(id))
    setLive(null)
    setLoading(true)
    setSelectedId(null)
    setDemo(false)
    setAdding(false)
  }

  if (!farms.length) {
    return (
      <section aria-labelledby="sensors-title" className="card-glass mb-10 p-6 text-center">
        <h2 id="sensors-title" className="text-lg font-semibold text-white">Sensorización en directo</h2>
        <p className="mt-2 text-sm text-slate-400">
          Crea tu primera granja para vincular sensores. <Link to="/farms/nueva" className="font-semibold text-secondary-300 underline-offset-2 hover:underline">Crear granja</Link>
        </p>
      </section>
    )
  }

  return (
    <section aria-labelledby="sensors-title" className="mb-12">
      <div className="mb-5 flex flex-col gap-4 md:flex-row md:flex-wrap md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-300">Sensorización</p>
          <h2 id="sensors-title" className="mt-1 text-xl font-semibold tracking-tight text-white sm:text-2xl">Tu finca en directo</h2>
          <div className="mt-1" aria-live="polite"><LiveBadge demo={demo} updatedAt={updatedAt} failed={!!error && !!live} /></div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor="sensor-farm" className="sr-only">Granja</label>
          <select id="sensor-farm" value={farmId ?? ''} onChange={(e) => changeFarm(e.target.value)} className={`${inputClass} sm:!w-auto sm:min-w-[12rem]`}>
            {farms.map((f) => <option className={optionClass} key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <div role="group" aria-label="Periodo de las gráficas" className="flex gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/10">
            {WINDOWS.map((w) => (
              <button key={w.hours} type="button" aria-pressed={hours === w.hours} onClick={() => setHours(w.hours)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-300 ${hours === w.hours ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
                {w.label}
              </button>
            ))}
          </div>
          <button type="button" onClick={refresh} disabled={demo} aria-label="Actualizar ahora" title="Actualizar ahora" className="inline-flex h-10 w-10 items-center justify-center rounded-xl text-slate-400 ring-1 ring-inset ring-white/10 transition-colors duration-300 hover:bg-white/5 hover:text-white disabled:opacity-40">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
          </button>
          <button type="button" onClick={() => setAdding((v) => !v)} aria-expanded={adding} className="inline-flex h-10 items-center gap-1.5 rounded-xl bg-secondary-500/15 px-3.5 text-sm font-semibold text-secondary-100 ring-1 ring-inset ring-secondary-400/30 transition-colors duration-300 hover:bg-secondary-500/25">
            <Plus className="h-4 w-4" aria-hidden="true" /> Sensor
          </button>
        </div>
      </div>

      {adding && (
        <div className="mb-5">
          <AddSensorForm farmId={farmId} onCancel={() => setAdding(false)} onCreated={(s) => { setAdding(false); setDemo(false); setSelectedId(s.id); refresh() }} />
        </div>
      )}
      {error && !live && <div className="mb-5"><Alert variant="error" onRetry={refresh}>{error}</Alert></div>}

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {loading && !live ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-busy="true" aria-label="Cargando sensores">
              {[0, 1, 2].map((i) => <div key={i} className="skeleton h-40 rounded-2xl" />)}
            </div>
          ) : !hasRealSensors && !demo ? (
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-white/15 px-6 py-10 text-center">
              <p className="font-medium text-white">«{farm?.name}» aún no tiene sensores vinculados</p>
              <p className="max-w-md text-sm text-slate-400">Añade sus sondas de humedad, temperatura o conductividad para ver aquí sus lecturas en directo.</p>
              <div className="mt-2 flex flex-wrap justify-center gap-2">
                <button type="button" onClick={() => setAdding(true)} className="rounded-lg bg-secondary-500/15 px-3 py-1.5 text-xs font-semibold text-secondary-100 ring-1 ring-inset ring-secondary-400/30 hover:bg-secondary-500/25">Añadir sensor</button>
                <button type="button" onClick={() => setDemo(true)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/5">Ver con datos de ejemplo</button>
              </div>
            </div>
          ) : (
            <>
              {demo && (
                <div className="flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
                  <p role="status" className="text-xs font-semibold uppercase tracking-wide text-accent-300">Vista previa con datos de ejemplo · no corresponden a tu finca</p>
                  <button type="button" onClick={() => setDemo(false)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 hover:bg-white/5">Ocultar ejemplo</button>
                </div>
              )}
              <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3" aria-label="Sensores de la finca">
                {sensors.map((s) => (
                  <li key={s.id}>
                    <SensorCard sensor={s} points={pointsById.get(s.id) ?? []} selected={selected?.id === s.id} onSelect={() => setSelectedId(s.id)} now={now} />
                  </li>
                ))}
              </ul>
              {selected && (
                <SensorDetail
                  key={selected.id}
                  farmId={farmId}
                  sensor={selected}
                  points={pointsById.get(selected.id) ?? []}
                  hours={hours}
                  demo={demo}
                  onChanged={({ removed }) => { if (removed) setSelectedId(null); refresh() }}
                />
              )}
            </>
          )}
        </div>

        {/* Contexto exterior en la misma vista: clima de la provincia de la finca y gasóleo agrícola. */}
        <aside aria-label="Clima y carburante" className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-1 xl:content-start">
          <WeatherWidget key={farmId} defaultPlace={placeFromText(farm?.location)} />
          <FuelWidget />
        </aside>
      </div>
    </section>
  )
}
