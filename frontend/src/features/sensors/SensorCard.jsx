import { ArrowDown, ArrowUp, Check, WifiOff } from 'lucide-react'
import { ago, formatValue, hardwareSource, kindColor, sensorStatus } from './sensorMeta.js'

// Estado con icono + texto (nunca solo color). Verde = en rango, tierra = fuera de rango, gris = sin señal.
const STATUS = {
  ok: { label: 'En rango', icon: Check, cls: 'bg-primary-500/10 text-primary-200 ring-primary-400/25' },
  low: { label: 'Bajo', icon: ArrowDown, cls: 'bg-accent-500/15 text-accent-200 ring-accent-400/30' },
  high: { label: 'Alto', icon: ArrowUp, cls: 'bg-accent-500/15 text-accent-200 ring-accent-400/30' },
  offline: { label: 'Sin señal', icon: WifiOff, cls: 'bg-white/5 text-slate-400 ring-white/10' },
}

/** Minigráfica SVG (sin librería): una ruta con trazo fino que no se deforma al escalar. */
function Sparkline({ points, color }) {
  if (points.length < 2) return <div className="h-8" aria-hidden="true" />
  const values = points.map((p) => p[1])
  const min = Math.min(...values)
  const span = Math.max(...values) - min || 1
  const d = values.map((v, i) => `${i ? 'L' : 'M'}${((i / (values.length - 1)) * 100).toFixed(2)},${(30 - ((v - min) / span) * 28).toFixed(2)}`).join(' ')
  return (
    <svg viewBox="0 0 100 32" preserveAspectRatio="none" className="h-8 w-full" aria-hidden="true">
      <path d={d} fill="none" stroke={color} strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  )
}

/**
 * Origen del hardware + punto de recepción. El punto «late» (animate-pulse) solo si el sensor está enviando datos
 * ahora mismo; sin señal queda gris y quieto: el indicador nunca miente sobre el estado real de la telemetría.
 */
function HardwareBadge({ kind, live }) {
  return (
    <span className={`pill-neon mt-2 max-w-full ${live ? '' : '!border-white/10 !text-slate-400 [text-shadow:none]'}`}>
      <span className={live ? 'pill-neon-dot animate-pulse' : 'h-1.5 w-1.5 shrink-0 rounded-full bg-slate-500'} aria-hidden="true" />
      <span className="truncate">{hardwareSource(kind)}</span>
      <span className="sr-only">{live ? ', recibiendo datos en tiempo real' : ', sin datos recientes'}</span>
    </span>
  )
}

export default function SensorCard({ sensor, points, selected, onSelect, now }) {
  const statusKey = sensorStatus(sensor, now)
  const status = STATUS[statusKey]
  const color = kindColor(sensor.kind)
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`card-inset group flex w-full flex-col p-4 text-left hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${selected ? 'card-inset-active' : ''}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: color }} aria-hidden="true" />
            <span className="truncate">{sensor.label}</span>
          </p>
          <p className="mt-0.5 truncate text-sm font-semibold text-white" title={sensor.name}>{sensor.name}</p>
          <HardwareBadge kind={sensor.kind} live={statusKey !== 'offline'} />
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${status.cls}`}>
          <status.icon className="h-3 w-3" aria-hidden="true" strokeWidth={2.5} />
          {status.label}
        </span>
      </div>
      <p className="mt-3 text-2xl font-semibold tabular-nums text-white">
        {formatValue(sensor.last_value, sensor.decimals)}
        <span className="ml-1 text-sm font-normal text-slate-400">{sensor.unit}</span>
      </p>
      <div className="mt-2"><Sparkline points={points} color={color} /></div>
      <p className="mt-1 flex justify-between gap-2 text-[11px] text-slate-500">
        <span className="truncate">{sensor.zone ?? 'Sin zona'}</span>
        <span className="shrink-0">{ago(sensor.last_at, now)}</span>
      </p>
    </button>
  )
}
