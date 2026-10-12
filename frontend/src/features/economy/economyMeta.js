// Categorías de coste (mismo catálogo que `ExpenseCategory` en backend/schemas.py).
export const EXPENSE_CATEGORIES = [
  { id: 'seeds', label: 'Semillas y plantel' },
  { id: 'fertilizers', label: 'Fertilizantes' },
  { id: 'phytosanitary', label: 'Fitosanitarios' },
  { id: 'water', label: 'Agua de riego' },
  { id: 'energy', label: 'Energía' },
  { id: 'fuel', label: 'Combustible' },
  { id: 'labor', label: 'Mano de obra' },
  { id: 'machinery', label: 'Maquinaria' },
  { id: 'services', label: 'Servicios externos' },
  { id: 'other', label: 'Otros' },
]
export const categoryLabel = (id) => EXPENSE_CATEGORIES.find((c) => c.id === id)?.label ?? id

// Costes fijos iniciales habituales al dar de alta la finca (el usuario puede elegir cualquier categoría).
export const FIXED_COST_CATEGORIES = ['seeds', 'fertilizers', 'phytosanitary', 'machinery', 'other']

export const QUARTERS = ['T1 · ene–mar', 'T2 · abr–jun', 'T3 · jul–sep', 'T4 · oct–dic']

const eur = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 2 })
const eur0 = new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
/** Importe exacto (con céntimos) para el desglose; `compact` sin decimales para ejes y titulares. */
export const money = (v, compact = false) => (compact ? eur0 : eur).format(v ?? 0)

export const parseAmount = (v) => {
  const s = String(v ?? '').trim().replace(/\s/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.')
  return s === '' ? null : Number(s)
}

export const today = () => new Date().toISOString().slice(0, 10)

/** Duración en días (ambos incluidos) de un periodo de cosecha; null si falta alguna fecha o no es válido. */
export function durationDays(start, end) {
  if (!start || !end) return null
  const days = Math.round((new Date(`${end}T00:00:00`) - new Date(`${start}T00:00:00`)) / 86_400_000) + 1
  return days > 0 ? days : null
}
