/* Diapositivas del carrusel del Hero: cada una con titular, KPIs grandes y un visual de producto. */
import { useState } from 'react'
import SensorChart from './SensorChart.jsx'
import { ChartIcon, DropIcon, SparkIcon } from './icons.jsx'
import { ArrowRight, Check, Tractor, Users } from 'lucide-react'

function AgentVisual() {
  const [decision, setDecision] = useState(null)
  return (
    <div className="space-y-3 rounded-2xl bg-slate-950/60 p-4 shadow-surface-sm sm:p-6">
      <div className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-primary-600 px-4 py-2.5 text-sm text-white">
        Las trampas del sector 2 han saltado. ¿Qué hacemos?
      </div>
      <div className="max-w-[95%] rounded-2xl rounded-bl-sm bg-white/[0.04] p-4 shadow-surface-sm text-sm text-slate-200">
        <p className="text-[11px] font-semibold text-secondary-300">Agropelink AI</p>
        <p className="mt-1">Umbral de mosca blanca superado. Activo tu protocolo estándar de plagas (modelo MBSE) con los recursos libres:</p>
        <div className="mt-3 rounded-xl border border-accent-400/30 bg-accent-500/10 p-4">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-accent-200">Protocolo SOP-PLAGAS-02 · Confirmación requerida</p>
          <p className="mt-1 text-base font-semibold text-white">Tratamiento mosca blanca · Sector 2</p>
          <dl className="mt-2 grid grid-cols-2 gap-2 text-xs">
            <div><dt className="text-slate-400">Fecha</dt><dd className="font-medium text-slate-100">Mañana, 8:00</dd></div>
            <div><dt className="text-slate-400">Plazo seguridad</dt><dd className="font-medium text-slate-100">Según etiqueta</dd></div>
          </dl>
          {/* Recursos asignados por el planificador (cuadrilla y maquinaria) */}
          <dl className="mt-3 space-y-1.5 border-t border-white/10 pt-3 text-xs">
            <div className="flex items-center gap-2">
              <dt className="inline-flex items-center gap-2 text-slate-400"><Users className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />Cuadrilla asignada:</dt>
              <dd className="font-medium text-slate-100">Equipo B (3 operarios)</dd>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <dt className="inline-flex items-center gap-2 text-slate-400"><Tractor className="h-3.5 w-3.5 shrink-0 text-emerald-300" aria-hidden="true" />Maquinaria:</dt>
              <dd className="font-medium text-slate-100">Cuba 1000L</dd>
              <dd className="pill-neon normal-case tracking-normal">
                <span className="pill-neon-dot" aria-hidden="true" />
                Sin colisión de turnos
              </dd>
            </div>
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
    tag: 'Gestión predictiva',
    title: 'Detecta, predice y adjudica antes de que falle',
    text: 'El sistema detecta patrones en tus datos, predice problemas antes de que ocurran, planifica el mantenimiento preventivo y adjudica cada tarea automáticamente según los recursos disponibles y el historial de tu finca.',
    kpis: [
      { value: '24/7', label: 'detección de patrones' },
      { value: 'Preventivo', label: 'mantenimiento planificado' },
      { value: 'Auto', label: 'adjudicación de tareas' },
    ],
    Visual: SensorChart,
  },
  {
    id: 'agente',
    icon: SparkIcon,
    tag: 'Modelado MBSE',
    title: 'Aprende cómo trabajas y lo convierte en protocolo',
    text: 'Mediante MBSE, Agropelink aprende la metodología de tu explotación —recursos, maquinaria y operarios— y crea protocolos estandarizados, incluidos los de emergencia, listos para activarse cuando hagan falta.',
    kpis: [
      { value: 'MBSE', label: 'modelo vivo de tu finca' },
      { value: 'SOP', label: 'protocolos de emergencia' },
      { value: 'HITL', label: 'tú apruebas cada labor' },
    ],
    Visual: AgentVisual,
  },
  {
    id: 'costes',
    icon: ChartIcon,
    tag: 'Control económico',
    title: 'Ratios, previsión de gastos y márgenes reales',
    text: 'Controla tus ratios de coste, anticipa los gastos futuros con gráficas de previsión y calcula tu margen real frente a la lonja para decidir cuándo cortar y a quién vender.',
    kpis: [
      { value: '€/kg', label: 'margen real vs. lonja' },
      { value: 'Ratios', label: 'control de costes' },
      { value: 'Previsión', label: 'gastos futuros' },
    ],
    Visual: CostVisual,
  },
]
