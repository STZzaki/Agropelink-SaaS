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

// Sesión caducada o revocada en cualquier petición → el AuthProvider vuelve a estado anónimo.
/**
 * La API siempre responde JSON (o el archivo pedido en descargas). Si llega HTML con un 200, la petición no ha
 * llegado al backend: proxy sin regla para /api, backend caído, «fallback» de la SPA que devuelve index.html…
 * Se convierte en error para que cada pantalla muestre su aviso en lugar de romperse con datos inesperados.
 */
export class ApiUnavailableError extends Error {
  constructor(config) {
    super('El servidor de datos no está disponible ahora mismo. Inténtalo de nuevo en unos minutos.')
    this.name = 'ApiUnavailableError'
    this.config = config
  }
}

const isHtmlInsteadOfApi = (response) => {
  const type = String(response.headers?.['content-type'] ?? '')
  const raw = typeof response.data === 'string' && /^\s*<(!doctype|html)/i.test(response.data)
  return response.config?.responseType !== 'blob' && (type.includes('text/html') || raw)
}

api.interceptors.response.use(
  (response) => (isHtmlInsteadOfApi(response) ? Promise.reject(new ApiUnavailableError(response.config)) : response),
  (error) => {
    const url = error.config?.url ?? ''
    const { status, data } = error.response ?? {}
    // 401 fuera de /auth, o bloqueo de la cuenta por moderación (el servidor ya revocó la sesión).
    const suspended = status === 403 && typeof data?.detail === 'string' && data.detail.startsWith('Tu cuenta ha sido suspendida')
    if ((status === 401 && !url.startsWith('/auth/')) || suspended) {
      window.dispatchEvent(new Event(UNAUTHORIZED_EVENT))
    }
    return Promise.reject(error)
  },
)

/** Convierte un error de Axios/FastAPI en un mensaje legible para el usuario. */
export function getErrorMessage(error) {
  if (axios.isCancel(error)) return null
  if (error instanceof ApiUnavailableError || error instanceof InvalidProfileError) return error.message
  if (!error?.response) {
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

export const economyApi = {
  harvests: (farmId, config) => api.get(`/farms/${farmId}/harvests`, config).then((r) => r.data),
  createHarvest: (farmId, payload) => api.post(`/farms/${farmId}/harvests`, payload).then((r) => r.data),
  updateHarvest: (farmId, id, payload) => api.put(`/farms/${farmId}/harvests/${id}`, payload).then((r) => r.data),
  removeHarvest: (farmId, id) => api.delete(`/farms/${farmId}/harvests/${id}`),
  expenses: (farmId, params, config) => api.get(`/farms/${farmId}/expenses`, { params, ...config }).then((r) => r.data),
  createExpense: (farmId, payload) => api.post(`/farms/${farmId}/expenses`, payload).then((r) => r.data),
  removeExpense: (farmId, id) => api.delete(`/farms/${farmId}/expenses/${id}`),
  finance: (farmId, year, config) => api.get(`/farms/${farmId}/finance`, { params: { year }, ...config }).then((r) => r.data),
}

export const sensorsApi = {
  list: (farmId, config) => api.get(`/farms/${farmId}/sensors`, config).then((r) => r.data),
  series: (farmId, hours, config) => api.get(`/farms/${farmId}/sensors/series`, { params: { hours }, ...config }).then((r) => r.data),
  create: (farmId, payload) => api.post(`/farms/${farmId}/sensors`, payload).then((r) => r.data),
  remove: (farmId, sensorId) => api.delete(`/farms/${farmId}/sensors/${sensorId}`),
  addSamples: (farmId, sensorId, samples) => api.post(`/farms/${farmId}/sensors/${sensorId}/samples`, { samples }).then((r) => r.data),
}

export const tasksApi = {
  list: (params, config) => api.get('/tasks', { params, ...config }).then((r) => r.data),
  create: (payload) => api.post('/tasks', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/tasks/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/tasks/${id}`),
  /** Foto (PNG/JPEG/WEBP, máx. 5 MB) o PDF (máx. 10 MB). Devuelve la tarea con sus adjuntos. */
  addAttachment: (id, file) => {
    const form = new FormData()
    form.append('file', file)
    return api.post(`/tasks/${id}/attachments`, form, { timeout: 120000 }).then((r) => r.data)
  },
  removeAttachment: (id, attachmentId) => api.delete(`/tasks/${id}/attachments/${attachmentId}`),
  /** Descarga autenticada por la cookie de sesión (mismo sitio). */
  attachmentUrl: (id, attachmentId) => `${baseURL}/tasks/${id}/attachments/${attachmentId}`,
}

export const TASK_ATTACHMENT = {
  types: ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'],
  imageMaxBytes: 5 * 1024 * 1024,
  pdfMaxBytes: 10 * 1024 * 1024,
  max: 10,
}

export const workersApi = {
  list: (config) => api.get('/workers', config).then((r) => r.data),
  create: (payload) => api.post('/workers', payload).then((r) => r.data),
  update: (id, payload) => api.put(`/workers/${id}`, payload).then((r) => r.data),
  remove: (id) => api.delete(`/workers/${id}`),
  invite: (id) => api.post(`/workers/${id}/invite`).then((r) => r.data),
  unlink: (id) => api.delete(`/workers/${id}/link`),
}

/** Vista del trabajador: vínculos con agricultores y tareas asignadas. */
export const assignedApi = {
  links: (config) => api.get('/me/worker-links', config).then((r) => r.data),
  redeem: (code) => api.post('/me/worker-links', { code }).then((r) => r.data),
  leave: (workerId) => api.delete(`/me/worker-links/${workerId}`),
  tasks: (params, config) => api.get('/me/tasks', { params, ...config }).then((r) => r.data),
  setStatus: (taskId, status) => api.put(`/me/tasks/${taskId}/status`, { status }).then((r) => r.data),
  attachmentUrl: (taskId, attachmentId) => `${baseURL}/me/tasks/${taskId}/attachments/${attachmentId}`,
}

export const siexApi = {
  /** `assist`: añade el resumen y los próximos pasos redactados por el agente. */
  draft: (farmId, year, config, assist = true) => api.get(`/farms/${farmId}/siex/draft`, { params: { year, assist }, timeout: 90000, ...config }).then((r) => r.data),
}

export const agentApi = {
  /** @param {{ message: string, history: { role: 'user' | 'model', text: string }[] }} payload */
  chat: (payload) => api.post('/agent/chat', payload, { timeout: 90000 }).then((r) => r.data),
  /** Resumen del día (siempre local: sin coste ni terceros). */
  briefing: (config) => api.get('/agent/briefing', config).then((r) => r.data),
}

export const contactApi = {
  send: (payload) => api.post('/contact', payload).then((r) => r.data),
}

/**
 * Solo un perfil de verdad cuenta como sesión. Si `/api` no llega al backend (proxy mal configurado, backend
 * caído, «fallback» de la SPA) el servidor puede responder 200 con el index.html: tratarlo como usuario dejaba
 * la app «autenticada» con un texto y la rompía (`user.name` undefined). Así se trata como invitado.
 */
export class InvalidProfileError extends Error {
  constructor() {
    super('El servidor no ha devuelto un perfil válido. Inténtalo de nuevo en unos minutos.')
    this.name = 'InvalidProfileError'
  }
}

export function asUser(data) {
  const valid = data && typeof data === 'object' && Number.isInteger(data.id) && typeof data.name === 'string' && typeof data.role === 'string'
  if (!valid) throw new InvalidProfileError()
  return data
}

export const authApi = {
  me: (config) => api.get('/auth/me', config).then((r) => asUser(r.data)),
  login: (payload) => api.post('/auth/login', payload).then((r) => asUser(r.data)),
  register: (payload) => api.post('/auth/register', payload).then((r) => r.data),
  logout: () => api.post('/auth/logout'),
  forgotPassword: (email) => api.post('/auth/forgot-password', { email }).then((r) => r.data),
  resetPassword: (token, newPassword) => api.post('/auth/reset-password', { token, new_password: newPassword }).then((r) => r.data),
}

// Límites de las fotos de granja (el backend los vuelve a imponer leyendo el stream).
export const IMAGE_UPLOAD = { types: ['image/png', 'image/jpeg', 'image/webp'], maxBytes: 5 * 1024 * 1024 }

export const applicationsApi = {
  mine: (config) => api.get('/applications/me', config).then((r) => r.data),
  create: (payload) => api.post('/applications', payload).then((r) => r.data),
}

export const usersApi = {
  /** @param {{ name: string, birth_date: string, avatar: string | null }} profile */
  updateProfile: (profile) => api.put('/users/me', profile).then((r) => asUser(r.data)),
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
  notes: (id, config) => api.get(`/documents/${id}/notes`, config).then((r) => r.data),
  addNote: (id, payload) => api.post(`/documents/${id}/notes`, payload).then((r) => r.data),
  updateNote: (id, noteId, payload) => api.patch(`/documents/${id}/notes/${noteId}`, payload).then((r) => r.data),
  removeNote: (id, noteId) => api.delete(`/documents/${id}/notes/${noteId}`),
  /** Recordatorios pendientes: vencidos y los de los próximos `days` días. */
  reminders: (days, config) => api.get('/documents/reminders', { params: { days }, ...config }).then((r) => r.data),
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
