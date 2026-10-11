import { useState } from 'react'
import { Link } from 'react-router-dom'
import { adminApi, getErrorMessage } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import Card from '../../components/ui/Card.jsx'
import { inputClass } from '../../components/ui/FormField.jsx'
import { LoadingBlock } from '../../components/ui/Spinner.jsx'
import useApi from '../../hooks/useApi.js'

const REASON_LABELS = {
  spam: 'Spam',
  insults: 'Falta de respeto / Insultos',
  inappropriate: 'Contenido inapropiado',
  hate: 'Odio',
  dangerous: 'Peligroso / malicioso',
  misinformation: 'Desinformación',
  other: 'Otro',
}
const ACTION_LABELS = {
  warning: 'Aviso (mensaje bloqueado)',
  ban: 'Bloqueo',
  unban: 'Desbloqueo',
  content_removed: 'Contenido retirado',
}
const ACTION_TONE = {
  warning: 'bg-accent-500/10 text-accent-200 ring-accent-400/30',
  ban: 'bg-red-500/10 text-red-300 ring-red-400/30',
  unban: 'bg-primary-500/10 text-primary-200 ring-primary-400/30',
  content_removed: 'bg-white/[0.06] text-slate-200 ring-white/10',
}
const when = (iso) => new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' })

function Report({ report, onDone }) {
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)
  const { content } = report

  async function resolve(action) {
    setBusy(action)
    setError(null)
    try {
      await adminApi.resolveReport(report.id, { action, note: note.trim() || null })
      onDone()
    } catch (err) {
      setError(getErrorMessage(err))
      setBusy(null)
    }
  }

  return (
    <li className="py-5">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full bg-accent-500/10 px-2.5 py-0.5 font-semibold text-accent-200 ring-1 ring-inset ring-accent-400/30">{REASON_LABELS[report.reason]}</span>
        <span className="text-slate-400">Reportado por {report.reporter.name} · {when(report.created_at)}</span>
      </div>
      <p className="mt-2 text-sm text-slate-300">
        {content.kind === 'reply' ? 'Respuesta' : 'Tema'} de <strong className="text-slate-100">{content.author.name}</strong> en{' '}
        <Link to={`/foro/${content.thread_id}`} className="text-secondary-300 underline-offset-2 hover:underline">«{content.thread_title}»</Link>
      </p>
      {/* Texto plano escapado por React: el contenido denunciado nunca se interpreta. */}
      <blockquote data-lenis-prevent className="mt-2 max-h-40 overflow-y-auto whitespace-pre-wrap break-words rounded-lg bg-white/[0.03] px-3 py-2 ring-1 ring-inset ring-white/10 text-sm text-slate-200">{content.body}</blockquote>
      {report.details && <p className="mt-2 text-sm text-slate-400">Detalle: {report.details}</p>}
      <div className="mt-3 flex flex-col gap-2 lg:flex-row lg:items-center">
        <label htmlFor={`rn-${report.id}`} className="sr-only">Nota de resolución</label>
        <input id={`rn-${report.id}`} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} className={`${inputClass} lg:flex-1`} placeholder="Nota de resolución (opcional)" />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" loading={busy === 'dismiss'} disabled={busy !== null} onClick={() => resolve('dismiss')}>Descartar</Button>
          <Button variant="secondary" loading={busy === 'remove'} disabled={busy !== null} onClick={() => resolve('remove')}>Retirar contenido</Button>
          <Button variant="danger" loading={busy === 'remove_and_ban'} disabled={busy !== null} onClick={() => resolve('remove_and_ban')}>Retirar y bloquear autor</Button>
        </div>
      </div>
      {error && <p role="alert" className="mt-2 text-sm font-medium text-accent-300">{error}</p>}
    </li>
  )
}

function RemovedList() {
  const removed = useApi((signal) => adminApi.removed({ signal }))
  const [error, setError] = useState(null)

  async function restore(item) {
    setError(null)
    try {
      await adminApi.restore(item.kind === 'thread' ? 'threads' : 'replies', item.id)
      removed.reload()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  if (removed.loading) return <LoadingBlock />
  if (removed.error) return <Alert variant="error" onRetry={removed.reload}>{removed.error}</Alert>
  if (!removed.data.length) return <p className="py-6 text-center text-sm text-slate-400">No hay publicaciones retiradas.</p>
  return (
    <>
      {error && <p role="alert" className="mb-2 text-sm font-medium text-accent-300">{error}</p>}
      <ul className="divide-y divide-white/[0.06]">
        {removed.data.map((item) => (
          <li key={`${item.kind}-${item.id}`} className="flex flex-wrap items-start justify-between gap-3 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm text-slate-300">
                {item.kind === 'reply' ? 'Respuesta' : 'Tema'} de <strong className="text-slate-100">{item.author.name}</strong> en «{item.thread_title}» · {when(item.deleted_at)}
              </p>
              <p className="mt-1 line-clamp-2 break-words text-sm text-slate-400">{item.body}</p>
              {item.deleted_reason && <p className="mt-1 text-xs text-slate-400">Motivo: {item.deleted_reason}</p>}
            </div>
            <Button variant="outline" onClick={() => restore(item)}>Restaurar</Button>
          </li>
        ))}
      </ul>
    </>
  )
}

function EventLog() {
  const events = useApi((signal) => adminApi.events({ signal }))
  if (events.loading) return <LoadingBlock />
  if (events.error) return <Alert variant="error" onRetry={events.reload}>{events.error}</Alert>
  if (!events.data.length) return <p className="py-6 text-center text-sm text-slate-400">Sin actividad de moderación.</p>
  return (
    <ul className="divide-y divide-white/[0.06]">
      {events.data.map((e) => (
        <li key={e.id} className="py-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${ACTION_TONE[e.action]}`}>{ACTION_LABELS[e.action]}</span>
            <strong className="text-slate-100">{e.user.name}</strong>
            <span className="text-xs text-slate-400">{when(e.created_at)} · {e.automatic ? 'Auto-Mod' : 'Manual'}</span>
          </div>
          <p className="mt-1 text-slate-300">{e.reason}</p>
          {e.excerpt && <p className="mt-1 line-clamp-2 break-words text-xs text-slate-400">«{e.excerpt}»</p>}
        </li>
      ))}
    </ul>
  )
}

const VIEWS = [
  { id: 'reports', label: 'Reportes del Foro' },
  { id: 'removed', label: 'Contenido retirado' },
  { id: 'events', label: 'Bitácora Auto-Mod' },
]

export default function ModerationPanel({ onChanged }) {
  const [view, setView] = useState('reports')
  const reports = useApi((signal) => adminApi.reports({ status: 'open' }, { signal }))

  return (
    <Card
      title="Centro de moderación del foro"
      actions={
        <div className="flex gap-1 rounded-xl bg-white/[0.06] p-1 text-sm font-medium" role="group" aria-label="Vista de moderación">
          {VIEWS.map((v) => (
            <button key={v.id} type="button" aria-pressed={view === v.id} onClick={() => setView(v.id)} className={`rounded-lg px-3 py-1.5 transition-colors ${view === v.id ? 'bg-white/[0.035] text-white shadow-sm' : 'text-slate-400 hover:text-slate-100'}`}>
              {v.label}
            </button>
          ))}
        </div>
      }
    >
      {view === 'reports' &&
        (reports.loading ? (
          <LoadingBlock />
        ) : reports.error ? (
          <Alert variant="error" onRetry={reports.reload}>{reports.error}</Alert>
        ) : reports.data.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-400">No hay reportes pendientes.</p>
        ) : (
          <ul className="divide-y divide-white/[0.06]">
            {reports.data.map((r) => (
              <Report key={r.id} report={r} onDone={() => { reports.reload(); onChanged() }} />
            ))}
          </ul>
        ))}
      {view === 'removed' && <RemovedList />}
      {view === 'events' && <EventLog />}
    </Card>
  )
}
