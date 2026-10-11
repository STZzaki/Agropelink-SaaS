import { useEffect, useRef, useState } from 'react'
import { contactApi, getErrorMessage } from '../../api.js'
import { focusFirstError } from '../../lib/forms.js'

const EMPTY = { name: '', phone: '', email: '', message: '', privacy: false, website: '' }
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const PHONE_RE = /^\+?[0-9\s()-]{9,20}$/

function validate(v) {
  const e = {}
  if (!v.name.trim()) e.name = 'Indica tu nombre.'
  else if (v.name.trim().length > 100) e.name = 'Máximo 100 caracteres.'
  if (!PHONE_RE.test(v.phone.trim())) e.phone = 'Introduce un teléfono válido (mín. 9 dígitos).'
  if (!EMAIL_RE.test(v.email.trim())) e.email = 'Introduce un email válido.'
  if (v.message.trim().length < 10) e.message = 'Cuéntanos un poco más (mín. 10 caracteres).'
  else if (v.message.length > 3000) e.message = 'Máximo 3000 caracteres.'
  if (!v.privacy) e.privacy = 'Debes aceptar la política de privacidad.'
  return e
}

// Foco elástico y anillo de error del sistema de diseño (index.css → .field).
const inputCls = 'field'

function Field({ id, label, error, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-300">{label}</label>
      {children}
      {error && <p id={`${id}-error`} className="field-error mt-2 text-xs font-medium text-accent-300">{error}</p>}
    </div>
  )
}

export default function ContactForm() {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [status, setStatus] = useState('idle') // idle | sending | sent | error
  const [serverError, setServerError] = useState(null)
  const successRef = useRef(null)

  // Al confirmar el envío, el foco pasa al mensaje de agradecimiento (se anuncia y no se pierde).
  useEffect(() => {
    if (status === 'sent') successRef.current?.focus()
  }, [status])

  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }

  const aria = (field) => ({
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `contact-${field}-error` : undefined,
  })

  async function handleSubmit(e) {
    e.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length) {
      focusFirstError(e.currentTarget)
      return
    }

    setStatus('sending')
    setServerError(null)
    try {
      await contactApi.send({
        name: values.name.trim(),
        phone: values.phone.trim(),
        email: values.email.trim(),
        message: values.message.trim(),
        privacy_accepted: true,
        website: values.website,
      })
      setStatus('sent')
      setValues(EMPTY)
    } catch (err) {
      setStatus('error')
      setServerError(getErrorMessage(err))
    }
  }

  if (status === 'sent') {
    return (
      <div ref={successRef} tabIndex={-1} role="status" aria-live="polite" className="flex h-full flex-col focus:outline-none items-center justify-center rounded-3xl border border-primary-400/20 bg-primary-500/5 p-10 text-center">
        <span className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-primary-500/15 text-primary-300">
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        </span>
        <h3 className="mt-5 text-xl font-semibold text-white">Mensaje recibido</h3>
        <p className="mt-2 max-w-sm text-sm text-slate-400">Gracias por escribirnos. Nuestro equipo te contactará en un plazo de 24–48 h laborables.</p>
        <button type="button" onClick={() => setStatus('idle')} className="mt-6 text-sm font-semibold text-secondary-300 hover:text-secondary-200">
          Enviar otro mensaje
        </button>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="surface p-6 sm:p-8">
      <div className="grid gap-5 sm:grid-cols-2">
        <Field id="contact-name" label="Nombre" error={errors.name}>
          <input id="contact-name" autoComplete="name" maxLength={100} value={values.name} onChange={set('name')} className={inputCls} placeholder="Nombre y apellidos" {...aria('name')} />
        </Field>
        <Field id="contact-phone" label="Teléfono" error={errors.phone}>
          <input id="contact-phone" type="tel" autoComplete="tel" maxLength={20} value={values.phone} onChange={set('phone')} className={inputCls} placeholder="+34 600 000 000" {...aria('phone')} />
        </Field>
        <Field id="contact-email" label="Email corporativo" error={errors.email} className="sm:col-span-2">
          <input id="contact-email" type="email" autoComplete="email" maxLength={255} value={values.email} onChange={set('email')} className={inputCls} placeholder="nombre@tuempresa.es" {...aria('email')} />
        </Field>
        <Field id="contact-message" label="Mensaje" error={errors.message} className="sm:col-span-2">
          <textarea id="contact-message" rows={5} maxLength={3000} value={values.message} onChange={set('message')} className={`${inputCls} resize-y`} placeholder="Cuéntanos sobre tu explotación: cultivos, superficie, qué te gustaría mejorar…" {...aria('message')} />
        </Field>

        {/* Honeypot anti-spam: oculto para personas, los bots suelen rellenarlo. */}
        <div className="hidden" aria-hidden="true">
          <label htmlFor="contact-website">Web</label>
          <input id="contact-website" tabIndex={-1} autoComplete="off" value={values.website} onChange={set('website')} />
        </div>

        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-start gap-3 text-sm text-slate-400">
            <input
              type="checkbox"
              checked={values.privacy}
              onChange={set('privacy')}
              className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/5 text-secondary-500 focus:ring-secondary-400/40"
              {...aria('privacy')}
            />
            <span>
              He leído y acepto la <a href="/privacidad" target="_blank" rel="noopener" className="font-medium text-slate-200 underline underline-offset-2">política de privacidad</a>.
              Entiendo que Agropelink puede utilizar herramientas de inteligencia artificial para clasificar y agilizar
              la respuesta a mi consulta, siempre bajo supervisión humana.
            </span>
          </label>
          {errors.privacy && <p id="contact-privacy-error" className="field-error mt-2 text-xs font-medium text-accent-300">{errors.privacy}</p>}
        </div>
      </div>

      {status === 'error' && serverError && (
        <p role="alert" className="mt-5 rounded-xl border border-accent-400/30 bg-accent-500/10 px-4 py-3 text-sm text-accent-100">{serverError}</p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="btn-primary mt-6 h-12 w-full text-sm sm:w-auto sm:px-8"
      >
        {status === 'sending' && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" aria-hidden="true" />}
        {status === 'sending' ? 'Enviando…' : 'Enviar mensaje'}
      </button>
    </form>
  )
}
