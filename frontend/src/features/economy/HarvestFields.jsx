import { inputClass } from '../../components/ui/FormField.jsx'
import { durationDays, parseAmount } from './economyMeta.js'

export const EMPTY_HARVEST = { name: '', surface_ha: '', length_m: '', width_m: '', plant_count: '', start_date: '', end_date: '', description: '' }

/** Validación en cliente (el servidor vuelve a validarlo todo). Devuelve { campo: mensaje }. */
export function validateHarvest(h) {
  const e = {}
  if (!h.name.trim()) e.name = 'Pon nombre a la cosecha (p. ej. «Tomate otoño»).'
  else if (h.name.trim().length > 80) e.name = 'Máximo 80 caracteres.'
  for (const k of ['surface_ha', 'length_m', 'width_m']) {
    const n = parseAmount(h[k])
    if (n !== null && (!Number.isFinite(n) || n <= 0 || n > 1_000_000)) e[k] = 'Número mayor que 0.'
  }
  const plants = parseAmount(h.plant_count)
  if (plants !== null && (!Number.isInteger(plants) || plants < 0)) e.plant_count = 'Número entero de plantas.'
  if (h.start_date && h.end_date && h.end_date < h.start_date) e.end_date = 'Debe ser posterior al inicio.'
  if (h.description.length > 2000) e.description = 'Máximo 2000 caracteres.'
  return e
}

export function harvestPayload(h) {
  const t = (s) => (s ?? '').trim()
  return {
    name: t(h.name),
    surface_ha: parseAmount(h.surface_ha),
    length_m: parseAmount(h.length_m),
    width_m: parseAmount(h.width_m),
    plant_count: parseAmount(h.plant_count),
    start_date: h.start_date || null,
    end_date: h.end_date || null,
    description: t(h.description) || null,
  }
}

/** Respuesta del API → valores editables del formulario. */
export const harvestToForm = (h) => Object.fromEntries(Object.keys(EMPTY_HARVEST).map((k) => [k, h[k] === null || h[k] === undefined ? '' : String(h[k])]))

function Field({ id, label, error, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 block text-[11px] font-medium text-slate-400">{label}</label>
      {children}
      {error && <p id={`${id}-error`} className="field-error mt-1 text-xs font-medium text-accent-300">{error}</p>}
    </div>
  )
}

/** Campos de una cosecha: nombre, dimensiones, plantas, periodo (con duración calculada) y descripción. */
export default function HarvestFields({ idPrefix, value, onChange, errors = {} }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value })
  const input = (k, props = {}) => (
    <input
      id={`${idPrefix}-${k}`}
      value={value[k]}
      onChange={set(k)}
      className={inputClass}
      aria-invalid={errors[k] ? true : undefined}
      aria-describedby={errors[k] ? `${idPrefix}-${k}-error` : undefined}
      {...props}
    />
  )
  const days = durationDays(value.start_date, value.end_date)
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-6">
      <Field id={`${idPrefix}-name`} label="Cosecha / cultivo *" error={errors.name} className="sm:col-span-3">{input('name', { maxLength: 80, placeholder: 'Tomate rama · ciclo otoño' })}</Field>
      <Field id={`${idPrefix}-plant_count`} label="Nº de plantas" error={errors.plant_count} className="sm:col-span-3">{input('plant_count', { inputMode: 'numeric', placeholder: '40000' })}</Field>
      <Field id={`${idPrefix}-surface_ha`} label="Superficie (ha)" error={errors.surface_ha} className="sm:col-span-2">{input('surface_ha', { inputMode: 'decimal', placeholder: '2,5' })}</Field>
      <Field id={`${idPrefix}-length_m`} label="Largo (m)" error={errors.length_m} className="sm:col-span-2">{input('length_m', { inputMode: 'decimal' })}</Field>
      <Field id={`${idPrefix}-width_m`} label="Ancho (m)" error={errors.width_m} className="sm:col-span-2">{input('width_m', { inputMode: 'decimal' })}</Field>
      <Field id={`${idPrefix}-start_date`} label="Inicio de la cosecha" error={errors.start_date} className="sm:col-span-2">{input('start_date', { type: 'date' })}</Field>
      <Field id={`${idPrefix}-end_date`} label="Fin de la cosecha" error={errors.end_date} className="sm:col-span-2">{input('end_date', { type: 'date', min: value.start_date || undefined })}</Field>
      <div className="flex items-end sm:col-span-2">
        <p className="w-full rounded-xl bg-white/[0.03] px-3.5 py-2.5 text-sm text-slate-300" aria-live="polite">
          Duración: <span className="font-semibold tabular-nums text-white">{days ? `${days} días` : '—'}</span>
        </p>
      </div>
      <Field id={`${idPrefix}-description`} label="Descripción detallada" error={errors.description} className="sm:col-span-6">
        <textarea
          id={`${idPrefix}-description`}
          value={value.description}
          onChange={set('description')}
          rows={3}
          maxLength={2000}
          placeholder="Variedad, marco de plantación, tipo de riego, observaciones…"
          className={`${inputClass} resize-y`}
          aria-invalid={errors.description ? true : undefined}
        />
      </Field>
    </div>
  )
}
