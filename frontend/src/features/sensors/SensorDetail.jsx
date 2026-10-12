import { Trash2 } from 'lucide-react'
import { useId, useMemo, useState } from 'react'
import { Area, AreaChart, CartesianGrid, ReferenceArea, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { getErrorMessage, sensorsApi } from '../../api.js'
import Button from '../../components/ui/Button.jsx'
import { inputClass } from '../../components/ui/FormField.jsx'
import { CHART } from '../dashboard/chartTheme.js'
import { formatValue, kindColor } from './sensorMeta.js'

const AXIS = { stroke: CHART.axis, tick: { fill: CHART.muted, fontSize: 11 }, tickLine: false, axisLine: false }

function timeLabel(ms, hours) {
  const d = new Date(ms)
  return hours > 24
    ? d.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric' })
    : d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
}

function DetailTooltip({ active, payload, sensor }) {
  if (!active || !payload?.length) return null
  const { t, v } = payload[0].payload
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs shadow-overlay">
      <p className="font-semibold text-slate-100">{new Date(t).toLocaleString('es-ES', { weekday: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</p>
      <p className="mt-0.5 text-slate-300">
        {sensor.label}: <span className="font-semibold tabular-nums text-slate-100">{formatValue(v, sensor.decimals)} {sensor.unit}</span>
      </p>
    </div>
  )
}

function ManualReading({ farmId, sensor, onSaved }) {
  const id = useId()
  const [value, setValue] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function submit(e) {
    e.preventDefault()
    const number = Number(value.replace(',', '.'))
    if (value.trim() === '' || !Number.isFinite(number)) {
      setError('Introduce un número.')
      return
    }
    setBusy(true)
    setError(null)
    try {
      await sensorsApi.addSamples(farmId, sensor.id, [{ value: number }])
      setValue('')
      onSaved()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="flex flex-wrap items-start gap-2">
      <label htmlFor={id} className="sr-only">Lectura manual en {sensor.unit}</label>
      <div className="relative">
        <input id={id} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="Lectura manual" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-err` : undefined} className={`${inputClass} !w-40 pr-14`} />
        <span className="pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-slate-500">{sensor.unit}</span>
      </div>
      <Button type="submit" variant="secondary" loading={busy}>Registrar</Button>
      {error && <p id={`${id}-err`} role="alert" className="basis-full text-xs text-accent-200">{error}</p>}
    </form>
  )
}

export default function SensorDetail({ farmId, sensor, points, hours, demo, onChanged }) {
  const gradient = useId().replace(/:/g, '')
  const [table, setTable] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const color = kindColor(sensor.kind)

  const data = useMemo(() => points.map(([t, v]) => ({ t: new Date(t).getTime(), v })), [points])
  const stats = useMemo(() => {
    if (!data.length) return null
    const values = data.map((d) => d.v)
    return { min: Math.min(...values), avg: values.reduce((a, b) => a + b, 0) / values.length, max: Math.max(...values) }
  }, [data])

  async function remove() {
    setBusy(true)
    setError(null)
    try {
      await sensorsApi.remove(farmId, sensor.id)
      onChanged({ removed: sensor.id })
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy(false)
    }
  }

  return (
    <section aria-labelledby="sensor-detail-title" className="card-glass p-5 sm:p-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 id="sensor-detail-title" className="text-base font-semibold text-white sm:text-lg">{sensor.name}</h3>
          <p className="text-xs text-slate-500">
            {sensor.label} · {sensor.zone ?? 'sin zona'}
            {sensor.optimal && <> · rango recomendado {formatValue(sensor.optimal[0], sensor.decimals)}–{formatValue(sensor.optimal[1], sensor.decimals)} {sensor.unit}</>}
          </p>
        </div>
        {data.length > 0 && (
          <button type="button" onClick={() => setTable((v) => !v)} aria-pressed={table} className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-400 transition-colors duration-300 hover:bg-white/5 hover:text-slate-200">
            {table ? 'Ver gráfica' : 'Ver tabla'}
          </button>
        )}
      </header>

      {stats && (
        <dl className="mt-4 grid grid-cols-3 gap-3">
          {[['Mínimo', stats.min], ['Media', stats.avg], ['Máximo', stats.max]].map(([label, v]) => (
            <div key={label} className="rounded-xl bg-white/[0.03] px-3 py-2">
              <dt className="text-[11px] text-slate-500">{label}</dt>
              <dd className="font-semibold tabular-nums text-slate-100">{formatValue(v, sensor.decimals)} <span className="text-xs font-normal text-slate-500">{sensor.unit}</span></dd>
            </div>
          ))}
        </dl>
      )}

      <div className="mt-4">
        {data.length === 0 ? (
          <div className="flex h-60 items-center justify-center rounded-xl border border-dashed border-white/10 px-6 text-center text-sm text-slate-400">
            Sin lecturas en este periodo. Conecta la pasarela del sensor o registra una lectura manual.
          </div>
        ) : table ? (
          <div className="max-h-60 overflow-auto" data-lenis-prevent>
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
                <tr><th className="py-2 font-semibold">Momento</th><th className="py-2 text-right font-semibold">Valor ({sensor.unit})</th></tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06] tabular-nums">
                {[...data].reverse().map((d) => (
                  <tr key={d.t}><td className="py-1.5 text-slate-300">{new Date(d.t).toLocaleString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td><td className="py-1.5 text-right text-slate-100">{formatValue(d.v, sensor.decimals)}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="h-60" role="img" aria-label={`Evolución de ${sensor.label.toLowerCase()} en ${sensor.name}`}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -12 }}>
                <defs>
                  <linearGradient id={gradient} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={color} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={CHART.grid} vertical={false} />
                {sensor.optimal && <ReferenceArea y1={sensor.optimal[0]} y2={sensor.optimal[1]} fill="#ffffff" fillOpacity={0.035} ifOverflow="extendDomain" />}
                <XAxis dataKey="t" type="number" scale="time" domain={['dataMin', 'dataMax']} tickFormatter={(t) => timeLabel(t, hours)} minTickGap={36} {...AXIS} />
                <YAxis width={48} tickFormatter={(v) => formatValue(v, Math.min(sensor.decimals, 1))} domain={['auto', 'auto']} {...AXIS} />
                <Tooltip content={<DetailTooltip sensor={sensor} />} cursor={{ stroke: CHART.axis, strokeDasharray: '3 3' }} />
                <Area type="monotone" dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${gradient})`} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#1c2623' }} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {!demo && (
        <div className="mt-5 flex flex-wrap items-start justify-between gap-3 border-t border-white/[0.06] pt-4">
          <ManualReading farmId={farmId} sensor={sensor} onSaved={() => onChanged({})} />
          {confirm ? (
            <div className="flex items-center gap-2 text-xs text-slate-300">
              ¿Eliminar el sensor y su histórico?
              <Button variant="danger" loading={busy} onClick={remove}>Eliminar</Button>
              <Button variant="outline" disabled={busy} onClick={() => setConfirm(false)}>Cancelar</Button>
            </div>
          ) : (
            <button type="button" onClick={() => setConfirm(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-xs font-medium text-slate-400 transition-colors duration-300 hover:bg-red-500/10 hover:text-red-200">
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Eliminar sensor
            </button>
          )}
          {error && <p role="alert" className="basis-full text-xs text-accent-200">{error}</p>}
        </div>
      )}
    </section>
  )
}
