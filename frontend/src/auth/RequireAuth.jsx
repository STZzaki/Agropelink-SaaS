import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from './AuthContext.jsx'
import { homeForRole } from './roles.js'

export function FullScreenLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-950" role="status" aria-label="Comprobando sesión">
      <span className="h-10 w-10 animate-spin rounded-full border-4 border-white/10 border-t-secondary-400" />
    </div>
  )
}

/**
 * Protege rutas privadas. Sin sesión redirige a /login conservando el destino; con `roles`,
 * un rol no permitido vuelve a su propio panel (la API rechaza igualmente con 403).
 */
export default function RequireAuth({ roles }) {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') return <FullScreenLoader />
  if (status === 'anonymous') {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />
  }
  if (roles && !roles.includes(user.role)) return <Navigate to={homeForRole(user.role)} replace />
  return <Outlet />
}

/** `/panel`: punto de entrada único (landing, menús) que lleva a cada rol a su panel. */
export function RoleHome() {
  const { status, user } = useAuth()
  if (status === 'loading') return <FullScreenLoader />
  if (status === 'anonymous') return <Navigate to="/login" replace />
  return <Navigate to={homeForRole(user.role)} replace />
}
