import { AlertTriangle } from 'lucide-react'
import { CHART } from '../dashboard/chartTheme.js'
import { money } from './economyMeta.js'

const SOURCES = [
  { key: 'fixed', label: 'Costes fijos', hint: 'Semillas, fertilizantes y demás costes iniciales', color: CHART.fixed },
  { key: 'variable', label: 'Costes variables', hint: 'Registrados durante la campaña', color: CHART.variable },
  { key: 'invoices', label: 'Facturas archivadas', hint: 'Documentos por fecha de devengo', color: CHART.invoices },
  { key: 'declared', label: 'Declarado en la ficha', hint: 'Importe sin desglose de fichas antiguas', color: CHART.declared },
]

/**
 * Presupuesto anual consumido: una barra segmentada por origen del gasto (2 px de separación entre tramos)
 * y, debajo, el importe EXACTO de cada origen. Leyenda siempre visible: el color nunca va solo.
 */
export default function BudgetPanel({ budget, year }) {
  const { total, consumed, remaining, consumed_pct: pct } = budget
  const scale = total && total > consumed ? total : consumed || 1
  const visible = SOURCES.filter((s) => budget[s.key] > 0 || s.key !== 'declared')
  const over = total !== null && consumed > total

  return (
    <section aria-labelledby="budget-title" className="card-glass p-5 sm:p-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div>
          <h2 id="budget-title" className="text-sm font-medium text-slate-400">Presupuesto consumido · {year}</h2>
          <p className="mt-1 text-3xl font-semibold tabular-nums tracking-tight text-white">
            {money(consumed)}
            {total !== null && <span className="ml-2 text-base font-normal text-slate-400">de {money(total)}</span>}
          </p>
        </div>
        {total !== null ? (
          <div className="md:text-right">
            <p className={`text-2xl font-semibold tabular-nums ${over ? 'text-accent-200' : 'text-white'}`}>{(pct ?? 0).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</p>
            <p className={`text-sm tabular-nums ${over ? 'text-accent-200' : 'text-slate-400'}`}>{over ? `Excedido en ${money(-remaining)}` : `Quedan ${money(remaining)}`}</p>
          </div>
        ) : (
          <p className="text-sm text-slate-400">Sin presupuesto anual definido</p>
        )}
      </div>

      <div className="mt-5 flex h-3 gap-0.5 overflow-hidden rounded-full bg-white/[0.06]" role="img" aria-label={`Consumido ${money(consumed)}${total !== null ? ` de ${money(total)}` : ''}`}>
        {visible.map((s) => budget[s.key] > 0 && (
          <span key={s.key} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(budget[s.key] / scale) * 100}%`, background: s.color }} />
        ))}
      </div>
      {over && (
        <p className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-accent-200">
          <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> El gasto del año supera el presupuesto anual.
        </p>
      )}

      <dl className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {visible.map((s) => (
          <div key={s.key} className="rounded-xl bg-white/[0.03] px-4 py-3">
            <dt className="flex items-center gap-2 text-xs font-medium text-slate-400">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />
              {s.label}
            </dt>
            <dd className="mt-1 text-lg font-semibold tabular-nums text-white">{money(budget[s.key])}</dd>
            <dd className="text-[11px] text-slate-500">
              {consumed > 0 ? `${((budget[s.key] / consumed) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} % del gasto · ` : ''}{s.hint}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  )
}
