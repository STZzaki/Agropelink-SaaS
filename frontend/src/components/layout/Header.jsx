import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import UserMenu from '../auth/UserMenu.jsx'

const FARMER_LINKS = [
  { to: '/dashboard', label: 'Hub de Telemetría IoT' },
  { to: '/economia', label: 'Economía' },
  { to: '/tasks', label: 'Tareas' },
  { to: '/documents', label: 'Documentos' },
]

// La navegación refleja el rol; el acceso real lo decide la API en cada petición.
const NAV_BY_ROLE = {
  admin: [{ to: '/admin', label: 'Administración' }, ...FARMER_LINKS],
  farmer: FARMER_LINKS,
  user: [
    { to: '/portal', label: 'Mi portal' },
    { to: '/cuenta', label: 'AgroProfile B2B' },
  ],
}

const desktopLinkClass = ({ isActive }) =>
  `border-b-2 py-1 transition-colors duration-300 ${
    isActive ? 'border-primary-400 text-white' : 'border-transparent text-white/70 hover:text-white'
  }`

const mobileLinkClass = ({ isActive }) =>
  `block rounded-md px-3 py-2 text-base font-medium ${
    isActive ? 'bg-white/10 text-white' : 'text-white/80 hover:bg-white/10 hover:text-white'
  }`

export default function Header() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const { pathname } = useLocation()
  const links = NAV_BY_ROLE[user?.role] ?? NAV_BY_ROLE.user

  // Cierra el menú móvil al navegar.
  useEffect(() => setOpen(false), [pathname])

  return (
    <header className="sticky top-0 z-40 border-b border-white/[0.06] bg-slate-950/[0.97] text-white">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:h-20 sm:px-6 lg:px-8">
        <Link to="/" className="flex items-center" aria-label="Agropelink, ir a la página principal">
          <img src="/brand/logo-white.png" alt="Agropelink" className="h-10 w-auto object-contain sm:h-12" />
        </Link>

        <nav className="hidden md:block" aria-label="Navegación principal">
          <ul className="flex items-center gap-8 text-sm font-medium">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} className={desktopLinkClass}>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <UserMenu />
          <button
            type="button"
            className="inline-flex items-center justify-center rounded-md p-2 text-white/80 hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-primary-400 md:hidden"
            aria-controls="mobile-menu"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="sr-only">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
            <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="mobile-menu" className="border-t border-white/10 md:hidden" aria-label="Navegación móvil">
          <ul className="space-y-1 px-4 py-3">
            {links.map((link) => (
              <li key={link.to}>
                <NavLink to={link.to} className={mobileLinkClass}>
                  {link.label}
                </NavLink>
              </li>
            ))}
          </ul>
        </nav>
      )}
    </header>
  )
}
