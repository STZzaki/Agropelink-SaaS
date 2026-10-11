import { useState } from 'react'
import { adminApi, getErrorMessage } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import Card from '../../components/ui/Card.jsx'
import { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import { LoadingBlock } from '../../components/ui/Spinner.jsx'
import useApi from '../../hooks/useApi.js'

const FILTERS = [
  { id: 'pending', label: 'Pendientes' },
  { id: 'approved', label: 'Aprobadas' },
  { id: 'rejected', label: 'Rechazadas' },
]
const STATUS_LABEL = { pending: 'Pendiente', approved: 'Aprobada', rejected: 'Rechazada' }
const STATUS_TONE = {
  pending: 'bg-accent-500/10 text-accent-200 ring-accent-400/30',
  approved: 'bg-primary-500/10 text-primary-200 ring-primary-400/30',
  rejected: 'bg-white/[0.06] text-slate-300 ring-white/10',
}

function Application({ app, onDone }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function review(kind) {
    setBusy(kind)
    setError(null)
    try {
      const payload = { note: note.trim() || null }
      await (kind === 'approve' ? adminApi.approve(app.id, payload) : adminApi.reject(app.id, payload))
      onDone()
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy(null)
    }
  }

  return (
    <li className="py-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-100">{app.farm_name} <span className="font-normal text-slate-400">· {app.location}</span></p>
          <p className="text-sm text-slate-300">{app.user_name} · <a href={`mailto:${app.user_email}`} className="text-secondary-300 underline-offset-2 hover:underline">{app.user_email}</a> · {app.phone}</p>
          <p className="mt-1 text-sm text-slate-300">Cultivos: {app.crops}{app.surface_ha ? ` · ${app.surface_ha} ha` : ''}</p>
          {app.message && <p className="mt-2 whitespace-pre-wrap rounded-lg bg-white/[0.03] px-3 py-2 text-sm text-slate-200">{app.message}</p>}
          <p className="mt-1 text-xs text-slate-400">Recibida el {new Date(app.created_at).toLocaleString('es-ES')}</p>
        </div>
        <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_TONE[app.status]}`}>{STATUS_LABEL[app.status]}</span>
      </div>
      {app.status === 'pending' ? (
        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor={`note-${app.id}`} className="sr-only">Nota para el solicitante</label>
          <input id={`note-${app.id}`} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} sm:flex-1`} placeholder="Nota opcional (se muestra al solicitante si se rechaza)" />
          <div className="flex gap-2">
            <Button loading={busy === 'approve'} disabled={busy !== null} onClick={() => review('approve')}>Aprobar como agricultor</Button>
            <Button variant="outline" loading={busy === 'reject'} disabled={busy !== null} onClick={() => review('reject')}>Rechazar</Button>
          </div>
        </div>
      ) : (
        app.review_note && <p className="mt-2 text-sm text-slate-400">Nota: {app.review_note}</p>
      )}
      {error && <p role="alert" className="mt-2 text-sm font-medium text-accent-300">{error}</p>}
    </li>
  )
}

export default function ApplicationsPanel({ onChanged }) {
  const [status, setStatus] = useState('pending')
  const list = useApi((signal) => adminApi.applications({ status }, { signal }), [status])

  return (
    <Card
      title="Solicitudes de alta como agricultor"
      actions={
        <select aria-label="Filtrar solicitudes" value={status} onChange={(e) => setStatus(e.target.value)} className={`${inputClass} !w-auto`}>
          {FILTERS.map((f) => <option className={optionClass} key={f.id} value={f.id}>{f.label}</option>)}
        </select>
      }
    >
      <p className="text-sm text-slate-400">Al aprobar, la cuenta recibe el rol <strong>agricultor</strong> al instante y se crea su primera finca con los datos de la solicitud.</p>
      {list.loading ? (
        <LoadingBlock />
      ) : list.error ? (
        <Alert variant="error" onRetry={list.reload}>{list.error}</Alert>
      ) : list.data.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No hay solicitudes en este estado.</p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {list.data.map((app) => (
            <Application key={app.id} app={app} onDone={() => { list.reload(); onChanged() }} />
          ))}
        </ul>
      )}
    </Card>
  )
}
