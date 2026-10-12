import { AnimatePresence, m } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { FORUM_MEDIA, farmsApi, getErrorMessage } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import FormField, { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import { ImagePlus, Plus, Trash2 } from 'lucide-react'
import HarvestFields, { EMPTY_HARVEST, harvestPayload, validateHarvest } from '../economy/HarvestFields.jsx'
import { EXPENSE_CATEGORIES, money, parseAmount } from '../economy/economyMeta.js'

const STEPS = [
  { id: 'base', title: 'Instalación', hint: 'Nombre, ubicación y foto' },
  { id: 'team', title: 'Dimensiones y equipo', hint: 'Superficie, trabajadores y operarios' },
  { id: 'crops', title: 'Producción', hint: 'Cosecha única o varias: dimensiones, plantas y periodo de cada una' },
  { id: 'inputs', title: 'Laboratorios e insumos', hint: 'Laboratorios, fitosanitarios y fermentos' },
  { id: 'budget', title: 'Presupuesto y costes fijos', hint: 'Presupuesto anual, costes iniciales (semillas, fertilizantes…) y revisión' },
]
const FREQUENCIES = [
  { id: 'daily', label: 'Diaria' },
  { id: 'weekly', label: 'Semanal' },
  { id: 'biweekly', label: 'Quincenal' },
  { id: 'monthly', label: 'Mensual' },
  { id: 'seasonal', label: 'Por campaña' },
]
const INPUT_KINDS = [
  { id: 'phytosanitary', label: 'Fitosanitario' },
  { id: 'fertilizer', label: 'Fertilizante' },
  { id: 'ferment', label: 'Fermento / biológico' },
]
const SLIDE = { initial: { opacity: 0, x: 16 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -16 }, transition: { duration: 0.22, ease: [0.2, 0, 0, 1] } }

const EMPTY = {
  name: '', location: '', surface_ha: '', length_m: '', width_m: '', avg_workers: '',
  operators: [], crop_types: [], schedules: [], labs: [], inputs: [], budget_total: '',
  harvest_mode: 'single', harvests: [{ ...EMPTY_HARVEST }], fixed_costs: [],
}

const MAX_HARVESTS = 20
const MAX_FIXED_COSTS = 50
const isBlankHarvest = (h) => Object.values(h).every((x) => String(x ?? '').trim() === '')
// Cosechas que se envían: en cosecha única, la ficha vacía se ignora (la cosecha es opcional).
const harvestsToSend = (v) => v.harvests.filter((h) => !(v.harvest_mode === 'single' && isBlankHarvest(h)))

const num = (v) => (String(v ?? '').trim() === '' ? null : Number(String(v).replace(/\s/g, '').replace(',', '.')))

/** Chips para listas simples (cosechas, laboratorios): Enter o coma para añadir. */
function TagInput({ id, label, values, onChange, placeholder, max }) {
  const [draft, setDraft] = useState('')
  function add() {
    const v = draft.trim()
    if (!v || v.length > 80 || values.length >= max) return
    if (!values.some((x) => x.toLowerCase() === v.toLowerCase())) onChange([...values, v])
    setDraft('')
  }
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-300">{label}</label>
      <div className="flex gap-2">
        <input id={id} value={draft} maxLength={80} onChange={(e) => setDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); add() } }} className={inputClass} placeholder={placeholder} />
        <Button variant="outline" onClick={add} disabled={!draft.trim()}>Añadir</Button>
      </div>
      {values.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-2">
          {values.map((v) => (
            <li key={v} className="pop-in inline-flex items-center gap-1.5 rounded-full bg-secondary-500/15 px-3 py-1 text-xs font-medium text-secondary-100 ring-1 ring-inset ring-secondary-400/30">
              {v}
              <button type="button" onClick={() => onChange(values.filter((x) => x !== v))} aria-label={`Quitar ${v}`} className="text-secondary-200/70 hover:text-white">×</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** Editor de filas (operarios, programaciones, insumos). `columns`: [{ key, label, type, options, placeholder }]. */
function RowsEditor({ legend, rows, onChange, columns, blank, max, addLabel }) {
  const set = (i, key, value) => onChange(rows.map((r, j) => (j === i ? { ...r, [key]: value } : r)))
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-300">{legend}</legend>
      {rows.length === 0 && <p className="mb-2 text-xs text-slate-500">Ninguno todavía.</p>}
      <ul className="space-y-2">
        {rows.map((row, i) => (
          <li key={i} className="pop-in grid items-end gap-2 rounded-xl bg-white/[0.02] p-2 ring-1 ring-inset ring-white/[0.06] sm:grid-cols-[repeat(var(--cols),minmax(0,1fr))_auto]" style={{ '--cols': columns.length }}>
            {columns.map((c) => (
              <div key={c.key}>
                <label htmlFor={`${legend}-${i}-${c.key}`} className="mb-1 block text-[11px] font-medium text-slate-400">{c.label}</label>
                {c.type === 'select' ? (
                  <select id={`${legend}-${i}-${c.key}`} value={row[c.key]} onChange={(e) => set(i, c.key, e.target.value)} className={inputClass}>
                    {c.options.map((o) => <option className={optionClass} key={o.id} value={o.id}>{o.label}</option>)}
                  </select>
                ) : (
                  <input id={`${legend}-${i}-${c.key}`} value={row[c.key] ?? ''} maxLength={c.maxLength ?? 80} onChange={(e) => set(i, c.key, e.target.value)} className={inputClass} placeholder={c.placeholder} />
                )}
              </div>
            ))}
            <button type="button" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label="Quitar fila" className="h-[42px] rounded-xl px-3 text-sm text-slate-400 transition-colors duration-300 hover:bg-white/5 hover:text-accent-200">Quitar</button>
          </li>
        ))}
      </ul>
      {rows.length < max && <Button variant="outline" className="mt-2" onClick={() => onChange([...rows, { ...blank }])}>{addLabel}</Button>}
    </fieldset>
  )
}

const MODES = [
  { id: 'single', title: 'Cosecha única', text: 'Un solo cultivo y ciclo en toda la finca.' },
  { id: 'multiple', title: 'Varias cosechas', text: 'Cultivos o ciclos distintos, cada uno con su superficie, plantas y costes.' },
]

/** Cosecha única o múltiple: grupo de radios nativo con aspecto de tarjeta (teclado y lector de pantalla). */
function HarvestModePicker({ value, onChange }) {
  return (
    <fieldset>
      <legend className="mb-2 text-sm font-medium text-slate-300">¿Cuántas cosechas tiene la finca?</legend>
      <div className="grid gap-3 sm:grid-cols-2">
        {MODES.map((mode) => (
          <label key={mode.id} className="relative cursor-pointer">
            <input type="radio" name="harvest_mode" value={mode.id} checked={value === mode.id} onChange={() => onChange(mode.id)} className="peer sr-only" />
            <span className="block rounded-2xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/10 transition-colors duration-300 hover:bg-white/[0.05] peer-checked:bg-secondary-500/10 peer-checked:ring-secondary-300/50 peer-focus-visible:ring-2 peer-focus-visible:ring-secondary-300">
              <span className="block font-semibold text-white">{mode.title}</span>
              <span className="mt-0.5 block text-xs text-slate-400">{mode.text}</span>
            </span>
          </label>
        ))}
      </div>
    </fieldset>
  )
}

function PhotoPicker({ file, onChange, error }) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(null)
  useEffect(() => {
    if (!file) return setPreview(null)
    const url = URL.createObjectURL(file) // vista previa local: nada se sube hasta crear la granja
    setPreview(url)
    return () => URL.revokeObjectURL(url)
  }, [file])
  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-slate-300">Foto de la instalación <span className="font-normal text-slate-500">(opcional)</span></p>
      <div className="flex items-center gap-4">
        <div className="flex h-24 w-32 items-center justify-center overflow-hidden rounded-xl bg-white/[0.04] ring-1 ring-inset ring-white/10">
          {preview ? <img src={preview} alt="Vista previa de la instalación" className="h-full w-full object-cover" /> : <ImagePlus className="h-8 w-8 text-slate-500" aria-hidden="true" strokeWidth={1.5} />}
        </div>
        <div className="space-y-2">
          <Button variant="outline" onClick={() => inputRef.current?.click()}>{file ? 'Cambiar foto' : 'Elegir foto'}</Button>
          {file && <button type="button" onClick={() => onChange(null)} className="block text-xs text-slate-400 hover:text-slate-200">Quitar</button>}
          <p className="text-xs text-slate-500">PNG, JPEG o WEBP · máx. 5 MB. Se eliminan los metadatos (incluida la ubicación GPS).</p>
        </div>
      </div>
      <input ref={inputRef} type="file" accept={FORUM_MEDIA.image.types.join(',')} className="sr-only" tabIndex={-1} onChange={(e) => { onChange(e.target.files?.[0] ?? null); e.target.value = '' }} />
      {error && <p className="field-error mt-1.5 text-xs font-medium text-accent-300">{error}</p>}
    </div>
  )
}

function validateStep(step, v, photo) {
  const e = {}
  if (step === 0) {
    if (!v.name.trim()) e.name = 'Indica el nombre de la granja.'
    if (!v.location.trim()) e.location = 'Indica la ubicación.'
    if (photo && !FORUM_MEDIA.image.types.includes(photo.type)) e.photo = 'Formato no permitido.'
    else if (photo && photo.size > FORUM_MEDIA.image.maxBytes) e.photo = 'La foto supera 5 MB.'
  }
  if (step === 1) {
    for (const k of ['surface_ha', 'length_m', 'width_m']) {
      const n = num(v[k])
      if (n !== null && (!Number.isFinite(n) || n <= 0)) e[k] = 'Debe ser un número mayor que 0.'
    }
    const w = num(v.avg_workers)
    if (w !== null && (!Number.isInteger(w) || w < 0)) e.avg_workers = 'Número entero de trabajadores.'
    if (v.operators.some((o) => !o.name.trim() || !o.position.trim())) e.operators = 'Completa nombre y puesto de cada operario (o quita la fila).'
  }
  if (step === 2) {
    if (v.schedules.some((s) => !s.name.trim())) e.schedules = 'Pon nombre a cada programación.'
    const sent = harvestsToSend(v)
    const perHarvest = v.harvests.map((h) => (sent.includes(h) ? validateHarvest(h) : {}))
    if (perHarvest.some((x) => Object.keys(x).length)) e.harvests = perHarvest
  }
  if (step === 3 && v.inputs.some((i) => !i.name.trim())) e.inputs = 'Pon nombre a cada producto.'
  if (step === 4) {
    const t = parseAmount(v.budget_total)
    if (t !== null && (!Number.isFinite(t) || t < 0)) e.budget_total = 'Importe no válido.'
    const bad = v.fixed_costs.some((c) => {
      const a = parseAmount(c.amount)
      return !c.concept.trim() || a === null || !Number.isFinite(a) || a <= 0
    })
    if (bad) e.fixed_costs = 'Cada coste fijo necesita concepto e importe mayor que 0 (o quita la fila).'
  }
  return e
}

function toPayload(v) {
  const trim = (s) => (s ?? '').trim()
  const sent = harvestsToSend(v)
  return {
    name: trim(v.name),
    location: trim(v.location),
    surface_ha: num(v.surface_ha),
    length_m: num(v.length_m),
    width_m: num(v.width_m),
    avg_workers: num(v.avg_workers),
    operators: v.operators.map((o) => ({ name: trim(o.name), position: trim(o.position) })),
    crop_types: v.crop_types,
    schedules: v.schedules.map((s) => ({ name: trim(s.name), frequency: s.frequency, notes: trim(s.notes) || null })),
    labs: v.labs,
    inputs: v.inputs.map((i) => ({ name: trim(i.name), kind: i.kind, registry: trim(i.registry) || null })),
    budget_total: parseAmount(v.budget_total),
    harvest_mode: v.harvest_mode,
    harvests: sent.map(harvestPayload),
    fixed_costs: v.fixed_costs.map((c) => {
      // Índice dentro de las cosechas QUE SE ENVÍAN (una cosecha única vacía no se envía).
      const index = c.harvest === '' ? -1 : sent.indexOf(v.harvests[Number(c.harvest)])
      return { category: c.category, concept: trim(c.concept), amount: parseAmount(c.amount), harvest_index: index >= 0 ? index : null }
    }),
  }
}

/**
 * Alta de granja en 5 pasos. Cada paso se valida antes de avanzar; el backend vuelve a validar todo (Pydantic).
 * La foto se sube al final, una vez creada la granja, por el mismo pipeline seguro que el foro.
 */
export default function FarmForm({ onCreated }) {
  const [step, setStep] = useState(0)
  const [values, setValues] = useState(EMPTY)
  const [photo, setPhoto] = useState(null)
  const [errors, setErrors] = useState({})
  const [state, setState] = useState('idle') // idle | saving
  const [serverError, setServerError] = useState(null)
  const headingRef = useRef(null)

  useEffect(() => headingRef.current?.focus(), [step])

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }
  const setList = (field) => (list) => {
    setValues((v) => ({ ...v, [field]: list }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }
  const setHarvest = (i, harvest) => setList('harvests')(values.harvests.map((h, j) => (j === i ? harvest : h)))
  // Al quitar una cosecha, sus costes pasan a «toda la finca» y los índices posteriores se corrigen.
  function removeHarvest(i) {
    setValues((v) => ({
      ...v,
      harvests: v.harvests.filter((_, j) => j !== i),
      fixed_costs: v.fixed_costs.map((c) => {
        if (c.harvest === '') return c
        const k = Number(c.harvest)
        return { ...c, harvest: k === i ? '' : k > i ? String(k - 1) : c.harvest }
      }),
    }))
    setErrors((er) => ({ ...er, harvests: undefined }))
  }
  // Pasar a cosecha única conserva solo la primera cosecha (y sus costes imputados).
  function changeMode(mode) {
    setValues((v) => ({
      ...v,
      harvest_mode: mode,
      harvests: mode === 'single' ? v.harvests.slice(0, 1) : v.harvests,
      fixed_costs: mode === 'single' ? v.fixed_costs.map((c) => (c.harvest !== '' && c.harvest !== '0' ? { ...c, harvest: '' } : c)) : v.fixed_costs,
    }))
    setErrors((er) => ({ ...er, harvests: undefined }))
  }
  const harvestOptions = [
    { id: '', label: 'Toda la finca' },
    ...values.harvests.map((h, i) => ({ id: String(i), label: h.name.trim() || `Cosecha ${i + 1}` })),
  ]
  const fixedTotal = values.fixed_costs.reduce((sum, c) => {
    const a = parseAmount(c.amount)
    return sum + (Number.isFinite(a) && a > 0 ? a : 0)
  }, 0)
  const budgetValue = parseAmount(values.budget_total) ?? 0

  const field = (name, label, props = {}) => (
    <FormField id={`ff-${name}`} label={label} error={errors[name]}>
      <input id={`ff-${name}`} value={values[name]} onChange={set(name)} className={inputClass} aria-invalid={errors[name] ? true : undefined} aria-describedby={errors[name] ? `ff-${name}-error` : undefined} {...props} />
    </FormField>
  )

  function next() {
    const found = validateStep(step, values, photo)
    setErrors(found)
    if (!Object.keys(found).length) setStep((s) => Math.min(s + 1, STEPS.length - 1))
  }

  async function submit() {
    for (let s = 0; s < STEPS.length; s += 1) {
      const found = validateStep(s, values, photo)
      if (Object.keys(found).length) {
        setErrors(found)
        setStep(s)
        return
      }
    }
    setState('saving')
    setServerError(null)
    try {
      let farm = await farmsApi.create(toPayload(values))
      if (photo) {
        try {
          farm = await farmsApi.uploadPhoto(farm.id, photo)
        } catch (err) {
          // La granja ya existe: se informa del fallo de la foto sin perder el resto.
          onCreated?.(farm, `La granja se ha creado, pero la foto no se pudo guardar: ${getErrorMessage(err)}`)
          return
        }
      }
      onCreated?.(farm)
    } catch (err) {
      setServerError(getErrorMessage(err))
      setState('idle')
    }
  }

  const v = values
  return (
    <div className="card-glass overflow-hidden">
      {/* Progreso */}
      <ol className="grid grid-cols-5 border-b border-white/[0.06]" aria-label="Pasos del alta">
        {STEPS.map((s, i) => (
          <li key={s.id} aria-current={i === step ? 'step' : undefined} className="relative px-2 py-3 text-center sm:px-4 sm:text-left">
            <span className={`text-[11px] font-semibold uppercase tracking-wide ${i <= step ? 'text-secondary-300' : 'text-slate-500'}`}>Paso {i + 1}</span>
            <span className={`hidden truncate text-sm font-medium sm:block ${i === step ? 'text-white' : 'text-slate-400'}`}>{s.title}</span>
            <span className={`absolute inset-x-0 bottom-0 h-0.5 origin-left bg-gradient-to-r from-primary-400 to-secondary-400 transition-transform duration-300 ${i <= step ? 'scale-x-100' : 'scale-x-0'}`} aria-hidden="true" />
          </li>
        ))}
      </ol>

      <div className="p-5 sm:p-7">
        <h2 ref={headingRef} tabIndex={-1} className="text-lg font-semibold text-white focus:outline-none">{STEPS[step].title}</h2>
        <p className="mb-6 text-sm text-slate-400">{STEPS[step].hint}</p>

        <AnimatePresence mode="wait" initial={false}>
          <m.div key={step} {...SLIDE} className="space-y-5">
            {step === 0 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('name', 'Nombre de la granja', { maxLength: 150, placeholder: 'Finca Los Llanos' })}
                  {field('location', 'Ubicación', { maxLength: 255, placeholder: 'Níjar, Almería' })}
                </div>
                <PhotoPicker file={photo} onChange={(f) => { setPhoto(f); setErrors((er) => ({ ...er, photo: undefined })) }} error={errors.photo} />
              </>
            )}
            {step === 1 && (
              <>
                <div className="grid gap-4 sm:grid-cols-4">
                  {field('surface_ha', 'Superficie (ha)', { inputMode: 'decimal', placeholder: '3,5' })}
                  {field('length_m', 'Largo (m)', { inputMode: 'decimal', placeholder: '250' })}
                  {field('width_m', 'Ancho (m)', { inputMode: 'decimal', placeholder: '140' })}
                  {field('avg_workers', 'Trabajadores medios', { inputMode: 'numeric', placeholder: '6' })}
                </div>
                <RowsEditor
                  legend="Operarios y puestos"
                  rows={v.operators}
                  onChange={setList('operators')}
                  max={100}
                  blank={{ name: '', position: '' }}
                  addLabel="+ Añadir operario"
                  columns={[{ key: 'name', label: 'Nombre', placeholder: 'Lucía Martín' }, { key: 'position', label: 'Puesto', placeholder: 'Encargada de riego' }]}
                />
                <p className="text-xs text-slate-500">Solo nombre y puesto: no añadas DNI, teléfonos ni otros datos personales de los trabajadores.</p>
                {errors.operators && <p className="field-error text-xs font-medium text-accent-300">{errors.operators}</p>}
              </>
            )}
            {step === 2 && (
              <>
                <HarvestModePicker value={v.harvest_mode} onChange={changeMode} />
                <ol className="space-y-4" aria-label="Cosechas">
                  {v.harvests.map((h, i) => (
                    <li key={i} className="pop-in rounded-2xl bg-white/[0.02] p-4 ring-1 ring-inset ring-white/[0.06]">
                      {v.harvest_mode === 'multiple' ? (
                        <div className="mb-3 flex items-center justify-between">
                          <p className="text-sm font-semibold text-slate-200">Cosecha {i + 1}</p>
                          {v.harvests.length > 1 && (
                            <button type="button" onClick={() => removeHarvest(i)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-white/5 hover:text-accent-200">
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Quitar
                            </button>
                          )}
                        </div>
                      ) : (
                        <p className="mb-3 text-xs text-slate-500">Opcional: si aún no la tienes planificada, déjala en blanco y añádela después desde Economía.</p>
                      )}
                      <HarvestFields idPrefix={`ff-h${i}`} value={h} onChange={(nh) => setHarvest(i, nh)} errors={errors.harvests?.[i]} />
                    </li>
                  ))}
                </ol>
                {v.harvest_mode === 'multiple' && v.harvests.length < MAX_HARVESTS && (
                  <Button variant="outline" onClick={() => setList('harvests')([...v.harvests, { ...EMPTY_HARVEST }])}><Plus className="h-4 w-4" aria-hidden="true" /> Añadir cosecha</Button>
                )}
                <TagInput id="ff-crops" label="Etiquetas de cultivo (para buscar y filtrar)" values={v.crop_types} onChange={setList('crop_types')} placeholder="Tomate, pimiento… (Enter para añadir)" max={30} />
                <RowsEditor
                  legend="Programaciones"
                  rows={v.schedules}
                  onChange={setList('schedules')}
                  max={50}
                  blank={{ name: '', frequency: 'weekly', notes: '' }}
                  addLabel="+ Añadir programación"
                  columns={[
                    { key: 'name', label: 'Labor', placeholder: 'Riego sector norte' },
                    { key: 'frequency', label: 'Frecuencia', type: 'select', options: FREQUENCIES },
                    { key: 'notes', label: 'Notas', placeholder: '2 pulsos de 15 min', maxLength: 300 },
                  ]}
                />
                {errors.schedules && <p className="field-error text-xs font-medium text-accent-300">{errors.schedules}</p>}
              </>
            )}
            {step === 3 && (
              <>
                <TagInput id="ff-labs" label="Laboratorios adheridos" values={v.labs} onChange={setList('labs')} placeholder="Laboratorio Agroanalítico Sur" max={20} />
                <RowsEditor
                  legend="Fitosanitarios, fertilizantes y fermentos usados"
                  rows={v.inputs}
                  onChange={setList('inputs')}
                  max={100}
                  blank={{ name: '', kind: 'phytosanitary', registry: '' }}
                  addLabel="+ Añadir producto"
                  columns={[
                    { key: 'name', label: 'Producto', placeholder: 'Azufre mojable' },
                    { key: 'kind', label: 'Tipo', type: 'select', options: INPUT_KINDS },
                    { key: 'registry', label: 'Nº registro (opcional)', placeholder: 'ES-00123', maxLength: 40 },
                  ]}
                />
                {errors.inputs && <p className="field-error text-xs font-medium text-accent-300">{errors.inputs}</p>}
              </>
            )}
            {step === 4 && (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  {field('budget_total', 'Presupuesto anual (€)', { inputMode: 'decimal', placeholder: '50.000' })}
                  <div className="rounded-xl bg-white/[0.03] px-4 py-3 text-sm">
                    <p className="text-xs text-slate-500">Costes fijos iniciales</p>
                    <p className="font-semibold tabular-nums text-white">{money(fixedTotal)}</p>
                    {budgetValue > 0 && <p className="text-xs text-slate-400">{((fixedTotal / budgetValue) * 100).toLocaleString('es-ES', { maximumFractionDigits: 1 })} % del presupuesto anual</p>}
                  </div>
                </div>
                <RowsEditor
                  legend="Costes fijos iniciales"
                  rows={v.fixed_costs}
                  onChange={setList('fixed_costs')}
                  max={MAX_FIXED_COSTS}
                  blank={{ category: 'seeds', concept: '', amount: '', harvest: '' }}
                  addLabel="+ Añadir coste fijo"
                  columns={[
                    { key: 'category', label: 'Categoría', type: 'select', options: EXPENSE_CATEGORIES },
                    { key: 'concept', label: 'Concepto', placeholder: 'Semilla tomate rama', maxLength: 120 },
                    { key: 'amount', label: 'Importe (€)', placeholder: '1.200,00', maxLength: 16 },
                    { key: 'harvest', label: 'Imputar a', type: 'select', options: harvestOptions },
                  ]}
                />
                <p className="text-xs text-slate-500">Se registran con fecha de hoy como costes fijos. Después podrás añadir costes variables desde Economía.</p>
                {errors.fixed_costs && <p className="field-error text-xs font-medium text-accent-300">{errors.fixed_costs}</p>}
                <dl className="grid gap-3 rounded-xl bg-white/[0.02] p-4 text-sm ring-1 ring-inset ring-white/[0.06] sm:grid-cols-2">
                  {[
                    ['Granja', `${v.name || '—'} · ${v.location || '—'}`],
                    ['Foto', photo ? photo.name : 'Sin foto'],
                    ['Dimensiones', [num(v.surface_ha) && `${v.surface_ha} ha`, num(v.length_m) && num(v.width_m) && `${v.length_m} × ${v.width_m} m`].filter(Boolean).join(' · ') || '—'],
                    ['Equipo', `${v.avg_workers || 0} trabajadores · ${v.operators.length} operarios`],
                    ['Cosechas', v.harvest_mode === 'single' ? `Cosecha única${harvestsToSend(v)[0] ? ` · ${harvestsToSend(v)[0].name}` : ''}` : `${v.harvests.length} cosechas`],
                    ['Costes fijos', `${v.fixed_costs.length} · ${money(fixedTotal)}`],
                    ['Programaciones', String(v.schedules.length)],
                    ['Laboratorios', v.labs.join(', ') || '—'],
                    ['Insumos', String(v.inputs.length)],
                  ].map(([k, val]) => (
                    <div key={k}><dt className="text-xs text-slate-500">{k}</dt><dd className="truncate text-slate-200">{val}</dd></div>
                  ))}
                </dl>
              </>
            )}
          </m.div>
        </AnimatePresence>

        {serverError && <div className="mt-5"><Alert variant="error">{serverError}</Alert></div>}

        <div className="mt-7 flex items-center justify-between gap-3 border-t border-white/[0.06] pt-5">
          <Button variant="outline" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || state === 'saving'}>Anterior</Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>Siguiente</Button>
          ) : (
            <Button onClick={submit} loading={state === 'saving'}>Crear granja</Button>
          )}
        </div>
      </div>
    </div>
  )
}
