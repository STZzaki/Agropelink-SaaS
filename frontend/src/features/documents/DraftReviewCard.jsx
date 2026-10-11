import { useState } from 'react'
import { documentsApi, getErrorMessage } from '../../api.js'
import Button from '../../components/ui/Button.jsx'
import DocumentMetaFields from './DocumentMetaFields.jsx'
import { DOC_TYPES, metaFromProposal, validateMeta } from './documentMeta.js'

/**
 * Human-in-the-Loop de la clasificación con IA: el archivo ya está subido como borrador privado,
 * pero no entra en el archivo ni recibe código de serie hasta que el agricultor revisa y confirma.
 */
export default function DraftReviewCard({ draft, farms, campaigns, onConfirmed, onDiscarded, compact = false }) {
  const { document: doc, proposal, engine } = draft
  const [values, setValues] = useState(() => metaFromProposal(proposal, farms[0]?.id))
  const [errors, setErrors] = useState({})
  const [state, setState] = useState('pending') // pending | saving | discarding
  const [error, setError] = useState(null)
  const series = DOC_TYPES.find((t) => t.id === values.doc_type)?.series ?? 'OTR'

  async function confirm() {
    const { errors: found, payload } = validateMeta(values)
    setErrors(found)
    if (Object.keys(found).length) return
    setState('saving')
    setError(null)
    try {
      onConfirmed?.(await documentsApi.confirm(doc.id, payload))
    } catch (err) {
      setError(getErrorMessage(err))
      setState('pending')
    }
  }

  async function discard() {
    setState('discarding')
    try {
      await documentsApi.remove(doc.id)
      onDiscarded?.()
    } catch (err) {
      setError(getErrorMessage(err))
      setState('pending')
    }
  }

  return (
    <div className="swap-in overflow-hidden rounded-xl border border-accent-400/30 bg-white/[0.035] text-slate-100 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-accent-400/20 bg-accent-500/10 px-3 py-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-accent-200">Confirmación requerida</p>
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${engine === 'gemini' ? 'bg-secondary-500/10 text-secondary-200 ring-secondary-400/30' : 'bg-white/[0.06] text-slate-300 ring-white/10'}`}>
          {engine === 'gemini' ? 'Clasificado con Gemini' : 'Extracción local · sin terceros'}
        </span>
      </div>
      <div className="space-y-3 p-3">
        <div>
          <p className="truncate text-sm font-semibold text-white" title={doc.filename}>{doc.filename}</p>
          {proposal.summary && <p className="mt-1 text-xs leading-relaxed text-slate-300">{proposal.summary}</p>}
          <p className="mt-1 text-[11px] text-slate-400">
            Se archivará con el código <span className="font-mono font-semibold text-slate-200">AGRO-{values.fiscal_year || '····'}-{series}-····</span>
          </p>
        </div>
        <DocumentMetaFields idPrefix={`draft-${doc.id}`} values={values} onChange={setValues} errors={errors} farms={farms} campaigns={campaigns} disabled={state !== 'pending'} compact={compact} />
        {error && <p role="alert" className="text-xs font-medium text-accent-300">{error}</p>}
        <div className="flex gap-2">
          <Button className="flex-1 !px-3 !py-1.5 text-xs" loading={state === 'saving'} disabled={state !== 'pending'} onClick={confirm}>
            Aprobar y archivar
          </Button>
          <Button variant="outline" className="flex-1 !px-3 !py-1.5 text-xs" loading={state === 'discarding'} disabled={state !== 'pending'} onClick={discard}>
            Descartar
          </Button>
        </div>
      </div>
    </div>
  )
}
