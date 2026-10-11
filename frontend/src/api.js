import axios from 'axios'

// Solo valores públicos en el frontend (tech_rules.md §2.1): nunca API keys aquí.
// Sin VITE_API_URL en desarrollo, la API se busca en el MISMO host desde el que se abrió la web
// (localhost o 127.0.0.1): así el origen está permitido por CORS y la cookie de sesión es del mismo sitio.
// En producción, sin variable, se usa la misma origen (/api/v1 tras el proxy inverso).
const devApiURL = typeof window !== 'undefined' ? `http://${window.location.hostname}:8000/api/v1` : 'http://localhost:8000/api/v1'
const baseURL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? devApiURL : '/api/v1')

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024
export const ALLOWED_UPLOAD_TYPES = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp']

const api = axios.create({
  baseURL,
  timeout: 15000,
  // La sesión viaja en una cookie HttpOnly gestionada por el navegador:
  // el frontend nunca ve ni guarda tokens (ni localStorage ni sessionStorage, tech_rules.md §2.4).
  withCredentials: true,
  headers: {
    Accept: 'application/json',
    // Defensa CSRF: el backend rechaza peticiones que modifican estado sin esta cabecera.
    'X-Requested-With': 'XMLHttpRequest',
  },
})

export const UNAUTHORIZED_EVENT = 'agropelink:unauthorized'
// El Auto-Mod bloqueó una publicación y emitió una advertencia oficial: hay que refrescar el perfil.
export const MODERATION_WARNING_EVENT = 'agropelink:moderation-warning'

// Sesión caducada o revocada en cualquier petición → el AuthProvider vuelve a estado anónimo.
api.interceptors.response.use(
  (response) => response,
  (error) => {
    const url = error.config?.url ?? ''
    const { status, data } = error.response ?? {}
    // 401 fuera de /auth, o bloqueo de la cuenta por moderación (el servidor ya revocó la sesión).
    const suspended = status === 403 && typeof data?.detail === 'string' && data.detail.startsWith('Tu cuenta ha sido suspendida')
    if ((status === 401 && !url.startsWith('/auth/')) || suspended) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
    if (status === 400 && url.startsWith('/forum/')) {
      window.dispatchEvent(new Event(MODERATION_WARNING_EVENT))
    }
    return Promise.reject(error)
  },
)

/** Convierte un error de Axios/FastAPI en un mensaje legible para el usuario. */
export function getErrorMessage(error) {
  if (axios.isCancel(error)) return null
  if (!error.response) {
    return error.code === 'ECONNABORTED'
      ? 'El servidor tardó demasiado en responder.'
      : 'No se pudo conectar con el servidor.'
  }

  const { status, data } = error.response
  const detail = data?.detail
  if (Array.isArray(detail)) {
    // Errores de validación de FastAPI (422)
    return detail.map((d) => d.msg).join('. ')
  }
  if (status === 401 && detail === 'Not authenticated') return 'Tu sesión ha caducado. Inicia sesión de nuevo.'
  if (status === 403 && (detail === 'Missing CSRF header' || detail === 'Origin not allowed')) {
    return 'No se pudo verificar el origen de la petición. Recarga la página.'
  }
  if (status === 403 && detail === 'Insufficient permissions') return 'Tu cuenta no tiene permisos para esta sección.'
  if (typeof detail === 'string' && status < 500) return detail
  if (status === 413) return 'El archivo supera el tamaño máximo permitido.'
  if (status === 415) return 'Tipo de archivo no permitido.'
  if (status === 502 || status === 503 || status === 504) {
    return 'El servicio no está disponible temporalmente. Inténtalo de nuevo en unos segundos.'
  }
  return 'Ha ocurrido un error inesperado. Inténtalo de nuevo más tarde.'
}

export const farmsApi = {
  list: (params, config) => api.get('/farms', { params, ...config }).then((r) => r.data),
  get: (id, config) => api.get(`/farms/${id}`, config).then((r) => r.data),
  create: (payload) => api.post('/farms', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/farms/${id}`, payload).then((r) => r.data),
  uploadPhoto: (id, file, onProgress) => {
    const form = new FormData()
    form.append('file', file)
    return api
      .put(`/farms/${id}/photo`, form, { timeout: 120000, onUploadProgress: (e) => onProgress && e.total && onProgress(Math.round((e.loaded / e.total) * 100)) })
      .then((r) => r.data)
  },
  /** Foto privada: el navegador envía la cookie de sesión (mismo sitio); `v` evita la caché tras cambiarla. */
  photoUrl: (id, v = '') => `${baseURL}/farms/${id}/photo${v ? `?v=${v}` : ''}`,
  addReading: (id, payload) => api.post(`/farms/${id}/readings`, payload).then((r) => r.data),
}

export const analyticsApi = {
  overview: (params, config) => api.get('/analytics/overview', { params, ...config }).then((r) => r.data),
}

export const tasksApi = {
  list: (params, config) => api.get('/tasks', { params, ...config }).then((r) => r.data),
  create: (payload) => api.post('/tasks', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/tasks/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/tasks/${id}`),
}

export const agentApi = {
  /** @param {{ message: string, history: { role: 'user' | 'model', text: string }[] }} payload */
  chat: (payload) => api.post('/agent/chat', payload, { timeout: 90000 }).then((r) => r.data),
}

export const contactApi = {
  send: (payload) => api.post('/contact', payload).then((r) => r.data),
}

export const authApi = {
  me: (config) => api.get('/auth/me', config).then((r) => r.data),
  login: (payload) => api.post('/auth/login', payload).then((r) => r.data),
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data),
  logout: () => api.post('/auth/logout'),
  moderation: (config) => api.get('/auth/me/moderation', config).then((r) => r.data),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (token, newPassword) => api.post('/auth/reset-password', { token, new_password: newPassword }).then((r) => r.data),
}

export const forumApi = {
  categories: (config) => api.get('/forum/categories', config).then((r) => r.data),
  list: (params, config) => api.get('/forum/threads', { params, ...config }).then((r) => r.data),
  get: (id, config) => api.get(`/forum/threads/${id}`, config).then((r) => r.data),
  create: (payload) => api.post('/forum/threads', payload).then((r) => r.data),
  reply: (id, payload) => api.post(`/forum/threads/${id}/replies`, payload).then((r) => r.data),
  report: (payload) => api.post('/forum/reports', payload).then((r) => r.data),
  /** Sube una imagen/vídeo con la aceptación legal expresa; devuelve { id, kind, url }. */
  uploadMedia: (file, onProgress) => {
    const form = new FormData()
    form.append('file', file)
    form.append('rights_accepted', 'true')
    return api
      .post('/forum/upload', form, { timeout: 180000, onUploadProgress: progressHandler(onProgress) })
      .then((r) => r.data)
  },
  discardMedia: (id) => api.delete(`/forum/upload/${id}`),
  /** Solo administradores: borrado forzoso de un tema (`thread`) o de una respuesta (`reply`). */
  adminDelete: (id, kind) => api.delete(`/forum/posts/${id}/admin`, { params: { kind } }),
  /** URL absoluta de un archivo multimedia (`media.url` es relativa a la API). */
  mediaUrl: (relative) => `${baseURL}${relative}`,
}

// Límites de multimedia del foro (el backend los vuelve a imponer leyendo el stream).
export const FORUM_MEDIA = {
  maxFiles: 4,
  image: { types: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 5 * 1024 * 1024 },
  video: { types: ['video/mp4'], maxBytes: 15 * 1024 * 1024 },
}

export const applicationsApi = {
  mine: (config) => api.get('/applications/me', config).then((r) => r.data),
  create: (payload) => api.post('/applications', payload).then((r) => r.data),
}

export const usersApi = {
  acknowledgeWarning: () => api.post('/users/acknowledge-warning').then((r) => r.data),
  /** @param {{ name: string, birth_date: string, avatar: string | null }} profile */
  updateProfile: (profile) => api.put('/users/me', profile).then((r) => r.data),
  /** Solo administradores: bloqueo inmediato de la cuenta. */
  ban: (id, reason) => api.put(`/users/${id}/ban`, reason ? { reason } : {}).then((r) => r.data),
}

export const supportApi = {
  open: (payload) => api.post('/support/tickets', payload).then((r) => r.data),
}

export const adminApi = {
  metrics: (config) => api.get('/admin/metrics', config).then((r) => r.data),
  users: (params, config) => api.get('/admin/users', { params, ...config }).then((r) => r.data),
  createUser: (payload) => api.post('/admin/users', payload).then((r) => r.data),
  setRole: (id, role) => api.patch(`/admin/users/${id}/role`, { role }).then((r) => r.data),
  ban: (id, reason) => api.post(`/admin/users/${id}/ban`, { reason }).then((r) => r.data),
  unban: (id) => api.post(`/admin/users/${id}/unban`).then((r) => r.data),
  farms: (params, config) => api.get('/admin/farms', { params, ...config }).then((r) => r.data),
  applications: (params, config) => api.get('/admin/applications', { params, ...config }).then((r) => r.data),
  approve: (id, payload = {}) => api.post(`/admin/applications/${id}/approve`, payload).then((r) => r.data),
  reject: (id, payload = {}) => api.post(`/admin/applications/${id}/reject`, payload).then((r) => r.data),
  reports: (params, config) => api.get('/admin/reports', { params, ...config }).then((r) => r.data),
  resolveReport: (id, payload) => api.post(`/admin/reports/${id}/resolve`, payload).then((r) => r.data),
  removed: (config) => api.get('/admin/moderation/removed', config).then((r) => r.data),
  events: (config) => api.get('/admin/moderation/events', config).then((r) => r.data),
  restore: (kind, id) => api.post(`/admin/forum/${kind}/${id}/restore`),
  support: (params, config) => api.get('/admin/support', { params, ...config }).then((r) => r.data),
  closeTicket: (id) => api.post(`/admin/support/${id}/close`),
}

export const marketApi = {
  fuel: (config) => api.get('/market/fuel', { timeout: 60000, ...config }).then((r) => r.data),
}

const progressHandler = (onProgress) => (e) => {
  if (onProgress && e.total) onProgress(Math.round((e.loaded / e.total) * 100))
}

export const documentsApi = {
  list: (params, config) => api.get('/documents', { params, ...config }).then((r) => r.data),
  facets: (config) => api.get('/documents/facets', config).then((r) => r.data),
  folders: (config) => api.get('/documents/folders', config).then((r) => r.data),
  /** Subida directa con metadatos de indexación (`meta`: farm_id, doc_type, fiscal_year, campaign…). */
  upload: (file, meta, onProgress) => {
    const form = new FormData()
    form.append('file', file)
    for (const [key, value] of Object.entries(meta)) {
      if (value !== null && value !== undefined && value !== '') form.append(key, String(value))
    }
    return api
      .post('/documents/upload', form, { timeout: 120000, onUploadProgress: progressHandler(onProgress) })
      .then((r) => r.data)
  },
  /** Sube el archivo como borrador y devuelve la propuesta de metadatos de la IA (requiere confirmación). */
  analyze: (file, instructions = '', onProgress) => {
    const form = new FormData()
    form.append('file', file)
    if (instructions) form.append('instructions', instructions)
    return api
      .post('/documents/analyze', form, { timeout: 120000, onUploadProgress: progressHandler(onProgress) })
      .then((r) => r.data)
  },
  confirm: (id, meta) => api.post(`/documents/${id}/confirm`, meta).then((r) => r.data),
  update: (id, payload) => api.patch(`/documents/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/documents/${id}`),
  /**
   * Descarga autenticada: la cookie HttpOnly viaja con la petición y el archivo llega como blob.
   * Se guarda con el nombre original; nunca se abre en una pestaña ni se interpreta en la página.
   */
  download: async (doc) => {
    const response = await api.get(`/documents/${doc.id}/download`, { responseType: 'blob', timeout: 120000 })
    const url = URL.createObjectURL(response.data)
    const link = document.createElement('a')
    link.href = url
    link.download = doc.filename
    link.rel = 'noopener'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  },
}

export default api
