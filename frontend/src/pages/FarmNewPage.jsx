import { useNavigate } from 'react-router-dom'
import PageHeader from '../components/ui/PageHeader.jsx'
import FarmForm from '../features/farms/FarmForm.jsx'

export default function FarmNewPage() {
  const navigate = useNavigate()
  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Nueva granja" title="Alta de explotación" subtitle="Completa la ficha en cinco pasos. Solo el nombre y la ubicación son obligatorios; el resto puedes ampliarlo más tarde." />
      <FarmForm onCreated={(farm, warning) => navigate('/dashboard', { replace: true, state: { createdFarm: farm.name, warning } })} />
    </div>
  )
}
