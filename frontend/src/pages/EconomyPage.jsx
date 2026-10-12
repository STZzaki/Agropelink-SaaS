import { AlertCircle } from 'lucide-react'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { economyApi, farmsApi } from '../api.js'
import Alert from '../components/ui/Alert.jsx'
import { inputClass, optionClass } from '../components/ui/FormField.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { LoadingBlock } from '../components/ui/Spinner.jsx'
import BudgetPanel from '../features/economy/BudgetPanel.jsx'
import ExpensesPanel from '../features/economy/ExpensesPanel.jsx'
import { CategoryBreakdown, HarvestCostTable } from '../features/economy/FinanceBreakdowns.jsx'
import { QuarterChart, YearChart } from '../features/economy/FinanceCharts.jsx'
import HarvestsPanel from '../features/economy/HarvestsPanel.jsx'
import useApi from '../hooks/useApi.js'

const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 5 }, (_, i) => THIS_YEAR - i)

/** Economía de la finca: presupuesto consumido con su desglose exacto, trimestres, años, categorías y cosechas. */
export default function EconomyPage() {
  const [farmId, setFarmId] = useState(null)
  const [year, setYear] = useState(THIS_YEAR)
  const [version, setVersion] = useState(0)
  const farms = useApi((signal) => farmsApi.list({ limit: 100 }, { signal }), [version])
  const farmList = farms.data ?? []
  const farm = farmList.find((f) => f.id === farmId) ?? farmList[0] ?? null
  const id = farm?.id

  const finance = useApi((signal) => (id ? economyApi.finance(id, year, { signal }) : Promise.resolve(null)), [id, year, version])
  const harvests = useApi((signal) => (id ? economyApi.harvests(id, { signal }) : Promise.resolve([])), [id, version])
  const refresh = () => setVersion((v) => v + 1)
  const fin = finance.data

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Economía" title="Presupuesto y costes" subtitle="Cuánto llevas gastado, en qué, en qué trimestre y en qué cosecha: costes registrados y facturas archivadas." />

      {farms.loading && !farms.data ? (
        <LoadingBlock label="Cargando fincas…" />
      ) : farms.error ? (
        <Alert variant="error" onRetry={farms.reload}>{farms.error}</Alert>
      ) : !farm ? (
        <div className="rounded-xl border border-dashed border-white/15 px-6 py-10 text-center text-sm text-slate-400">
          Aún no tienes granjas. <Link to="/farms/nueva" className="font-semibold text-secondary-300 underline-offset-2 hover:underline">Crea la primera</Link> con sus cosechas y costes fijos.
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <label htmlFor="eco-farm" className="sr-only">Finca</label>
            <select id="eco-farm" value={id} onChange={(e) => setFarmId(Number(e.target.value))} className={`${inputClass} sm:!w-auto sm:min-w-[12rem]`}>
              {farmList.map((f) => <option className={optionClass} key={f.id} value={f.id}>{f.name}</option>)}
            </select>
            <label htmlFor="eco-year" className="sr-only">Año</label>
            <select id="eco-year" value={year} onChange={(e) => setYear(Number(e.target.value))} className={`${inputClass} sm:!w-auto`}>
              {YEARS.map((y) => <option className={optionClass} key={y} value={y}>{y}</option>)}
            </select>
          </div>

          {finance.error && <div className="mb-6"><Alert variant="error" onRetry={finance.reload}>{finance.error}</Alert></div>}
          {!fin && finance.loading ? (
            <LoadingBlock label="Calculando economía…" />
          ) : fin ? (
            <div className="space-y-6">
              <BudgetPanel budget={fin.budget} year={fin.year} />
              {fin.undated_invoices > 0 && (
                <p className="flex items-start gap-2 rounded-xl bg-accent-500/10 px-4 py-3 text-sm text-accent-100 ring-1 ring-inset ring-accent-400/25">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <span>{fin.undated_invoices} {fin.undated_invoices === 1 ? 'factura' : 'facturas'} de {fin.year} sin fecha de devengo no se incluyen en el desglose. Complétala en <Link to="/documents" className="font-semibold underline underline-offset-2">Documentos</Link>.</span>
                </p>
              )}
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <QuarterChart data={fin.by_quarter} year={fin.year} />
                <YearChart data={fin.by_year} year={fin.year} />
              </div>
              <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
                <CategoryBreakdown items={fin.by_category} />
                <HarvestCostTable items={fin.by_harvest} />
              </div>
              <HarvestsPanel farm={farm} harvests={harvests.data ?? []} onChanged={refresh} />
              <ExpensesPanel key={`${id}-${year}`} farmId={id} year={year} harvests={harvests.data ?? []} onChanged={refresh} />
              <p className="text-xs text-slate-500">
                Las facturas archivadas en Documentos cuentan como gasto por su fecha de devengo: no registres aquí el mismo importe como coste para no duplicarlo.
              </p>
            </div>
          ) : null}
        </>
      )}
    </div>
  )
}
