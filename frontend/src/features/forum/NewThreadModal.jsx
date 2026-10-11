import { useCallback, useEffect, useRef, useState } from 'react'
import { forumApi, getErrorMessage } from '../../api.js'
import { FORUM_CATEGORIES } from './forumMeta.js'
import MediaDropzone, { toEntry } from './MediaDropzone.jsx'
import { focusFirstError } from '../../lib/forms.js'
import { prefersReducedMotion } from '../../lib/gsap.js'

// Campos con foco elástico y anillo de error del sistema de diseño (index.css → .field).
const inputCls = 'field'

const TAG_RE = /^[\p{L}\p{N}_\- ]{2,24}$/u

export const RIGHTS_TEXT =
  'Confirmo que tengo los derechos de este archivo, asumo toda la responsabilidad legal sobre su contenido y acepto las condiciones de publicación.'

function parseTags(raw) {
  return [...new Set(raw.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean))]
}

function validate(v) {
  const e = {}
  if (!v.category) e.category = 'Elige una categoría.'
  const title = v.title.trim()
  if (title.length < 8) e.title = 'El título debe tener al menos 8 caracteres.'
  else if (title.length > 160) e.title = 'Máximo 160 caracteres.'
  const body = v.body.trim()
  if (body.length < 20) e.body = 'Desarrolla un poco más tu consulta (mín. 20 caracteres).'
  else if (body.length > 5000) e.body = 'Máximo 5000 caracteres.'
  const tags = parseTags(v.tags)
  if (tags.length > 5) e.tags = 'Máximo 5 etiquetas.'
  else if (tags.some((t) => !TAG_RE.test(t))) e.tags = 'Cada etiqueta: 2–24 letras, números o guiones.'
  return e
}

export default function NewThreadModal({ open, onClose, onCreated, defaultCategory = '' }) {
  const [values, setValues] = useState({ category: defaultCategory, title: '', body: '', tags: '' })
  const [errors, setErrors] = useState({})
  const [serverError, setServerError] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [entries, setEntries] = useState([])
  const [rightsAccepted, setRightsAccepted] = useState(false)
  const dialogRef = useRef(null)

  // Con adjuntos, "Subir y publicar" solo se habilita si todos son válidos y se acepta la declaración legal.
  const hasMedia = entries.length > 0
  const mediaReady = !hasMedia || (entries.every((e) => !e.error) && rightsAccepted)

  const patchEntry = (key, changes) => setEntries((list) => list.map((e) => (e.key === key ? { ...e, ...changes } : e)))
  const addFiles = (files) => setEntries((list) => [...list, ...files.map(toEntry)])
  function removeEntry(entry) {
    if (entry.preview) URL.revokeObjectURL(entry.preview)
    // Si ya se subió (p. ej. falló la publicación), se descarta también en el servidor.
    if (entry.uploadedId) forumApi.discardMedia(entry.uploadedId).catch(() => {})
    setEntries((list) => list.filter((e) => e.key !== entry.key))
  }

  useEffect(() => {
    const dialog = dialogRef.current
    if (!dialog) return
    if (open && !dialog.open) {
      setValues((v) => ({ ...v, category: v.category || defaultCategory }))
      dialog.showModal()
    }
    if (!open && dialog.open) dialog.close()
  }, [open, defaultCategory])

  // Cierre con transición de salida (160 ms, más corta que la entrada). <dialog> cierra al instante
  // por defecto, así que se marca `data-closing`, se espera a la animación y entonces se cierra.
  const requestClose = useCallback(() => {
    const dialog = dialogRef.current
    if (!dialog?.open || dialog.hasAttribute('data-closing')) return
    if (prefersReducedMotion()) {
      dialog.close()
      return
    }
    dialog.setAttribute('data-closing', '')
    let finished = false
    const finish = () => {
      if (finished) return
      finished = true
      dialog.removeAttribute('data-closing')
      dialog.close()
    }
    dialog.addEventListener('animationend', finish, { once: true })
    setTimeout(finish, 250) // red de seguridad si el navegador no emite animationend
  }, [])

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }
  const aria = (field) => ({ 'aria-invalid': errors[field] ? true : undefined, 'aria-describedby': errors[field] ? `nt-${field}-error` : undefined })

  async function handleSubmit(e) {
    e.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length) {
      focusFirstError(e.currentTarget)
      return
    }
    if (!mediaReady) return
    setSubmitting(true)
    setServerError(null)
    try {
      // 1) Subida secuencial de adjuntos (los ya subidos en un intento anterior se reutilizan).
      const mediaIds = []
      for (const entry of entries) {
        let id = entry.uploadedId
        if (!id) {
          const media = await forumApi.uploadMedia(entry.file, (progress) => patchEntry(entry.key, { progress }))
          id = media.id
          patchEntry(entry.key, { uploadedId: id, progress: 100 })
        }
        mediaIds.push(id)
      }
      // 2) Publicación del tema con los adjuntos validados por el servidor.
      const thread = await forumApi.create({
        category: values.category,
        title: values.title.trim(),
        body: values.body.trim(),
        tags: parseTags(values.tags),
        media_ids: mediaIds,
      })
      entries.forEach((e) => e.preview && URL.revokeObjectURL(e.preview))
      setEntries([])
      setRightsAccepted(false)
      setValues({ category: values.category, title: '', body: '', tags: '' })
      onCreated?.(thread)
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
      onCancel={(e) => {
        e.preventDefault() // Esc: cerrar también con transición
        requestClose()
      }}
      onClick={(e) => e.target === dialogRef.current && requestClose()}
      aria-labelledby="new-thread-title"
      className="dialog-animated w-[calc(100%-2rem)] max-w-2xl rounded-3xl bg-slate-900 p-0 text-slate-200 shadow-overlay backdrop:bg-slate-950/85"
    >
      <form onSubmit={handleSubmit} noValidate className="p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 id="new-thread-title" className="text-xl font-semibold text-white">Nuevo tema</h2>
            <p className="mt-1 text-sm text-slate-400">Plantea tu duda o comparte tu experiencia con la comunidad.</p>
          </div>
          <button type="button" onClick={requestClose} aria-label="Cerrar" className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-400 transition-[color,background-color,transform] duration-200 ease-out hover:bg-white/5 hover:text-white active:scale-[0.96]">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>

        <fieldset className="mt-6">
          <legend className="mb-2 text-sm font-medium text-slate-300">Categoría</legend>
          <div className="grid grid-cols-2 gap-2">
            {FORUM_CATEGORIES.map((c) => (
              <label key={c.id} className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-3 text-sm transition-[color,background-color,box-shadow] duration-200 ease-out has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-secondary-400 ${values.category === c.id ? 'bg-secondary-500/10 text-white shadow-[0_0_0_1px_rgb(75_194_168_/_0.45)]' : 'text-slate-400 shadow-surface-sm hover:bg-white/[0.04] hover:text-slate-200'}`}>
                <input type="radio" name="category" value={c.id} checked={values.category === c.id} onChange={set('category')} className="sr-only" />
                <span className={`h-2 w-2 shrink-0 rounded-full bg-gradient-to-r ${c.accent}`} aria-hidden="true" />
                {c.label}
              </label>
            ))}
          </div>
          {errors.category && <p className="field-error mt-2 text-xs font-medium text-accent-300">{errors.category}</p>}
        </fieldset>

        <div className="mt-5 space-y-5">
          <div>
            <label htmlFor="nt-title" className="mb-1.5 block text-sm font-medium text-slate-300">Título</label>
            <input id="nt-title" maxLength={160} value={values.title} onChange={set('title')} className={inputCls} placeholder="Ej. ¿Qué umbral de trips usáis en pimiento en otoño?" {...aria('title')} />
            {errors.title && <p id="nt-title-error" className="field-error mt-2 text-xs font-medium text-accent-300">{errors.title}</p>}
          </div>
          <div>
            <label htmlFor="nt-body" className="mb-1.5 flex justify-between text-sm font-medium text-slate-300">
              Mensaje <span className="text-xs font-normal text-slate-500">{values.body.length}/5000</span>
            </label>
            <textarea id="nt-body" rows={6} maxLength={5000} value={values.body} onChange={set('body')} className={`${inputCls} resize-y`} placeholder="Describe tu cultivo, zona, lo que has probado…" {...aria('body')} />
            {errors.body && <p id="nt-body-error" className="field-error mt-2 text-xs font-medium text-accent-300">{errors.body}</p>}
          </div>
          <div>
            <label htmlFor="nt-tags" className="mb-1.5 block text-sm font-medium text-slate-300">Etiquetas <span className="font-normal text-slate-500">(opcional, separadas por comas)</span></label>
            <input id="nt-tags" maxLength={140} value={values.tags} onChange={set('tags')} className={inputCls} placeholder="pimiento, trips, almería" {...aria('tags')} />
            {errors.tags && <p id="nt-tags-error" className="field-error mt-2 text-xs font-medium text-accent-300">{errors.tags}</p>}
          </div>
        </div>

        <div className="mt-5">
          <p className="mb-1.5 text-sm font-medium text-slate-300">Fotos o vídeo <span className="font-normal text-slate-500">(opcional)</span></p>
          <MediaDropzone entries={entries} onAdd={addFiles} onRemove={removeEntry} disabled={submitting} />
          {hasMedia && (
            <label className={`mt-4 flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-sm transition-[border-color,background-color] duration-300 ${rightsAccepted ? 'border-primary-400/40 bg-primary-500/[0.07] text-slate-200' : 'border-white/10 bg-white/[0.02] text-slate-300'}`}>
              <input
                type="checkbox"
                required
                checked={rightsAccepted}
                onChange={(e) => setRightsAccepted(e.target.checked)}
                disabled={submitting}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 bg-white/5 text-secondary-500 focus:ring-secondary-400/40"
              />
              <span>{RIGHTS_TEXT}</span>
            </label>
          )}
        </div>

        {serverError && <p role="alert" className="mt-5 rounded-xl border border-accent-400/30 bg-accent-500/10 px-4 py-3 text-sm text-accent-100">{serverError}</p>}

        {hasMedia && !mediaReady && (
          <p className="mt-5 text-right text-xs text-slate-500">
            {entries.some((e) => e.error) ? 'Quita los archivos no válidos para continuar.' : 'Marca la declaración de derechos para habilitar «Subir y publicar».'}
          </p>
        )}
        <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" onClick={requestClose} className="btn-secondary h-11 px-6 text-sm text-slate-200">Cancelar</button>
          <button
            type="submit"
            disabled={submitting || !mediaReady}
            aria-disabled={submitting || !mediaReady}
            className="btn-primary h-11 px-6 text-sm disabled:cursor-not-allowed disabled:opacity-40 disabled:shadow-none disabled:grayscale"
          >
            {submitting && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" aria-hidden="true" />}
            {submitting ? (hasMedia ? 'Subiendo…' : 'Publicando…') : hasMedia ? 'Subir y publicar' : 'Publicar tema'}
          </button>
        </div>
      </form>
    </dialog>
  )
}
