import { BellRing, Check } from 'lucide-react'
import { useEffect, useState } from 'react'
import { documentsApi, getErrorMessage } from '../../api.js'
import useApi from '../../hooks/useApi.js'

const day = (iso) => new Date(`${iso}T00:00:00`).toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short' })

/** Recordatorios de las notas de documentos: vencidos y próximos 30 días. Se oculta si no hay ninguno. */
export default function RemindersPanel({ refreshKey, onChanged }) {
  const reminders = useApi((signal) => documentsApi.reminders(30, { signal }))
  const [error, setError] = useState(null)

  const { reload } = reminders
  useEffect(() => {
    if (refreshKey) reload()
  }, [refreshKey, reload])

  async function markDone(r) {
    setError(null)
    try {
      await documentsApi.updateNote(r.document_id, r.id, { done: true })
      reminders.setData((list) => (list ?? []).filter((x) => x.id !== r.id))
      onChanged()
    } catch (err) {
      setError(getErrorMessage(err))
    }
  }

  const list = reminders.data ?? []
  if (!list.length) return null
  const overdue = list.filter((r) => r.overdue).length

  return (
    <section aria-labelledby="reminders-title" className="card-glass mb-6 p-5">
      <h2 id="reminders-title" className="flex flex-wrap items-center gap-2 text-sm font-semibold text-white">
        <BellRing className="h-4 w-4 text-secondary-300" aria-hidden="true" /> Recordatorios de documentos
        <span className="font-normal text-slate-400">· {list.length} en los próximos 30 días{overdue ? `, ${overdue} vencido${overdue > 1 ? 's' : ''}` : ''}</span>
      </h2>
      {error && <p role="alert" className="mt-2 text-xs text-accent-200">{error}</p>}
      <ul className="mt-3 divide-y divide-white/[0.06]">
        {list.map((r) => (
          <li key={r.id} className="flex items-start gap-3 py-2.5">
            <span className={`mt-0.5 shrink-0 rounded-md px-2 py-0.5 text-[11px] font-semibold tabular-nums ${r.overdue ? 'bg-accent-500/15 text-accent-200' : 'bg-secondary-500/10 text-secondary-200'}`}>
              {r.overdue ? 'Vencido · ' : ''}{day(r.remind_on)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="line-clamp-2 whitespace-pre-line text-sm text-slate-200">{r.body}</p>
              <p className="text-[11px] text-slate-500"><span className="font-mono">{r.reference}</span> · {r.filename}</p>
            </div>
            <button type="button" onClick={() => markDone(r)} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-slate-300 hover:bg-white/5 hover:text-primary-200">
              <Check className="h-3.5 w-3.5" aria-hidden="true" /> Hecho
            </button>
          </li>
        ))}
      </ul>
    </section>
  )
}
