import { AlertTriangle, Check, Download, Info, ListChecks, Loader2, Lock, Sparkles, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { getErrorMessage, siexApi } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import { categoryLabel, money } from '../economy/economyMeta.js'
import { formatSpan, positionLabel, taskCategory } from '../tasks/taskMeta.js'
import { TASK_STATUS } from '../tasks/taskStatus.jsx'

// Pasos que se muestran mientras se recopila el borrador (el agente IA, cuando se conecte, los irá emitiendo).
const STEPS = [
  'Leyendo lecturas de agua de riego',
  'Recopilando insumos, productos y facturas',
  'Revisando labores y tratamientos',
  'Comprobando requisitos del cuaderno',
]
const STEP_MS = 450
const THIS_YEAR = new Date().getFullYear()
const MONTHS = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic']
const nf = new Intl.NumberFormat('es-ES', { maximumFractionDigits: 1 })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

function Section({ title, children }) {
  return (
    <section className="mt-6">
      <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-slate-400">{title}</h3>
      {children}
    </section>
  )
}

function Table({ head, rows, empty }) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>
  return (
    <div className="relative overflow-x-auto">
      <table className="w-full text-left text-sm">
        <thead className="text-xs text-slate-500"><tr>{head.map((h) => <th key={h} className="py-1.5 pr-3 font-semibold">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-white/[0.06]">{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className="py-1.5 pr-3 text-slate-200">{c}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}

function Report({ draft }) {
  const warnings = draft.checks.filter((c) => c.level === 'warning')
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-lg font-semibold text-white">{draft.farm.name} · {draft.year}</p>
        <p className="text-xs text-slate-500">{draft.farm.location} · borrador generado {new Date(draft.generated_at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })}</p>
      </div>
      <p className="mt-1 text-xs text-slate-500">Fuentes: {draft.sources.join(' · ')}</p>

      {draft.narrative && (
        <section className="mt-4 rounded-2xl bg-secondary-500/[0.07] p-4 ring-1 ring-inset ring-secondary-400/20" aria-labelledby="siex-ai-title">
          <h3 id="siex-ai-title" className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
            <Sparkles className="h-4 w-4 text-secondary-300" aria-hidden="true" /> Resumen del asistente
            <span className="inline-flex items-center gap-1 text-[11px] font-normal text-slate-400">
              {draft.engine === 'gemini' ? 'Gemini (Google)' : <><Lock className="h-3 w-3" aria-hidden="true" /> {draft.engine === 'ollama' ? 'modelo propio' : 'en nuestro servidor'}</>}
            </span>
          </h3>
          <p className="mt-2 text-sm leading-relaxed text-slate-200">{draft.narrative}</p>
          {draft.next_steps.length > 0 && (
            <>
              <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400"><ListChecks className="h-3.5 w-3.5" aria-hidden="true" /> Próximos pasos</p>
              <ol className="mt-1.5 list-decimal space-y-1 pl-5 text-sm text-slate-300">
                {draft.next_steps.map((s) => <li key={s}>{s}</li>)}
              </ol>
            </>
          )}
        </section>
      )}

      {draft.checks.length > 0 && (
        <ul className="mt-4 space-y-2" aria-label="Comprobaciones">
          {draft.checks.map((c) => (
            <li key={c.message} className={`flex items-start gap-2 rounded-xl px-3 py-2 text-sm ${c.level === 'warning' ? 'bg-accent-500/10 text-accent-100 ring-1 ring-inset ring-accent-400/25' : 'bg-white/[0.03] text-slate-300'}`}>
              {c.level === 'warning' ? <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" /> : <Info className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
              <span><span className="sr-only">{c.level === 'warning' ? 'Aviso: ' : 'Nota: '}</span>{c.message}</span>
            </li>
          ))}
        </ul>
      )}
      {warnings.length === 0 && <p className="mt-4 inline-flex items-center gap-1.5 text-sm text-primary-200"><Check className="h-4 w-4" aria-hidden="true" /> Sin avisos: el borrador tiene los datos mínimos.</p>}

      <Section title="Cultivos y cosechas">
        <Table head={['Cosecha', 'Superficie', 'Plantas', 'Periodo']} empty="Sin cosechas definidas." rows={draft.harvests.map((h) => [
          h.name, h.surface_ha ? `${nf.format(h.surface_ha)} ha` : '—', h.plant_count !== null ? nf.format(h.plant_count) : '—',
          h.start_date ? `${new Date(h.start_date).toLocaleDateString('es-ES')} → ${h.end_date ? new Date(h.end_date).toLocaleDateString('es-ES') : '…'}` : '—',
        ])} />
      </Section>

      <Section title={`Agua de riego · ${nf.format(draft.water_total_liters / 1000)} m³ en el año`}>
        {draft.water_total_liters === 0 ? (
          <p className="text-sm text-slate-500">Sin lecturas de agua.</p>
        ) : (
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-12">
            {draft.water.map((w) => (
              <div key={w.month} className="rounded-lg bg-white/[0.03] px-1.5 py-1 text-center">
                <p className="text-[10px] text-slate-500">{MONTHS[w.month - 1]}</p>
                <p className="text-xs font-semibold tabular-nums text-slate-200">{w.liters ? nf.format(w.liters / 1000) : '—'}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section title="Productos fitosanitarios y fertilizantes">
        <Table head={['Producto', 'Tipo', 'Nº registro']} empty="La ficha de la finca no tiene productos." rows={draft.products.map((p) => [p.name, p.kind === 'phytosanitary' ? 'Fitosanitario' : p.kind === 'fertilizer' ? 'Fertilizante' : 'Fermento / biológico', p.registry ?? <span className="text-accent-200">Falta</span>])} />
      </Section>

      <Section title="Tratamientos y abonados">
        <Table head={['Fechas', 'Labor', 'Aplicador', 'Estado']} empty="Sin tratamientos en el año." rows={draft.treatments.map((t) => [
          formatSpan(t), `${t.title} (${taskCategory(t.category).label.toLowerCase()})`, t.worker ? `${t.worker} · ${positionLabel(t.worker_position)}` : <span className="text-accent-200">Sin asignar</span>, TASK_STATUS[t.status]?.label,
        ])} />
      </Section>

      <Section title="Resto de labores">
        <Table head={['Fechas', 'Labor', 'Tipo', 'Estado']} empty="Sin otras labores." rows={draft.operations.filter((o) => !['treatment', 'fertilization'].includes(o.category)).map((o) => [formatSpan(o), o.title, taskCategory(o.category).label, TASK_STATUS[o.status]?.label])} />
      </Section>

      <Section title="Gasto en insumos">
        <Table head={['Categoría', 'Importe']} empty="Sin gasto en semillas, fertilizantes ni fitosanitarios." rows={draft.input_spend.map((s) => [categoryLabel(s.category), money(s.amount)])} />
      </Section>
    </div>
  )
}

/** Botón + diálogo «Generar SIEX con IA». Hoy la recopilación es local; la estructura ya espera al agente IA. */
export default function SiexGenerator({ farms }) {
  const dialogRef = useRef(null)
  const [farmId, setFarmId] = useState('')
  const [year, setYear] = useState(THIS_YEAR)
  const [phase, setPhase] = useState('idle') // idle | running | done
  const [step, setStep] = useState(0)
  const [draft, setDraft] = useState(null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!farmId && farms.length) setFarmId(String(farms[0].id))
  }, [farms, farmId])

  function open() {
    setPhase('idle')
    setDraft(null)
    setError(null)
    dialogRef.current?.showModal()
  }

  async function generate() {
    setPhase('running')
    setError(null)
    setDraft(null)
    const request = siexApi.draft(Number(farmId), year)
    try {
      for (let i = 0; i < STEPS.length; i += 1) {
        setStep(i)
        await wait(STEP_MS)
      }
      setDraft(await request)
      setStep(STEPS.length)
      setPhase('done')
    } catch (err) {
      setError(getErrorMessage(err))
      setPhase('idle')
    }
  }

  function download() {
    // Archivo generado en el navegador: no sale de tu equipo.
    const blob = new Blob([JSON.stringify(draft, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = Object.assign(document.createElement('a'), { href: url, download: `siex-borrador-${draft.year}-${draft.farm.name.replace(/[^\w-]+/g, '_')}.json` })
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <>
      <Button onClick={open} disabled={!farms.length}><Sparkles className="h-4 w-4" aria-hidden="true" /> Generar SIEX con IA</Button>
      <dialog
        ref={dialogRef}
        onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()}
        aria-labelledby="siex-title"
        className="dialog-animated w-[calc(100%-2rem)] max-w-3xl rounded-3xl bg-slate-900 p-0 text-slate-200 shadow-overlay backdrop:bg-slate-950/85"
      >
        <div className="max-h-[88vh] overflow-y-auto p-6 sm:p-8" data-lenis-prevent>
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-[0.18em] text-secondary-300"><Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Cuaderno de explotación</p>
              <h2 id="siex-title" className="mt-1 text-xl font-semibold text-white">Borrador SIEX</h2>
              <p className="mt-1 text-sm text-slate-400">Autocompleta el cuaderno con el agua, los insumos y las labores registrados. Revísalo antes de presentarlo.</p>
            </div>
            <button type="button" onClick={() => dialogRef.current?.close()} aria-label="Cerrar" className="rounded-lg p-1.5 text-slate-400 hover:bg-white/5 hover:text-white"><X className="h-5 w-5" aria-hidden="true" /></button>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end">
            <div>
              <label htmlFor="siex-farm" className="mb-1 block text-xs text-slate-400">Granja</label>
              <select id="siex-farm" value={farmId} onChange={(e) => setFarmId(e.target.value)} disabled={phase === 'running'} className={`${inputClass} sm:!w-auto sm:min-w-[12rem]`}>
                {farms.map((f) => <option className={optionClass} key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="siex-year" className="mb-1 block text-xs text-slate-400">Campaña</label>
              <select id="siex-year" value={year} onChange={(e) => setYear(Number(e.target.value))} disabled={phase === 'running'} className={`${inputClass} sm:!w-auto`}>
                {[0, 1, 2].map((i) => <option className={optionClass} key={i} value={THIS_YEAR - i}>{THIS_YEAR - i}</option>)}
              </select>
            </div>
            <Button onClick={generate} loading={phase === 'running'}>{phase === 'done' ? 'Volver a generar' : 'Generar borrador'}</Button>
            {phase === 'done' && <Button variant="outline" onClick={download}><Download className="h-4 w-4" aria-hidden="true" /> Descargar (JSON)</Button>}
          </div>

          {phase !== 'idle' && (
            <ol className="mt-6 space-y-2" aria-live="polite" aria-label="Progreso">
              {STEPS.map((label, i) => {
                const state = i < step || phase === 'done' ? 'done' : i === step ? 'active' : 'todo'
                return (
                  <li key={label} className={`flex items-center gap-2 text-sm transition-colors duration-300 ${state === 'todo' ? 'text-slate-600' : state === 'active' ? 'text-white' : 'text-slate-400'}`}>
                    {state === 'done' ? <Check className="h-4 w-4 text-primary-300" aria-hidden="true" /> : state === 'active' ? <Loader2 className="h-4 w-4 animate-spin text-secondary-300 motion-off:animate-none" aria-hidden="true" /> : <span className="h-4 w-4 rounded-full ring-1 ring-inset ring-white/15" aria-hidden="true" />}
                    {label}
                  </li>
                )
              })}
            </ol>
          )}
          {error && <div className="mt-4"><Alert variant="error">{error}</Alert></div>}
          {draft && <div className="mt-6 border-t border-white/[0.06] pt-6"><Report draft={draft} /></div>}
          <p className="mt-6 text-[11px] text-slate-500">
            El borrador se calcula con tus propios datos y lo redacta Agropelink AI. Con el motor local o un modelo propio (Ollama) nada sale de nuestros servidores; revísalo siempre antes de presentarlo.
          </p>
        </div>
      </dialog>
    </>
  )
}
