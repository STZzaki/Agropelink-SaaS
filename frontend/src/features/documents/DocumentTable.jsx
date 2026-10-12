import { BellRing, StickyNote } from 'lucide-react'
import { Fragment, useState } from 'react'
import { documentsApi, getErrorMessage } from '../../api.js'
import { optionClass } from '../../components/ui/FormField.jsx'
import DocumentNotes from './DocumentNotes.jsx'
import { DOC_STATUSES, docStatus, docTypeLabel, formatAmount, formatDay } from './documentMeta.js'

const COLUMNS = 7
const todayISO = () => {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function Row({ doc, farmName, onChanged, onError }) {
  const [busy, setBusy] = useState(null) // download | delete | status
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [notesOpen, setNotesOpen] = useState(false)
  const overdue = doc.next_reminder && doc.next_reminder < todayISO()
  const status = docStatus(doc.status)

  async function run(kind, action) {
    setBusy(kind)
    onError(null)
    try {
      await action()
      if (kind !== 'download') onChanged()
    } catch (err) {
      onError(getErrorMessage(err))
    } finally {
      setBusy(null)
      setConfirmDelete(false)
    }
  }

  return (
    <Fragment>
    <tr className="grid grid-cols-2 gap-x-3 gap-y-2 rounded-xl bg-white/[0.03] p-3 ring-1 ring-inset ring-white/[0.06] md:table-row md:rounded-none md:bg-transparent md:p-0 md:align-top md:ring-0">
      <td className="col-span-2 whitespace-nowrap font-mono text-xs font-semibold text-white md:py-3 md:pr-4">{doc.reference}</td>
      <td className="col-span-2 min-w-0 md:max-w-[14rem] md:py-3 md:pr-4">
        <p className="truncate font-medium text-slate-100" title={doc.filename}>{doc.filename}</p>
        <p className="text-xs text-slate-400">{docTypeLabel(doc.doc_type)}{doc.vendor ? ` · ${doc.vendor}` : ''}</p>
        <button
          type="button"
          onClick={() => setNotesOpen((v) => !v)}
          aria-expanded={notesOpen}
          aria-controls={`notes-${doc.id}`}
          className={`mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset transition-colors duration-200 ${
            notesOpen ? 'bg-secondary-500/15 text-secondary-100 ring-secondary-400/30' : 'text-slate-400 ring-white/10 hover:bg-white/5 hover:text-slate-200'
          }`}
        >
          <StickyNote className="h-3 w-3" aria-hidden="true" />
          {doc.note_count ? `${doc.note_count} ${doc.note_count === 1 ? 'nota' : 'notas'}` : 'Añadir nota'}
          {doc.next_reminder && (
            <span className={`inline-flex items-center gap-0.5 ${overdue ? 'text-accent-200' : 'text-secondary-200'}`}>
              · <BellRing className="h-3 w-3" aria-hidden="true" />
              {overdue ? 'vencido ' : ''}{new Date(`${doc.next_reminder}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}
            </span>
          )}
        </button>
      </td>
      <td className="col-span-2 text-slate-300 md:py-3 md:pr-4">
        <p>{doc.campaign ?? '—'}</p>
        <p className="text-xs text-slate-400">{farmName ?? '—'} · {doc.fiscal_year ?? '—'}</p>
      </td>
      <td className="whitespace-nowrap text-slate-300 md:py-3 md:pr-4"><span className="block text-[11px] text-slate-500 md:hidden">Devengo</span>{formatDay(doc.accrual_date)}</td>
      <td className="whitespace-nowrap text-right tabular-nums text-slate-100 md:py-3 md:pr-4"><span className="block text-[11px] text-slate-500 md:hidden">Importe</span>{formatAmount(doc.amount)}</td>
      <td className="self-center md:py-3 md:pr-4">
        <label className="sr-only" htmlFor={`st-${doc.id}`}>Estado de {doc.reference}</label>
        <select
          id={`st-${doc.id}`}
          value={doc.status}
          disabled={busy !== null}
          onChange={(e) => run('status', () => documentsApi.update(doc.id, { status: e.target.value }))}
          className={`cursor-pointer rounded-full border-0 [color-scheme:dark] py-0.5 pl-2.5 pr-7 text-xs font-semibold ring-1 ring-inset focus:ring-2 focus:ring-secondary-400 ${status.tone}`}
        >
          {DOC_STATUSES.map((s) => <option className={optionClass} key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </td>
      <td className="whitespace-nowrap text-right md:py-3">
        {confirmDelete ? (
          <span className="inline-flex items-center gap-2 text-xs">
            <span className="text-slate-300">¿Eliminar?</span>
            <button type="button" onClick={() => run('delete', () => documentsApi.remove(doc.id))} disabled={busy !== null} className="font-semibold text-accent-300 hover:underline">Sí</button>
            <button type="button" onClick={() => setConfirmDelete(false)} className="font-semibold text-slate-300 hover:underline">No</button>
          </span>
        ) : (
          <span className="inline-flex gap-1">
            <button
              type="button"
              onClick={() => run('download', () => documentsApi.download(doc))}
              disabled={busy !== null}
              aria-label={`Descargar ${doc.reference}`}
              className="rounded-lg p-2 text-secondary-300 hover:bg-secondary-500/10 disabled:opacity-50"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M12 4v12m0 0 4-4m-4 4-4-4M4 20h16" /></svg>
            </button>
            <button type="button" onClick={() => setConfirmDelete(true)} disabled={busy !== null} aria-label={`Eliminar ${doc.reference}`} className="rounded-lg p-2 text-slate-400 hover:bg-accent-500/10 hover:text-accent-300 disabled:opacity-50">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M6 7h12M9 7V4h6v3m-8 0 1 13h8l1-13" /></svg>
            </button>
          </span>
        )}
      </td>
    </tr>
    {notesOpen && (
      <tr id={`notes-${doc.id}`} className="block md:table-row">
        <td colSpan={COLUMNS} className="block pb-4 pt-2 md:table-cell md:pt-0">
          <DocumentNotes document={doc} onChanged={onChanged} />
        </td>
      </tr>
    )}
    </Fragment>
  )
}

export default function DocumentTable({ documents, farms, filtered, onChanged }) {
  const [error, setError] = useState(null)
  const farmName = (id) => farms.find((f) => f.id === id)?.name

  if (documents.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/15 px-6 py-10 text-center text-sm text-slate-400">
        {filtered ? 'Ningún documento coincide con los filtros.' : 'Tu archivo está vacío. Sube tu primera factura o albarán.'}
      </div>
    )
  }

  return (
    <>
      {error && <p role="alert" className="mb-3 text-sm font-medium text-accent-300">{error}</p>}
      <div className="relative md:-mx-6 md:overflow-x-auto md:px-6">
        <table className="block w-full text-left text-sm md:table md:min-w-[56rem]">
          <thead className="hidden border-b border-white/10 text-xs uppercase tracking-wide text-slate-400 md:table-header-group">
            <tr>
              <th scope="col" className="py-2 pr-4 font-semibold">Código</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Documento</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Campaña · finca</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Devengo</th>
              <th scope="col" className="py-2 pr-4 text-right font-semibold">Importe</th>
              <th scope="col" className="py-2 pr-4 font-semibold">Estado</th>
              <th scope="col" className="py-2 text-right font-semibold"><span className="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody className="block space-y-3 md:table-row-group md:space-y-0 md:divide-y md:divide-white/[0.06]">
            {documents.map((doc) => (
              <Row key={doc.id} doc={doc} farmName={farmName(doc.farm_id)} onChanged={onChanged} onError={setError} />
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
