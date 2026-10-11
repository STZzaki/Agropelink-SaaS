import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { forumApi, getErrorMessage } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import AdminPostTools from '../features/forum/AdminPostTools.jsx'
import MediaGallery from '../features/forum/MediaGallery.jsx'
import ReportDialog from '../features/forum/ReportDialog.jsx'
import { categoryById, formatDate, timeAgo } from '../features/forum/forumMeta.js'
import usePageMeta from '../hooks/usePageMeta.js'
import { ArrowLeft, Flag } from 'lucide-react'

function Post({ author, date, body, highlight, onReport, media, adminTools }) {
  return (
    <article className={`rounded-2xl border p-5 sm:p-6 ${highlight ? 'border-secondary-400/25 bg-secondary-500/[0.04]' : 'border-white/10 bg-white/[0.02]'}`}>
      <header className="flex items-center gap-3">
        <Avatar avatar={author.avatar} name={author.name} />
        <div>
          <p className="text-sm font-semibold text-white">{author.name}</p>
          <time dateTime={date} title={formatDate(date)} className="text-xs text-slate-500">{timeAgo(date)}</time>
        </div>
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
      {/* Texto plano: React escapa el contenido de los usuarios. */}
      <p className="mt-4 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-300 sm:text-base">{body}</p>
      <MediaGallery media={media} />
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
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [replyError, setReplyError] = useState(null)
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

  async function handleReply(e) {
    e.preventDefault()
    const body = reply.trim()
    if (body.length < 2) {
      setReplyError('Escribe una respuesta.')
      return
    }
    setSending(true)
    setReplyError(null)
    try {
      const created = await forumApi.reply(thread.id, { body })
      setThread((t) => ({ ...t, replies: [...t.replies, created], last_activity_at: created.created_at }))
      setReply('')
    } catch (err) {
      setReplyError(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

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
                media={thread.media}
                highlight
                onReport={reportable(thread.author) ? () => openReport({ threadId: thread.id, author: thread.author.name }) : undefined}
                adminTools={tools('thread', thread.id, thread.author, () => navigate('/foro', { replace: true }))}
              />
              <h2 className="pt-4 text-sm font-semibold text-slate-300">
                {thread.replies.length} {thread.replies.length === 1 ? 'respuesta' : 'respuestas'}
              </h2>
              {thread.replies.map((r) => (
                <Post
                  key={r.id}
                  author={r.author}
                  date={r.created_at}
                  body={r.body}
                  onReport={reportable(r.author) ? () => openReport({ threadId: thread.id, replyId: r.id, author: r.author.name }) : undefined}
                  adminTools={tools('reply', r.id, r.author, () => setThread((t) => ({ ...t, replies: t.replies.filter((x) => x.id !== r.id) })))}
                />
              ))}
            </div>

            <div className="mt-8 rounded-2xl border border-white/10 bg-slate-900/60 p-5 sm:p-6">
              {status === 'authenticated' ? (
                <form onSubmit={handleReply} noValidate>
                  <label htmlFor="reply" className="text-sm font-medium text-slate-300">Tu respuesta</label>
                  <textarea
                    id="reply"
                    rows={4}
                    maxLength={3000}
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    className="mt-2 block w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-secondary-400/60 focus:outline-none focus:ring-2 focus:ring-secondary-400/20"
                    placeholder="Comparte tu experiencia…"
                  />
                  {replyError && <p role="alert" className="mt-2 text-xs font-medium text-accent-300">{replyError}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-xs text-slate-500">{reply.length}/3000</span>
                    <button type="submit" disabled={sending} className="btn-primary h-10 px-5 text-sm">
                      {sending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" aria-hidden="true" />}
                      Responder
                    </button>
                  </div>
                </form>
              ) : (
                <p className="text-center text-sm text-slate-400">
                  <Link to="/login" state={{ from: location.pathname }} className="font-semibold text-secondary-300 hover:text-secondary-200">Inicia sesión</Link>{' '}
                  o <Link to="/register" state={{ from: location.pathname }} className="font-semibold text-secondary-300 hover:text-secondary-200">crea una cuenta</Link> para responder.
                </p>
              )}
            </div>
          </>
        )
      })()}
      <ReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
    </div>
  )
}
