import { useAuth } from '../../auth/AuthContext.jsx'
import { FullScreenLoader } from '../../auth/RequireAuth.jsx'
import Layout from './Layout.jsx'
import PublicLayout from './PublicLayout.jsx'

/**
 * El foro es público, pero con sesión iniciada se muestra dentro del panel (navegación por rol, ayuda,
 * avisos de moderación). Es la vista por defecto de los usuarios estándar.
 */
export default function ForumLayout() {
  const { status } = useAuth()
  if (status === 'loading') return <FullScreenLoader />
  return status === 'authenticated' ? <Layout privateMeta={false} /> : <PublicLayout />
}
