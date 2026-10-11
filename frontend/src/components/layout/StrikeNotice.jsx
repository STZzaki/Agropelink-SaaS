import { useAuth } from '../../auth/AuthContext.jsx'

/** Aviso persistente en el panel cuando la cuenta ya tiene una advertencia oficial (aceptada). */
export default function StrikeNotice() {
  const { user } = useAuth()
  if (!user?.warnings_count) return null

  return (
    <div role="status" className="border-b border-accent-400/30 bg-accent-500/10">
      <p className="mx-auto max-w-6xl px-4 py-2.5 text-sm text-accent-200 sm:px-6 lg:px-8">
        <strong className="font-semibold">Advertencia oficial vigente:</strong> tu cuenta tiene {user.warnings_count}{' '}
        {user.warnings_count === 1 ? 'advertencia' : 'advertencias'} por incumplir las normas de la comunidad. Reincidir supondrá la
        expulsión permanente de Agropelink.
      </p>
    </div>
  )
}
