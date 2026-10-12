import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { ROLE_LABELS, panelForRole } from '../../auth/roles.js'
import Avatar from '../ui/Avatar.jsx'

const ITEM = 'block rounded-lg px-3 py-2 text-sm text-slate-200 transition-colors duration-300 hover:bg-white/[0.06] hover:text-white'

/** Avatar con menú desplegable (panel, AgroProfile B2B y cerrar sesión). Funciona sobre fondos oscuros. */
export default function UserMenu({ showPanelLink = true }) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const onClick = (e) => !ref.current?.contains(e.target) && setOpen(false)
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('mousedown', onClick)
    window.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onClick)
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  if (!user) return null

  async function handleLogout() {
    setBusy(true)
    await logout()
    setBusy(false)
    navigate('/', { replace: true })
  }

  const close = () => setOpen(false)

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] py-1 pl-1 pr-3 text-sm text-white transition-[border-color,background-color] duration-300 hover:border-white/25 hover:bg-white/[0.06]"
      >
        <Avatar avatar={user.avatar} name={user.name} size="sm" />
        <span className="hidden max-w-[8rem] truncate font-medium sm:inline">{user?.name?.split(' ')[0] || 'Mi cuenta'}</span>
        <svg className={`h-4 w-4 text-white/60 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {open && (
        <div role="menu" className="pop-in absolute right-0 z-50 mt-2 w-64 origin-top-right overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-overlay">
          <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
            <Avatar avatar={user.avatar} name={user.name} />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{user.name}</p>
              <p className="truncate text-xs text-slate-400">{user.email}</p>
              <p className="mt-1 inline-flex rounded-full bg-secondary-500/15 px-2 py-0.5 text-[11px] font-semibold text-secondary-200">
                {ROLE_LABELS[user.role] ?? user.role}
              </p>
            </div>
          </div>
          <div className="p-1.5">
            {showPanelLink && (
              <Link role="menuitem" to={panelForRole(user.role)} onClick={close} className={ITEM}>
                Mi panel
              </Link>
            )}
            <Link role="menuitem" to="/cuenta" onClick={close} className={ITEM}>
              AgroProfile B2B
            </Link>
            <button
              role="menuitem"
              type="button"
              onClick={handleLogout}
              disabled={busy}
              className="block w-full rounded-lg px-3 py-2 text-left text-sm text-accent-200 transition-colors duration-300 hover:bg-accent-500/10 disabled:opacity-60"
            >
              {busy ? 'Cerrando sesión…' : 'Cerrar sesión'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
