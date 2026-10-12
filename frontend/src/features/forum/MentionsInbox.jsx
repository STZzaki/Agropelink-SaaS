import { AtSign } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { forumApi } from '../../api.js'
import { timeAgo } from './forumMeta.js'

/** Avisos de @menciones del usuario: se leen al abrir el foro (sin sondeo) y se marcan como leídos a petición. */
export default function MentionsInbox() {
  const [data, setData] = useState(null)

  useEffect(() => {
    const controller = new AbortController()
    forumApi.mentions({ signal: controller.signal }).then(setData).catch(() => setData(null))
    return () => controller.abort()
  }, [])

  if (!data?.items.length) return null

  async function markRead() {
    try {
      await forumApi.readMentions()
      setData((d) => ({ unread: 0, items: d.items.map((m) => ({ ...m, read: true })) }))
    } catch {
      /* sin conexión: se reintentará en la próxima visita */
    }
  }

  return (
    <section aria-labelledby="mentions-title" className="mt-6 rounded-2xl bg-white/[0.03] p-4 ring-1 ring-inset ring-white/[0.08]">
      <div className="flex items-center justify-between gap-2">
        <h2 id="mentions-title" className="inline-flex items-center gap-1.5 text-sm font-semibold text-white">
          <AtSign className="h-4 w-4 text-secondary-300" aria-hidden="true" /> Menciones
          {data.unread > 0 && <span className="rounded-full bg-secondary-400 px-1.5 text-[11px] font-bold text-slate-950">{data.unread}<span className="sr-only"> sin leer</span></span>}
        </h2>
        {data.unread > 0 && <button type="button" onClick={markRead} className="text-xs text-slate-400 hover:text-white">Marcar leídas</button>}
      </div>
      <ul className="mt-3 space-y-2">
        {data.items.slice(0, 5).map((m) => (
          <li key={m.id}>
            <Link to={`/foro/${m.thread_id}`} className={`block rounded-xl px-3 py-2 text-xs transition-colors hover:bg-white/5 ${m.read ? 'text-slate-400' : 'bg-secondary-500/10 text-slate-200'}`}>
              <span className="font-semibold text-white">{m.actor.name}</span> te mencionó en <span className="line-clamp-1">«{m.thread_title}»</span>
              <span className="text-slate-500">{timeAgo(m.created_at)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
