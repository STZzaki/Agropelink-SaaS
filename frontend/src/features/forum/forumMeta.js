export const FORUM_CATEGORIES = [
  { id: 'plagas', label: 'Tratamientos y Plagas', description: 'Umbrales, materias activas, lucha integrada y control biológico.', accent: 'from-accent-400 to-accent-600', text: 'text-accent-200', ring: 'ring-accent-400/30', bg: 'bg-accent-500/10' },
  { id: 'riego', label: 'Riego y Eficiencia', description: 'Programación de riego, fertirrigación, sondas y ahorro de agua.', accent: 'from-secondary-400 to-secondary-600', text: 'text-secondary-200', ring: 'ring-secondary-400/30', bg: 'bg-secondary-500/10' },
  { id: 'lonjas', label: 'Cotizaciones y Lonjas', description: 'Precios en origen, alhóndigas, contratos y comercialización.', accent: 'from-primary-400 to-primary-600', text: 'text-primary-200', ring: 'ring-primary-400/30', bg: 'bg-primary-500/10' },
  { id: 'maquinaria', label: 'Maquinaria', description: 'Equipos, mantenimiento, inspecciones ITEAF y novedades.', accent: 'from-slate-300 to-slate-500', text: 'text-slate-200', ring: 'ring-white/20', bg: 'bg-white/5' },
]

export const categoryById = (id) => FORUM_CATEGORIES.find((c) => c.id === id) ?? FORUM_CATEGORIES[0]

const rtf = new Intl.RelativeTimeFormat('es', { numeric: 'auto' })
const UNITS = [
  ['year', 31536000],
  ['month', 2592000],
  ['week', 604800],
  ['day', 86400],
  ['hour', 3600],
  ['minute', 60],
]

export function timeAgo(iso) {
  const time = iso ? new Date(iso).getTime() : NaN
  if (!Number.isFinite(time)) return '' // fecha ausente: Intl.RelativeTimeFormat lanzaría RangeError con NaN
  const seconds = (time - Date.now()) / 1000
  for (const [unit, s] of UNITS) {
    if (Math.abs(seconds) >= s) return rtf.format(Math.round(seconds / s), unit)
  }
  return 'ahora mismo'
}

export const formatDate = (iso) =>
  !iso || Number.isNaN(new Date(iso).getTime()) ? '' : new Date(iso).toLocaleDateString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

// Reacciones con emoji (lista cerrada, la misma que acepta el servidor). «Me gusta» va aparte con su icono.
export const REACTIONS = [
  { id: 'heart', emoji: '❤️', label: 'Me encanta' },
  { id: 'laugh', emoji: '😂', label: 'Me hace gracia' },
  { id: 'wow', emoji: '😮', label: 'Me sorprende' },
  { id: 'thanks', emoji: '🙏', label: 'Gracias' },
  { id: 'sprout', emoji: '🌱', label: 'Buena práctica' },
]

// Emojis que se pueden insertar en el texto de una respuesta (contenido del usuario, no iconos de la interfaz).
export const COMPOSER_EMOJIS = ['👍', '👏', '🙏', '😊', '😂', '😮', '🤔', '❤️', '🌱', '🌿', '🍅', '🌶️', '🥒', '🍆', '🥬', '🍓', '🍋', '🌞', '🌧️', '💧', '🚜', '🐝', '🐛', '✅']

const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Trocea el texto para resaltar las menciones confirmadas por el servidor (`@Nombre`). React escapa el resto. */
export function splitMentions(text, mentions = []) {
  const safe = String(text ?? '')
  const valid = (mentions ?? []).filter((m) => typeof m?.name === 'string' && m.name)
  if (!valid.length) return [{ text: safe }]
  const names = [...valid].sort((a, b) => b.name.length - a.name.length)
  const re = new RegExp(`(@(?:${names.map((m) => escapeRegExp(m.name)).join('|')}))`, 'giu')
  return safe.split(re).filter(Boolean).map((part) => {
    const hit = names.find((m) => part.toLocaleLowerCase('es') === `@${m.name}`.toLocaleLowerCase('es'))
    return hit ? { text: part, mention: hit } : { text: part }
  })
}
