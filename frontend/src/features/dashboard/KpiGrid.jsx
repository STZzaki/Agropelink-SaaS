import { fmt, fmtEuro, fmtLiters } from './chartTheme.js'

function Kpi({ label, value, hint, children }) {
  return (
    <div className="card-glass flex flex-col p-5 transition-[border-color,box-shadow] duration-300 hover:card-glass-active">
      <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-2 text-2xl font-semibold tabular-nums tracking-tight text-white sm:text-3xl">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
      {children}
    </div>
  )
}

function Delta({ current, previous }) {
  if (!previous) return <span className="text-slate-500">sin datos del año anterior</span>
  const pct = ((current - previous) / previous) * 100
  const up = pct > 0
  // Más gasto en insumos no es "bueno" ni "malo" por sí mismo: se muestra neutro, con flecha y texto.
  return (
    <span className="text-slate-300">
      <span aria-hidden="true">{up ? '▲' : '▼'}</span> {fmt(Math.abs(pct))} % {up ? 'más' : 'menos'} que en el mismo periodo de {new Date().getFullYear() - 1}
    </span>
  )
}

/** Tarjetas KPI de cristal oscuro (se iluminan en verde al pasar el ratón). Solo datos reales de la cuenta. */
export default function KpiGrid({ kpis }) {
  const budgetPct = kpis.budget_total > 0 ? Math.min(100, (kpis.budget_spent / kpis.budget_total) * 100) : null
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Kpi label="Superficie gestionada" value={`${fmt(kpis.surface_ha)} ha`} hint={`${kpis.farms} ${kpis.farms === 1 ? 'finca' : 'fincas'} · ${kpis.pending_tasks} tareas pendientes`} />
      <Kpi label="Agua · últimos 30 días" value={fmtLiters(kpis.water_liters_30d)} hint={kpis.avg_moisture_7d !== null ? `Humedad media 7 días: ${fmt(kpis.avg_moisture_7d)} %` : 'Sin lecturas de humedad esta semana'} />
      <Kpi label={`Insumos ${new Date().getFullYear()} (acumulado)`} value={fmtEuro(kpis.inputs_spend_ytd)} hint={<Delta current={kpis.inputs_spend_ytd} previous={kpis.inputs_spend_prev_ytd} />} />
      <Kpi label="Presupuesto consumido" value={budgetPct === null ? '—' : `${fmt(budgetPct)} %`} hint={budgetPct === null ? 'Define el presupuesto en la ficha de la finca' : `${fmtEuro(kpis.budget_spent)} de ${fmtEuro(kpis.budget_total)}`}>
        {budgetPct !== null && (
          <span className="mt-3 block h-1.5 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={Math.round(budgetPct)} aria-valuemin={0} aria-valuemax={100} aria-label="Presupuesto consumido">
            <span className="block h-full origin-left rounded-full bg-gradient-to-r from-primary-400 to-secondary-400" style={{ transform: `scaleX(${budgetPct / 100})` }} />
          </span>
        )}
      </Kpi>
    </div>
  )
}
