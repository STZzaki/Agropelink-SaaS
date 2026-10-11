// Misma política que el backend (schemas.validate_password_strength).
export const PASSWORD_RULES = [
  { id: 'length', label: 'Mínimo 8 caracteres', test: (p) => p.length >= 8 && p.length <= 128 },
  { id: 'letter', label: 'Al menos una letra', test: (p) => /\p{L}/u.test(p) },
  { id: 'number', label: 'Al menos un número', test: (p) => /\d/.test(p) },
  { id: 'symbol', label: 'Al menos un símbolo (!, #, $, _…)', test: (p) => /[^\p{L}\p{N}\s]/u.test(p) },
]

export const isStrongPassword = (p) => PASSWORD_RULES.every((r) => r.test(p))

function score(p) {
  if (!p) return 0
  let s = PASSWORD_RULES.filter((r) => r.test(p)).length
  if (p.length >= 12) s += 1
  if (/[a-z]/.test(p) && /[A-Z]/.test(p)) s += 1
  return Math.min(s, 6)
}

const LEVELS = [
  { min: 0, label: 'Muy débil', bar: 'bg-accent-500', text: 'text-accent-300' },
  { min: 3, label: 'Débil', bar: 'bg-accent-400', text: 'text-accent-300' },
  { min: 4, label: 'Aceptable', bar: 'bg-secondary-400', text: 'text-secondary-300' },
  { min: 5, label: 'Fuerte', bar: 'bg-primary-400', text: 'text-primary-300' },
  { min: 6, label: 'Muy fuerte', bar: 'bg-primary-400', text: 'text-primary-300' },
]

export default function PasswordStrength({ password, id }) {
  const s = score(password)
  const level = [...LEVELS].reverse().find((l) => s >= l.min)

  return (
    <div id={id} className="mt-3" aria-live="polite">
      <div className="flex items-center gap-3">
        <div className="flex h-1.5 flex-1 gap-1" aria-hidden="true">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <span key={i} className={`h-full flex-1 rounded-full transition-colors duration-300 ${i <= s ? level.bar : 'bg-white/10'}`} />
          ))}
        </div>
        {password && <span className={`w-20 text-right text-xs font-semibold ${level.text}`}>{level.label}</span>}
      </div>
      <ul className="mt-3 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        {PASSWORD_RULES.map((r) => {
          const ok = r.test(password)
          return (
            <li key={r.id} className={`flex items-center gap-2 text-xs transition-colors ${ok ? 'text-primary-300' : 'text-slate-500'}`}>
              <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full ${ok ? 'bg-primary-500/20' : 'bg-white/5'}`} aria-hidden="true">
                {ok ? (
                  <svg className="h-2.5 w-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={4}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                ) : (
                  <span className="h-1 w-1 rounded-full bg-current" />
                )}
              </span>
              <span>
                {r.label}
                <span className="sr-only">{ok ? ': cumplido' : ': pendiente'}</span>
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
