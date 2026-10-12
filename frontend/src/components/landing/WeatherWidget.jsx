import { useCallback, useEffect, useState } from 'react'
import { SITE } from '../../config/site.js'
import CountUp from './CountUp.jsx'

// Open-Meteo: API pública sin clave. Se usa `fetch` directo (no el cliente `api` con credenciales).
// Solo viajan las coordenadas de la capital elegida (de una lista fija): ningún dato del usuario.
const PLACES = SITE.weather
const forecastUrl = ({ latitude, longitude }) =>
  'https://api.open-meteo.com/v1/forecast' +
  `?latitude=${latitude}&longitude=${longitude}` +
  '&current=temperature_2m,relative_humidity_2m,apparent_temperature,wind_speed_10m,wind_gusts_10m,weather_code' +
  '&hourly=precipitation_probability&forecast_hours=12&wind_speed_unit=kmh&timezone=Europe%2FMadrid'

const REFRESH_MS = 10 * 60 * 1000

const WMO = [
  [[0], 'Despejado'],
  [[1, 2], 'Poco nuboso'],
  [[3], 'Cubierto'],
  [[45, 48], 'Niebla'],
  [[51, 53, 55, 56, 57], 'Llovizna'],
  [[61, 63, 65, 66, 67, 80, 81, 82], 'Lluvia'],
  [[71, 73, 75, 77, 85, 86], 'Nieve'],
  [[95, 96, 99], 'Tormenta'],
]
const describe = (code) => WMO.find(([codes]) => codes.includes(code))?.[1] ?? '—'

function rainRisk(prob) {
  if (prob >= 60) return { label: 'Alto', tone: 'text-accent-300', bar: 'bg-accent-400' }
  if (prob >= 30) return { label: 'Moderado', tone: 'text-secondary-300', bar: 'bg-secondary-400' }
  return { label: 'Bajo', tone: 'text-primary-300', bar: 'bg-primary-400' }
}

function StatCard({ label, value, unit, hint, children }) {
  return (
    <div className="rounded-2xl bg-white/[0.03] p-4 shadow-surface-sm">
      <p className="text-xs font-medium text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums text-white">
        {typeof value === 'number' ? <CountUp value={value} /> : value}
        {unit && <span className="ml-1 text-sm font-normal text-slate-400">{unit}</span>}
      </p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
      {children}
    </div>
  )
}

function Skeleton() {
  return (
    <div className="grid grid-cols-2 gap-4" aria-hidden="true">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="skeleton h-[6.5rem] rounded-2xl" />
      ))}
    </div>
  )
}

/** Selector de provincia: grupo de radios nativo (flechas del teclado y lector de pantalla). */
function PlacePicker({ value, onChange }) {
  return (
    <div role="radiogroup" aria-label="Provincia" className="inline-flex flex-wrap gap-1 rounded-xl bg-white/[0.04] p-1 shadow-inner-soft">
      {PLACES.map((place) => {
        const selected = place.id === value
        return (
          <label key={place.id} className="relative cursor-pointer">
            <input type="radio" name="weather-place" value={place.id} checked={selected} onChange={() => onChange(place.id)} className="peer sr-only" />
            <span
              className={`block rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors duration-300 peer-focus-visible:ring-2 peer-focus-visible:ring-secondary-300 ${
                selected ? 'bg-secondary-400/15 text-secondary-200 ring-1 ring-inset ring-secondary-300/40' : 'text-slate-400 hover:bg-white/[0.06] hover:text-slate-200'
              }`}
            >
              {place.label}
            </span>
          </label>
        )
      })}
    </div>
  )
}

/** Provincia del catálogo cuyo nombre aparece en un texto libre (p. ej. la ubicación de una finca). */
export function placeFromText(text = '') {
  const plain = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
  return PLACES.find((p) => plain(text).includes(plain(p.label)))?.id ?? null
}

/** `defaultPlace`: provincia inicial (p. ej. la de la finca seleccionada); el usuario puede cambiarla. */
export default function WeatherWidget({ defaultPlace = null }) {
  const [placeId, setPlaceId] = useState(PLACES.some((p) => p.id === defaultPlace) ? defaultPlace : PLACES[0].id)
  const [data, setData] = useState(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const place = PLACES.find((p) => p.id === placeId) ?? PLACES[0]

  const load = useCallback(async (signal) => {
    setError(false)
    try {
      const res = await fetch(forecastUrl(place), { signal })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      const json = await res.json()
      const probs = json.hourly?.precipitation_probability ?? []
      setData({
        ...json.current,
        rainProb: probs.length ? Math.max(...probs) : 0,
      })
    } catch (err) {
      if (err.name !== 'AbortError') setError(true)
    } finally {
      if (!signal?.aborted) setLoading(false)
    }
  }, [place])

  // Al cambiar de provincia se cancela la petición anterior (sin carreras) y se recarga con las nuevas coordenadas.
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setData(null)
    load(controller.signal)
    const id = setInterval(() => load(controller.signal), REFRESH_MS)
    return () => {
      controller.abort()
      clearInterval(id)
    }
  }, [load])

  const risk = data ? rainRisk(data.rainProb) : null
  const updated = data?.time
    ? new Date(data.time).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })
    : null

  return (
    <div className="surface flex h-full flex-col p-6 sm:p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-secondary-300">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-secondary-400 opacity-60 motion-off:hidden" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-secondary-400" />
            </span>
            Clima en directo
          </p>
          <h3 className="mt-2 text-xl font-semibold text-white">{place.label}</h3>
          <p className="text-sm text-slate-400">{data ? describe(data.weather_code) : 'Cargando condiciones…'}</p>
        </div>
        {updated && <p className="text-right text-xs text-slate-500">Actualizado<br />{updated}</p>}
      </div>

      <div className="mt-5">
        <PlacePicker value={placeId} onChange={setPlaceId} />
      </div>

      <div className="mt-6 flex-1" aria-live="polite" aria-busy={loading}>
        {loading ? (
          <Skeleton />
        ) : error || !data ? (
          <div className="rounded-2xl border border-accent-400/30 bg-accent-500/10 p-4 text-sm text-accent-100">
            No se pudo cargar el clima en este momento.{' '}
            <button type="button" onClick={() => load()} className="font-semibold underline underline-offset-2">
              Reintentar
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <StatCard label="Temperatura" value={Math.round(data.temperature_2m)} unit="°C" hint={`Sensación ${Math.round(data.apparent_temperature)} °C`} />
            <StatCard label="Viento" value={Math.round(data.wind_speed_10m)} unit="km/h" hint={`Rachas ${Math.round(data.wind_gusts_10m)} km/h`} />
            <StatCard label="Humedad" value={data.relative_humidity_2m} unit="%" hint="Relativa del aire" />
            <StatCard label="Riesgo de lluvia" value={data.rainProb} unit="%">
              <p className={`mt-1 text-xs font-medium ${risk.tone}`}>{risk.label} · próximas 12 h</p>
              <div className="mt-2 h-1 rounded-full bg-white/10">
                <div className={`h-full rounded-full ${risk.bar}`} style={{ width: `${data.rainProb}%` }} />
              </div>
            </StatCard>
          </div>
        )}
      </div>

      <p className="mt-4 text-[11px] text-slate-500">
        Fuente:{' '}
        <a href="https://open-meteo.com/" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2 hover:text-slate-300">
          Open-Meteo
        </a>{' '}
        (CC BY 4.0)
      </p>
    </div>
  )
}
