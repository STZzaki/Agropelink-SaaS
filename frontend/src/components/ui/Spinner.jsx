const SIZES = { sm: 'h-4 w-4 border-2', md: 'h-6 w-6 border-2', lg: 'h-10 w-10 border-4' }

export default function Spinner({ size = 'md', className = '' }) {
  return (
    <span
      role="status"
      aria-label="Cargando"
      className={`inline-block animate-spin rounded-full border-white/10 border-t-secondary-400 ${SIZES[size]} ${className}`}
    />
  )
}

export function LoadingBlock({ label = 'Cargando…' }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-12 text-secondary-300">
      <Spinner size="lg" />
      <p className="text-sm font-medium">{label}</p>
    </div>
  )
}
