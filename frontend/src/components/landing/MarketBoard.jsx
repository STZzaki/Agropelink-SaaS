import { useMemo, useRef, useState } from 'react'
import { MARKET_PRICES, MARKET_PRICES_UPDATED_AT } from '../../data/marketPrices.js'
import { MOTION_OK, gsap, useGSAP } from '../../lib/gsap.js'
import CountUp from './CountUp.jsx'
import { ArrowDown, ArrowUp } from 'lucide-react'

const eur = new Intl.NumberFormat('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const pct = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1, signDisplay: 'exceptZero' })

const ROWS = MARKET_PRICES.map((item) => {
  const price = item.history.at(-1)
  const previous = item.history.at(-2)
  return { ...item, price, change: ((price - previous) / previous) * 100 }
})

const COLUMNS = [
  { key: 'product', label: 'Producto' },
  { key: 'price', label: '€/kg' },
  { key: 'change', label: 'Variación' },
]

function Sparkline({ values, positive }) {
  const min = Math.min(...values)
  const max = Math.max(...values)
  const range = max - min || 1
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${(i / (values.length - 1)) * 60},${20 - ((v - min) / range) * 18 - 1}`).join(' ')
  return (
    <svg viewBox="0 0 60 20" className="h-5 w-16" aria-hidden="true">
      {/* pathLength=1 permite "dibujar" la línea animando strokeDashoffset 1 → 0 */}
      <path data-spark d={d} pathLength="1" strokeDasharray="1" fill="none" stroke={positive ? '#74bd77' : '#d9a476'} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function ChangeBadge({ value }) {
  const up = value > 0
  const flat = Math.abs(value) < 0.05
  const tone = flat
    ? 'bg-white/5 text-slate-300 ring-white/10'
    : up
      ? 'bg-primary-500/10 text-primary-300 ring-primary-400/20'
      : 'bg-accent-500/10 text-accent-200 ring-accent-400/20'
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold tabular-nums ring-1 ring-inset ${tone}`}>
      {!flat && (
        <svg className={`h-3 w-3 ${up ? '' : 'rotate-180'}`} viewBox="0 0 12 12" fill="currentColor" aria-hidden="true">
          <path d="M6 2l4 6H2z" />
        </svg>
      )}
      <span className="sr-only">{flat ? 'Sin cambios' : up ? 'Sube' : 'Baja'}</span>
      {pct.format(value)} %
    </span>
  )
}

export default function MarketBoard() {
  const [sort, setSort] = useState({ key: 'product', dir: 'asc' })
  const [selected, setSelected] = useState(null)
  const rootRef = useRef(null)

  // Entrada coreografiada: filas en cascada y sparklines que se dibujan, una sola vez.
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const tl = gsap.timeline({ scrollTrigger: { trigger: rootRef.current, start: 'top 80%', once: true } })
        tl.from('tbody tr', { autoAlpha: 0, y: 8, stagger: 0.06, duration: 0.5, clearProps: 'transform,opacity,visibility' })
          .fromTo('[data-spark]', { strokeDashoffset: 1 }, { strokeDashoffset: 0, duration: 0.9, stagger: 0.06, ease: 'power2.inOut' }, '<0.1')
      })
      return () => mm.revert()
    },
    { scope: rootRef },
  )

  const rows = useMemo(() => {
    const factor = sort.dir === 'asc' ? 1 : -1
    return [...ROWS].sort((a, b) =>
      sort.key === 'product' ? a.product.localeCompare(b.product, 'es') * factor : (a[sort.key] - b[sort.key]) * factor,
    )
  }, [sort])

  const toggleSort = (key) =>
    setSort((s) => ({ key, dir: s.key === key && s.dir === 'asc' ? 'desc' : 'asc' }))

  const detail = ROWS.find((r) => r.id === selected)
  const updated = new Date(`${MARKET_PRICES_UPDATED_AT}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div ref={rootRef} className="surface flex h-full flex-col p-6 sm:p-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary-300">Agropizarra</p>
          <h3 className="mt-2 text-xl font-semibold text-white">Cotizaciones orientativas en origen</h3>
          <p className="text-sm text-slate-400">Hortícolas de Almería · precio medio €/kg</p>
        </div>
        <span className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] text-slate-400">Ref. {updated}</span>
      </div>

      <div className="mt-6 -mx-5 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[22rem] text-sm">
          <caption className="sr-only">Precios orientativos por producto. Pulsa una cabecera para ordenar.</caption>
          <thead>
            <tr className="border-b border-white/10 text-left text-xs text-slate-400">
              {COLUMNS.map((col) => {
                const active = sort.key === col.key
                return (
                  <th
                    key={col.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                    className={`px-5 pb-3 font-medium sm:px-3 ${col.key !== 'product' ? 'text-right' : ''}`}
                  >
                    <button type="button" onClick={() => toggleSort(col.key)} className={`inline-flex items-center gap-1 hover:text-white ${active ? 'text-white' : ''}`}>
                      {col.label}
                      {active && sort.dir === 'desc' ? (
                        <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ArrowUp className={`h-3.5 w-3.5 ${active ? '' : 'opacity-30'}`} aria-hidden="true" />
                      )}
                    </button>
                  </th>
                )
              })}
              <th scope="col" className="hidden pb-3 pr-3 text-right font-medium sm:table-cell">7 registros</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const isSelected = selected === r.id
              return (
                <tr
                  key={r.id}
                  onClick={() => setSelected(isSelected ? null : r.id)}
                  className={`cursor-pointer border-b border-white/5 transition-colors last:border-0 ${isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.03]'}`}
                >
                  <th scope="row" className="px-5 py-3.5 text-left font-medium text-white sm:px-3">
                    <button type="button" aria-expanded={isSelected} className="text-left" onClick={(e) => { e.stopPropagation(); setSelected(isSelected ? null : r.id) }}>
                      {r.product}
                      <span className="block text-xs font-normal text-slate-500">{r.variety}</span>
                    </button>
                  </th>
                  <td className="px-5 py-3.5 text-right font-semibold text-white sm:px-3"><CountUp value={r.price} decimals={2} /></td>
                  <td className="px-5 py-3.5 text-right sm:px-3"><ChangeBadge value={r.change} /></td>
                  <td className="hidden py-3.5 pr-3 text-right sm:table-cell">
                    <span className="inline-flex justify-end"><Sparkline values={r.history} positive={r.change >= 0} /></span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {detail && (
        <div className="swap-in mt-4 rounded-2xl bg-white/[0.03] p-4 text-sm shadow-surface-sm">
          <p className="font-medium text-white">{detail.product} {detail.variety.toLowerCase()}</p>
          <dl className="mt-2 grid grid-cols-3 gap-2 text-xs">
            <div><dt className="text-slate-500">Mínimo</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate-200">{eur.format(Math.min(...detail.history))} €</dd></div>
            <div><dt className="text-slate-500">Media</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate-200">{eur.format(detail.history.reduce((a, b) => a + b, 0) / detail.history.length)} €</dd></div>
            <div><dt className="text-slate-500">Máximo</dt><dd className="mt-0.5 font-semibold tabular-nums text-slate-200">{eur.format(Math.max(...detail.history))} €</dd></div>
          </dl>
        </div>
      )}

      <p className="mt-auto pt-4 text-[11px] leading-relaxed text-slate-500">
        Valores medios orientativos de referencia, de actualización manual. No constituyen cotización oficial
        ni oferta de compra; consulta tu alhóndiga o cooperativa antes de operar.
      </p>
    </div>
  )
}
