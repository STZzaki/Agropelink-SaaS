import { AnimatePresence, m } from 'framer-motion'
import { useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { authApi, getErrorMessage } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import AuthShell, { AuthField, PasswordInput } from '../components/auth/AuthShell.jsx'
import PasswordStrength, { isStrongPassword } from '../components/auth/PasswordStrength.jsx'
import usePageMeta from '../hooks/usePageMeta.js'

const SWAP = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.24, ease: [0.2, 0, 0, 1] } }

/**
 * Nueva contraseña a partir del enlace `/reset-password?token=…`.
 * El token se retira de la barra de direcciones al cargar (no queda en el historial ni viaja como Referer)
 * y solo se conserva en memoria hasta enviarlo.
 */
export default function ResetPasswordPage() {
  const [params] = useSearchParams()
  const navigate = useNavigate()
  const { status, logout } = useAuth()
  const [token] = useState(() => params.get('token') ?? '')
  const [values, setValues] = useState({ password: '', confirm: '' })
  const [errors, setErrors] = useState({})
  const [state, setState] = useState('idle') // idle | sending | done
  const [serverError, setServerError] = useState(null)

  usePageMeta({ title: 'Nueva contraseña', description: 'Crea una nueva contraseña para tu cuenta de Agropelink.', noindex: true })

  useEffect(() => {
    if (params.has('token')) navigate('/reset-password', { replace: true })
  }, [params, navigate])

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const found = {}
    if (!isStrongPassword(values.password)) found.password = 'La contraseña no cumple todos los requisitos.'
    if (values.confirm !== values.password) found.confirm = 'Las contraseñas no coinciden.'
    setErrors(found)
    if (Object.keys(found).length) return
    setState('sending')
    setServerError(null)
    try {
      await authApi.resetPassword(token, values.password)
      setValues({ password: '', confirm: '' })
      setState('done')
      // El backend cierra todas las sesiones de la cuenta: se refleja también en esta pestaña.
      if (status === 'authenticated') await logout()
    } catch (err) {
      setServerError(getErrorMessage(err))
      setState('idle')
    }
  }

  if (!token) {
    return (
      <AuthShell title="Enlace no válido" subtitle="Falta el código de recuperación o el enlace está incompleto.">
        <Link to="/forgot-password" className="btn-primary h-12 w-full rounded-xl text-sm">Solicitar un enlace nuevo</Link>
      </AuthShell>
    )
  }

  return (
    <AuthShell title="Crea una nueva contraseña" subtitle="El enlace es de un solo uso y caduca a los 15 minutos.">
      <AnimatePresence mode="wait" initial={false}>
        {state === 'done' ? (
          <m.div key="done" {...SWAP} role="status" className="space-y-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-500/15 text-primary-300" aria-hidden="true">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">Contraseña actualizada. Por seguridad hemos cerrado las sesiones abiertas en otros dispositivos.</p>
            <Link to="/login" className="btn-primary h-12 w-full rounded-xl text-sm">Iniciar sesión</Link>
          </m.div>
        ) : (
          <m.form key="form" {...SWAP} onSubmit={handleSubmit} noValidate className="space-y-5">
            <AuthField id="reset-password" label="Nueva contraseña" error={errors.password}>
              <PasswordInput
                id="reset-password"
                value={values.password}
                onChange={set('password')}
                autoComplete="new-password"
                invalid={!!errors.password}
                describedBy={`reset-password-strength${errors.password ? ' reset-password-error' : ''}`}
              />
              <PasswordStrength id="reset-password-strength" password={values.password} />
            </AuthField>
            <AuthField id="reset-confirm" label="Repite la contraseña" error={errors.confirm}>
              <PasswordInput
                id="reset-confirm"
                value={values.confirm}
                onChange={set('confirm')}
                autoComplete="new-password"
                invalid={!!errors.confirm}
                describedBy={errors.confirm ? 'reset-confirm-error' : undefined}
              />
            </AuthField>
            {serverError && (
              <div role="alert" className="rounded-xl border border-accent-400/30 bg-accent-500/10 px-4 py-3 text-sm text-accent-100">
                {serverError}{' '}
                <Link to="/forgot-password" className="font-semibold underline underline-offset-2">Pedir otro enlace</Link>
              </div>
            )}
            <button type="submit" disabled={state === 'sending'} className="btn-primary h-12 w-full rounded-xl text-sm">
              {state === 'sending' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" aria-hidden="true" />}
              {state === 'sending' ? 'Guardando…' : 'Guardar nueva contraseña'}
            </button>
          </m.form>
        )}
      </AnimatePresence>
    </AuthShell>
  )
}
