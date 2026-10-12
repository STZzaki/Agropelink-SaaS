import { applicationsApi } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import FuelWidget from '../components/landing/FuelWidget.jsx'
import WeatherWidget from '../components/landing/WeatherWidget.jsx'
import Alert from '../components/ui/Alert.jsx'
import Card from '../components/ui/Card.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { LoadingBlock } from '../components/ui/Spinner.jsx'
import FarmerApplicationForm from '../features/applications/FarmerApplicationForm.jsx'
import AssignedTasks from '../features/workers/AssignedTasks.jsx'
import useApi from '../hooks/useApi.js'

const BENEFITS = [
  'Panel agronómico con datos en vivo y sensores de parcela',
  'Gestor de tareas y calendario de labores',
  'Archivo documental indexado y clasificado con IA',
  'Asistente agronómico Agropelink AI',
]

function ApplicationStatus({ application }) {
  const date = new Date(application.created_at).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })
  if (application.status === 'pending') {
    return (
      <Alert variant="info">
        <p className="font-semibold">Solicitud en revisión</p>
        <p className="mt-0.5">Recibimos tu solicitud para «{application.farm_name}» el {date}. Te avisaremos cuando el equipo la revise.</p>
      </Alert>
    )
  }
  if (application.status === 'rejected') {
    return (
      <Alert variant="error">
        <p className="font-semibold">Solicitud no aprobada</p>
        {application.review_note && <p className="mt-0.5">{application.review_note}</p>}
        <p className="mt-0.5">Puedes enviar una nueva solicitud con más información.</p>
      </Alert>
    )
  }
  return null
}

/** Panel del usuario estándar: datos públicos en directo, tareas asignadas y solicitud de alta como agricultor. */
export default function PortalPage() {
  const { user } = useAuth()
  const application = useApi((signal) => applicationsApi.mine({ signal }))
  const current = application.data
  const canApply = !current || current.status === 'rejected'

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader title={user?.name ? `Hola, ${user.name.split(' ')[0]}` : 'Hola'} subtitle="Tu portal Agropelink: meteorología, carburante y tus labores asignadas." />

      {/* Los widgets públicos usan el estilo oscuro de la landing. */}
      <section aria-label="Datos en directo" className="grid grid-cols-1 gap-6 rounded-3xl bg-slate-950 p-4 text-slate-200 sm:p-6 lg:grid-cols-2">
        <WeatherWidget />
        <FuelWidget />
      </section>

      <div className="mt-8">
        <AssignedTasks />
      </div>

      <div className="mt-8">
        <Card title="Conviértete en Agricultor Agropelink">
          <ul className="mb-6 grid grid-cols-1 gap-2 text-sm text-slate-300 sm:grid-cols-2">
            {BENEFITS.map((b) => (
              <li key={b} className="flex items-start gap-2">
                <svg className="mt-0.5 h-4 w-4 shrink-0 text-primary-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                {b}
              </li>
            ))}
          </ul>
          {application.loading ? (
            <LoadingBlock label="Comprobando tu solicitud…" />
          ) : application.error ? (
            <Alert variant="error" onRetry={application.reload}>{application.error}</Alert>
          ) : (
            <div className="space-y-5">
              {current && <ApplicationStatus application={current} />}
              {canApply && <FarmerApplicationForm onSubmitted={(created) => application.setData(created)} />}
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
