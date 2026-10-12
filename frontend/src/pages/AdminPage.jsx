import { useSearchParams } from 'react-router-dom'
import { adminApi } from '../api.js'
import PageHeader from '../components/ui/PageHeader.jsx'
import AdminOverview from '../features/admin/AdminOverview.jsx'
import ApplicationsPanel from '../features/admin/ApplicationsPanel.jsx'
import BannedPanel from '../features/admin/BannedPanel.jsx'
import FarmsPanel from '../features/admin/FarmsPanel.jsx'
import ModerationPanel from '../features/admin/ModerationPanel.jsx'
import SupportPanel from '../features/admin/SupportPanel.jsx'
import UsersPanel from '../features/admin/UsersPanel.jsx'
import useApi from '../hooks/useApi.js'

const TABS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'altas', label: 'Solicitudes de alta', badge: 'pending_applications' },
  { id: 'moderacion', label: 'Reportes del Foro', badge: 'open_reports' },
  { id: 'usuarios', label: 'Gestión de usuarios' },
  { id: 'baneados', label: 'Baneados', badge: 'banned_users' },
  { id: 'fincas', label: 'Fincas' },
  { id: 'soporte', label: 'Soporte', badge: 'open_support_tickets' },
]

/** Panel de administración global. Cada endpoint que consume exige rol `admin` en la API. */
export default function AdminPage() {
  const [params, setParams] = useSearchParams()
  const tab = TABS.some((t) => t.id === params.get('tab')) ? params.get('tab') : 'resumen'
  const metrics = useApi((signal) => adminApi.metrics({ signal }))
  const select = (id) => setParams(id === 'resumen' ? {} : { tab: id }, { replace: true })

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader title="Administración" subtitle="Visión global de la plataforma, altas de agricultores, moderación del foro y soporte." />

      <div role="tablist" aria-label="Secciones de administración" className="relative -mx-4 mb-8 flex gap-1 overflow-x-auto border-b border-white/10 px-4 sm:mx-0 sm:px-0">
        {TABS.map((t) => {
          const count = t.badge ? metrics.data?.[t.badge] : 0
          const active = tab === t.id
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`tab-${t.id}`}
              aria-selected={active}
              aria-controls={`panel-${t.id}`}
              onClick={() => select(t.id)}
              className={`-mb-px inline-flex shrink-0 items-center gap-2 border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${active ? 'border-secondary-600 text-white' : 'border-transparent text-slate-400 hover:text-slate-100'}`}
            >
              {t.label}
              {count > 0 && <span className="rounded-full bg-accent-600 px-1.5 py-0.5 text-[11px] font-bold leading-none text-white">{count}</span>}
            </button>
          )
        })}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === 'resumen' && <AdminOverview metrics={metrics} onNavigate={select} />}
        {tab === 'altas' && <ApplicationsPanel onChanged={metrics.reload} />}
        {tab === 'moderacion' && <ModerationPanel onChanged={metrics.reload} />}
        {tab === 'usuarios' && <UsersPanel onChanged={metrics.reload} />}
        {tab === 'baneados' && <BannedPanel onChanged={metrics.reload} />}
        {tab === 'fincas' && <FarmsPanel />}
        {tab === 'soporte' && <SupportPanel onChanged={metrics.reload} />}
      </div>
    </div>
  )
}
