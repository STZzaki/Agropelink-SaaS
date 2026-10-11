import { m } from 'framer-motion'
import Avatar, { AVATARS } from '../../components/ui/Avatar.jsx'

const SPRING = { type: 'spring', stiffness: 520, damping: 38 }

/**
 * Selector de avatar: 10 círculos recortados del sprite de mascotas del campo (+ opción "iniciales").
 * Es un grupo de radios nativo: accesible con teclado (flechas) y lector de pantalla.
 * No se pueden subir fotos: solo se guarda el identificador del personaje.
 */
export default function AvatarSelector({ value, name, onChange }) {
  const options = [...AVATARS, { id: null, label: 'Sin avatar (iniciales)' }]
  return (
    <fieldset>
      <legend className="mb-3 text-sm font-medium text-slate-300">Elige tu avatar</legend>
      <div role="radiogroup" aria-label="Avatar" className="flex flex-wrap gap-x-3 gap-y-4">
        {options.map((option) => {
          const selected = value === option.id
          return (
            <label key={option.id ?? 'none'} className="group relative flex w-16 cursor-pointer flex-col items-center gap-1.5" title={option.label}>
              <input type="radio" name="avatar" value={option.id ?? ''} checked={selected} onChange={() => onChange(option.id)} className="peer sr-only" />
              <span className="relative block rounded-full p-1 transition-transform duration-300 ease-out group-hover:scale-105 group-active:scale-95 peer-focus-visible:ring-2 peer-focus-visible:ring-secondary-300">
                {selected && (
                  // El anillo se desplaza entre opciones (layoutId): transición continua, solo transform.
                  <m.span layoutId="avatar-ring" transition={SPRING} className="absolute inset-0 rounded-full shadow-btn-primary ring-2 ring-secondary-300" />
                )}
                <Avatar avatar={option.id} name={name} size="lg" className={`!h-12 !w-12 sm:!h-14 sm:!w-14 ${selected ? '' : 'opacity-75 transition-opacity duration-300 group-hover:opacity-100'}`} />
              </span>
              <span className={`w-full truncate text-center text-[11px] leading-none ${selected ? 'text-secondary-200' : 'text-slate-500'}`}>{option.id ? option.label : 'Iniciales'}</span>
            </label>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500">Por seguridad y privacidad no se pueden subir fotos: solo personajes del catálogo de Agropelink.</p>
    </fieldset>
  )
}
