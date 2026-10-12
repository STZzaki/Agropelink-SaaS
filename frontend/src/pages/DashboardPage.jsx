import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { analyticsApi, farmsApi } from '../api.js'
import { TASK_CREATED_EVENT } from '../components/agent/AgentChat.jsx'
import Alert from '../components/ui/Alert.jsx'
import Card from '../components/ui/Card.jsx'
import { inputClass, optionClass } from '../components/ui/FormField.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { LoadingBlock } from '../components/ui/Spinner.jsx'
import { InputsSpendChart, WaterMoistureChart } from '../features/dashboard/AnalyticsCharts.jsx'
import KpiGrid from '../features/dashboard/KpiGrid.jsx'
import ReadingQuickForm from '../features/dashboard/ReadingQuickForm.jsx'
import SensorDashboard from '../features/sensors/SensorDashboard.jsx'
import AgentBriefing from '../features/dashboard/AgentBriefing.jsx'
import { demoOverview, fmt } from '../features/dashboard/chartTheme.js'
import useApi from '../hooks/useApi.js'
import { ArrowRight, Sprout } from 'lucide-react'

const RANGES = [
  { days: 7, label: '7 días' },
  { days: 30, label: '30 días' },
  { days: 90, label: '90 días' },
]

function FarmCard({ farm }) {
  return (
    <li className="card-glass flex gap-4 overflow-hidden p-3">
      <div className="h-20 w-24 shrink-0 overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-inset ring-white/10">
        {farm.has_photo ? (
          <img src={farmsApi.photoUrl(farm.id)} alt={`Instalación de ${farm.name}`} loading="lazy" className="h-full w-full object-cover" />
        ) : (
          <span className="flex h-full items-center justify-center" aria-hidden="true"><Sprout className="h-7 w-7 text-primary-300/70" strokeWidth={1.5} /></span>
        )}
      </div>
      <div className="min-w-0 flex-1 py-1">
        <p className="truncate font-semibold text-white">{farm.name}</p>
        <p className="truncate text-sm text-slate-400">{farm.location}</p>
        <p className="mt-1 truncate text-xs text-slate-500">
          {[farm.surface_ha && `${fmt(farm.surface_ha)} ha`, farm.crop_types?.slice(0, 3).join(', '), farm.avg_workers && `${farm.avg_workers} trabajadores`].filter(Boolean).join(' · ') || 'Ficha básica'}
        </p>
      </div>
    </li>
  )
}

/** Panel analítico del agricultor: KPIs, agua vs humedad, gasto en insumos y sus fincas. */
export default function DashboardPage() {
  const [farmId, setFarmId] = useState('')
  const [days, setDays] = useState(30)
  const [demo, setDemo] = useState(false)
  const farms = useApi((signal) => farmsApi.list({ limit: 100 }, { signal }))
  const overview = useApi((signal) => analyticsApi.overview({ farm_id: farmId || undefined, days }, { signal }), [farmId, days])

  const reload = overview.reload
  useEffect(() => {
    window.addEventListener(TASK_CREATED_EVENT, reload)
    return () => window.removeEventListener(TASK_CREATED_EVENT, reload)
  }, [reload])

  const farmList = farms.data ?? []
  const data = overview.data
  const isEmpty = data && data.water_vs_moisture.length === 0 && data.inputs_spend.every((p) => !p.this_year && !p.last_year)
  const series = demo ? demoOverview(days) : data
  const { state: navState } = useLocation()

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Panel de control" title="Tu explotación" subtitle="Sensores en directo, clima y carburante; después, riego, insumos y presupuesto de tus fincas con tus propios datos." />

      {/* 0. Lo importante de hoy, según el agente (local). */}
      <AgentBriefing />

      {/* 1. Sensorización en directo (prioritaria): se monta cuando ya se conocen las fincas. */}
      {farms.loading ? (
        <div className="mb-12"><LoadingBlock label="Cargando fincas…" /></div>
      ) : !farms.error && (
        <SensorDashboard farms={farmList} />
      )}

      {/* 2. Resumen y analítica histórica */}
      <h2 className="mb-4 text-xl font-semibold tracking-tight text-white sm:text-2xl">Resumen y analítica</h2>
      {/* Filtros en una sola fila sobre las gráficas */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <label htmlFor="dash-farm" className="sr-only">Finca</label>
        <select id="dash-farm" value={farmId} onChange={(e) => setFarmId(e.target.value)} className={`${inputClass} sm:!w-auto sm:min-w-[12rem]`}>
          <option className={optionClass} value="">Todas las fincas</option>
          {farmList.map((f) => <option className={optionClass} key={f.id} value={f.id}>{f.name}</option>)}
        </select>
        <div role="group" aria-label="Periodo" className="flex gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/10">
          {RANGES.map((r) => (
            <button key={r.days} type="button" aria-pressed={days === r.days} onClick={() => setDays(r.days)} className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-300 ${days === r.days ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              {r.label}
            </button>
          ))}
        </div>
        <Link to="/farms/nueva" className="inline-flex h-10 items-center justify-center rounded-xl sm:ml-auto bg-gradient-to-b from-primary-400 to-secondary-500 px-4 text-sm font-semibold text-slate-950 shadow-btn-primary transition-[transform,box-shadow] duration-300 hover:-translate-y-px hover:shadow-btn-primary-hover">
          + Nueva granja
        </Link>
      </div>

      {navState?.createdFarm && (
        <div className="mb-6">
          <Alert variant={navState.warning ? 'error' : 'success'}>{navState.warning ?? `Granja «${navState.createdFarm}» creada correctamente.`}</Alert>
        </div>
      )}
      {overview.error && <div className="mb-6"><Alert variant="error" onRetry={overview.reload}>{overview.error}</Alert></div>}

      {!data && overview.loading ? (
        <LoadingBlock label="Calculando analítica…" />
      ) : data ? (
        <div className="space-y-6">
          <KpiGrid kpis={data.kpis} />

          {isEmpty && (
            <div className="flex flex-col items-start gap-3 rounded-xl border border-secondary-400/20 md:flex-row md:items-center md:justify-between bg-secondary-500/[0.06] px-4 py-3 text-sm text-slate-300">
              <p>Aún no hay lecturas de riego ni facturas de insumos. Registra una lectura abajo o archiva tus facturas para ver tus gráficas.</p>
              <button type="button" onClick={() => setDemo((v) => !v)} aria-pressed={demo} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs font-semibold text-slate-200 transition-colors duration-300 hover:bg-white/5">
                {demo ? 'Ocultar ejemplo' : 'Ver con datos de ejemplo'}
              </button>
            </div>
          )}
          {demo && <p role="status" className="text-xs font-semibold uppercase tracking-wide text-accent-300">Vista previa con datos de ejemplo · no corresponden a tu explotación</p>}

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <WaterMoistureChart data={series.water_vs_moisture} demo={demo} emptyHint="Sin lecturas en este periodo. Conecta tus sensores o registra el riego y la humedad del día." />
            <InputsSpendChart data={series.inputs_spend} year={data.year} demo={demo} emptyHint="Sin facturas de fitosanitarios, fertilizantes o semillas con fecha de devengo. Archívalas en Documentos." />
          </div>

          <Card title="Registrar lectura de riego y humedad">
            {farmList.length ? <ReadingQuickForm farms={farmList} onSaved={() => { setDemo(false); overview.reload() }} /> : <p className="text-sm text-slate-400">Crea primero una granja.</p>}
          </Card>
        </div>
      ) : null}

      <section aria-labelledby="farms-title" className="mt-10">
        <div className="mb-4 flex items-center justify-between">
          <h2 id="farms-title" className="text-lg font-semibold text-white">Mis granjas</h2>
          <Link to="/tasks" className="inline-flex items-center gap-1 text-sm font-medium text-secondary-300 transition-colors duration-300 hover:text-secondary-200">Ver tareas <ArrowRight className="h-4 w-4" aria-hidden="true" /></Link>
        </div>
        {farms.loading ? (
          <LoadingBlock label="Cargando fincas…" />
        ) : farms.error ? (
          <Alert variant="error" onRetry={farms.reload}>{farms.error}</Alert>
        ) : farmList.length ? (
          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{farmList.map((f) => <FarmCard key={f.id} farm={f} />)}</ul>
        ) : (
          <div className="rounded-xl border border-dashed border-white/15 px-6 py-10 text-center text-sm text-slate-400">
            Aún no tienes granjas. <Link to="/farms/nueva" className="font-semibold text-secondary-300 underline-offset-2 hover:underline">Crea la primera</Link> con el asistente.
          </div>
        )}
      </section>
    </div>
  )
}
