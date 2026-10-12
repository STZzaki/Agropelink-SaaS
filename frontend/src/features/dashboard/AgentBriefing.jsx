import { AlertTriangle, ArrowRight, CheckCircle2, Info, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { agentApi } from '../../api.js'
import useApi from '../../hooks/useApi.js'

// Estado con icono + texto (nunca solo color).
const LEVEL = {
  alert: { icon: AlertTriangle, cls: 'text-accent-200', label: 'Atención' },
  warning: { icon: AlertTriangle, cls: 'text-accent-300', label: 'Aviso' },
  info: { icon: Info, cls: 'text-secondary-200', label: 'Info' },
  ok: { icon: CheckCircle2, cls: 'text-primary-200', label: 'En orden' },
}

/** «Hoy, según Agropelink AI»: lo prioritario de sensores, tareas, documentos y presupuesto. Una sola petición local. */
export default function AgentBriefing() {
  const briefing = useApi((signal) => agentApi.briefing({ signal }))
  const items = briefing.data?.items ?? []
  if (briefing.error || (!briefing.loading && !items.length)) return null

  return (
    <section aria-labelledby="briefing-title" className="card-glass mb-8 p-5">
      <h2 id="briefing-title" className="flex items-center gap-2 text-sm font-semibold text-white">
        <Sparkles className="h-4 w-4 text-secondary-300" aria-hidden="true" /> Hoy, según Agropelink AI
      </h2>
      {briefing.loading && !briefing.data ? (
        <div className="mt-3 space-y-2" aria-hidden="true">
          {[0, 1].map((i) => <div key={i} className="skeleton h-5 rounded-md" />)}
        </div>
      ) : (
        <ul className="mt-3 space-y-2">
          {items.map((item) => {
            const level = LEVEL[item.level] ?? LEVEL.info
            const content = (
              <>
                <level.icon className={`mt-0.5 h-4 w-4 shrink-0 ${level.cls}`} aria-hidden="true" />
                <span className="flex-1"><span className="sr-only">{level.label}: </span>{item.text}</span>
                {item.link && <ArrowRight className="mt-0.5 h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />}
              </>
            )
            return (
              <li key={`${item.area}-${item.text}`}>
                {item.link ? (
                  <Link to={item.link} className="group flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm text-slate-200 transition-colors hover:bg-white/[0.04]">{content}</Link>
                ) : (
                  <p className="flex items-start gap-2.5 px-2 py-1.5 text-sm text-slate-200">{content}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
