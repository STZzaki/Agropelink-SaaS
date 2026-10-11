import { useEffect, useRef, useState } from 'react'
import { FORUM_MEDIA } from '../../api.js'
import { Check, Film, Image, UploadCloud } from 'lucide-react'

const ACCEPT = [...FORUM_MEDIA.image.types, ...FORUM_MEDIA.video.types]
const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(bytes < 1024 * 1024 ? 2 : 1)} MB`

let nextId = 0

/** Validación de UX en el navegador (el backend repite TODO: magic bytes, tamaño en stream, recodificación). */
export function checkMediaFile(file) {
  const kind = FORUM_MEDIA.image.types.includes(file.type) ? 'image' : FORUM_MEDIA.video.types.includes(file.type) ? 'video' : null
  if (!kind) return { kind: null, error: 'Formato no permitido. Usa PNG, JPEG, WEBP o MP4.' }
  const max = FORUM_MEDIA[kind].maxBytes
  if (file.size > max) return { kind, error: `Supera el máximo de ${mb(max)} para ${kind === 'image' ? 'imágenes' : 'vídeos'}.` }
  if (file.size === 0) return { kind, error: 'El archivo está vacío.' }
  return { kind, error: null }
}

/** Entrada local de la lista: { key, file, kind, error, preview, progress, uploadedId }. */
export function toEntry(file) {
  const { kind, error } = checkMediaFile(file)
  // Vista previa 100 % local (object URL): no se envía nada hasta pulsar "Subir y publicar".
  return { key: ++nextId, file, kind, error, preview: error ? null : URL.createObjectURL(file), progress: 0, uploadedId: null }
}

/**
 * Zona de arrastrar y soltar para imágenes y vídeos cortos del foro.
 * `entries` lo controla el padre; aquí solo se añaden/quitan y se muestran vistas previas y errores.
 */
export default function MediaDropzone({ entries, onAdd, onRemove, disabled }) {
  const inputRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const remaining = FORUM_MEDIA.maxFiles - entries.length

  // Liberar las vistas previas al desmontar.
  const entriesRef = useRef(entries)
  entriesRef.current = entries
  useEffect(() => () => entriesRef.current.forEach((e) => e.preview && URL.revokeObjectURL(e.preview)), [])

  function add(fileList) {
    if (disabled || !fileList?.length) return
    onAdd(Array.from(fileList).slice(0, Math.max(0, remaining)))
  }

  return (
    <div>
      <div
        onDragOver={(e) => {
          e.preventDefault()
          if (!disabled && remaining > 0) setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault()
          setDragging(false)
          add(e.dataTransfer.files)
        }}
        className={`relative flex flex-col items-center justify-center rounded-2xl border border-dashed px-6 py-8 text-center transition-[border-color,background-color,box-shadow] duration-300 ease-out ${
          remaining <= 0 || disabled
            ? 'cursor-not-allowed border-white/10 bg-white/[0.02] opacity-60'
            : dragging
              ? 'border-secondary-300/80 bg-secondary-500/10 shadow-focus-ring'
              : 'border-white/15 bg-white/[0.025] hover:border-secondary-400/50 hover:bg-white/[0.04]'
        }`}
      >
        <span className={`flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-b from-secondary-400/25 to-primary-500/10 text-secondary-200 ring-1 ring-inset ring-white/10 transition-transform duration-300 ${dragging ? 'scale-110' : ''}`} aria-hidden="true">
          <UploadCloud className="h-5 w-5" strokeWidth={1.8} />
        </span>
        <p className="mt-3 text-sm font-medium text-slate-200">{dragging ? 'Suelta para añadir' : 'Arrastra fotos o un vídeo corto'}</p>
        <p className="mt-1 text-xs text-slate-500">
          PNG, JPEG o WEBP hasta {mb(FORUM_MEDIA.image.maxBytes)} · MP4 hasta {mb(FORUM_MEDIA.video.maxBytes)} · máx. {FORUM_MEDIA.maxFiles} archivos
        </p>
        <button
          type="button"
          disabled={disabled || remaining <= 0}
          onClick={() => inputRef.current?.click()}
          className="btn-secondary mt-4 h-9 px-4 text-xs disabled:cursor-not-allowed disabled:opacity-50"
        >
          Seleccionar archivos
        </button>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT.join(',')}
          className="sr-only"
          tabIndex={-1}
          onChange={(e) => {
            add(e.target.files)
            e.target.value = ''
          }}
        />
      </div>

      {entries.length > 0 && (
        <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {entries.map((entry) => (
            <li key={entry.key} className={`pop-in relative overflow-hidden rounded-xl border ${entry.error ? 'border-accent-400/50 bg-accent-500/10' : 'border-white/10 bg-white/[0.03]'}`}>
              <div className="aspect-square w-full">
                {entry.preview && entry.kind === 'image' && <img src={entry.preview} alt="" className="h-full w-full object-cover" />}
                {entry.preview && entry.kind === 'video' && <video src={entry.preview} muted playsInline preload="metadata" className="h-full w-full object-cover" />}
                {entry.error && (
                  <p role="alert" className="flex h-full items-center p-3 text-center text-[11px] font-medium leading-snug text-accent-200">{entry.error}</p>
                )}
              </div>
              <div className="flex items-center justify-between gap-2 px-2 py-1.5 text-[11px] text-slate-400">
                <span className="flex min-w-0 items-center gap-1 truncate" title={entry.file.name}>
                  {entry.kind === 'video' ? <Film className="h-3.5 w-3.5 shrink-0" aria-label="Vídeo" /> : <Image className="h-3.5 w-3.5 shrink-0" aria-label="Imagen" />}
                  {mb(entry.file.size)}
                </span>
                <button
                  type="button"
                  onClick={() => onRemove(entry)}
                  disabled={disabled}
                  aria-label={`Quitar ${entry.file.name}`}
                  className="rounded-md px-1.5 py-0.5 text-slate-300 transition-colors duration-300 hover:bg-white/10 hover:text-white disabled:opacity-40"
                >
                  Quitar
                </button>
              </div>
              {entry.progress > 0 && entry.progress < 100 && (
                <span className="absolute inset-x-0 bottom-0 h-0.5 origin-left bg-secondary-400 transition-transform duration-200" style={{ transform: `scaleX(${entry.progress / 100})` }} aria-hidden="true" />
              )}
              {entry.uploadedId && (
                <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary-500/90 text-slate-950" role="img" aria-label="Subido">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
