import { useEffect, useState } from 'react'
import { marketApi } from '../../api.js'
import CountUp from './CountUp.jsx'
import { ArrowRight } from 'lucide-react'

export const GEOPORTAL_URL = 'https://geoportalgasolineras.es/geoportal-instalaciones/Inicio'

// Último recurso si ni siquiera responde nuestro backend: misma referencia que usa el servidor.
const CLIENT_FALLBACK = {
  status: 'estimate',
  region: 'Andalucía',
  region_avg: 1.7,
  region_weekly_change_pct: 0,
  source_updated_at: '10/10/2026',
  note: 'Valor de referencia (media oficial reciente). Tendencia estable.',
}

const STATUS_BADGE = {
  live: { label: 'Dato oficial', cls: 'bg-primary-500/10 text-primary-300 ring-primary-400/25', dot: 'bg-primary-400 animate-pulse' },
  cached: { label: 'Último dato oficial', cls: 'bg-secondary-500/10 text-secondary-300 ring-secondary-400/25', dot: 'bg-secondary-400' },
  estimate: { label: 'Valor de referencia', cls: 'bg-white/5 text-slate-300 ring-white/15', dot: 'bg-slate-400' },
}

const eur3 = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 3, maximumFractionDigits: 3 })
const pct = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2, signDisplay: 'exceptZero' })

function Trend({ value }) {
  if (value === null || value === undefined) return null
  // Para el agricultor, que el gasóleo baje es positivo: verde si baja, tierra si sube.
  const flat = Math.abs(value) < 0.05
  const down = value < 0
  const tone = flat ? 'bg-white/5 text-slate-300 ring-white/10' : down ? 'bg-primary-500/10 text-primary-300 ring-primary-400/20' : 'bg-accent-500/10 text-accent-200 ring-accent-400/20'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold tabular-nums ring-1 ring-inset ${tone}`}>
      {flat ? (
        <ArrowRight className="h-3 w-3" aria-hidden="true" />
      ) : (
        <svg className={`h-3 w-3 ${down ? 'rotate-180' : ''}`} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true"><path d="M6 2l4 6H2z" /></svg>
      )}
      {flat ? 'Estable' : `${pct.format(value)} %`} · semanal
    </span>
  )
}

function Stat({ label, value, hint, hintTone = 'text-slate-500' }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] p-4 shadow-surface-sm">
      <dt className="text-xs text-slate-400">{label}</dt>
      <dd className="mt-1 text-lg font-semibold tabular-nums text-white">{value}</dd>
      {hint && <p className={`text-[11px] ${hintTone}`}>{hint}</p>}
    </div>
  )
}

export default function FuelWidget() {
  const [data, setData] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    marketApi
      .fuel({ signal: controller.signal, timeout: 8000 })
      .then(setData)
      .catch((err) => {
        if (err?.name !== 'CanceledError') setData(CLIENT_FALLBACK)
      })
    return () => controller.abort()
  }, [])

  const badge = data ? STATUS_BADGE[data.status] ?? STATUS_BADGE.estimate : null
  const diffVsSpain = data?.spain_avg ? data.region_avg - data.spain_avg : null
  const hasRange = data?.region_min && data?.region_max
  const rangePos = hasRange ? ((data.region_avg - data.region_min) / (data.region_max - data.region_min || 1)) * 100 : 0

  return (
    <div className="surface flex h-full flex-col p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-accent-300">Carburante agrícola</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Gasóleo B · Andalucía</h3>
          <p className="text-sm text-slate-400">Precio medio en estaciones de servicio</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent-500/10 text-accent-300 ring-1 ring-inset ring-accent-400/20">
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 20V5a1 1 0 011-1h8a1 1 0 011 1v15M3 20h12M6 8h6M14 9h2.5a1.5 1.5 0 011.5 1.5V16a1.5 1.5 0 003 0V8l-3-3" />
          </svg>
        </span>
      </div>

      <div className="mt-8 flex-1">
        {!data ? (
          <div className="space-y-3" aria-hidden="true">
            <div className="skeleton h-12 w-40 rounded-xl" />
            <div className="skeleton h-16 rounded-2xl" />
          </div>
        ) : (
          <>
            <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${badge.cls}`}>
              <span className={`h-1.5 w-1.5 rounded-full ${badge.dot}`} aria-hidden="true" />
              {badge.label}
              {data.source_updated_at && <span className="font-normal opacity-80">· {data.source_updated_at.split(' ')[0]}</span>}
            </span>

            <div className="mt-3 flex flex-wrap items-end gap-x-4 gap-y-2">
              <p className="text-4xl font-semibold tabular-nums text-white">
                <CountUp value={data.region_avg} decimals={3} from={data.region_avg * 0.92} />
                <span className="ml-1 text-base font-normal text-slate-400">€/l</span>
              </p>
              <Trend value={data.region_weekly_change_pct} />
            </div>

            {(data.almeria_avg || data.region_week_ago_avg || data.spain_avg) && (
              <dl className="mt-6 grid grid-cols-3 gap-4">
                <Stat label="Almería" value={data.almeria_avg ? `${eur3.format(data.almeria_avg)} €` : '—'} />
                <Stat label="Hace 7 días" value={data.region_week_ago_avg ? `${eur3.format(data.region_week_ago_avg)} €` : '—'} />
                <Stat
                  label="Media España"
                  value={data.spain_avg ? `${eur3.format(data.spain_avg)} €` : '—'}
                  hint={diffVsSpain !== null ? `${diffVsSpain <= 0 ? '▼' : '▲'} ${eur3.format(Math.abs(diffVsSpain))} € Andalucía` : null}
                  hintTone={diffVsSpain !== null && diffVsSpain <= 0 ? 'text-primary-300' : 'text-accent-300'}
                />
              </dl>
            )}

            {hasRange && (
              <div className="mt-6">
                <div className="flex justify-between text-[11px] text-slate-500">
                  <span>Mín. {eur3.format(data.region_min)} €</span>
                  <span>Máx. {eur3.format(data.region_max)} €</span>
                </div>
                <div className="relative mt-1.5 h-2 rounded-full bg-gradient-to-r from-primary-500/40 via-secondary-500/30 to-accent-500/40">
                  <span className="absolute top-1/2 h-4 w-1 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" style={{ left: `${rangePos}%` }} aria-hidden="true" />
                </div>
                <p className="mt-1.5 text-[11px] text-slate-500">Rango entre {data.stations} estaciones · la marca indica la media</p>
              </div>
            )}
            {data.note && <p className="mt-4 text-xs text-slate-400">{data.note}</p>}
          </>
        )}
      </div>

      <p className="mt-4 text-[11px] leading-relaxed text-slate-500">
        Fuente:{' '}
        <a href={GEOPORTAL_URL} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-slate-300">
          Geoportal de Gasolineras (MITECO)
        </a>
        . Precio en surtidor con impuestos; el suministro a granel puede variar.
      </p>
    </div>
  )
}
