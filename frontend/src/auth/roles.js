/**
 * Roles de la plataforma (RBAC). El frontend solo los usa para la navegación y la experiencia:
 * la autorización real la aplica siempre el backend (`require_role`) en cada petición.
 */
export const ROLES = {
  ADMIN: 'admin',
  FARMER: 'farmer',
  USER: 'user',
}

export const ROLE_LABELS = {
  admin: 'Administrador',
  farmer: 'Agricultor',
  user: 'Usuario',
}

/** Primera vista tras iniciar sesión. Los usuarios estándar entran directamente al foro. */
export function homeForRole(role) {
  if (role === ROLES.ADMIN) return '/admin'
  if (role === ROLES.FARMER) return '/dashboard'
  return '/foro'
}

/** Panel principal de cada rol (enlace "Mi panel"). */
export function panelForRole(role) {
  if (role === ROLES.ADMIN) return '/admin'
  if (role === ROLES.FARMER) return '/dashboard'
  return '/portal'
}

export const isFarmerOrAdmin = (role) => role === ROLES.FARMER || role === ROLES.ADMIN
