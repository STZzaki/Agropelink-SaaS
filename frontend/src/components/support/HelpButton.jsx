import { useEffect, useId, useRef, useState } from 'react'
import { getErrorMessage, supportApi } from '../../api.js'
import { SITE } from '../../config/site.js'
import Button from '../ui/Button.jsx'
import { inputClass, optionClass } from '../ui/FormField.jsx'

const CATEGORIES = [
  { id: 'technical', label: 'Soporte técnico' },
  { id: 'account', label: 'AgroProfile B2B' },
  { id: 'legal', label: 'Legal y privacidad' },
  { id: 'other', label: 'Otro' },
]

const EMPTY = { category: 'technical', subject: '', message: '' }

function validate(v) {
  const e = {}
  if (v.subject.trim().length < 4) e.subject = 'Indica un asunto (mín. 4 caracteres).'
  if (v.message.trim().length < 10) e.message = 'Describe la consulta (mín. 10 caracteres).'
  return e
}

/** Botón flotante global de ayuda: contacto directo con el equipo técnico y legal o ticket rápido. */
export default function HelpButton() {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [state, setState] = useState('idle') // idle | sending | sent
  const [serverError, setServerError] = useState(null)
  const [ticketId, setTicketId] = useState(null)
  const panelRef = useRef(null)
  const uid = useId()

  useEffect(() => {
    if (!open) return
    panelRef.current?.querySelector('select, input, textarea, a')?.focus()
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length) return
    setState('sending')
    setServerError(null)
    try {
      const ticket = await supportApi.open({ category: values.category, subject: values.subject.trim(), message: values.message.trim() })
      setTicketId(ticket.id)
      setValues(EMPTY)
      setState('sent')
    } catch (err) {
      setServerError(getErrorMessage(err))
      setState('idle')
    }
  }

  return (
    <>
      {open && (
        <section
          ref={panelRef}
          id={`${uid}-panel`}
          role="dialog"
          aria-labelledby={`${uid}-title`}
          data-lenis-prevent
          className="pop-in fixed inset-x-3 bottom-24 z-50 max-h-[min(80vh,calc(100dvh-7rem))] origin-bottom-left overflow-y-auto rounded-2xl border border-white/10 bg-slate-900 shadow-overlay sm:inset-x-auto sm:left-6 sm:w-[24rem]"
        >
          <header className="flex items-start justify-between gap-3 border-b border-white/[0.06] px-5 py-4">
            <div>
              <h2 id={`${uid}-title`} className="text-base font-semibold text-white">¿Necesitas ayuda?</h2>
              <p className="mt-0.5 text-xs text-slate-400">Equipo técnico y legal de Agropelink.</p>
            </div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar ayuda" className="rounded-md p-1 text-slate-400 hover:bg-white/[0.06] hover:text-slate-200">
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </header>

          <div className="space-y-4 px-5 py-4">
            <a href={`mailto:${SITE.email}`} className="flex items-center gap-3 rounded-xl border border-white/10 px-4 py-3 text-sm transition-colors hover:border-secondary-300 hover:bg-secondary-500/10">
              <svg className="h-5 w-5 shrink-0 text-secondary-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M3 8l9 6 9-6M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" /></svg>
              <span>
                <span className="block font-medium text-slate-100">Escríbenos directamente</span>
                <span className="text-secondary-300">{SITE.email}</span>
              </span>
            </a>

            {state === 'sent' ? (
              <div role="status" className="rounded-xl bg-primary-500/10 px-4 py-4 text-sm text-primary-200 ring-1 ring-inset ring-primary-400/30">
                <p className="font-semibold">Ticket #{ticketId} recibido.</p>
                <p className="mt-1">Te responderemos por email lo antes posible.</p>
                <button type="button" onClick={() => setState('idle')} className="mt-3 text-xs font-semibold underline underline-offset-2">Abrir otro ticket</button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} noValidate className="space-y-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">O abre un ticket rápido</p>
                <div>
                  <label htmlFor={`${uid}-cat`} className="mb-1 block text-sm font-medium text-slate-200">Tema</label>
                  <select id={`${uid}-cat`} value={values.category} onChange={set('category')} className={inputClass}>
                    {CATEGORIES.map((c) => <option className={optionClass} key={c.id} value={c.id}>{c.label}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor={`${uid}-subject`} className="mb-1 block text-sm font-medium text-slate-200">Asunto</label>
                  <input id={`${uid}-subject`} maxLength={150} value={values.subject} onChange={set('subject')} className={inputClass} aria-invalid={errors.subject ? true : undefined} aria-describedby={errors.subject ? `${uid}-subject-error` : undefined} />
                  {errors.subject && <p id={`${uid}-subject-error`} className="mt-1 text-xs font-medium text-accent-300">{errors.subject}</p>}
                </div>
                <div>
                  <label htmlFor={`${uid}-msg`} className="mb-1 block text-sm font-medium text-slate-200">Mensaje</label>
                  <textarea id={`${uid}-msg`} rows={4} maxLength={3000} value={values.message} onChange={set('message')} className={`${inputClass} resize-y`} aria-invalid={errors.message ? true : undefined} aria-describedby={errors.message ? `${uid}-msg-error` : undefined} />
                  {errors.message && <p id={`${uid}-msg-error`} className="mt-1 text-xs font-medium text-accent-300">{errors.message}</p>}
                </div>
                {serverError && <p role="alert" className="text-xs font-medium text-accent-300">{serverError}</p>}
                <Button type="submit" variant="secondary" loading={state === 'sending'} className="w-full">Enviar ticket</Button>
              </form>
            )}
          </div>
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={`${uid}-panel`}
        aria-label={open ? 'Cerrar ayuda y soporte' : 'Abrir ayuda y soporte'}
        className="fixed bottom-5 left-5 z-50 inline-flex h-14 items-center gap-2 rounded-full bg-secondary-950 px-5 text-sm font-semibold text-white shadow-lg ring-4 ring-slate-950 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-secondary-300 active:scale-[0.96] sm:bottom-6 sm:left-6"
      >
        <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
        </svg>
        <span className="hidden sm:inline">Ayuda</span>
      </button>
    </>
  )
}
