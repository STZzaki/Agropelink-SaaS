import { useId, useMemo, useRef, useState } from 'react'
import { MOTION_OK, gsap, useGSAP } from '../../lib/gsap.js'

// Serie de demostración de 24 h (lecturas horarias) para cada sensor.
const SENSORS = {
  humedad: {
    label: 'Humedad suelo',
    unit: '%',
    color: '#4bc2a8',
    threshold: { value: 55, label: 'Umbral de riego' },
    data: [68, 66, 64, 62, 61, 59, 58, 56, 55, 54, 72, 74, 73, 71, 69, 67, 65, 63, 61, 60, 58, 57, 56, 74],
  },
  temperatura: {
    label: 'Temp. invernadero',
    unit: '°C',
    color: '#d9a476',
    threshold: { value: 30, label: 'Ventilación' },
    data: [14, 13.5, 13, 12.6, 12.4, 12.8, 14.5, 17, 20.5, 23.8, 26.4, 28.6, 30.2, 31.1, 30.6, 29.4, 27, 23.9, 20.6, 18.4, 17, 16, 15.2, 14.6],
  },
  ce: {
    label: 'Conductividad',
    unit: 'dS/m',
    color: '#97cf99',
    threshold: { value: 2.2, label: 'Límite salino' },
    data: [1.6, 1.62, 1.65, 1.67, 1.7, 1.71, 1.74, 1.76, 1.79, 1.82, 1.58, 1.55, 1.57, 1.6, 1.63, 1.66, 1.69, 1.71, 1.74, 1.77, 1.79, 1.81, 1.84, 1.6],
  },
}

const W = 640
const H = 220
const PAD = { top: 16, right: 12, bottom: 28, left: 36 }

export default function SensorChart() {
  const [sensorKey, setSensorKey] = useState('humedad')
  const [hover, setHover] = useState(null)
  const gradientId = useId()
  const svgRef = useRef(null)

  // Al montar y al cambiar de sensor: la línea se dibuja y el área aparece con aceleración natural.
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        gsap.timeline()
          .fromTo('[data-chart-line]', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 1.1, ease: 'power2.out' })
          .fromTo('[data-chart-area]', { opacity: 0 }, { opacity: 1, duration: 0.6, ease: 'power2.out' }, '<0.25')
          .fromTo('[data-chart-dot]', { scale: 0, transformOrigin: '50% 50%' }, { scale: 1, duration: 0.35, ease: 'back.out(2)' }, '<0.35')
      })
      return () => mm.revert()
    },
    { scope: svgRef, dependencies: [sensorKey], revertOnUpdate: true },
  )
  const sensor = SENSORS[sensorKey]

  const { points, min, max, y } = useMemo(() => {
    const values = [...sensor.data, sensor.threshold.value]
    const lo = Math.min(...values)
    const hi = Math.max(...values)
    const margin = (hi - lo) * 0.15
    const min = lo - margin
    const max = hi + margin
    const x = (i) => PAD.left + (i / (sensor.data.length - 1)) * (W - PAD.left - PAD.right)
    const y = (v) => PAD.top + (1 - (v - min) / (max - min)) * (H - PAD.top - PAD.bottom)
    return { points: sensor.data.map((v, i) => ({ x: x(i), y: y(v), v, h: i })), min, max, y }
  }, [sensor])

  const line = points.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
  const area = `${line} L${points.at(-1).x},${H - PAD.bottom} L${points[0].x},${H - PAD.bottom} Z`
  const active = hover !== null ? points[hover] : points.at(-1)
  const fmt = (v) => (sensor.unit === 'dS/m' ? v.toFixed(2) : Math.round(v * 10) / 10).toString().replace('.', ',')

  function handleMove(e) {
    const rect = e.currentTarget.getBoundingClientRect()
    const clientX = e.touches ? e.touches[0].clientX : e.clientX
    const ratio = ((clientX - rect.left) / rect.width) * W
    const idx = Math.round(((ratio - PAD.left) / (W - PAD.left - PAD.right)) * (points.length - 1))
    setHover(Math.max(0, Math.min(points.length - 1, idx)))
  }

  return (
    <div className="rounded-2xl bg-slate-950/60 p-4 shadow-surface-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="Sensor" className="flex flex-wrap gap-1.5">
          {Object.entries(SENSORS).map(([key, s]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={key === sensorKey}
              onClick={() => {
                setSensorKey(key)
                setHover(null)
              }}
              className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
                key === sensorKey ? 'bg-white text-slate-950' : 'bg-white/5 text-slate-300 hover:bg-white/10'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
        <p className="text-right" aria-live="polite">
          <span className="block text-[11px] text-slate-500">{hover !== null ? `${String(active.h).padStart(2, '0')}:00 h` : 'Ahora'}</span>
          <span className="text-2xl font-semibold tabular-nums text-white">
            {fmt(active.v)} <span className="text-sm font-normal text-slate-400">{sensor.unit}</span>
          </span>
        </p>
      </div>

      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-3 h-48 w-full touch-pan-y select-none sm:h-56"
        role="img"
        aria-label={`Gráfico de ${sensor.label} en las últimas 24 horas`}
        onMouseMove={handleMove}
        onMouseLeave={() => setHover(null)}
        onTouchStart={handleMove}
        onTouchMove={handleMove}
        onTouchEnd={() => setHover(null)}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={sensor.color} stopOpacity="0.35" />
            <stop offset="100%" stopColor={sensor.color} stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const v = min + (max - min) * t
          return (
            <g key={t}>
              <line x1={PAD.left} x2={W - PAD.right} y1={y(v)} y2={y(v)} stroke="white" strokeOpacity="0.06" />
              <text x={PAD.left - 6} y={y(v) + 4} textAnchor="end" fontSize="10" fill="#64748b">{fmt(v)}</text>
            </g>
          )
        })}
        {[0, 6, 12, 18, 23].map((h) => (
          <text key={h} x={points[h].x} y={H - 8} textAnchor="middle" fontSize="10" fill="#64748b">{`${String(h).padStart(2, '0')}h`}</text>
        ))}
        <line x1={PAD.left} x2={W - PAD.right} y1={y(sensor.threshold.value)} y2={y(sensor.threshold.value)} stroke="#f4e5d6" strokeOpacity="0.35" strokeDasharray="5 5" />
        <text x={W - PAD.right} y={y(sensor.threshold.value) - 6} textAnchor="end" fontSize="10" fill="#e8c8a9" fillOpacity="0.8">{sensor.threshold.label}</text>
        <path data-chart-area d={area} fill={`url(#${gradientId})`} />
        <path data-chart-line d={line} pathLength="1" strokeDasharray="1" fill="none" stroke={sensor.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
        <line x1={active.x} x2={active.x} y1={PAD.top} y2={H - PAD.bottom} stroke="white" strokeOpacity={hover !== null ? 0.25 : 0} />
        <g data-chart-dot>
          <circle cx={active.x} cy={active.y} r="6" fill={sensor.color} fillOpacity="0.25" />
          <circle cx={active.x} cy={active.y} r="3.5" fill={sensor.color} stroke="#020617" strokeWidth="1.5" />
        </g>
      </svg>
      <p className="mt-1 text-[11px] text-slate-500">Datos de demostración · pasa el cursor o el dedo por el gráfico</p>
    </div>
  )
}
