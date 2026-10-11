import { useState } from 'react'
import { adminApi, getErrorMessage } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import Card from '../../components/ui/Card.jsx'
import { LoadingBlock } from '../../components/ui/Spinner.jsx'
import useApi from '../../hooks/useApi.js'

const when = (iso) => (iso ? new Date(iso).toLocaleString('es-ES', { dateStyle: 'medium', timeStyle: 'short' }) : '—')

/** Lista de cuentas expulsadas: motivo, fecha y rehabilitación (reinicia las advertencias). */
export default function BannedPanel({ onChanged }) {
  const banned = useApi((signal) => adminApi.users({ banned: true, limit: 100 }, { signal }))
  const [busy, setBusy] = useState(null)
  const [error, setError] = useState(null)

  async function rehabilitate(user) {
    setBusy(user.id)
    setError(null)
    try {
      await adminApi.unban(user.id)
      banned.reload()
      onChanged()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(null)
    }
  }

  return (
    <Card title="Usuarios baneados">
      {error && <p role="alert" className="mb-3 text-sm font-medium text-accent-300">{error}</p>}
      {banned.loading ? (
        <LoadingBlock />
      ) : banned.error ? (
        <Alert variant="error" onRetry={banned.reload}>{banned.error}</Alert>
      ) : banned.data.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">No hay cuentas baneadas.</p>
      ) : (
        <div className="-mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          <table className="w-full min-w-[48rem] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th scope="col" className="py-2 pr-4 font-semibold">Usuario</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Motivo del baneo</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Fecha</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Advertencias</th>
                <th scope="col" className="py-2 text-right font-semibold"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {banned.data.items.map((u) => (
                <tr key={u.id} className="align-top">
                  <td className="py-3 pr-4">
                    <p className="font-medium text-slate-100">{u.name}</p>
                    <p className="text-xs text-slate-400">#{u.id} · {u.email}</p>
                  </td>
                  <td className="max-w-[22rem] py-3 pr-4 text-slate-300">{u.ban_reason ?? '—'}</td>
                  <td className="whitespace-nowrap py-3 pr-4 text-slate-300">{when(u.banned_at)}</td>
                  <td className="py-3 pr-4 tabular-nums text-slate-300">{u.warnings_count}</td>
                  <td className="py-3 text-right">
                    <Button variant="outline" loading={busy === u.id} disabled={busy !== null} onClick={() => rehabilitate(u)}>
                      Rehabilitar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}
