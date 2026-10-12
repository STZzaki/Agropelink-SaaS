import { useEffect, useState } from 'react'
import { adminApi, getErrorMessage } from '../../api.js'
import { useAuth } from '../../auth/AuthContext.jsx'
import { ROLE_LABELS } from '../../auth/roles.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import Card from '../../components/ui/Card.jsx'
import { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import Spinner, { LoadingBlock } from '../../components/ui/Spinner.jsx'
import useApi from '../../hooks/useApi.js'
import CreateUserDialog from './CreateUserDialog.jsx'

const day = (iso) => (iso ? new Date(iso).toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' }) : '—')

function UserRow({ user, isSelf, onChanged }) {
  const [busy, setBusy] = useState(false)
  const [banning, setBanning] = useState(false)
  const [reason, setReason] = useState('')
  const [error, setError] = useState(null)

  async function run(action) {
    setBusy(true)
    setError(null)
    try {
      await action()
      setBanning(false)
      setReason('')
      onChanged()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <tr className="align-top">
      <td className="whitespace-nowrap py-3 pr-4 font-mono text-xs text-slate-400">#{user.id}</td>
      <td className="py-3 pr-4">
        <p className="font-medium text-slate-100">{user.name}{isSelf && <span className="ml-1 text-xs text-slate-400">(tú)</span>}</p>
        <p className="text-xs text-slate-400">{user.email}</p>
      </td>
      <td className="py-3 pr-4">
        <label htmlFor={`role-${user.id}`} className="sr-only">Rol de {user.name}</label>
        <select
          id={`role-${user.id}`}
          value={user.role}
          disabled={busy || isSelf}
          onChange={(e) => run(() => adminApi.setRole(user.id, e.target.value))}
          className={`${inputClass} !w-auto py-1`}
        >
          {Object.entries(ROLE_LABELS).map(([id, label]) => <option className={optionClass} key={id} value={id}>{label}</option>)}
        </select>
      </td>
      <td className="whitespace-nowrap py-3 pr-4 text-slate-300" title={user.birth_date ? `Nacimiento: ${day(user.birth_date)}` : 'Cuenta anterior al control de edad'}>
        {user.age !== null ? `${user.age} años` : '—'}
      </td>
      <td className="whitespace-nowrap py-3 pr-4 text-slate-300">{user.farm_count}</td>
      <td className="whitespace-nowrap py-3 pr-4 text-slate-300">{day(user.last_login_at)}</td>
      <td className="py-3 pr-4">
        {user.is_banned ? (
          <span className="rounded-full bg-red-500/10 px-2 py-0.5 text-xs font-semibold text-red-300 ring-1 ring-inset ring-red-400/30" title={user.ban_reason ?? ''}>Bloqueada</span>
        ) : user.warnings_count ? (
          <span className="rounded-full bg-accent-500/10 px-2 py-0.5 text-xs font-semibold text-accent-200 ring-1 ring-inset ring-accent-400/30">
            Activa · {user.warnings_count} advertencia{user.warnings_count > 1 ? 's' : ''}{user.pending_warning_ack ? ' (sin aceptar)' : ''}
          </span>
        ) : (
          <span className="text-xs text-slate-400">Activa</span>
        )}
        {user.is_banned && user.ban_reason && <p className="mt-1 max-w-[16rem] text-xs text-slate-400">{user.ban_reason}</p>}
      </td>
      <td className="py-3 text-right">
        {isSelf ? null : user.is_banned ? (
          <Button variant="outline" loading={busy} onClick={() => run(() => adminApi.unban(user.id))}>Desbloquear</Button>
        ) : banning ? (
          <div className="flex min-w-[16rem] flex-col items-end gap-2">
            <label htmlFor={`ban-${user.id}`} className="sr-only">Motivo del bloqueo</label>
            <input id={`ban-${user.id}`} autoFocus maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} placeholder="Motivo del bloqueo" />
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setBanning(false)} disabled={busy}>Cancelar</Button>
              <Button variant="danger" loading={busy} disabled={reason.trim().length < 4} onClick={() => run(() => adminApi.ban(user.id, reason.trim()))}>Bloquear</Button>
            </div>
          </div>
        ) : (
          <Button variant="outline" onClick={() => setBanning(true)}>Bloquear</Button>
        )}
        {error && <p role="alert" className="mt-1 text-xs font-medium text-accent-300">{error}</p>}
      </td>
    </tr>
  )
}

export default function UsersPanel({ onChanged }) {
  const { user: me } = useAuth()
  const [role, setRole] = useState('')
  const [banned, setBanned] = useState('')
  const [search, setSearch] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 300)
    return () => clearTimeout(t)
  }, [search])

  const params = { role: role || undefined, banned: banned || undefined, q: q.length >= 2 ? q : undefined, limit: 100 }
  const users = useApi((signal) => adminApi.users(params, { signal }), [JSON.stringify(params)])
  const [creating, setCreating] = useState(false)

  return (
    <Card
      title="Gestión de usuarios"
      actions={
        <div className="flex items-center gap-3">
          {users.loading && users.data && <Spinner size="sm" />}
          <Button onClick={() => setCreating(true)}>Nuevo usuario</Button>
        </div>
      }
    >
      <CreateUserDialog open={creating} onClose={() => setCreating(false)} onCreated={() => { users.reload(); onChanged() }} />
      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <input type="search" aria-label="Buscar por nombre o email" value={search} onChange={(e) => setSearch(e.target.value)} maxLength={80} className={inputClass} placeholder="Buscar nombre o email…" />
        <select aria-label="Filtrar por rol" value={role} onChange={(e) => setRole(e.target.value)} className={inputClass}>
          <option className={optionClass} value="">Todos los roles</option>
          {Object.entries(ROLE_LABELS).map(([id, label]) => <option className={optionClass} key={id} value={id}>{label}</option>)}
        </select>
        <select aria-label="Filtrar por estado" value={banned} onChange={(e) => setBanned(e.target.value)} className={inputClass}>
          <option className={optionClass} value="">Todas las cuentas</option>
          <option className={optionClass} value="true">Bloqueadas</option>
          <option className={optionClass} value="false">Activas</option>
        </select>
      </div>
      {users.error ? (
        <Alert variant="error" onRetry={users.reload}>{users.error}</Alert>
      ) : !users.data ? (
        <LoadingBlock />
      ) : users.data.items.length === 0 ? (
        <p className="py-8 text-center text-sm text-slate-400">Ningún usuario coincide.</p>
      ) : (
        <div className="relative -mx-5 overflow-x-auto px-5 sm:-mx-6 sm:px-6">
          <table className="w-full min-w-[60rem] text-left text-sm">
            <thead className="border-b border-white/10 text-xs uppercase tracking-wide text-slate-400">
              <tr>
                <th scope="col" className="py-2 pr-4 font-semibold">ID</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Usuario</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Rol</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Edad</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Fincas</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Último acceso</th>
                <th scope="col" className="py-2 pr-4 font-semibold">Estado</th>
                <th scope="col" className="py-2 text-right font-semibold"><span className="sr-only">Acciones</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.06]">
              {users.data.items.map((u) => (
                <UserRow key={u.id} user={u} isSelf={u.id === me.id} onChanged={() => { users.reload(); onChanged() }} />
              ))}
            </tbody>
          </table>
          {users.data.total > users.data.items.length && (
            <p className="mt-3 text-xs text-slate-400">Mostrando {users.data.items.length} de {users.data.total}. Afina la búsqueda para ver el resto.</p>
          )}
        </div>
      )}
    </Card>
  )
}
