import Card from '../../components/ui/Card.jsx'
import { categoryLabel, money } from './economyMeta.js'

/** Gasto por categoría: barras horizontales HTML con etiqueta e importe directos (una sola serie). */
export function CategoryBreakdown({ items }) {
  const max = Math.max(...items.map((i) => i.amount), 0)
  const total = items.reduce((sum, i) => sum + i.amount, 0)
  return (
    <Card title="Por categoría">
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Sin gastos en este año.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((i) => (
            <li key={i.key}>
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="text-slate-200">{categoryLabel(i.key)}</span>
                <span className="tabular-nums text-slate-100">{money(i.amount)} <span className="text-xs text-slate-500">· {((i.amount / total) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} %</span></span>
              </div>
              <div className="mt-1.5 h-1.5 rounded-full bg-white/[0.06]">
                <div className="h-full rounded-full bg-secondary-500" style={{ width: `${(i.amount / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

/** Coste por cosecha (costes registrados) con coste por hectárea cuando hay superficie. */
export function HarvestCostTable({ items }) {
  return (
    <Card title="Por cosecha">
      {items.length === 0 ? (
        <p className="text-sm text-slate-400">Sin costes imputados en este año.</p>
      ) : (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="py-2 font-semibold">Cosecha</th><th className="py-2 text-right font-semibold">Coste</th><th className="py-2 text-right font-semibold">€/ha</th></tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06] tabular-nums">
            {items.map((h) => (
              <tr key={h.harvest_id ?? 'none'}>
                <td className={`py-2 ${h.harvest_id ? 'text-slate-200' : 'italic text-slate-400'}`}>{h.name}</td>
                <td className="py-2 text-right text-slate-100">{money(h.amount)}</td>
                <td className="py-2 text-right text-slate-300">{h.cost_per_ha !== null ? money(h.cost_per_ha) : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <p className="mt-3 text-[11px] text-slate-500">Las facturas archivadas no se imputan a cosechas: cuentan en el total de la finca.</p>
    </Card>
  )
}
