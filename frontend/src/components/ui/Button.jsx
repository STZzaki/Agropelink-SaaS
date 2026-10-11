import Spinner from './Spinner.jsx'

// Botones premium sobre fondo casi negro: degradado ligero + resplandor de marca en el principal,
// superficies translúcidas con borde fino en el resto. Solo se animan transform, sombra, color y filtro.
const BASE =
  'relative inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold ' +
  'transition-[transform,box-shadow,background-color,border-color,color,filter] duration-300 ease-out ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-offset-slate-950 ' +
  'active:scale-[0.97] active:duration-100 disabled:pointer-events-none disabled:opacity-50'

const VARIANTS = {
  primary:
    'bg-gradient-to-b from-primary-400 to-secondary-500 text-slate-950 shadow-btn-primary ' +
    'hover:-translate-y-px hover:shadow-btn-primary-hover hover:brightness-110 focus-visible:ring-secondary-300',
  secondary:
    'border border-secondary-400/30 bg-secondary-500/15 text-secondary-100 shadow-btn ' +
    'hover:-translate-y-px hover:border-secondary-300/50 hover:bg-secondary-500/25 hover:shadow-btn-hover focus-visible:ring-secondary-300',
  outline:
    'border border-white/10 bg-white/[0.03] text-slate-200 shadow-btn ' +
    'hover:-translate-y-px hover:border-white/20 hover:bg-white/[0.07] hover:text-white hover:shadow-btn-hover focus-visible:ring-white/40',
  danger:
    'border border-red-400/30 bg-red-500/15 text-red-200 shadow-btn ' +
    'hover:-translate-y-px hover:border-red-300/50 hover:bg-red-500/25 hover:shadow-btn-hover focus-visible:ring-red-300',
}

export default function Button({ variant = 'primary', loading = false, disabled, className = '', children, ...props }) {
  const spinner = variant === 'primary' ? 'border-slate-950/25 border-t-slate-950' : 'border-white/20 border-t-white'
  return (
    <button type="button" disabled={disabled || loading} className={`${BASE} ${VARIANTS[variant]} ${className}`} {...props}>
      {loading && <Spinner size="sm" className={spinner} />}
      {children}
    </button>
  )
}
