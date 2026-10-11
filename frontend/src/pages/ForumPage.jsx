import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { forumApi, getErrorMessage } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import NewThreadModal from '../features/forum/NewThreadModal.jsx'
import { FORUM_CATEGORIES, categoryById, timeAgo } from '../features/forum/forumMeta.js'
import usePageMeta from '../hooks/usePageMeta.js'
import { ArrowRight, Paperclip } from 'lucide-react'

const PAGE_SIZE = 15

function ThreadCard({ thread }) {
  const cat = categoryById(thread.category)
  return (
    <li>
      <Link
        to={`/foro/${thread.id}`}
        className="surface-interactive group flex gap-4 rounded-2xl p-4 focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400 sm:p-6"
      >
        <Avatar avatar={thread.author.avatar} name={thread.author.name} className="!hidden !h-10 !w-10 sm:!inline-flex" />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${cat.bg} ${cat.text} ${cat.ring}`}>{cat.label}</span>
            {thread.tags.map((t) => (
              <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">#{t}</span>
            ))}
          </div>
          <h3 className="mt-2 font-semibold text-white group-hover:text-secondary-200">{thread.title}</h3>
          <p className="mt-1 line-clamp-2 text-sm text-slate-400">{thread.excerpt}</p>
          <p className="mt-3 text-xs text-slate-500">
            <span className="text-slate-300">{thread.author.name}</span> · {timeAgo(thread.created_at)}
            {thread.last_activity_at !== thread.created_at && <> · última actividad {timeAgo(thread.last_activity_at)}</>}
            {thread.media_count > 0 && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[11px] text-slate-400">
                <Paperclip className="h-3 w-3" aria-hidden="true" /> {thread.media_count} {thread.media_count === 1 ? 'adjunto' : 'adjuntos'}
              </span>
            )}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-center justify-center rounded-xl border border-white/10 px-3 py-2 text-center">
          <span className="text-lg font-semibold tabular-nums text-white">{thread.reply_count}</span>
          <span className="text-[10px] text-slate-500">{thread.reply_count === 1 ? 'respuesta' : 'respuestas'}</span>
        </div>
      </Link>
    </li>
  )
}

export default function ForumPage() {
  const { status } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const [params, setParams] = useSearchParams()
  const category = FORUM_CATEGORIES.some((c) => c.id === params.get('categoria')) ? params.get('categoria') : ''
  const [query, setQuery] = useState(params.get('q') ?? '')
  const [debounced, setDebounced] = useState(query)
  const [data, setData] = useState({ items: [], total: 0 })
  const [page, setPage] = useState(0)
  const [state, setState] = useState('loading')
  const [error, setError] = useState(null)
  const [modalOpen, setModalOpen] = useState(false)
  const [reloadKey, setReloadKey] = useState(0)

  usePageMeta({
    title: 'Foro de agricultores',
    description: 'Comunidad Agropelink: dudas y experiencias sobre plagas y tratamientos, riego eficiente, cotizaciones de lonja y maquinaria agrícola.',
    path: '/foro',
  })

  useEffect(() => {
    const id = setTimeout(() => setDebounced(query.trim()), 350)
    return () => clearTimeout(id)
  }, [query])

  useEffect(() => setPage(0), [category, debounced])

  useEffect(() => {
    const controller = new AbortController()
    setState('loading')
    forumApi
      .list(
        { category: category || undefined, q: debounced.length >= 2 ? debounced : undefined, limit: PAGE_SIZE, offset: page * PAGE_SIZE },
        { signal: controller.signal },
      )
      .then((d) => {
        setData((prev) => (page === 0 ? d : { items: [...prev.items, ...d.items], total: d.total }))
        setState('ok')
      })
      .catch((err) => {
        if (err?.name === 'CanceledError') return
        setError(getErrorMessage(err))
        setState('error')
      })
    return () => controller.abort()
  }, [category, debounced, page, reloadKey])

  function selectCategory(id) {
    const next = new URLSearchParams(params)
    if (id) next.set('categoria', id)
    else next.delete('categoria')
    setParams(next, { replace: true })
  }

  function openNewThread() {
    if (status !== 'authenticated') {
      navigate('/login', { state: { from: location.pathname + location.search } })
      return
    }
    setModalOpen(true)
  }

  return (
    <div className="relative">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-80 bg-gradient-to-b from-secondary-500/10 to-transparent" aria-hidden="true" />
      <div className="relative mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary-400">Comunidad</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">Foro de agricultores</h1>
            <p className="mt-2 max-w-xl text-slate-400">Pregunta, comparte y aprende con productores y técnicos.</p>
          </div>
          <button
            type="button"
            onClick={openNewThread}
            className="btn-primary h-12 px-6 text-sm"
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" d="M12 5v14M5 12h14" /></svg>
            {status === 'authenticated' ? 'Nuevo tema' : 'Inicia sesión para publicar'}
          </button>
        </div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[16rem_1fr]">
          <aside>
            <nav aria-label="Categorías del foro" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
              {[{ id: '', label: 'Todos los temas' }, ...FORUM_CATEGORIES].map((c) => {
                const active = category === c.id
                return (
                  <button
                    key={c.id || 'all'}
                    type="button"
                    onClick={() => selectCategory(c.id)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex shrink-0 items-center gap-2.5 whitespace-nowrap rounded-xl px-4 py-2.5 text-left text-sm font-medium transition-colors lg:w-full ${
                      active ? 'bg-white/10 text-white' : 'text-slate-400 hover:bg-white/5 hover:text-white'
                    }`}
                  >
                    {c.accent && <span className={`h-2 w-2 rounded-full bg-gradient-to-r ${c.accent}`} aria-hidden="true" />}
                    {c.label}
                  </button>
                )
              })}
            </nav>
          </aside>

          <div>
            <div className="relative">
              <label htmlFor="forum-search" className="sr-only">Buscar en el foro</label>
              <svg className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <circle cx="11" cy="11" r="7" /><path strokeLinecap="round" d="M20 20l-3.5-3.5" />
              </svg>
              <input
                id="forum-search"
                type="search"
                maxLength={80}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Buscar temas…"
                className="block w-full rounded-xl border border-white/10 bg-white/[0.04] py-3 pl-11 pr-4 text-sm text-white placeholder:text-slate-500 focus:border-secondary-400/60 focus:outline-none focus:ring-2 focus:ring-secondary-400/20"
              />
            </div>

            <p className="mt-4 text-xs text-slate-500" aria-live="polite">
              {state === 'ok' && `${data.total} ${data.total === 1 ? 'tema' : 'temas'}`}
            </p>

            {state === 'error' && (
              <div className="mt-4 rounded-2xl border border-accent-400/30 bg-accent-500/10 p-4 text-sm text-accent-100">
                {error}{' '}
                <button type="button" onClick={() => setReloadKey((k) => k + 1)} className="font-semibold underline underline-offset-2">Reintentar</button>
              </div>
            )}

            {state === 'loading' && page === 0 ? (
              <ul className="mt-3 space-y-3" aria-hidden="true">
                {[0, 1, 2].map((i) => <li key={i} className="skeleton h-32 rounded-2xl" />)}
              </ul>
            ) : data.items.length === 0 && state === 'ok' ? (
              <div className="mt-3 rounded-2xl border border-dashed border-white/15 p-10 text-center">
                <p className="font-medium text-white">{debounced ? 'No hay temas que coincidan con tu búsqueda.' : 'Todavía no hay temas en esta categoría.'}</p>
                <p className="mt-1 text-sm text-slate-400">¡Sé el primero en abrir la conversación!</p>
                <button type="button" onClick={openNewThread} className="mt-5 inline-flex items-center gap-1.5 text-sm font-semibold text-secondary-300 hover:text-secondary-200">Crear un tema <ArrowRight className="h-4 w-4" aria-hidden="true" /></button>
              </div>
            ) : (
              <ul key={`${category}|${debounced}`} className="swap-in mt-4 space-y-4">
                {data.items.map((t) => <ThreadCard key={t.id} thread={t} />)}
              </ul>
            )}

            {data.items.length < data.total && state !== 'error' && (
              <div className="mt-6 text-center">
                <button type="button" onClick={() => setPage((p) => p + 1)} disabled={state === 'loading'} className="btn-secondary h-11 px-6 text-sm disabled:opacity-60">
                  {state === 'loading' ? 'Cargando…' : 'Cargar más temas'}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      <NewThreadModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        defaultCategory={category}
        onCreated={(thread) => navigate(`/foro/${thread.id}`)}
      />
    </div>
  )
}
