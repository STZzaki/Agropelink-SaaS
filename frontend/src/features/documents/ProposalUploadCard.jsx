import { useId, useRef, useState } from 'react'
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, documentsApi, getErrorMessage } from '../../api.js'
import Button from '../../components/ui/Button.jsx'
import DocumentMetaFields from './DocumentMetaFields.jsx'
import { metaFromProposal, validateMeta } from './documentMeta.js'

/**
 * El asistente ha extraído los metadatos de unas instrucciones en lenguaje natural
 * ("Guarda esta factura de diésel de 450 €…"): falta adjuntar el archivo y aprobar.
 */
export default function ProposalUploadCard({ proposal, farms, onUploaded, onDismiss }) {
  const [values, setValues] = useState(() => metaFromProposal(proposal, farms[0]?.id))
  const [errors, setErrors] = useState({})
  const [file, setFile] = useState(null)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const inputRef = useRef(null)
  const uid = useId()

  async function save() {
    const { errors: found, payload } = validateMeta(values)
    setErrors(found)
    if (Object.keys(found).length) return
    if (!file) {
      setError('Adjunta el archivo del documento.')
      return
    }
    if (!ALLOWED_UPLOAD_TYPES.includes(file.type) || file.size > MAX_UPLOAD_BYTES) {
      setError('Usa un PDF, PNG, JPEG o WEBP de hasta 10 MB.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      onUploaded?.(await documentsApi.upload(file, payload))
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-3 overflow-hidden rounded-xl border border-accent-400/30 bg-white/[0.035] text-slate-100 shadow-sm">
      <p className="border-b border-accent-400/20 bg-accent-500/10 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-accent-200">
        Confirmación requerida · Archivar documento
      </p>
      <div className="space-y-3 p-3">
        <DocumentMetaFields idPrefix={`prop-${uid}`} values={values} onChange={setValues} errors={errors} farms={farms} disabled={saving} compact />
        <div className="flex items-center gap-2">
          <Button variant="outline" className="!px-3 !py-1.5 text-xs" onClick={() => inputRef.current?.click()} disabled={saving}>
            {file ? 'Cambiar archivo' : 'Adjuntar archivo'}
          </Button>
          <span className="min-w-0 truncate text-xs text-slate-300">{file ? file.name : 'Ningún archivo seleccionado'}</span>
          <input
            ref={inputRef}
            type="file"
            accept={ALLOWED_UPLOAD_TYPES.join(',')}
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null)
              setError(null)
              e.target.value = ''
            }}
          />
        </div>
        {error && <p role="alert" className="text-xs font-medium text-accent-300">{error}</p>}
        <div className="flex gap-2">
          <Button className="flex-1 !px-3 !py-1.5 text-xs" loading={saving} onClick={save}>Aprobar y archivar</Button>
          <Button variant="outline" className="flex-1 !px-3 !py-1.5 text-xs" disabled={saving} onClick={onDismiss}>Rechazar</Button>
        </div>
      </div>
    </div>
  )
}
