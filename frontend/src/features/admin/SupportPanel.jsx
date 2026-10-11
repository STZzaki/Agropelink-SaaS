import { useState } from 'react'
import { adminApi, getErrorMessage } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import Card from '../../components/ui/Card.jsx'
import { LoadingBlock } from '../../components/ui/Spinner.jsx'
import useApi from '../../hooks/useApi.js'

const CATEGORY_LABELS = { technical: 'Técnico', legal: 'Legal', account: 'Cuenta', other: 'Otro' }

export default function SupportPanel({ onChanged }) {
  const [closed, setClosed] = useState(false)
  const tickets = useApi((signal) => adminApi.support({ closed }, { signal }), [closed])
  const [error, setError] = useState(null)

  async function close(id) {
    setError(null)
    try {
      await adminApi.closeTicket(id)
      tickets.reload()
      onChanged()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  return (
    <Card
      title="Tickets de soporte"
      actions={
        <label className="flex items-center gap-2 text-sm text-slate-300">
          <input type="checkbox" checked={closed} onChange={(e) => setClosed(e.target.checked)} className="h-4 w-4 rounded border-white/15 text-secondary-300" />
          Ver cerrados
        </label>
      }
    >
      {error && <p role="alert" className="mb-3 text-sm font-medium text-accent-300">{error}</p>}
      {tickets.loading ? (
        <LoadingBlock />
      ) : tickets.error ? (
        <Alert variant="error" onRetry={tickets.reload}>{tickets.error}</Alert>
      ) : tickets.data.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">{closed ? 'No hay tickets cerrados.' : 'No hay tickets abiertos.'}</p>
      ) : (
        <ul className="divide-y divide-white/[0.06]">
          {tickets.data.map((t) => (
            <li key={t.id} className="flex flex-wrap items-start justify-between gap-3 py-4">
              <div className="min-w-0 flex-1">
                <p className="text-sm">
                  <span className="mr-2 rounded-full bg-secondary-500/10 px-2 py-0.5 text-xs font-semibold text-secondary-200 ring-1 ring-inset ring-secondary-400/30">{CATEGORY_LABELS[t.category]}</span>
                  <strong className="text-slate-100">#{t.id} {t.subject}</strong>
                </p>
                <p className="mt-1 text-xs text-slate-400">
                  {t.user.name} · <a href={`mailto:${t.user_email}?subject=${encodeURIComponent(`Re: [Agropelink #${t.id}] ${t.subject}`)}`} className="text-secondary-300 hover:underline">{t.user_email}</a> · {new Date(t.created_at).toLocaleString('es-ES')}
                </p>
                <p className="mt-2 whitespace-pre-wrap break-words text-sm text-slate-200">{t.message}</p>
              </div>
              {!t.is_closed && <Button variant="outline" onClick={() => close(t.id)}>Marcar resuelto</Button>}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
