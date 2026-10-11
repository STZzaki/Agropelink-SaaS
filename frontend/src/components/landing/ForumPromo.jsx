import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { forumApi } from '../../api.js'
import { FORUM_CATEGORIES, timeAgo } from '../../features/forum/forumMeta.js'
import Reveal from './Reveal.jsx'
import SectionHeading from './SectionHeading.jsx'
import { ArrowRightIcon } from './icons.jsx'

export default function ForumPromo() {
  const [stats, setStats] = useState({})
  const [latest, setLatest] = useState([])

  useEffect(() => {
    const controller = new AbortController()
    forumApi
      .categories({ signal: controller.signal })
      .then((rows) => setStats(Object.fromEntries(rows.map((r) => [r.category, r.thread_count]))))
      .catch(() => {})
    forumApi
      .list({ limit: 3 }, { signal: controller.signal })
      .then((d) => setLatest(d.items))
      .catch(() => {})
    return () => controller.abort()
  }, [])

  return (
    <section id="foro" className="relative scroll-mt-24 overflow-hidden border-t border-white/5 py-24 sm:py-32">
      <div className="pointer-events-none absolute -right-40 top-20 h-96 w-96 glow-secondary" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr] lg:items-center">
          <div>
            <SectionHeading
              eyebrow="Comunidad y Foro Agropelink"
              title="Agricultores que resuelven dudas entre agricultores"
              description="Comparte experiencias sobre plagas, riego, precios y maquinaria con productores y técnicos de tu zona. Leer es libre; para publicar solo necesitas una cuenta."
            />
            <Reveal className="mt-8 flex flex-col gap-3 sm:flex-row">
              <Link to="/foro" className="btn-primary group h-12 px-7 text-sm">
                Entrar al foro <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </Link>
              <Link to="/register" className="btn-secondary h-12 px-7 text-sm">
                Crear cuenta gratis
              </Link>
            </Reveal>
          </div>

          <div className="space-y-4">
            <ul className="grid gap-3 sm:grid-cols-2">
              {FORUM_CATEGORIES.map((c, i) => (
                <Reveal as="li" key={c.id} delay={i * 70}>
                  <Link to={`/foro?categoria=${c.id}`} className="surface-interactive group block h-full rounded-2xl p-6 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400">
                    <span className={`block h-1 w-10 rounded-full bg-gradient-to-r ${c.accent}`} aria-hidden="true" />
                    <p className="mt-4 font-semibold text-white">{c.label}</p>
                    <p className="mt-1 text-xs leading-relaxed text-slate-400">{c.description}</p>
                    <p className="mt-3 text-xs font-medium text-slate-500">
                      {stats[c.id] ?? 0} {stats[c.id] === 1 ? 'tema' : 'temas'}
                    </p>
                  </Link>
                </Reveal>
              ))}
            </ul>

            {latest.length > 0 && (
              <Reveal className="surface rounded-2xl p-6">
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-secondary-300">Últimos temas</p>
                <ul className="mt-3 divide-y divide-white/5">
                  {latest.map((t) => (
                    <li key={t.id}>
                      <Link to={`/foro/${t.id}`} className="flex items-center justify-between gap-3 py-3 text-sm hover:text-white">
                        <span className="truncate text-slate-200">{t.title}</span>
                        <span className="shrink-0 text-xs text-slate-500">{t.reply_count} resp. · {timeAgo(t.last_activity_at)}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </Reveal>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}
