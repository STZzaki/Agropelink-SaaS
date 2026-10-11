import { AnimatePresence, m } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import { FORUM_MEDIA, farmsApi, getErrorMessage } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import FormField, { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import { ImagePlus } from 'lucide-react'

const STEPS = [
  { id: 'base', title: 'Instalación', hint: 'Nombre, ubicación y foto' },
  { id: 'team', title: 'Dimensiones y equipo', hint: 'Superficie, trabajadores y operarios' },
  { id: 'crops', title: 'Producción', hint: 'Cosechas y programaciones' },
  { id: 'inputs', title: 'Laboratorios e insumos', hint: 'Laboratorios, fitosanitarios y fermentos' },
  { id: 'budget', title: 'Presupuesto y resumen', hint: 'Presupuesto consumido y revisión' },
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
  operators: [], crop_types: [], schedules: [], labs: [], inputs: [], budget_total: '', budget_spent: '',
}

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
  if (step === 2 && v.schedules.some((s) => !s.name.trim())) e.schedules = 'Pon nombre a cada programación.'
  if (step === 3 && v.inputs.some((i) => !i.name.trim())) e.inputs = 'Pon nombre a cada producto.'
  if (step === 4) {
    const t = num(v.budget_total)
    const s = num(v.budget_spent)
    if (t !== null && (!Number.isFinite(t) || t < 0)) e.budget_total = 'Importe no válido.'
    if (s !== null && (!Number.isFinite(s) || s < 0)) e.budget_spent = 'Importe no válido.'
  }
  return e
}

function toPayload(v) {
  const trim = (s) => (s ?? '').trim()
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
    budget_total: num(v.budget_total),
    budget_spent: num(v.budget_spent),
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
                <TagInput id="ff-crops" label="Tipo de cosechas" values={v.crop_types} onChange={setList('crop_types')} placeholder="Tomate, pimiento… (Enter para añadir)" max={30} />
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
                  {field('budget_total', 'Presupuesto de la campaña (€)', { inputMode: 'decimal', placeholder: '50.000' })}
                  {field('budget_spent', 'Presupuesto consumido (€)', { inputMode: 'decimal', placeholder: '12.500' })}
                </div>
                <dl className="grid gap-3 rounded-xl bg-white/[0.02] p-4 text-sm ring-1 ring-inset ring-white/[0.06] sm:grid-cols-2">
                  {[
                    ['Granja', `${v.name || '—'} · ${v.location || '—'}`],
                    ['Foto', photo ? photo.name : 'Sin foto'],
                    ['Dimensiones', [num(v.surface_ha) && `${v.surface_ha} ha`, num(v.length_m) && num(v.width_m) && `${v.length_m} × ${v.width_m} m`].filter(Boolean).join(' · ') || '—'],
                    ['Equipo', `${v.avg_workers || 0} trabajadores · ${v.operators.length} operarios`],
                    ['Cosechas', v.crop_types.join(', ') || '—'],
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
