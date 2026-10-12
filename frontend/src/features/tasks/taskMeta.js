// Tipos de labor y su color en el calendario. Orden FIJO validado con dataviz/validate_palette.js sobre la
// superficie oscura #1c2623 (7 tonos: ΔE CVD peor 9,2 protan; visión normal ≥ 18; contraste ≥ 3:1).
// «Otra» va en gris neutro: no es una categoría con identidad propia. El color nunca va solo: cada bloque
// lleva el título de la tarea y hay leyenda.
export const TASK_CATEGORIES = [
  { id: 'irrigation', label: 'Riego', color: '#3d95d6' },
  { id: 'treatment', label: 'Tratamiento', color: '#c6804b' },
  { id: 'planting', label: 'Siembra / plantación', color: '#24a58c' },
  { id: 'pruning', label: 'Poda', color: '#8a7fd6' },
  { id: 'harvest', label: 'Recolección', color: '#b38a1e' },
  { id: 'maintenance', label: 'Mantenimiento', color: '#c4688f' },
  { id: 'fertilization', label: 'Abonado', color: '#6aa84f' },
  { id: 'other', label: 'Otra', color: '#6f8379' },
]
export const taskCategory = (id) => TASK_CATEGORIES.find((c) => c.id === id) ?? TASK_CATEGORIES.at(-1)

export const WORKER_POSITIONS = [
  { id: 'manager', label: 'Encargado/a' },
  { id: 'laborer', label: 'Peón agrícola' },
  { id: 'tractor_driver', label: 'Tractorista' },
  { id: 'applicator', label: 'Aplicador/a de fitosanitarios' },
  { id: 'technician', label: 'Técnico/a' },
  { id: 'admin', label: 'Administración' },
  { id: 'other', label: 'Otro' },
]
export const positionLabel = (id) => WORKER_POSITIONS.find((p) => p.id === id)?.label ?? id

export const WEEKDAYS = [
  { id: 'mon', short: 'L', label: 'Lunes' },
  { id: 'tue', short: 'M', label: 'Martes' },
  { id: 'wed', short: 'X', label: 'Miércoles' },
  { id: 'thu', short: 'J', label: 'Jueves' },
  { id: 'fri', short: 'V', label: 'Viernes' },
  { id: 'sat', short: 'S', label: 'Sábado' },
  { id: 'sun', short: 'D', label: 'Domingo' },
]

// --- Fechas (siempre en local, sin desfase de zona: 'YYYY-MM-DD' ↔ Date a medianoche local) -----------

export const toISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
export const fromISO = (iso) => {
  const [y, m, d] = String(iso ?? '').split('-').map(Number) // fecha ausente → Invalid Date, sin romper
  return new Date(y, m - 1, d)
}
export const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
export const dayDiff = (a, b) => Math.round((fromISO(toISO(b)) - fromISO(toISO(a))) / 86_400_000)
export const taskEnd = (task) => task.end_date ?? task.date

const range = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short' })
export function formatSpan(task) {
  const start = fromISO(task.date)
  if (!task.end_date || task.end_date === task.date) return range.format(start)
  const days = dayDiff(start, fromISO(task.end_date)) + 1
  return `${range.format(start)} → ${range.format(fromISO(task.end_date))} · ${days} días`
}
