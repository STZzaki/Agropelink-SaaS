import { LazyMotion, MotionConfig, domAnimation, m } from 'framer-motion'
import { useState } from 'react'
import { Link } from 'react-router-dom'
import { FORCE_MOTION } from '../../lib/gsap.js'

export const authInputCls = 'field'

export function AuthField({ id, label, error, hint, children }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-300">{label}</label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="field-error mt-2 text-xs font-medium text-accent-300">{error}</p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  )
}

export function PasswordInput({ id, value, onChange, autoComplete, invalid, describedBy }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="relative">
      <input
        id={id}
        type={visible ? 'text' : 'password'}
        autoComplete={autoComplete}
        maxLength={128}
        value={value}
        onChange={onChange}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        className={`${authInputCls} pr-12`}
      />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-pressed={visible}
        aria-label={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'}
        className="absolute inset-y-0 right-0 flex w-12 items-center justify-center text-slate-500 hover:text-slate-200"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M2.5 12S6 5 12 5s9.5 7 9.5 7-3.5 7-9.5 7-9.5-7-9.5-7z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path strokeLinecap="round" d="M4 4l16 16" />}
        </svg>
      </button>
    </div>
  )
}

/** Marco común de las vistas de acceso (login, registro, recuperación): marca a la izquierda y formulario a la derecha. */
export default function AuthShell({ title, subtitle, children, footer }) {
  return (
    <LazyMotion features={domAnimation} strict>
    <MotionConfig reducedMotion={FORCE_MOTION ? 'never' : 'user'}>
    <div className="relative min-h-screen overflow-hidden bg-slate-950 font-sans text-slate-200 antialiased">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="absolute -top-40 left-1/4 h-[30rem] w-[40rem] glow-secondary" />
        <div className="absolute bottom-0 right-0 h-80 w-80 glow-primary" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:56px_56px] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      </div>

      <div className="relative mx-auto grid min-h-screen max-w-6xl items-center gap-12 px-4 py-10 sm:px-6 lg:grid-cols-2 lg:px-8">
        <div className="hidden lg:block">
          <Link to="/" aria-label="Volver a la página principal">
            <img src="/brand/logo-white.png" alt="Agropelink" className="h-14 w-auto" />
          </Link>
          <h2 className="mt-10 text-4xl font-semibold leading-tight tracking-tight text-white">
            Tu explotación,{' '}
            <span className="bg-gradient-to-r from-primary-300 to-secondary-300 bg-clip-text text-transparent">bajo control.</span>
          </h2>
          <ul className="mt-8 space-y-4 text-slate-400">
            {['Tareas y labores por parcela', 'Asistente agronómico con aprobación humana', 'Documentos y costes en un solo lugar'].map((t) => (
              <li key={t} className="flex items-center gap-3">
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-500/15 text-primary-300">
                  <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} aria-hidden="true">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                  </svg>
                </span>
                {t}
              </li>
            ))}
          </ul>
          <p className="mt-10 flex items-center gap-2 text-xs text-slate-500">
            <svg className="h-4 w-4 text-secondary-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
            </svg>
            Contraseñas cifradas con Argon2id · sesión en cookie segura HttpOnly
          </p>
        </div>

        <m.div
          initial={{ opacity: 0, y: 16, scale: 0.985 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="mx-auto w-full max-w-md"
        >
          <Link to="/" className="mb-8 inline-block lg:hidden" aria-label="Volver a la página principal">
            <img src="/brand/logo-white.png" alt="Agropelink" className="h-12 w-auto" />
          </Link>
          {/* Tarjeta de cristal sin backdrop-filter: borde translúcido, brillo superior y sombra difusa. */}
          <div className="relative rounded-3xl border border-white/10 bg-slate-900/[0.92] p-6 shadow-overlay sm:p-8">
            <div className="pointer-events-none absolute inset-x-8 top-0 h-px bg-gradient-to-r from-transparent via-secondary-300/50 to-transparent" aria-hidden="true" />
            <h1 className="text-2xl font-semibold text-white">{title}</h1>
            {subtitle && <p className="mt-1.5 text-sm text-slate-400">{subtitle}</p>}
            <div className="mt-7">{children}</div>
          </div>
          {footer && <p className="mt-6 text-center text-sm text-slate-400">{footer}</p>}
        </m.div>
      </div>
    </div>
    </MotionConfig>
    </LazyMotion>
  )
}
