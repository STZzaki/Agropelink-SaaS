// Campo oscuro con borde translúcido y foco "elástico" (halo de marca que crece). Sin desenfoque en vivo.
export const inputClass =
  'block w-full rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-2.5 text-sm text-white shadow-inner-soft ' +
  'placeholder:text-slate-500 transition-[border-color,background-color,box-shadow] duration-300 ease-out ' +
  'hover:border-white/20 hover:bg-white/[0.06] focus:border-secondary-400/60 focus:bg-white/[0.06] focus:outline-none focus:shadow-focus-ring ' +
  'disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-accent-400/60 aria-[invalid=true]:shadow-error-ring ' +
  // Controles nativos (lista del <select>, calendario, barras) en su variante oscura.
  '[color-scheme:dark]'

// La lista desplegada de un <select> la pinta el sistema: hereda `text-white` pero NO el fondo translúcido,
// y en Windows/Chrome quedaba texto blanco sobre fondo blanco. Toda <option> lleva fondo y texto explícitos.
export const optionClass = 'bg-gray-800 text-white'

export default function FormField({ id, label, error, hint, children, className = '' }) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-slate-300">
        {label}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} className="field-error mt-1.5 text-xs font-medium text-accent-300">
          {error}
        </p>
      ) : (
        hint && <p className="mt-1.5 text-xs text-slate-500">{hint}</p>
      )}
    </div>
  )
}
