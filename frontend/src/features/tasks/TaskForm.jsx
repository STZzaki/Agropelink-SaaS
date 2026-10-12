import { FileText, Image as ImageIcon, Paperclip, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { TASK_ATTACHMENT, getErrorMessage, tasksApi } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import FormField, { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import { focusFirstError } from '../../lib/forms.js'
import { EXPENSE_CATEGORIES, money, parseAmount } from '../economy/economyMeta.js'
import FarmSelect from '../farms/FarmSelect.jsx'
import { TASK_CATEGORIES, positionLabel, toISO } from './taskMeta.js'

const blank = (date) => ({ title: '', description: '', date, end_date: '', multiday: false, category: 'other', farm_id: '', worker_id: '', costs: [] })
const BLANK_COST = { category: 'labor', concept: '', amount: '' }

/** Comprobación en cliente (el servidor vuelve a validar tipo real, tamaño y contenido). */
export function checkAttachment(file) {
  if (!TASK_ATTACHMENT.types.includes(file.type)) return `${file.name}: solo fotos PNG, JPEG, WEBP o PDF.`
  const max = file.type === 'application/pdf' ? TASK_ATTACHMENT.pdfMaxBytes : TASK_ATTACHMENT.imageMaxBytes
  if (file.size > max) return `${file.name}: supera ${max / 1024 / 1024} MB.`
  return null
}

function validate(v) {
  const e = {}
  const title = v.title.trim()
  if (!title) e.title = 'El título es obligatorio.'
  else if (title.length > 200) e.title = 'Máximo 200 caracteres.'
  if (v.description.length > 10000) e.description = 'Máximo 10.000 caracteres.'
  if (!v.date) e.date = 'Indica la fecha de inicio.'
  if (v.multiday) {
    if (!v.end_date) e.end_date = 'Indica la fecha de fin.'
    else if (v.end_date < v.date) e.end_date = 'Debe ser igual o posterior al inicio.'
  }
  if (!v.farm_id) e.farm_id = 'Selecciona una granja.'
  if (v.costs.some((c) => !c.concept.trim() || !(parseAmount(c.amount) > 0))) e.costs = 'Cada gasto necesita concepto e importe mayor que 0 (o quita la fila).'
  return e
}

/** Alta de tarea: tipo, periodo (uno o varios días), trabajador, descripción larga, gastos directos y adjuntos. */
export default function TaskForm({ farms, workers = [], defaultDate, onCreated }) {
  const [values, setValues] = useState(() => blank(defaultDate ?? toISO(new Date())))
  const [files, setFiles] = useState([])
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState(null)
  const fileRef = useRef(null)

  // Al elegir un día en el calendario, el formulario lo propone como inicio.
  useEffect(() => {
    if (defaultDate) setValues((v) => ({ ...v, date: defaultDate, end_date: v.end_date && v.end_date < defaultDate ? '' : v.end_date }))
  }, [defaultDate])

  const set = (field) => (e) => {
    const value = e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }
  const setCost = (i, key, value) => setValues((v) => ({ ...v, costs: v.costs.map((c, j) => (j === i ? { ...c, [key]: value } : c)) }))

  function pickFiles(list) {
    const chosen = [...list]
    const problems = chosen.map(checkAttachment).filter(Boolean)
    const ok = chosen.filter((f) => !checkAttachment(f)).slice(0, TASK_ATTACHMENT.max - files.length)
    setFiles((fs) => [...fs, ...ok])
    setErrors((er) => ({ ...er, files: problems[0] }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).filter((k) => found[k]).length) {
      focusFirstError(e.currentTarget)
      return
    }
    setSubmitting(true)
    setServerError(null)
    try {
      let task = await tasksApi.create({
        title: values.title.trim(),
        description: values.description.trim() || null,
        date: values.date,
        end_date: values.multiday ? values.end_date : null,
        category: values.category,
        farm_id: Number(values.farm_id),
        worker_id: values.worker_id ? Number(values.worker_id) : null,
        costs: values.costs.map((c) => ({ category: c.category, concept: c.concept.trim(), amount: parseAmount(c.amount) })),
      })
      // Adjuntos tras crear la tarea: si alguno falla, la tarea ya existe y se avisa sin perder lo demás.
      const failed = []
      for (const file of files) {
        try {
          task = await tasksApi.addAttachment(task.id, file)
        } catch (err) {
          failed.push(`${file.name}: ${getErrorMessage(err)}`)
        }
      }
      setValues({ ...blank(values.date), farm_id: values.farm_id, category: values.category })
      setFiles([])
      onCreated?.(task)
      if (failed.length) setServerError(`Tarea creada, pero no se pudieron adjuntar: ${failed.join(' · ')}`)
    } catch (err) {
      setServerError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const aria = (field) => ({ 'aria-invalid': errors[field] ? true : undefined, 'aria-describedby': errors[field] ? `task-${field}-error` : undefined })
  const costTotal = values.costs.reduce((s, c) => s + (parseAmount(c.amount) > 0 ? parseAmount(c.amount) : 0), 0)
  const activeWorkers = workers.filter((w) => w.active)

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {serverError && <Alert variant="error" onClose={() => setServerError(null)}>{serverError}</Alert>}

      <FormField id="task-title" label="Título" error={errors.title}>
        <input id="task-title" className={inputClass} value={values.title} maxLength={200} onChange={set('title')} placeholder="Ej. Tratamiento contra oídio" {...aria('title')} />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="task-category" label="Tipo de labor">
          <select id="task-category" value={values.category} onChange={set('category')} className={inputClass}>
            {TASK_CATEGORIES.map((c) => <option className={optionClass} key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </FormField>
        <FormField id="task-farm_id" label="Granja" error={errors.farm_id}>
          <FarmSelect id="task-farm_id" farms={farms} value={values.farm_id} onChange={set('farm_id')} invalid={!!errors.farm_id} />
        </FormField>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="task-date" label={values.multiday ? 'Inicio' : 'Fecha'} error={errors.date}>
          <input id="task-date" type="date" className={inputClass} value={values.date} onChange={set('date')} {...aria('date')} />
        </FormField>
        {values.multiday ? (
          <FormField id="task-end_date" label="Fin" error={errors.end_date}>
            <input id="task-end_date" type="date" min={values.date} className={inputClass} value={values.end_date} onChange={set('end_date')} {...aria('end_date')} />
          </FormField>
        ) : (
          <div className="flex items-end">
            <label className="inline-flex cursor-pointer items-center gap-2 pb-2.5 text-sm text-slate-300">
              <input type="checkbox" checked={values.multiday} onChange={set('multiday')} className="h-4 w-4 rounded border-white/20 bg-white/5 accent-secondary-400" />
              Dura varios días
            </label>
          </div>
        )}
      </div>
      {values.multiday && (
        <button type="button" onClick={() => setValues((v) => ({ ...v, multiday: false, end_date: '' }))} className="-mt-2 text-xs text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline">Es de un solo día</button>
      )}

      <FormField id="task-worker" label="Asignar a" hint={activeWorkers.length ? 'Lo verá en su portal si tiene la cuenta vinculada.' : 'Da de alta a tu equipo en la pestaña «Trabajadores».'}>
        <select id="task-worker" value={values.worker_id} onChange={set('worker_id')} className={inputClass} disabled={!activeWorkers.length}>
          <option className={optionClass} value="">Sin asignar</option>
          {activeWorkers.map((w) => <option className={optionClass} key={w.id} value={w.id}>{w.name} · {positionLabel(w.position)}</option>)}
        </select>
      </FormField>

      <FormField id="task-description" label="Descripción detallada (opcional)" error={errors.description} hint={`${values.description.length.toLocaleString('es-ES')} / 10.000`}>
        <textarea id="task-description" rows={5} className={`${inputClass} resize-y`} value={values.description} maxLength={10000} onChange={set('description')} placeholder="Instrucciones, dosis, sectores, precauciones…" {...aria('description')} />
      </FormField>

      <fieldset>
        <legend className="mb-2 flex w-full items-center justify-between text-sm font-medium text-slate-300">
          <span>Gastos directos</span>
          {costTotal > 0 && <span className="tabular-nums text-slate-400">{money(costTotal)}</span>}
        </legend>
        <ul className="space-y-2">
          {values.costs.map((c, i) => (
            <li key={i} className="pop-in grid grid-cols-[1fr_auto] gap-2 rounded-xl bg-white/[0.02] p-2 ring-1 ring-inset ring-white/[0.06] sm:grid-cols-[9rem_1fr_6.5rem_auto]">
              <label className="sr-only" htmlFor={`cost-${i}-category`}>Categoría</label>
              <select id={`cost-${i}-category`} value={c.category} onChange={(e) => setCost(i, 'category', e.target.value)} className={`${inputClass} col-span-2 sm:col-span-1`}>
                {EXPENSE_CATEGORIES.map((k) => <option className={optionClass} key={k.id} value={k.id}>{k.label}</option>)}
              </select>
              <label className="sr-only" htmlFor={`cost-${i}-concept`}>Concepto</label>
              <input id={`cost-${i}-concept`} value={c.concept} maxLength={120} onChange={(e) => setCost(i, 'concept', e.target.value)} placeholder="Concepto" className={`${inputClass} col-span-2 sm:col-span-1`} />
              <label className="sr-only" htmlFor={`cost-${i}-amount`}>Importe en euros</label>
              <input id={`cost-${i}-amount`} value={c.amount} inputMode="decimal" maxLength={16} onChange={(e) => setCost(i, 'amount', e.target.value)} placeholder="€" className={inputClass} />
              <button type="button" onClick={() => setValues((v) => ({ ...v, costs: v.costs.filter((_, j) => j !== i) }))} aria-label="Quitar gasto" className="rounded-xl px-2.5 text-slate-400 hover:bg-white/5 hover:text-accent-200"><Trash2 className="h-4 w-4" aria-hidden="true" /></button>
            </li>
          ))}
        </ul>
        {values.costs.length < 20 && (
          <button type="button" onClick={() => setValues((v) => ({ ...v, costs: [...v.costs, { ...BLANK_COST }] }))} className="mt-2 inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs font-semibold text-secondary-200 hover:bg-white/5">
            <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Imputar gasto
          </button>
        )}
        {errors.costs && <p className="field-error mt-1 text-xs font-medium text-accent-300">{errors.costs}</p>}
        {values.costs.length > 0 && <p className="mt-1 text-[11px] text-slate-500">Se registran en Economía como costes variables con la fecha de inicio.</p>}
      </fieldset>

      <div>
        <p className="mb-2 text-sm font-medium text-slate-300">Fotos y archivos</p>
        {files.length > 0 && (
          <ul className="mb-2 space-y-1.5">
            {files.map((f, i) => (
              <li key={`${f.name}-${i}`} className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-2.5 py-1.5 text-xs text-slate-300">
                {f.type === 'application/pdf' ? <FileText className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" /> : <ImageIcon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />}
                <span className="min-w-0 flex-1 truncate">{f.name}</span>
                <span className="tabular-nums text-slate-500">{(f.size / 1024 / 1024).toFixed(1)} MB</span>
                <button type="button" onClick={() => setFiles((fs) => fs.filter((_, j) => j !== i))} aria-label={`Quitar ${f.name}`} className="text-slate-500 hover:text-white"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
        )}
        {files.length < TASK_ATTACHMENT.max && (
          <Button variant="outline" onClick={() => fileRef.current?.click()}><Paperclip className="h-4 w-4" aria-hidden="true" /> Adjuntar</Button>
        )}
        <input ref={fileRef} type="file" multiple accept={TASK_ATTACHMENT.types.join(',')} className="sr-only" tabIndex={-1} onChange={(e) => { pickFiles(e.target.files ?? []); e.target.value = '' }} />
        <p className="mt-1.5 text-[11px] text-slate-500">Fotos PNG, JPEG o WEBP (5 MB) y PDF (10 MB). Se eliminan los metadatos de las fotos, incluida la ubicación GPS.</p>
        {errors.files && <p role="alert" className="field-error mt-1 text-xs font-medium text-accent-300">{errors.files}</p>}
      </div>

      <Button type="submit" loading={submitting} className="w-full sm:w-auto">Crear tarea</Button>
    </form>
  )
}
