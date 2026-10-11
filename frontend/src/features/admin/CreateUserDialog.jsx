import { useEffect, useRef, useState } from 'react'
import { adminApi, getErrorMessage } from '../../api.js'
import { ROLE_LABELS } from '../../auth/roles.js'
import { isStrongPassword } from '../../components/auth/PasswordStrength.jsx'
import Button from '../../components/ui/Button.jsx'
import FormField, { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import { birthDateError, latestAdultBirthDate } from '../../lib/age.js'
import { focusFirstError } from '../../lib/forms.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const EMPTY = { name: '', email: '', birth_date: '', role: 'user', password: '' }

function validate(v) {
  const e = {}
  if (!v.name.trim()) e.name = 'Indica el nombre.'
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Email no válido.'
  const birth = birthDateError(v.birth_date)
  if (birth) e.birth_date = birth
  if (!isStrongPassword(v.password)) e.password = 'Mín. 8 caracteres con letra, número y símbolo.'
  return e
}

/** Alta directa de una cuenta desde el panel (POST /admin/users, solo rol admin). */
export default function CreateUserDialog({ open, onClose, onCreated }) {
  const dialogRef = useRef(null)
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setValues(EMPTY)
      setErrors({})
      setServerError(null)
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }
  const aria = (field) => ({ 'aria-invalid': errors[field] ? true : undefined, 'aria-describedby': errors[field] ? `cu-${field}-error` : undefined })

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
      const created = await adminApi.createUser({ ...values, name: values.name.trim(), email: values.email.trim() })
      onCreated?.(created)
      onClose()
    } catch (err) {
      setServerError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onClick={(e) => e.target === dialogRef.current && dialogRef.current.close()}
      aria-labelledby="cu-title"
      className="dialog-animated w-[calc(100%-2rem)] max-w-lg rounded-3xl border border-white/10 bg-slate-900 p-0 text-slate-100 shadow-overlay backdrop:bg-slate-950/85"
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-4 p-6">
        <div>
          <h2 id="cu-title" className="text-lg font-semibold text-white">Nuevo usuario</h2>
          <p className="mt-0.5 text-sm text-slate-400">La cuenta queda activa al instante con el rol elegido.</p>
        </div>
        <FormField id="cu-name" label="Nombre" error={errors.name}>
          <input id="cu-name" maxLength={100} value={values.name} onChange={set('name')} className={inputClass} {...aria('name')} />
        </FormField>
        <FormField id="cu-email" label="Email" error={errors.email}>
          <input id="cu-email" type="email" maxLength={255} autoComplete="off" value={values.email} onChange={set('email')} className={inputClass} {...aria('email')} />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField id="cu-birth_date" label="Fecha de nacimiento" error={errors.birth_date}>
            <input id="cu-birth_date" type="date" min="1900-01-01" max={latestAdultBirthDate()} value={values.birth_date} onChange={set('birth_date')} className={inputClass} {...aria('birth_date')} />
          </FormField>
          <FormField id="cu-role" label="Rol">
            <select id="cu-role" value={values.role} onChange={set('role')} className={inputClass}>
              {Object.entries(ROLE_LABELS).map(([id, label]) => <option className={optionClass} key={id} value={id}>{label}</option>)}
            </select>
          </FormField>
        </div>
        <FormField id="cu-password" label="Contraseña inicial" error={errors.password} hint="Comunícala por un canal seguro y pide que la cambie.">
          <input id="cu-password" type="password" autoComplete="new-password" maxLength={128} value={values.password} onChange={set('password')} className={inputClass} {...aria('password')} />
        </FormField>
        {serverError && <p role="alert" className="text-sm font-medium text-accent-300">{serverError}</p>}
        <div className="flex justify-end gap-2 pt-2">
          <Button variant="outline" onClick={() => dialogRef.current?.close()}>Cancelar</Button>
          <Button type="submit" loading={submitting}>Crear usuario</Button>
        </div>
      </form>
    </dialog>
  )
}
