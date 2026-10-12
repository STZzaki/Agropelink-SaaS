import { useState } from 'react'
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Card from '../../components/ui/Card.jsx'
import { CHART } from '../dashboard/chartTheme.js'
import { QUARTERS, money } from './economyMeta.js'

const AXIS = { stroke: CHART.axis, tick: { fill: CHART.muted, fontSize: 11 }, tickLine: false, axisLine: false }
const SERIES = [
  { key: 'fixed', label: 'Fijos', color: CHART.fixed },
  { key: 'variable', label: 'Variables', color: CHART.variable },
  { key: 'invoices', label: 'Facturas', color: CHART.invoices },
]

function Toggle({ table, onToggle }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={table} className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-400 transition-colors duration-300 hover:bg-white/5 hover:text-slate-200">
      {table ? 'Ver gráfica' : 'Ver tabla'}
    </button>
  )
}

function Tip({ active, payload, label, title }) {
  if (!active || !payload?.length) return null
  const total = payload.reduce((sum, p) => sum + (p.value || 0), 0)
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs shadow-overlay">
      <p className="mb-1 font-semibold text-slate-100">{title ? title(label) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-300">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
          {p.name}: <span className="ml-auto pl-3 font-semibold tabular-nums text-slate-100">{money(p.value)}</span>
        </p>
      ))}
      {payload.length > 1 && <p className="mt-1 border-t border-white/10 pt-1 text-slate-300">Total: <span className="font-semibold tabular-nums text-white">{money(total)}</span></p>}
    </div>
  )
}

/** Gasto por trimestre apilado por origen (fijos · variables · facturas). Leyenda fija y vista de tabla. */
export function QuarterChart({ data, year }) {
  const [table, setTable] = useState(false)
  const rows = data.map((q) => ({ ...q, name: `T${q.quarter}`, total: q.fixed + q.variable + q.invoices }))
  const empty = rows.every((r) => r.total === 0)
  return (
    <Card title={`Gasto trimestral · ${year}`} actions={!empty && <Toggle table={table} onToggle={() => setTable((v) => !v)} />}>
      <ul className="-mt-2 mb-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-300" aria-label="Leyenda">
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} aria-hidden="true" />{s.label}</li>
        ))}
      </ul>
      {empty ? (
        <p className="flex h-56 items-center justify-center rounded-xl border border-dashed border-white/10 px-6 text-center text-sm text-slate-400">Sin gastos registrados en {year}.</p>
      ) : table ? (
        <div className="relative -mx-1 overflow-x-auto px-1" data-lenis-prevent>
        <table className="w-full min-w-[30rem] text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="py-2 font-semibold">Trimestre</th>{SERIES.map((s) => <th key={s.key} className="py-2 text-right font-semibold">{s.label}</th>)}<th className="py-2 text-right font-semibold">Total</th></tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06] tabular-nums">
            {rows.map((r) => (
              <tr key={r.quarter}>
                <td className="py-2 text-slate-300">{QUARTERS[r.quarter - 1]}</td>
                {SERIES.map((s) => <td key={s.key} className="py-2 text-right text-slate-200">{money(r[s.key])}</td>)}
                <td className="py-2 text-right font-semibold text-white">{money(r.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        </div>
      ) : (
        <div className="h-60" role="img" aria-label={`Gasto por trimestre en ${year}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="28%">
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis width={64} tickFormatter={(v) => money(v, true)} {...AXIS} />
              <Tooltip content={<Tip title={(l) => QUARTERS[Number(l.slice(1)) - 1]} />} cursor={{ fill: 'rgb(255 255 255 / 0.04)' }} />
              {SERIES.map((s) => (
                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="q" fill={s.color} stroke="#1c2623" strokeWidth={2} isAnimationActive={false} />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

/** Evolución anual (últimos 5 años): una sola serie, sin leyenda (el título la nombra). */
export function YearChart({ data, year }) {
  const [table, setTable] = useState(false)
  const empty = data.every((d) => d.amount === 0)
  return (
    <Card title="Gasto anual · últimos 5 años" actions={!empty && <Toggle table={table} onToggle={() => setTable((v) => !v)} />}>
      {empty ? (
        <p className="flex h-56 items-center justify-center rounded-xl border border-dashed border-white/10 px-6 text-center text-sm text-slate-400">Aún no hay gastos con fecha.</p>
      ) : table ? (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-400"><tr><th className="py-2 font-semibold">Año</th><th className="py-2 text-right font-semibold">Gasto</th></tr></thead>
          <tbody className="divide-y divide-white/[0.06] tabular-nums">
            {data.map((d) => <tr key={d.year}><td className="py-2 text-slate-300">{d.year}</td><td className="py-2 text-right text-slate-100">{money(d.amount)}</td></tr>)}
          </tbody>
        </table>
      ) : (
        <div className="h-60" role="img" aria-label="Gasto por año">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data.map((d) => ({ ...d, name: String(d.year) }))} margin={{ top: 8, right: 8, bottom: 0, left: 8 }} barCategoryGap="32%">
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="name" {...AXIS} />
              <YAxis width={64} tickFormatter={(v) => money(v, true)} {...AXIS} />
              <Tooltip content={<Tip />} cursor={{ fill: 'rgb(255 255 255 / 0.04)' }} />
              <Bar dataKey="amount" name="Gasto" fill={CHART.moisture} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-2 text-[11px] text-slate-500">Año seleccionado: {year}. Incluye costes registrados y facturas con fecha de devengo.</p>
    </Card>
  )
}
