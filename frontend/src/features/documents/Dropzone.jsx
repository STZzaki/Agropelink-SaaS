import { useRef, useState } from 'react'
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES } from '../../api.js'

export default function Dropzone({ onFiles, disabled }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)

  function handleFiles(fileList) {
    if (disabled || !fileList?.length) return
    onFiles(Array.from(fileList))
  }

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault()
        if (!disabled) setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragging(false)
        handleFiles(e.dataTransfer.files)
      }}
      className={`flex flex-col items-center justify-center rounded-2xl border-2 border-dashed px-6 py-12 text-center transition-colors ${
        disabled
          ? 'cursor-not-allowed border-white/10 bg-white/[0.03] opacity-60'
          : dragging
            ? 'border-primary-500 bg-primary-500/10'
            : 'border-white/15 bg-white/[0.035] hover:border-secondary-400'
      }`}
    >
      <svg className="mb-3 h-10 w-10 text-secondary-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 16V4m0 0-4 4m4-4 4 4M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
      </svg>
      <p className="text-sm font-medium text-slate-200">Arrastra aquí tus albaranes o facturas</p>
      <p className="mt-1 text-xs text-slate-400">PDF, PNG, JPEG o WEBP · máx. {MAX_UPLOAD_BYTES / 1024 / 1024} MB</p>
      <button
        type="button"
        disabled={disabled}
        onClick={() => inputRef.current?.click()}
        className="mt-4 rounded-lg bg-secondary-600 px-4 py-2 text-sm font-semibold text-white hover:bg-secondary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400 disabled:cursor-not-allowed"
      >
        Seleccionar archivos
      </button>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={ALLOWED_UPLOAD_TYPES.join(',')}
        className="sr-only"
        tabIndex={-1}
        onChange={(e) => {
          handleFiles(e.target.files)
          e.target.value = ''
        }}
      />
    </div>
  )
}
