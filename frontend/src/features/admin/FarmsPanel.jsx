import { useEffect, useState } from 'react'
import { adminApi } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Card from '../../components/ui/Card.jsx'
import { inputClass } from '../../components/ui/FormField.jsx'
import { LoadingBlock } from '../../components/ui/Spinner.jsx'
import useApi from '../../hooks/useApi.js'

export default function FarmsPanel() {
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])
  const farms = useApi((signal) => adminApi.farms({ q: q.length >= 2 ? q : undefined }, { signal }), [q])

  return (
    <Card title="Fincas registradas">
      <input type="search" aria-label="Buscar finca, ubicación o titular" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={80} className={`${inputClass} mb-4 sm:max-w-sm`} placeholder="Buscar finca, ubicación o titular…" />
      {farms.loading && !farms.data ? (
        <LoadingBlock />
      ) : farms.error ? (
        <Alert variant="error" onRetry={farms.reload}>{farms.error}</Alert>
      ) : farms.data.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No hay fincas que coincidan.</p>
      ) : (
        <div className="relative -mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          <table className="w-full min-w-[40rem] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th scope="col" className="py-2 pr-4 font-semibold">Finca</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Ubicación</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Titular</th>
                <th scope="col" className="py-2 pr-4 text-right font-semibold">Labores</th>
                <th scope="col" className="py-2 text-right font-semibold">Documentos</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {farms.data.map((f) => (
                <tr key={f.id}>
                  <td className="py-3 pr-4 font-medium text-slate-100">{f.name}</td>
                  <td className="py-3 pr-4 text-slate-300">{f.location}</td>
                  <td className="py-3 pr-4 text-slate-300">{f.owner_name}</td>
                  <td className="py-3 pr-4 text-right tabular-nums">{f.task_count}</td>
                  <td className="py-3 text-right tabular-nums">{f.document_count}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
