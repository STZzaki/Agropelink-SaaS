import { useState } from 'react'
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import Card from '../../components/ui/Card.jsx'
import { CHART, MONTHS, fmt, fmtEuro, fmtLiters, shortDate } from './chartTheme.js'

const AXIS = { stroke: CHART.axis, tick: { fill: CHART.muted, fontSize: 11 }, tickLine: false, axisLine: false }

function ChartTooltip({ active, payload, label, labelFormatter, valueFormatter }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl border border-white/10 bg-slate-900 px-3 py-2 text-xs shadow-overlay">
      <p className="mb-1 font-semibold text-slate-100">{labelFormatter ? labelFormatter(label) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-slate-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden="true" />
          {p.name}: <span className="font-semibold tabular-nums text-slate-100">{valueFormatter(p.value, p.dataKey)}</span>
        </p>
      ))}
    </div>
  )
}

function TableToggle({ shown, onToggle }) {
  return (
    <button type="button" onClick={onToggle} aria-pressed={shown} className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-400 transition-colors duration-300 hover:bg-white/5 hover:text-slate-200">
      {shown ? 'Ver gráfica' : 'Ver tabla'}
    </button>
  )
}

function EmptyChart({ children }) {
  return <div className="flex h-56 items-center justify-center rounded-xl border border-dashed border-white/10 px-6 text-center text-sm text-slate-400">{children}</div>
}

/**
 * Agua usada vs humedad del suelo. Dos magnitudes con escalas distintas (litros y %) → dos gráficas
 * sincronizadas sobre el mismo eje temporal, nunca un gráfico de doble eje Y (engaña al comparar).
 */
export function WaterMoistureChart({ data, demo, emptyHint }) {
  const [table, setTable] = useState(false)
  const water = (v) => fmtLiters(v ?? 0)
  return (
    <Card title="Agua usada vs. humedad del suelo" actions={data.length > 0 && <TableToggle shown={table} onToggle={() => setTable((v) => !v)} />}>
      <p className="-mt-3 mb-4 text-xs text-slate-500">Sensores IoT y registros de riego · {demo ? 'datos de ejemplo' : 'tus lecturas'}</p>
      {data.length === 0 ? (
        <EmptyChart>{emptyHint}</EmptyChart>
      ) : table ? (
        <div className="relative max-h-72 overflow-auto" data-lenis-prevent>
          <table className="w-full text-left text-sm">
            <thead className="sticky top-0 bg-slate-900 text-xs uppercase tracking-wide text-slate-400">
              <tr><th className="py-2 font-semibold">Fecha</th><th className="py-2 text-right font-semibold">Agua</th><th className="py-2 text-right font-semibold">Humedad</th></tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06] tabular-nums">
              {data.map((d) => (
                <tr key={d.date}><td className="py-1.5 text-slate-300">{shortDate(d.date)}</td><td className="py-1.5 text-right text-slate-100">{water(d.water_liters)}</td><td className="py-1.5 text-right text-slate-100">{fmt(d.soil_moisture_pct)} %</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-2" role="img" aria-label="Gráficas sincronizadas de agua usada por día y humedad media del suelo">
          <p className="text-xs font-medium text-slate-400"><span className="mr-1.5 inline-block h-2 w-2 rounded-sm align-middle" style={{ background: CHART.water }} aria-hidden="true" />Agua usada por día</p>
          <ResponsiveContainer width="100%" height={150}>
            <BarChart data={data} syncId="water-moisture" margin={{ top: 4, right: 8, bottom: 0, left: 0 }} barCategoryGap={2}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="date" hide />
              <YAxis {...AXIS} width={52} tickFormatter={(v) => fmtLiters(v)} />
              <Tooltip cursor={{ fill: 'rgb(255 255 255 / 0.04)' }} content={<ChartTooltip labelFormatter={shortDate} valueFormatter={(v) => water(v)} />} />
              <Bar dataKey="water_liters" name="Agua" fill={CHART.water} radius={[4, 4, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
          <p className="pt-2 text-xs font-medium text-slate-400"><span className="mr-1.5 inline-block h-0.5 w-3 align-middle" style={{ background: CHART.moisture }} aria-hidden="true" />Humedad media del suelo</p>
          <ResponsiveContainer width="100%" height={130}>
            <LineChart data={data} syncId="water-moisture" margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="date" {...AXIS} tickFormatter={shortDate} minTickGap={24} />
              <YAxis {...AXIS} width={52} domain={[0, 'auto']} tickFormatter={(v) => `${v} %`} />
              <Tooltip cursor={{ stroke: 'rgb(255 255 255 / 0.25)' }} content={<ChartTooltip labelFormatter={shortDate} valueFormatter={(v) => `${fmt(v)} %`} />} />
              <Line type="monotone" dataKey="soil_moisture_pct" name="Humedad" stroke={CHART.moisture} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#1c2623' }} connectNulls isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}

/** Gasto en fertilizantes y fitosanitarios por mes (facturas archivadas): este año vs el anterior. */
export function InputsSpendChart({ data, year, demo, emptyHint }) {
  const [table, setTable] = useState(false)
  const hasData = data.some((d) => d.this_year > 0 || d.last_year > 0)
  const rows = data.map((d) => ({ ...d, label: MONTHS[d.month - 1] }))
  return (
    <Card title="Uso de fertilizantes y fitosanitarios" actions={hasData && <TableToggle shown={table} onToggle={() => setTable((v) => !v)} />}>
      <p className="-mt-3 mb-4 text-xs text-slate-500">Gasto mensual según tus facturas archivadas · {demo ? 'datos de ejemplo' : `${year} vs ${year - 1}`}</p>
      {!hasData ? (
        <EmptyChart>{emptyHint}</EmptyChart>
      ) : table ? (
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase tracking-wide text-slate-400">
            <tr><th className="py-2 font-semibold">Mes</th><th className="py-2 text-right font-semibold">{year}</th><th className="py-2 text-right font-semibold">{year - 1}</th></tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06] tabular-nums">
            {rows.map((d) => (
              <tr key={d.month}><td className="py-1.5 text-slate-300">{d.label}</td><td className="py-1.5 text-right text-slate-100">{fmtEuro(d.this_year)}</td><td className="py-1.5 text-right text-slate-100">{fmtEuro(d.last_year)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div role="img" aria-label={`Gasto mensual en insumos, ${year} frente a ${year - 1}`}>
          <ResponsiveContainer width="100%" height={300}>
            <AreaChart data={rows} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <defs>
                <linearGradient id="spend-this" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={CHART.thisYear} stopOpacity={0.35} />
                  <stop offset="100%" stopColor={CHART.thisYear} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="label" {...AXIS} />
              <YAxis {...AXIS} width={60} tickFormatter={(v) => fmtEuro(v)} />
              <Tooltip cursor={{ stroke: 'rgb(255 255 255 / 0.25)' }} content={<ChartTooltip valueFormatter={(v) => fmtEuro(v)} />} />
              <Legend verticalAlign="top" align="right" height={28} iconType="plainline" wrapperStyle={{ fontSize: 12, color: CHART.ink }} formatter={(v) => <span className="text-slate-300">{v}</span>} />
              <Area type="monotone" dataKey="last_year" name={String(year - 1)} stroke={CHART.lastYear} strokeWidth={2} strokeDasharray="5 4" fill="none" dot={false} isAnimationActive={false} />
              <Area type="monotone" dataKey="this_year" name={String(year)} stroke={CHART.thisYear} strokeWidth={2} fill="url(#spend-this)" dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#1c2623' }} isAnimationActive={false} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  )
}
