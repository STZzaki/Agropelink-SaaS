import { forwardRef, useRef, useState } from 'react'
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '../../api.js'

const MAX_LENGTH = 2000

/** Entrada del chat. Con un archivo adjunto, el texto se usa como instrucciones para clasificarlo. */
const ChatInput = forwardRef(function ChatInput({ onSend, disabled }, ref) {
  const [value, setValue] = useState('')
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState(null)
  const fileRef = useRef(null)
  const trimmed = value.trim()
  const canSend = (trimmed || file) && !disabled

  function submit(e) {
    e.preventDefault()
    if (!canSend) return
    onSend(trimmed, file)
    setValue('')
    setFile(null)
  }

  function pick(picked) {
    setFileError(null)
    if (!picked) return
    // Comprobación de UX: el servidor valida además magic bytes, extensiones y contenido.
    if (!ALLOWED_UPLOAD_TYPES.includes(picked.type)) setFileError('Solo PDF, PNG, JPEG o WEBP.')
    else if (picked.size > MAX_UPLOAD_BYTES) setFileError('Máximo 10 MB.')
    else setFile(picked)
  }

  return (
    <form onSubmit={submit} className="border-t border-white/10 bg-white/[0.035] p-3">
      {(file || fileError) && (
        <div className="mb-2 flex items-center gap-2 text-xs">
          {file ? (
            <>
              <span className="min-w-0 truncate rounded-lg bg-secondary-500/10 px-2 py-1 font-medium text-secondary-200 ring-1 ring-inset ring-secondary-400/30">{file.name}</span>
              <button type="button" onClick={() => setFile(null)} className="font-semibold text-slate-400 hover:text-slate-100">Quitar</button>
            </>
          ) : (
            <span role="alert" className="font-medium text-accent-300">{fileError}</span>
          )}
        </div>
      )}
      <div className="flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={disabled}
          aria-label="Adjuntar documento para archivarlo"
          title="Adjuntar factura, albarán o análisis"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-secondary-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400 disabled:opacity-50"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="m15 7-6.5 6.5a2.1 2.1 0 0 0 3 3L18 10a4 4 0 0 0-5.7-5.7l-6.5 6.6a6 6 0 0 0 8.5 8.5L20 13" />
          </svg>
        </button>
        <input
          ref={fileRef}
          type="file"
          accept={ALLOWED_UPLOAD_TYPES.join(',')}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            pick(e.target.files?.[0])
            e.target.value = ''
          }}
        />
        <label htmlFor="agent-input" className="sr-only">Escribe un mensaje</label>
        <textarea
          ref={ref}
          id="agent-input"
          rows={1}
          value={value}
          maxLength={MAX_LENGTH}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) submit(e)
          }}
          placeholder={file ? 'Instrucciones: p. ej. factura de diésel, campaña tomate 2026' : 'Escribe a Agropelink AI…'}
          className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-xl border border-white/15 px-3 py-2 text-sm focus:border-secondary-500 focus:outline-none focus:ring-2 focus:ring-secondary-400/30"
        />
        <button
          type="submit"
          disabled={!canSend}
          aria-label="Enviar mensaje"
          className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-600 text-white transition-colors hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M5 12h14M13 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </form>
  )
})

export default ChatInput
