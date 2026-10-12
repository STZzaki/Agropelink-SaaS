import { useState } from 'react'
import { Link } from 'react-router-dom'
import { applicationsApi, getErrorMessage } from '../../api.js'
import Button from '../../components/ui/Button.jsx'
import FormField, { inputClass } from '../../components/ui/FormField.jsx'
import { focusFirstError } from '../../lib/forms.js'

const PHONE_RE = /^\+?[0-9\s()-]{9,20}$/
const EMPTY = { farm_name: '', location: '', crops: '', surface_ha: '', phone: '', message: '', privacy: false }

function validate(v) {
  const e = {}
  if (v.farm_name.trim().length < 2) e.farm_name = 'Indica el nombre de la explotación.'
  if (v.location.trim().length < 2) e.location = 'Indica el municipio y la provincia.'
  if (v.crops.trim().length < 2) e.crops = 'Indica tus cultivos principales.'
  if (v.surface_ha !== '') {
    const n = Number(String(v.surface_ha).replace(',', '.'))
    if (!Number.isFinite(n) || n <= 0 || n > 100000) e.surface_ha = 'Superficie no válida.'
  }
  if (!PHONE_RE.test(v.phone.trim())) e.phone = 'Teléfono no válido (9–20 dígitos).'
  if (!v.privacy) e.privacy = 'Debes aceptar la política de privacidad.'
  return e
}

/** Solicitud formal de alta como agricultor: un administrador la revisa y concede el rol `farmer`. */
export default function FarmerApplicationForm({ onSubmitted }) {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }
  const aria = (field) => ({ 'aria-invalid': errors[field] ? true : undefined, 'aria-describedby': errors[field] ? `fa-${field}-error` : undefined })

  async function handleSubmit(e) {
    e.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length) {
      focusFirstError(e.currentTarget)
      return
    }
    setSubmitting(true)
    setServerError(null)
    try {
      const created = await applicationsApi.create({
        farm_name: values.farm_name.trim(),
        location: values.location.trim(),
        crops: values.crops.trim(),
        surface_ha: values.surface_ha === '' ? null : Number(String(values.surface_ha).replace(',', '.')),
        phone: values.phone.trim(),
        message: values.message.trim() || null,
        privacy_accepted: true,
      })
      setValues(EMPTY)
      onSubmitted?.(created)
    } catch (err) {
      setServerError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <FormField id="fa-farm_name" label="Nombre de la explotación" error={errors.farm_name}>
        <input id="fa-farm_name" maxLength={150} value={values.farm_name} onChange={set('farm_name')} className={inputClass} placeholder="Finca Los Llanos" {...aria('farm_name')} />
      </FormField>
      <FormField id="fa-location" label="Ubicación" error={errors.location}>
        <input id="fa-location" maxLength={255} value={values.location} onChange={set('location')} className={inputClass} placeholder="Níjar, Almería" {...aria('location')} />
      </FormField>
      <FormField id="fa-crops" label="Cultivos principales" error={errors.crops}>
        <input id="fa-crops" maxLength={300} value={values.crops} onChange={set('crops')} className={inputClass} placeholder="Tomate, pimiento" {...aria('crops')} />
      </FormField>
      <div className="grid grid-cols-2 gap-4">
        <FormField id="fa-surface_ha" label="Superficie (ha)" error={errors.surface_ha}>
          <input id="fa-surface_ha" inputMode="decimal" maxLength={10} value={values.surface_ha} onChange={set('surface_ha')} className={inputClass} placeholder="3,5" {...aria('surface_ha')} />
        </FormField>
        <FormField id="fa-phone" label="Teléfono" error={errors.phone}>
          <input id="fa-phone" type="tel" autoComplete="tel" maxLength={20} value={values.phone} onChange={set('phone')} className={inputClass} placeholder="600 123 456" {...aria('phone')} />
        </FormField>
      </div>
      <FormField id="fa-message" label="Cuéntanos tu explotación (opcional)" className="sm:col-span-2">
        <textarea id="fa-message" rows={3} maxLength={1000} value={values.message} onChange={set('message')} className={`${inputClass} resize-y`} placeholder="Invernadero multitúnel, riego por goteo, sondas de humedad…" />
      </FormField>
      <div className="sm:col-span-2">
        <label className="flex items-start gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={values.privacy} onChange={set('privacy')} className="mt-0.5 h-4 w-4 rounded border-white/15 text-secondary-300 focus:ring-secondary-400" {...aria('privacy')} />
          <span>
            Acepto que Agropelink trate estos datos para evaluar mi alta según la{' '}
            <Link to="/privacidad" className="font-semibold text-secondary-300 underline underline-offset-2">política de privacidad</Link>.
          </span>
        </label>
        {errors.privacy && <p id="fa-privacy-error" className="mt-1 text-xs font-medium text-accent-300">{errors.privacy}</p>}
      </div>
      {serverError && <p role="alert" className="text-sm font-medium text-accent-300 sm:col-span-2">{serverError}</p>}
      <div className="sm:col-span-2">
        <Button type="submit" loading={submitting} className="w-full sm:w-auto">Enviar solicitud de alta</Button>
      </div>
    </form>
  )
}
