import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { getErrorMessage } from '../api.js'
import { safeRedirect, useAuth } from '../auth/AuthContext.jsx'
import AuthShell, { AuthField, PasswordInput, authInputCls } from '../components/auth/AuthShell.jsx'
import PasswordStrength, { isStrongPassword } from '../components/auth/PasswordStrength.jsx'
import usePageMeta from '../hooks/usePageMeta.js'
import { birthDateError, latestAdultBirthDate } from '../lib/age.js'
import { focusFirstError } from '../lib/forms.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function validate(v) {
  const e = {}
  const name = v.name.trim()
  if (!name) e.name = 'Indica tu nombre.'
  else if (name.length > 100) e.name = 'Máximo 100 caracteres.'
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Introduce un email válido.'
  const birth = birthDateError(v.birth_date)
  if (birth) e.birth_date = birth
  if (!isStrongPassword(v.password)) e.password = 'La contraseña no cumple todos los requisitos.'
  if (v.confirm !== v.password) e.confirm = 'Las contraseñas no coinciden.'
  if (!v.terms) e.terms = 'Debes aceptar las condiciones y la política de privacidad.'
  return e
}

export default function RegisterPage() {
  const { register, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [values, setValues] = useState({ name: '', email: '', birth_date: '', password: '', confirm: '', terms: false })
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  usePageMeta({
    title: 'Crear cuenta',
    description: 'Crea tu cuenta gratuita en Agropelink y digitaliza la gestión de tu explotación agrícola.',
    noindex: true,
  })

  if (status === 'authenticated') return <Navigate to={safeRedirect(location.state?.from)} replace />

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }
  const aria = (field) => ({
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `register-${field}-error` : undefined,
  })

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
      await register({ name: values.name.trim(), email: values.email.trim(), birth_date: values.birth_date, password: values.password })
      // La respuesta es idéntica exista o no el email (anti-enumeración): siempre se continúa al login.
      navigate('/login', { replace: true, state: { ...location.state, registered: true, email: values.email.trim() } })
    } catch (err) {
      setServerError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Crea tu cuenta"
      subtitle="Empieza a digitalizar tu explotación en minutos."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/login" state={location.state} className="font-semibold text-secondary-300 hover:text-secondary-200">
            Inicia sesión
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <AuthField id="register-name" label="Nombre completo" error={errors.name}>
          <input id="register-name" autoComplete="name" maxLength={100} value={values.name} onChange={set('name')} className={authInputCls} placeholder="Nombre y apellidos" {...aria('name')} />
        </AuthField>
        <AuthField id="register-email" label="Email" error={errors.email}>
          <input id="register-email" type="email" autoComplete="email" maxLength={255} value={values.email} onChange={set('email')} className={authInputCls} placeholder="nombre@tuempresa.es" {...aria('email')} />
        </AuthField>
        <AuthField id="register-birth_date" label="Fecha de nacimiento" error={errors.birth_date}>
          <input
            id="register-birth_date"
            type="date"
            required
            autoComplete="bday"
            min="1900-01-01"
            max={latestAdultBirthDate()}
            value={values.birth_date}
            onChange={set('birth_date')}
            className={`${authInputCls} [color-scheme:dark]`}
            {...aria('birth_date')}
          />
          <p className="mt-1.5 text-xs text-slate-500">Agropelink es solo para mayores de 18 años.</p>
        </AuthField>
        <AuthField id="register-password" label="Contraseña" error={errors.password}>
          <PasswordInput
            id="register-password"
            value={values.password}
            onChange={set('password')}
            autoComplete="new-password"
            invalid={!!errors.password}
            describedBy={`register-password-strength${errors.password ? ' register-password-error' : ''}`}
          />
          <PasswordStrength id="register-password-strength" password={values.password} />
        </AuthField>
        <AuthField id="register-confirm" label="Repite la contraseña" error={errors.confirm}>
          <PasswordInput
            id="register-confirm"
            value={values.confirm}
            onChange={set('confirm')}
            autoComplete="new-password"
            invalid={!!errors.confirm}
            describedBy={errors.confirm ? 'register-confirm-error' : undefined}
          />
        </AuthField>

        <div>
          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-400">
            <input type="checkbox" checked={values.terms} onChange={set('terms')} className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/5 text-secondary-500 focus:ring-secondary-400/40" {...aria('terms')} />
            <span>
              Acepto las <a href="/terminos" target="_blank" rel="noopener" className="font-medium text-slate-200 underline underline-offset-2">condiciones de uso</a> y la <a href="/privacidad" target="_blank" rel="noopener" className="font-medium text-slate-200 underline underline-offset-2">política de privacidad</a>.
            </span>
          </label>
          {errors.terms && <p id="register-terms-error" className="field-error mt-2 text-xs font-medium text-accent-300">{errors.terms}</p>}
        </div>

        {serverError && (
          <p role="alert" className="rounded-xl border border-accent-400/30 bg-accent-500/10 px-4 py-3 text-sm text-accent-100">{serverError}</p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="btn-primary h-12 w-full rounded-xl text-sm"
        >
          {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" aria-hidden="true" />}
          {submitting ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>
      </form>
    </AuthShell>
  )
}
