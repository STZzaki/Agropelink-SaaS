/* Diapositivas del carrusel del Hero: cada una con titular, KPIs grandes y un visual de producto. */
import { useState } from 'react'
import SensorChart from './SensorChart.jsx'
import { ChartIcon, DropIcon, SparkIcon } from './icons.jsx'
import { ArrowRight, Check } from 'lucide-react'

function AgentVisual() {
  const [decision, setDecision] = useState(null)
  return (
    <div className="space-y-3 rounded-2xl bg-slate-950/60 p-4 shadow-surface-sm sm:p-6">
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary-600 px-4 py-2.5 text-sm text-white">
        Programa el tratamiento contra mosca blanca en el sector 2
      </div>
      <div className="max-w-[95%] rounded-2xl rounded-bl-sm bg-white/[0.04] p-4 shadow-surface-sm text-sm text-slate-200">
        <p className="text-[11px] font-semibold text-secondary-300">Agropelink AI</p>
        <p className="mt-1">Las trampas cromáticas superan el umbral esta semana. He preparado la labor:</p>
        <div className="mt-3 rounded-xl border border-accent-400/30 bg-accent-500/10 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-200">Confirmación requerida</p>
          <p className="mt-1 text-base font-semibold text-white">Tratamiento mosca blanca · Sector 2</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div><dt className="text-slate-400">Fecha</dt><dd className="font-medium text-slate-100">Mañana, 8:00</dd></div>
            <div><dt className="text-slate-400">Plazo seguridad</dt><dd className="font-medium text-slate-100">Según etiqueta</dd></div>
          </dl>
          {decision ? (
            <p className={`mt-3 rounded-lg px-3 py-2 text-center text-xs font-semibold ${decision === 'ok' ? 'bg-primary-500/20 text-primary-200' : 'bg-white/10 text-slate-300'}`}>
              {decision === 'ok' ? <><Check className="-mt-0.5 mr-1 inline h-3.5 w-3.5" strokeWidth={2.5} aria-hidden="true" />Labor aprobada y registrada</> : 'Propuesta descartada'}
              <button type="button" onClick={() => setDecision(null)} className="ml-2 underline underline-offset-2">Deshacer</button>
            </p>
          ) : (
            <div className="mt-3 flex gap-2">
              <button type="button" onClick={() => setDecision('ok')} className="flex-1 rounded-lg bg-primary-500 py-2 text-xs font-semibold text-slate-950 transition-colors hover:bg-primary-400">Aprobar acción</button>
              <button type="button" onClick={() => setDecision('no')} className="flex-1 rounded-lg border border-white/15 py-2 text-xs font-semibold text-slate-300 transition-colors hover:bg-white/5">Rechazar</button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

const CROPS = [
  { label: 'Pepino', cost: 0.41, market: 0.74 },
  { label: 'Tomate', cost: 0.58, market: 1.06 },
  { label: 'Berenjena', cost: 0.49, market: 0.81 },
  { label: 'Pimiento', cost: 0.82, market: 1.24 },
]

function CostVisual() {
  const [active, setActive] = useState(0)
  const crop = CROPS[active]
  const margin = ((crop.market - crop.cost) / crop.market) * 100
  const max = Math.max(...CROPS.map((c) => c.market))
  return (
    <div className="rounded-2xl bg-slate-950/60 p-4 shadow-surface-sm sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs text-slate-400">Coste de producción vs. precio en origen (€/kg)</p>
          <p className="mt-1 text-lg font-semibold text-white">{crop.label}</p>
        </div>
        <div className="text-right">
          <p className="text-[11px] text-slate-500">Margen bruto</p>
          <p className="text-3xl font-semibold tabular-nums text-primary-300">{Math.round(margin)} %</p>
        </div>
      </div>
      <ul className="mt-5 space-y-3">
        {CROPS.map((c, i) => (
          <li key={c.label}>
            <button
              type="button"
              onMouseEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              onClick={() => setActive(i)}
              className={`w-full rounded-xl p-2 text-left transition-colors ${i === active ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
            >
              <div className="flex justify-between text-xs">
                <span className={i === active ? 'font-semibold text-white' : 'text-slate-400'}>{c.label}</span>
                <span className="tabular-nums text-slate-400">
                  {c.cost.toFixed(2).replace('.', ',')} <ArrowRight className="-mt-0.5 inline h-3 w-3" aria-label="pasa a" /> <span className="text-slate-100">{c.market.toFixed(2).replace('.', ',')} €</span>
                </span>
              </div>
              <div className="relative mt-1.5 h-2.5 rounded-full bg-white/5">
                <div className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary-500 to-secondary-400 transition-[width] duration-500 ease-out" style={{ width: `${(c.market / max) * 100}%` }} />
                <div className="absolute inset-y-0 left-0 rounded-full bg-accent-400/90 transition-[width] duration-500 ease-out" style={{ width: `${(c.cost / max) * 100}%` }} />
              </div>
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-3 flex gap-4 text-[11px] text-slate-500">
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-accent-400" /> Coste imputado</span>
        <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full bg-secondary-400" /> Precio lonja</span>
        <span>· Datos de demostración</span>
      </p>
    </div>
  )
}

export const HERO_SLIDES = [
  {
    id: 'agua',
    icon: DropIcon,
    tag: 'Telemetría de precisión',
    title: 'Optimización hídrica en cada sector',
    text: 'Sondas de humedad, temperatura y conductividad conectadas que ajustan cada riego a la necesidad real del cultivo.',
    kpis: [
      { value: '3', label: 'variables por sonda' },
      { value: '15 min', label: 'frecuencia de lectura' },
      { value: '24/7', label: 'alertas de umbral' },
    ],
    Visual: SensorChart,
  },
  {
    id: 'agente',
    icon: SparkIcon,
    tag: 'IA con Human-in-the-Loop',
    title: 'Un asistente agronómico que propone, tú decides',
    text: 'Agropelink AI interpreta tus datos y prepara labores y tratamientos. Ninguna acción se ejecuta sin tu aprobación explícita.',
    kpis: [
      { value: '100 %', label: 'acciones con aprobación' },
      { value: 'HITL', label: 'tú apruebas cada labor' },
      { value: 'ES', label: 'en tu idioma, en el campo' },
    ],
    Visual: AgentVisual,
  },
  {
    id: 'costes',
    icon: ChartIcon,
    tag: 'Control económico',
    title: 'Rentabilidad real frente a la lonja',
    text: 'Cruza tus costes de explotación con las cotizaciones en origen para decidir cuándo cortar y a quién vender.',
    kpis: [
      { value: '€/kg', label: 'coste real por cultivo' },
      { value: '5', label: 'hortícolas de referencia' },
      { value: 'Semanal', label: 'tendencia de precios' },
    ],
    Visual: CostVisual,
  },
]
