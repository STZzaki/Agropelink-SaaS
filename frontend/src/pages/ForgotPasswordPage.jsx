import { AnimatePresence, m } from 'framer-motion'
import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { authApi, getErrorMessage } from '../api.js'
import AuthShell, { AuthField, authInputCls } from '../components/auth/AuthShell.jsx'
import usePageMeta from '../hooks/usePageMeta.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const SWAP = { initial: { opacity: 0, y: 8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -6 }, transition: { duration: 0.24, ease: [0.2, 0, 0, 1] } }

/** Solicitud del enlace de recuperación. La respuesta es la misma exista o no la cuenta (anti-enumeración). */
export default function ForgotPasswordPage() {
  const location = useLocation()
  const [email, setEmail] = useState(location.state?.email ?? '')
  const [error, setError] = useState(null)
  const [state, setState] = useState('idle') // idle | sending | sent
  const [message, setMessage] = useState('')

  usePageMeta({ title: 'Recuperar contraseña', description: 'Solicita un enlace para restablecer tu contraseña de Agropelink.', noindex: true })

  async function handleSubmit(e) {
    e.preventDefault()
    if (!EMAIL_RE.test(email.trim())) {
      setError('Introduce un email válido.')
      return
    }
    setError(null)
    setState('sending')
    try {
      const { detail } = await authApi.forgotPassword(email.trim())
      setMessage(detail)
      setState('sent')
    } catch (err) {
      setError(getErrorMessage(err))
      setState('idle')
    }
  }

  return (
    <AuthShell
      title="¿Olvidaste tu contraseña?"
      subtitle="Te enviaremos un enlace seguro para crear una nueva."
      footer={<Link to="/login" className="font-semibold text-secondary-300 transition-colors duration-300 hover:text-secondary-200">Volver a iniciar sesión</Link>}
    >
      <AnimatePresence mode="wait" initial={false}>
        {state === 'sent' ? (
          <m.div key="sent" {...SWAP} role="status" className="space-y-5">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-500/15 text-primary-300" aria-hidden="true">
              <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" /></svg>
            </div>
            <p className="text-sm leading-relaxed text-slate-300">{message}</p>
            <p className="text-xs text-slate-500">Revisa también la carpeta de spam. Si no llega, puedes solicitar otro enlace en unos minutos.</p>
            <button type="button" onClick={() => setState('idle')} className="btn-secondary h-11 w-full rounded-xl text-sm">Usar otro email</button>
          </m.div>
        ) : (
          <m.form key="form" {...SWAP} onSubmit={handleSubmit} noValidate className="space-y-5">
            <AuthField id="forgot-email" label="Email de tu cuenta" error={error}>
              <input
                id="forgot-email"
                type="email"
                autoComplete="email"
                maxLength={255}
                value={email}
                onChange={(e) => { setEmail(e.target.value); setError(null) }}
                className={authInputCls}
                placeholder="nombre@tuempresa.es"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'forgot-email-error' : undefined}
                autoFocus
              />
            </AuthField>
            <button type="submit" disabled={state === 'sending'} className="btn-primary h-12 w-full rounded-xl text-sm">
              {state === 'sending' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" aria-hidden="true" />}
              {state === 'sending' ? 'Enviando…' : 'Enviar enlace de recuperación'}
            </button>
          </m.form>
        )}
      </AnimatePresence>
    </AuthShell>
  )
}
