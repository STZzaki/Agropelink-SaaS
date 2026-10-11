/**
 * Avatares por sprite: una sola imagen con 10 personajes (5 × 2) y `background-position` para recortar cada cara.
 * Coordenadas medidas en el original (1536 × 1024 px, círculos de r ≈ 150 px). Se sirve una copia WebP
 * optimizada (768 × 512, ~39 kB) en lugar del PNG de 1,6 MB: misma proporción, porcentajes válidos.
 * El usuario solo puede elegir uno de estos identificadores (validado también en el backend).
 */
export const SPRITE_URL = '/media/avatar-sprite.webp'
const SHEET = { width: 1536, height: 1024 }
const RADIUS = 142 // un poco menor que el círculo real: recorta el borde blanco y centra la cara

export const AVATARS = [
  { id: 'abeja', label: 'Abeja', cx: 165, cy: 313 },
  { id: 'vaca', label: 'Vaca', cx: 472, cy: 313 },
  { id: 'girasol', label: 'Girasol', cx: 775, cy: 314 },
  { id: 'aguacate', label: 'Aguacate', cx: 1080, cy: 313 },
  { id: 'mariquita', label: 'Mariquita', cx: 1381, cy: 315 },
  { id: 'tomate', label: 'Tomate', cx: 164, cy: 711 },
  { id: 'zanahoria', label: 'Zanahoria', cx: 473, cy: 711 },
  { id: 'agricultor', label: 'Agricultor', cx: 775, cy: 711 },
  { id: 'margarita', label: 'Margarita', cx: 1080, cy: 711 },
  { id: 'guisante', label: 'Guisante', cx: 1381, cy: 711 },
].map((a) => ({ ...a, style: spriteStyle(a) }))

/**
 * Estilo de recorte independiente del tamaño del círculo: la hoja se escala para que el diámetro del
 * personaje ocupe el 100 % del círculo, y la posición se expresa en % del recorrido disponible.
 */
function spriteStyle({ cx, cy }) {
  const d = RADIUS * 2
  const left = cx - RADIUS
  const top = cy - RADIUS
  return {
    backgroundImage: `url("${SPRITE_URL}")`,
    backgroundSize: `${(SHEET.width / d) * 100}% ${(SHEET.height / d) * 100}%`,
    backgroundPosition: `${(left / (SHEET.width - d)) * 100}% ${(top / (SHEET.height - d)) * 100}%`,
    backgroundRepeat: 'no-repeat',
  }
}

export const avatarById = (id) => AVATARS.find((a) => a.id === id) ?? null

export const initials = (name = '') =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((n) => n[0].toUpperCase())
    .join('') || '?'

const SIZES = { sm: 'h-8 w-8 text-xs', md: 'h-9 w-9 text-xs', lg: 'h-16 w-16 text-lg', xl: 'h-24 w-24 text-2xl' }

/** Avatar del catálogo (sprite) o, si no hay, iniciales sobre el degradado de marca. */
export default function Avatar({ avatar, name, size = 'md', className = '' }) {
  const sprite = avatarById(avatar)
  return (
    <span
      className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-slate-950 ring-1 ring-white/15 ${sprite ? 'bg-white' : 'bg-gradient-to-br from-primary-400 to-secondary-500'} ${SIZES[size]} ${className}`}
      style={sprite?.style}
      aria-hidden="true"
    >
      {!sprite && initials(name)}
    </span>
  )
}
