import { AnimatePresence, m } from 'framer-motion'
import { useState } from 'react'
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, documentsApi, getErrorMessage } from '../../api.js'
import Card from '../../components/ui/Card.jsx'
import { inputClass } from '../../components/ui/FormField.jsx'
import DraftReviewCard from './DraftReviewCard.jsx'
import Dropzone from './Dropzone.jsx'
import { docTypeLabel, formatAmount, formatDay } from './documentMeta.js'

let nextId = 0

function ExtractedFields({ proposal }) {
  const rows = [
    ['Tipo', docTypeLabel(proposal.doc_type)],
    ['Proveedor', proposal.vendor ?? '—'],
    ['Importe', formatAmount(proposal.amount)],
    ['Fecha', formatDay(proposal.accrual_date)],
    ['Campaña', proposal.campaign ?? '—'],
  ]
  return (
    <dl className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs sm:grid-cols-5">
      {rows.map(([k, v]) => (
        <div key={k}><dt className="text-slate-500">{k}</dt><dd className="truncate font-medium text-slate-200">{v}</dd></div>
      ))}
    </dl>
  )
}

/**
 * Bandeja del agente documental: recibe facturas y documentos, extrae sus datos y los pre-clasifica.
 * Cada archivo queda como BORRADOR privado hasta que el agricultor revisa y aprueba (Human-in-the-Loop).
 * Por defecto la extracción es local en nuestro servidor (texto del PDF + reglas): no se envía a terceros.
 */
export default function AIDocumentProcessor({ farms, campaigns = [], onFiled }) {
  const [instructions, setInstructions] = useState('')
  const [items, setItems] = useState([]) // { id, name, state: analyzing|review|done|discarded|error, draft?, error?, reference? }

  const patch = (id, changes) => setItems((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)))

  function handleFiles(files) {
    for (const file of files) {
      const id = ++nextId
      const invalid = !ALLOWED_UPLOAD_TYPES.includes(file.type) ? 'Tipo no permitido.' : file.size > MAX_UPLOAD_BYTES ? 'Supera 10 MB.' : null
      setItems((list) => [{ id, name: file.name, state: invalid ? 'error' : 'analyzing', error: invalid }, ...list])
      if (invalid) continue
      documentsApi
        .analyze(file, instructions.trim())
        .then((draft) => patch(id, { state: 'review', draft }))
        .catch((err) => patch(id, { state: 'error', error: getErrorMessage(err) }))
    }
  }

  const pending = items.filter((i) => i.state === 'analyzing' || i.state === 'review').length
  // El servidor decide el motor (local por defecto; Gemini solo si se activa DOCUMENT_AI_USE_GEMINI).
  const usedGemini = items.some((i) => i.draft?.engine === 'gemini')

  return (
    <Card title="Procesador de documentos con IA">
      <div className="-mt-2 mb-5 flex flex-wrap items-center gap-2 text-sm text-slate-400">
        <span>Suelta facturas, albaranes o análisis: el agente extrae proveedor, importe, fecha, tipo y campaña, y te pide confirmación.</span>
        {usedGemini ? (
          <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-[11px] font-semibold text-accent-200 ring-1 ring-inset ring-accent-400/30">Analizado con Gemini (Google)</span>
        ) : (
          <span className="rounded-full bg-primary-500/10 px-2 py-0.5 text-[11px] font-semibold text-primary-200 ring-1 ring-inset ring-primary-400/30">Extracción local en nuestro servidor · sin terceros</span>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <Dropzone onFiles={handleFiles} disabled={farms.length === 0} />
        <div>
          <label htmlFor="ai-instructions" className="mb-1.5 block text-sm font-medium text-slate-300">Indicaciones para el agente <span className="font-normal text-slate-500">(opcional)</span></label>
          <textarea id="ai-instructions" rows={5} maxLength={2000} value={instructions} onChange={(e) => setInstructions(e.target.value)} className={`${inputClass} resize-y`} placeholder="Ej. Facturas de diésel de la campaña de tomate 2026, ya pagadas" />
          <p className="mt-1 text-xs text-slate-500">Lo que indiques aquí tiene prioridad sobre lo que se lea del documento.</p>
        </div>
      </div>
      {farms.length === 0 && <p className="mt-3 text-sm text-accent-300">Crea primero una granja para poder archivar documentos.</p>}

      {items.length > 0 && (
        <section aria-label="Bandeja del agente" className="mt-6">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">Bandeja {pending > 0 && <span className="ml-1 rounded-full bg-accent-600 px-1.5 py-0.5 text-[11px] font-bold text-white">{pending}</span>}</h3>
          <ul className="space-y-3">
            <AnimatePresence initial={false}>
              {items.map((it) => (
                <m.li key={it.id} layout initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.24, ease: [0.2, 0, 0, 1] }} className="rounded-xl bg-white/[0.02] p-3 ring-1 ring-inset ring-white/[0.06]">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="min-w-0 truncate text-sm font-medium text-slate-100" title={it.name}>{it.name}</p>
                    <span className="shrink-0 text-xs text-slate-400">
                      {it.state === 'analyzing' && <span className="inline-flex items-center gap-2"><span className="h-3 w-3 animate-spin rounded-full border-2 border-white/10 border-t-secondary-400" aria-hidden="true" />Extrayendo datos…</span>}
                      {it.state === 'done' && <span className="font-semibold text-primary-300">Archivado · <span className="font-mono">{it.reference}</span></span>}
                      {it.state === 'discarded' && 'Descartado'}
                      {it.state === 'error' && <span className="text-accent-300">{it.error}</span>}
                    </span>
                  </div>
                  {it.state === 'analyzing' && <div className="skeleton h-10 rounded-lg" aria-hidden="true" />}
                  {it.state === 'review' && (
                    <div className="space-y-3">
                      <ExtractedFields proposal={it.draft.proposal} />
                      <DraftReviewCard
                        draft={it.draft}
                        farms={farms}
                        campaigns={campaigns}
                        onConfirmed={(doc) => {
                          patch(it.id, { state: 'done', reference: doc.reference })
                          onFiled?.(doc)
                        }}
                        onDiscarded={() => patch(it.id, { state: 'discarded' })}
                      />
                    </div>
                  )}
                </m.li>
              ))}
            </AnimatePresence>
          </ul>
        </section>
      )}
    </Card>
  )
}
