import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { documentsApi, farmsApi } from '../api.js'
import Alert from '../components/ui/Alert.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { LoadingBlock } from '../components/ui/Spinner.jsx'
import AIDocumentProcessor from '../features/documents/AIDocumentProcessor.jsx'
import DocumentManager from '../features/documents/DocumentManager.jsx'
import RemindersPanel from '../features/documents/RemindersPanel.jsx'
import useApi from '../hooks/useApi.js'

const TABS = [
  { id: 'archivo', label: 'Archivo y subida' },
  { id: 'ia', label: 'Procesador IA' },
]

export default function DocumentsPage() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'ia' ? 'ia' : 'archivo'
  const farms = useApi((signal) => farmsApi.list({ limit: 100 }, { signal }))
  const facets = useApi((signal) => documentsApi.facets({ signal }))
  const [version, setVersion] = useState(0) // remonta el archivo tras archivar desde el procesador
  const [tableNotes, setTableNotes] = useState(0) // notas cambiadas en la tabla → recargar recordatorios
  const [panelNotes, setPanelNotes] = useState(0) // recordatorio hecho en el panel → recargar la tabla
  const farmList = farms.data ?? []

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Documentos" title="Archivo documental" subtitle="Facturas, albaranes, análisis y certificados organizados por granja, año y cosecha, con código de serie único." />

      <div role="tablist" aria-label="Secciones de documentos" className="mb-6 inline-flex gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/10">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            onClick={() => setParams(t.id === 'archivo' ? {} : { tab: t.id }, { replace: true })}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors duration-300 ${tab === t.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {farms.loading ? (
        <LoadingBlock label="Cargando fincas…" />
      ) : farms.error ? (
        <Alert variant="error" onRetry={farms.reload}>{farms.error}</Alert>
      ) : farmList.length === 0 ? (
        <Alert variant="info">
          Primero crea una granja con el <Link to="/farms/nueva" className="font-semibold underline">asistente de alta</Link>.
        </Alert>
      ) : tab === 'archivo' ? (
        <>
          <RemindersPanel refreshKey={tableNotes} onChanged={() => setPanelNotes((n) => n + 1)} />
          <DocumentManager key={version} farms={farmList} notesKey={panelNotes} onNotesChanged={() => setTableNotes((n) => n + 1)} />
        </>
      ) : (
        <AIDocumentProcessor farms={farmList} campaigns={facets.data?.campaigns ?? []} onFiled={() => setVersion((v) => v + 1)} />
      )}
    </div>
  )
}
