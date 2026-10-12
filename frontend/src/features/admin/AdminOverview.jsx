import Alert from '../../components/ui/Alert.jsx'
import Card from '../../components/ui/Card.jsx'
import { LoadingBlock } from '../../components/ui/Spinner.jsx'
import { DOC_TYPES } from '../documents/documentMeta.js'

const nf = new Intl.NumberFormat('es-ES')

function Stat({ label, value, hint, onClick, tone = 'text-secondary-200' }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag
      {...(onClick ? { type: 'button', onClick } : {})}
      className={`rounded-2xl border border-white/10 bg-white/[0.035] p-5 text-left shadow-sm ${onClick ? 'transition-shadow hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400' : ''}`}
    >
      <p className="text-sm font-medium text-slate-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold tabular-nums ${tone}`}>{nf.format(value)}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </Tag>
  )
}

function Bars({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.value))
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[minmax(0,10rem)_1fr_3rem] items-center gap-3 text-sm">
          <span className="truncate text-slate-300">{r.label}</span>
          <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <span className="block h-full origin-left rounded-full bg-secondary-500" style={{ transform: `scaleX(${r.value / max})` }} />
          </span>
          <span className="text-right tabular-nums text-slate-100">{nf.format(r.value)}</span>
        </li>
      ))}
    </ul>
  )
}

export default function AdminOverview({ metrics, onNavigate }) {
  if (metrics.loading && !metrics.data) return <LoadingBlock label="Calculando métricas…" />
  if (metrics.error) return <Alert variant="error" onRetry={metrics.reload}>{metrics.error}</Alert>
  const m = metrics.data

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Usuarios activos" value={m.active_users} hint={`${nf.format(m.users_total)} cuentas · ${nf.format(m.new_users_30d)} nuevas en 30 días`} onClick={() => onNavigate('usuarios')} />
        <Stat label="Agricultores" value={m.users_by_role.farmer} hint={`${nf.format(m.users_by_role.user)} usuarios estándar · ${nf.format(m.users_by_role.admin)} admin.`} tone="text-primary-300" onClick={() => onNavigate('usuarios')} />
        <Stat label="Fincas registradas" value={m.farms} hint={`${nf.format(m.documents)} documentos archivados`} onClick={() => onNavigate('fincas')} />
        <Stat label="Pendiente de revisar" value={m.pending_applications + m.open_reports + m.open_support_tickets} hint={`${m.pending_applications} altas · ${m.open_reports} denuncias · ${m.open_support_tickets} tickets`} tone="text-accent-300" onClick={() => onNavigate(m.pending_applications ? 'altas' : m.open_reports ? 'moderacion' : 'soporte')} />
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card title="Telemetría de labores">
          <Bars
            rows={[
              { label: 'Pendientes', value: m.tasks_by_status.pending },
              { label: 'En curso', value: m.tasks_by_status.in_progress },
              { label: 'Completadas', value: m.tasks_by_status.done },
            ]}
          />
        </Card>
        <Card title="Archivo documental por tipo">
          <Bars rows={DOC_TYPES.map((t) => ({ label: t.label, value: m.documents_by_type[t.id] ?? 0 })).filter((r) => r.value > 0)} />
          {m.documents === 0 && <p className="text-sm text-slate-400">Aún no hay documentos archivados.</p>}
        </Card>
        <Card title="Comunidad">
          <dl className="grid grid-cols-3 gap-4 text-center">
            {[
              ['Temas', m.forum_threads],
              ['Respuestas', m.forum_replies],
              ['Cuentas bloqueadas', m.banned_users],
            ].map(([label, value]) => (
              <div key={label}>
                <dt className="text-xs text-slate-400">{label}</dt>
                <dd className="mt-1 text-2xl font-bold tabular-nums text-secondary-200">{nf.format(value)}</dd>
              </div>
            ))}
          </dl>
        </Card>
      </div>
    </div>
  )
}
