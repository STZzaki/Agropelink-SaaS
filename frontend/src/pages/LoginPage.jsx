import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { getErrorMessage } from '../api.js'
import { safeRedirect, useAuth } from '../auth/AuthContext.jsx'
import AuthShell, { AuthField, PasswordInput, authInputCls } from '../components/auth/AuthShell.jsx'
import usePageMeta from '../hooks/usePageMeta.js'
import { focusFirstError } from '../lib/forms.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export default function LoginPage() {
  const { login, status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const target = safeRedirect(location.state?.from)
  const justRegistered = location.state?.registered === true

  const [email, setEmail] = useState(location.state?.email ?? '')
  const [password, setPassword] = useState('')
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [submitting, setSubmitting] = useState(false)

  usePageMeta({
    title: 'Iniciar sesión',
    description: 'Accede al panel de Agropelink para gestionar parcelas, tareas, documentos y tu asistente agronómico.',
    noindex: true,
  })

  if (status === 'authenticated') return <Navigate to={target} replace />

  async function handleSubmit(e) {
    e.preventDefault()
    const found = {}
    if (!EMAIL_RE.test(email.trim())) found.email = 'Introduce un email válido.'
    if (!password) found.password = 'Introduce tu contraseña.'
    setErrors(found)
    if (Object.keys(found).length) {
      focusFirstError(e.currentTarget)
      return
    }

    setSubmitting(true)
    setServerError(null)
    try {
      await login({ email: email.trim(), password })
      navigate(target, { replace: true })
    } catch (err) {
      setServerError(getErrorMessage(err))
      setPassword('')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthShell
      title="Inicia sesión"
      subtitle="Accede al panel de gestión de tu explotación."
      footer={
        <>
          ¿Aún no tienes cuenta?{' '}
          <Link to="/register" state={location.state} className="font-semibold text-secondary-300 hover:text-secondary-200">
            Regístrate gratis
          </Link>
        </>
      }
    >
      {justRegistered && (
        <p role="status" className="mb-5 rounded-xl border border-primary-400/25 bg-primary-500/10 px-4 py-3 text-sm text-primary-100">
          Cuenta preparada. Inicia sesión con tu email y contraseña.
        </p>
      )}
      <form onSubmit={handleSubmit} noValidate className="space-y-5">
        <AuthField id="login-email" label="Email" error={errors.email}>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            maxLength={255}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={authInputCls}
            placeholder="nombre@tuempresa.es"
            aria-invalid={errors.email ? true : undefined}
            aria-describedby={errors.email ? 'login-email-error' : undefined}
          />
        </AuthField>
        <AuthField id="login-password" label="Contraseña" error={errors.password}>
          <PasswordInput
            id="login-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            invalid={!!errors.password}
            describedBy={errors.password ? 'login-password-error' : undefined}
          />
        </AuthField>
        <div className="-mt-3 flex justify-end">
          <Link to="/forgot-password" state={{ email: email.trim() }} className="text-xs font-medium text-secondary-300 transition-colors duration-300 hover:text-secondary-200">
            ¿Olvidaste tu contraseña?
          </Link>
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
          {submitting ? 'Verificando…' : 'Iniciar sesión'}
        </button>
      </form>
    </AuthShell>
  )
}
