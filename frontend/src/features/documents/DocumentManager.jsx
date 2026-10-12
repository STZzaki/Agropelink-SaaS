import { useCallback, useEffect, useMemo, useState } from 'react'
import { ALLOWED_UPLOAD_TYPES, MAX_UPLOAD_BYTES, documentsApi, getErrorMessage } from '../../api.js'
import { DOCUMENT_FILED_EVENT } from '../../components/agent/AgentChat.jsx'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import Card from '../../components/ui/Card.jsx'
import FormField, { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import Spinner, { LoadingBlock } from '../../components/ui/Spinner.jsx'
import useApi from '../../hooks/useApi.js'
import FarmSelect from '../farms/FarmSelect.jsx'
import DocumentTable from './DocumentTable.jsx'
import Dropzone from './Dropzone.jsx'
import UploadItem from './UploadItem.jsx'
import { CURRENT_YEAR, DOC_STATUSES, DOC_TYPES } from './documentMeta.js'
import { Folder, FolderOpen, FolderTree as FolderTreeIcon, Sprout } from 'lucide-react'

let nextUploadId = 0
const PAGE_SIZE = 25

function precheck(file) {
  if (!ALLOWED_UPLOAD_TYPES.includes(file.type)) return 'Tipo no permitido. Usa PDF, PNG, JPEG o WEBP.'
  if (file.size > MAX_UPLOAD_BYTES) return `Supera el máximo de ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`
  return null
}

/** Carpetas Finca → Año → Cosecha construidas a partir de /documents/folders. */
function buildTree(folders) {
  const farms = new Map()
  for (const f of folders) {
    if (!farms.has(f.farm_id)) farms.set(f.farm_id, { id: f.farm_id, name: f.farm_name, count: 0, years: new Map() })
    const farm = farms.get(f.farm_id)
    farm.count += f.count
    const yearKey = f.year ?? 'sin-año'
    if (!farm.years.has(yearKey)) farm.years.set(yearKey, { year: f.year, count: 0, campaigns: [] })
    const year = farm.years.get(yearKey)
    year.count += f.count
    year.campaigns.push({ campaign: f.campaign, count: f.count })
  }
  return [...farms.values()].map((farm) => ({ ...farm, years: [...farm.years.values()] }))
}

function FolderButton({ active, depth, icon: Icon, label, count, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'true' : undefined}
      className={`flex w-full items-center gap-2 rounded-lg py-1.5 pr-2 text-left text-sm transition-colors duration-300 ${active ? 'bg-secondary-500/15 text-white' : 'text-slate-300 hover:bg-white/[0.05] hover:text-white'}`}
      style={{ paddingLeft: `${0.5 + depth * 1}rem` }}
    >
      <Icon className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" strokeWidth={1.75} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      <span className="text-xs tabular-nums text-slate-500">{count}</span>
    </button>
  )
}

function FolderTree({ tree, selection, onSelect, total }) {
  const isActive = (s) => JSON.stringify(s) === JSON.stringify(selection)
  return (
    <nav aria-label="Carpetas del archivo" className="space-y-0.5">
      <FolderButton active={isActive({})} depth={0} icon={FolderTreeIcon} label="Todo el archivo" count={total} onClick={() => onSelect({})} />
      {tree.map((farm) => (
        <div key={farm.id}>
          <FolderButton active={isActive({ farm_id: farm.id })} depth={0} icon={Sprout} label={farm.name} count={farm.count} onClick={() => onSelect({ farm_id: farm.id })} />
          {farm.years.map((y) => (
            <div key={y.year ?? 'na'}>
              <FolderButton active={isActive({ farm_id: farm.id, year: y.year })} depth={1} icon={Folder} label={y.year ?? 'Sin año'} count={y.count} onClick={() => onSelect({ farm_id: farm.id, year: y.year })} />
              {y.campaigns.map((c) => (
                <FolderButton
                  key={c.campaign ?? 'none'}
                  active={isActive({ farm_id: farm.id, year: y.year, campaign: c.campaign })}
                  depth={2}
                  icon={FolderOpen}
                  label={c.campaign ?? 'Sin cosecha'}
                  count={c.count}
                  onClick={() => onSelect({ farm_id: farm.id, year: y.year, campaign: c.campaign })}
                />
              ))}
            </div>
          ))}
        </div>
      ))}
    </nav>
  )
}

const EMPTY_META = { farm_id: '', campaign: '', fiscal_year: String(CURRENT_YEAR), doc_type: '', status: 'pending', accrual_date: '', amount: '' }

function metaErrors(m) {
  const e = {}
  if (!m.farm_id) e.farm_id = 'Obligatorio.'
  if (m.campaign.trim().length < 2) e.campaign = 'Indica la cosecha (p. ej. Tomate 2026).'
  const y = Number(m.fiscal_year)
  if (!Number.isInteger(y) || y < 2000 || y > 2100) e.fiscal_year = 'Año no válido.'
  if (!m.doc_type) e.doc_type = 'Obligatorio.'
  if (String(m.amount).trim() !== '') {
    const a = Number(String(m.amount).replace(/\s/g, '').replace(',', '.'))
    if (!Number.isFinite(a) || a < 0) e.amount = 'Importe no válido.'
  }
  return e
}

/**
 * Gestor documental del agricultor: subida con metadatos OBLIGATORIOS (granja, cosecha, año y tipo)
 * y archivo organizado en carpetas Finca → Año → Cosecha.
 */
export default function DocumentManager({ farms, notesKey = 0, onNotesChanged }) {
  const folders = useApi((signal) => documentsApi.folders({ signal }))
  const [selection, setSelection] = useState({})
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const params = { ...selection, campaign: selection.campaign ?? undefined, year: selection.year ?? undefined, q: q.trim().length >= 2 ? q.trim() : undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE }
  const docs = useApi((signal) => documentsApi.list(params, { signal }), [JSON.stringify(params)])

  const [meta, setMeta] = useState({ ...EMPTY_META, farm_id: farms.length === 1 ? String(farms[0].id) : '' })
  const [touched, setTouched] = useState(false)
  const [uploads, setUploads] = useState([])
  const errors = metaErrors(meta)
  const metaReady = Object.keys(errors).length === 0

  const tree = useMemo(() => buildTree(folders.data ?? []), [folders.data])
  const total = tree.reduce((n, f) => n + f.count, 0)
  const campaigns = useMemo(() => [...new Set((folders.data ?? []).map((f) => f.campaign).filter(Boolean))], [folders.data])

  const { reload: reloadDocs } = docs
  const { reload: reloadFolders } = folders
  const refresh = useCallback(() => {
    reloadDocs()
    reloadFolders()
  }, [reloadDocs, reloadFolders])
  // Un recordatorio marcado como hecho fuera de la tabla actualiza el resumen de notas de cada fila.
  useEffect(() => {
    if (notesKey) reloadDocs()
  }, [notesKey, reloadDocs])
  useEffect(() => {
    window.addEventListener(DOCUMENT_FILED_EVENT, refresh)
    return () => window.removeEventListener(DOCUMENT_FILED_EVENT, refresh)
  }, [refresh])

  const setField = (field) => (e) => setMeta((m) => ({ ...m, [field]: e.target.value }))
  const patch = (id, changes) => setUploads((list) => list.map((u) => (u.id === id ? { ...u, ...changes } : u)))

  function handleFiles(files) {
    setTouched(true)
    if (!metaReady) return
    const payload = {
      farm_id: Number(meta.farm_id),
      campaign: meta.campaign.trim(),
      fiscal_year: Number(meta.fiscal_year),
      doc_type: meta.doc_type,
      status: meta.status,
      accrual_date: meta.accrual_date || null,
      amount: String(meta.amount).trim() === '' ? null : Number(String(meta.amount).replace(/\s/g, '').replace(',', '.')),
    }
    const farmName = farms.find((f) => f.id === payload.farm_id)?.name
    for (const file of files) {
      const id = ++nextUploadId
      const error = precheck(file)
      setUploads((list) => [{ id, name: file.name, size: file.size, farmName: `${farmName} · ${payload.campaign}`, state: error ? 'error' : 'uploading', progress: 0, error }, ...list])
      if (error) continue
      documentsApi
        .upload(file, payload, (progress) => patch(id, { progress }))
        .then(() => {
          patch(id, { state: 'done', progress: 100 })
          refresh()
        })
        .catch((err) => patch(id, { state: 'error', error: getErrorMessage(err) }))
    }
  }

  const show = (name) => (touched || meta[name]) && errors[name]
  const aria = (name) => ({ 'aria-invalid': show(name) ? true : undefined, 'aria-describedby': show(name) ? `dm-${name}-error` : undefined })

  return (
    <div className="space-y-6">
      <Card title="Subir documentos">
        <p className="-mt-2 mb-4 text-sm text-slate-400">Indica primero a qué granja, cosecha, año y tipo pertenecen: se archivarán en su carpeta con un código de serie único.</p>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <FormField id="dm-farm_id" label="Granja *" error={show('farm_id')}>
            <FarmSelect id="dm-farm_id" farms={farms} value={meta.farm_id} onChange={(v) => setMeta((m) => ({ ...m, farm_id: v }))} invalid={!!show('farm_id')} />
          </FormField>
          <FormField id="dm-campaign" label="Cosecha / campaña *" error={show('campaign')}>
            <input id="dm-campaign" list="dm-campaigns" maxLength={80} value={meta.campaign} onChange={setField('campaign')} className={inputClass} placeholder="Tomate 2026" {...aria('campaign')} />
            <datalist id="dm-campaigns">{campaigns.map((c) => <option key={c} value={c} />)}</datalist>
          </FormField>
          <FormField id="dm-fiscal_year" label="Año *" error={show('fiscal_year')}>
            <input id="dm-fiscal_year" type="number" min={2000} max={2100} value={meta.fiscal_year} onChange={setField('fiscal_year')} className={inputClass} {...aria('fiscal_year')} />
          </FormField>
          <FormField id="dm-doc_type" label="Tipo de documento *" error={show('doc_type')}>
            <select id="dm-doc_type" value={meta.doc_type} onChange={setField('doc_type')} className={inputClass} {...aria('doc_type')}>
              <option className={optionClass} value="">Elige el tipo…</option>
              {DOC_TYPES.map((t) => <option className={optionClass} key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </FormField>
        </div>
        <details className="mt-4 rounded-xl bg-white/[0.02] px-4 py-2 ring-1 ring-inset ring-white/[0.06]">
          <summary className="cursor-pointer py-1 text-sm font-medium text-slate-300">Más datos (opcional): estado, fecha de devengo e importe</summary>
          <div className="grid grid-cols-1 gap-4 py-3 sm:grid-cols-3">
            <FormField id="dm-status" label="Estado">
              <select id="dm-status" value={meta.status} onChange={setField('status')} className={inputClass}>
                {DOC_STATUSES.map((s) => <option className={optionClass} key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </FormField>
            <FormField id="dm-accrual" label="Fecha de devengo">
              <input id="dm-accrual" type="date" value={meta.accrual_date} onChange={setField('accrual_date')} className={inputClass} />
            </FormField>
            <FormField id="dm-amount" label="Importe (€)" error={show('amount')}>
              <input id="dm-amount" inputMode="decimal" value={meta.amount} onChange={setField('amount')} className={inputClass} placeholder="450,00" {...aria('amount')} />
            </FormField>
          </div>
        </details>
        <div className="mt-4">
          <Dropzone onFiles={handleFiles} disabled={!metaReady} />
          {!metaReady && <p className="mt-2 text-xs text-slate-500">Completa los campos marcados con * para habilitar la subida.</p>}
        </div>
        {uploads.length > 0 && <ul className="mt-4 divide-y divide-white/[0.06]">{uploads.map((u) => <UploadItem key={u.id} upload={u} />)}</ul>}
      </Card>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <Card title="Carpetas" className="lg:self-start">
          {folders.loading && !folders.data ? <LoadingBlock /> : folders.error ? <Alert variant="error" onRetry={folders.reload}>{folders.error}</Alert> : (
            <FolderTree tree={tree} total={total} selection={selection} onSelect={(s) => { setSelection(s); setPage(0) }} />
          )}
        </Card>

        <Card
          title={selection.campaign ?? (selection.year ? `Año ${selection.year}` : selection.farm_id ? tree.find((f) => f.id === selection.farm_id)?.name : 'Todo el archivo')}
          actions={
            <div className="flex w-full items-center gap-3 sm:w-auto">
              {docs.loading && docs.data && <Spinner size="sm" />}
              <label htmlFor="dm-q" className="sr-only">Buscar por código, nombre o proveedor</label>
              <input id="dm-q" type="search" maxLength={60} value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} className={`${inputClass} sm:!w-56`} placeholder="AGRO-2026-FCT-0042…" />
            </div>
          }
        >
          {docs.error ? <Alert variant="error" onRetry={docs.reload}>{docs.error}</Alert> : !docs.data ? <LoadingBlock /> : (
            <DocumentTable documents={docs.data.items} farms={farms} filtered={Object.keys(selection).length > 0 || q.trim().length > 1} onChanged={() => { refresh(); onNotesChanged?.() }} />
          )}
          {docs.data && docs.data.total > PAGE_SIZE && (
            <div className="mt-4 flex items-center justify-between text-sm text-slate-400">
              <span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, docs.data.total)} de {docs.data.total}</span>
              <div className="flex gap-2">
                <Button variant="outline" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Anterior</Button>
                <Button variant="outline" disabled={(page + 1) * PAGE_SIZE >= docs.data.total} onClick={() => setPage((p) => p + 1)}>Siguiente</Button>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
