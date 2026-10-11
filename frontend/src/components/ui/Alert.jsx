const VARIANTS = {
  error: 'border-accent-400/25 bg-accent-500/10 text-accent-100',
  success: 'border-primary-400/25 bg-primary-500/10 text-primary-100',
  info: 'border-secondary-400/25 bg-secondary-500/10 text-secondary-100',
}

const ICON_TONE = { error: 'text-accent-300', success: 'text-primary-300', info: 'text-secondary-300' }

const ICONS = {
  error: 'M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z',
  success: 'M5 13l4 4L19 7',
  info: 'M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z',
}

export default function Alert({ variant = 'info', children, onRetry, onClose }) {
  return (
    <div role={variant === 'error' ? 'alert' : 'status'} className={`flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${VARIANTS[variant]}`}>
      <svg className={`mt-0.5 h-5 w-5 shrink-0 ${ICON_TONE[variant]}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
        <path strokeLinecap="round" strokeLinejoin="round" d={ICONS[variant]} />
      </svg>
      <div className="flex-1">{children}</div>
      {onRetry && (
        <button type="button" onClick={onRetry} className="font-semibold underline underline-offset-2 transition-opacity duration-300 hover:opacity-80">
          Reintentar
        </button>
      )}
      {onClose && (
        <button type="button" onClick={onClose} aria-label="Cerrar aviso" className="opacity-70 transition-opacity duration-300 hover:opacity-100">
          ×
        </button>
      )}
    </div>
  )
}
