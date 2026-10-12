import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { UNAUTHORIZED_EVENT, authApi } from '../api.js'

/**
 * Estado de sesión. La sesión real vive en una cookie HttpOnly que JS no puede leer:
 * aquí solo se guarda en memoria el perfil público devuelto por `/auth/me`.
 */
const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [status, setStatus] = useState('loading') // loading | authenticated | anonymous

  useEffect(() => {
    const controller = new AbortController()
    authApi
      .me({ signal: controller.signal })
      .then((me) => {
        setUser(me)
        setStatus('authenticated')
      })
      .catch((err) => {
        if (err?.name === 'CanceledError') return
        setUser(null)
        setStatus('anonymous')
      })
    return () => controller.abort()
  }, [])

  useEffect(() => {
    const onUnauthorized = () => {
      setUser(null)
      setStatus('anonymous')
    }
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized)
  }, [])

  const login = useCallback(async (credentials) => {
    const me = await authApi.login(credentials)
    setUser(me)
    setStatus('authenticated')
    return me
  }, [])

  const register = useCallback((payload) => authApi.register(payload), [])

  /** Vuelve a leer el perfil (rol, datos de la cuenta) desde el servidor. */
  const refresh = useCallback(async () => {
    try {
      setUser(await authApi.me())
      setStatus('authenticated')
    } catch {
      // Un 401 ya lo gestiona el interceptor (UNAUTHORIZED_EVENT).
    }
  }, [])

  const logout = useCallback(async () => {
    try {
      await authApi.logout()
    } finally {
      setUser(null)
      setStatus('anonymous')
    }
  }, [])

  const value = useMemo(
    () => ({ user, status, login, register, logout, refresh, setUser }),
    [user, status, login, register, logout, refresh],
  )
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de <AuthProvider>')
  return ctx
}

/**
 * Solo rutas internas: evita redirecciones abiertas a dominios externos tras el login.
 * Sin destino se va a `/panel`, que lleva a cada rol a su panel (admin, agricultor o usuario).
 */
export function safeRedirect(path) {
  return typeof path === 'string' && path.startsWith('/') && !path.startsWith('//') && !path.startsWith('/\\') ? path : '/panel'
}
