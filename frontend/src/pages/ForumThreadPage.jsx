import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { forumApi, getErrorMessage } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import AdminPostTools from '../features/forum/AdminPostTools.jsx'
import MediaGallery from '../features/forum/MediaGallery.jsx'
import ReactionBar from '../features/forum/ReactionBar.jsx'
import ReplyComposer from '../features/forum/ReplyComposer.jsx'
import ReportDialog from '../features/forum/ReportDialog.jsx'
import { categoryById, formatDate, splitMentions, timeAgo } from '../features/forum/forumMeta.js'
import usePageMeta from '../hooks/usePageMeta.js'
import { ArrowLeft, Flag } from 'lucide-react'

/** Texto plano con las menciones confirmadas por el servidor resaltadas (React escapa todo lo demás). */
function Body({ text, mentions }) {
  return (
    <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300 sm:text-base">
      {splitMentions(text, mentions).map((part, i) =>
        part.mention ? <span key={i} className="rounded bg-secondary-500/15 px-0.5 font-semibold text-secondary-200">{part.text}</span> : part.text,
      )}
    </p>
  )
}

function Post({ author, date, body, mentions, highlight, onReport, media, adminTools, reactionBar }) {
  return (
    <article className={`rounded-2xl border p-5 sm:p-6 ${highlight ? 'border-secondary-400/25 bg-secondary-500/[0.04]' : 'border-white/10 bg-white/[0.02]'}`}>
      {/* Nombre AL LADO del avatar, en la misma línea que la fecha. */}
      <header className="flex items-center gap-2.5">
        <Avatar avatar={author.avatar} name={author.name} />
        <p className="flex min-w-0 flex-wrap items-baseline gap-x-2">
          <span className="truncate text-sm font-semibold text-white">{author.name}</span>
          <time dateTime={date} title={formatDate(date)} className="text-xs text-slate-500">{timeAgo(date)}</time>
        </p>
        {onReport && (
          <button
            type="button"
            onClick={onReport}
            className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-white/5 hover:text-accent-200"
          >
            <Flag className="h-3.5 w-3.5" aria-hidden="true" />
            Reportar
          </button>
        )}
      </header>
      <Body text={body} mentions={mentions} />
      <MediaGallery media={media} />
      {reactionBar}
      {adminTools}
    </article>
  )
}

export default function ForumThreadPage() {
  const { id } = useParams()
  const { status, user } = useAuth()
  const location = useLocation()
  const [thread, setThread] = useState(null)
  const [state, setState] = useState('loading')
  const [error, setError] = useState(null)
  const [reportTarget, setReportTarget] = useState(null)
  // Se puede denunciar cualquier publicación ajena (con sesión iniciada).
  // Visible en toda publicación ajena; sin sesión lleva al login y vuelve a este tema.
  const navigate = useNavigate()
  const reportable = (author) => author.id !== user?.id
  const isAdmin = user?.role === 'admin'
  const tools = (kind, postId, author, onDeleted) =>
    isAdmin ? <AdminPostTools kind={kind} postId={postId} author={author} isSelf={author.id === user.id} onDeleted={onDeleted} /> : null
  const openReport = (target) =>
    status === 'authenticated' ? setReportTarget(target) : navigate('/login', { state: { from: location.pathname } })

  usePageMeta({
    title: thread ? `${thread.title} · Foro` : 'Foro de agricultores',
    description: thread
      ? `${thread.body.replace(/\s+/g, ' ').slice(0, 150)}${thread.body.length > 150 ? '…' : ''}`
      : 'Tema del foro de agricultores de Agropelink.',
    noindex: state === 'notfound',
  })

  useEffect(() => {
    const controller = new AbortController()
    if (!/^\d+$/.test(id ?? '')) {
      setState('notfound')
      return
    }
    setState('loading')
    forumApi
      .get(id, { signal: controller.signal })
      .then((t) => {
        setThread(t)
        setState('ok')
      })
      .catch((err) => {
        if (err?.name === 'CanceledError') return
        if (err?.response?.status === 404) setState('notfound')
        else {
          setError(getErrorMessage(err))
          setState('error')
        }
      })
    return () => controller.abort()
  }, [id])

  const requireLogin = () => navigate('/login', { state: { from: location.pathname } })
  const reactionBar = (replyId, reactions) => (
    <ReactionBar
      threadId={thread.id}
      replyId={replyId}
      reactions={reactions}
      canReact={status === 'authenticated'}
      onRequireLogin={requireLogin}
      onChange={(next) =>
        setThread((t) =>
          replyId === null ? { ...t, reactions: next } : { ...t, replies: t.replies.map((r) => (r.id === replyId ? { ...r, reactions: next } : r)) },
        )
      }
    />
  )

  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6 sm:py-16">
      <Link to="/foro" className="inline-flex items-center gap-1.5 text-sm text-slate-400 hover:text-white">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Volver al foro
      </Link>

      {state === 'loading' && (
        <div className="mt-8 space-y-4" aria-hidden="true">
          <div className="skeleton h-8 w-2/3 rounded-lg" />
          <div className="skeleton h-40 rounded-2xl" />
        </div>
      )}
      {state === 'notfound' && (
        <div className="mt-10 rounded-2xl border border-dashed border-white/15 p-10 text-center">
          <p className="font-medium text-white">Este tema no existe o ha sido eliminado.</p>
        </div>
      )}
      {state === 'error' && <p role="alert" className="mt-8 rounded-2xl border border-accent-400/30 bg-accent-500/10 p-4 text-sm text-accent-100">{error}</p>}

      {state === 'ok' && thread && (() => {
        const cat = categoryById(thread.category)
        return (
          <>
            <div className="mt-8">
              <div className="flex flex-wrap items-center gap-2">
                <Link to={`/foro?categoria=${cat.id}`} className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${cat.bg} ${cat.text} ${cat.ring}`}>{cat.label}</Link>
                {thread.tags.map((t) => <span key={t} className="rounded-full bg-white/5 px-2 py-0.5 text-xs text-slate-400">#{t}</span>)}
              </div>
              <h1 className="mt-3 text-2xl font-semibold leading-tight tracking-tight text-white sm:text-3xl">{thread.title}</h1>
            </div>

            <div className="mt-8 space-y-4">
              <Post
                author={thread.author}
                date={thread.created_at}
                body={thread.body}
                mentions={thread.mentions}
                media={thread.media}
                reactionBar={reactionBar(null, thread.reactions)}
                highlight
                onReport={reportable(thread.author) ? () => openReport({ threadId: thread.id, author: thread.author.name }) : undefined}
                adminTools={tools('thread', thread.id, thread.author, () => navigate('/foro', { replace: true }))}
              />
              <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
                {status === 'authenticated' ? (
                  <ReplyComposer
                    threadId={thread.id}
                    onPosted={(created) => setThread((t) => ({ ...t, replies: [created, ...t.replies], last_activity_at: created.created_at }))}
                  />
                ) : (
                  <p className="text-center text-sm text-slate-400">
                    <Link to="/login" state={{ from: location.pathname }} className="font-semibold text-secondary-300 hover:text-secondary-200">Inicia sesión</Link>{' '}
                    o <Link to="/register" state={{ from: location.pathname }} className="font-semibold text-secondary-300 hover:text-secondary-200">crea una cuenta</Link> para responder.
                  </p>
                )}
              </div>
              <h2 className="pt-4 text-sm font-semibold text-slate-300">
                {thread.replies.length} {thread.replies.length === 1 ? 'respuesta' : 'respuestas'}
                {thread.replies.length > 1 && <span className="ml-2 font-normal text-slate-500">· más recientes primero</span>}
              </h2>
              {thread.replies.map((r) => (
                <Post
                  key={r.id}
                  author={r.author}
                  date={r.created_at}
                  body={r.body}
                  mentions={r.mentions}
                  media={r.media}
                  reactionBar={reactionBar(r.id, r.reactions)}
                  onReport={reportable(r.author) ? () => openReport({ threadId: thread.id, replyId: r.id, author: r.author.name }) : undefined}
                  adminTools={tools('reply', r.id, r.author, () => setThread((t) => ({ ...t, replies: t.replies.filter((x) => x.id !== r.id) })))}
                />
              ))}
            </div>

          </>
        )
      })()}
      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  )
}
