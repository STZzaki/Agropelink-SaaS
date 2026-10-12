import { SmilePlus, ThumbsUp } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { forumApi, getErrorMessage } from '../../api.js'
import { REACTIONS } from './forumMeta.js'

/**
 * «Me gusta» + reacciones con emoji de una publicación. Sin sesión, cualquier clic lleva al login.
 * Actualización optimista: se pinta al instante y se corrige con la respuesta del servidor.
 */
export default function ReactionBar({ threadId, replyId = null, reactions, onChange, canReact, onRequireLogin }) {
  const [open, setOpen] = useState(false)
  const [error, setError] = useState(null)
  const wrapRef = useRef(null)
  const counts = reactions?.counts ?? {}
  const mine = reactions?.mine ?? []

  useEffect(() => {
    if (!open) return undefined
    const close = (e) => !wrapRef.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && setOpen(false)
    document.addEventListener('pointerdown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [open])

  async function toggle(kind) {
    setOpen(false)
    if (!canReact) {
      onRequireLogin()
      return
    }
    const had = mine.includes(kind)
    const previous = reactions
    const optimistic = {
      counts: { ...counts, [kind]: Math.max(0, (counts[kind] ?? 0) + (had ? -1 : 1)) },
      mine: had ? mine.filter((k) => k !== kind) : [...mine, kind],
    }
    if (!optimistic.counts[kind]) delete optimistic.counts[kind]
    onChange(optimistic)
    setError(null)
    try {
      onChange(await forumApi.react({ thread_id: threadId, reply_id: replyId, kind }))
    } catch (err) {
      onChange(previous)
      setError(getErrorMessage(err))
    }
  }

  const chip = 'inline-flex h-8 items-center gap-1.5 rounded-full px-2.5 text-xs font-semibold tabular-nums ring-1 ring-inset transition-colors duration-200'
  const liked = mine.includes('like')
  const shown = REACTIONS.filter((r) => counts[r.id])

  return (
    <div className="mt-4">
      <div className="flex flex-wrap items-center gap-1.5" ref={wrapRef}>
        <button type="button" onClick={() => toggle('like')} aria-pressed={liked} aria-label={`Me gusta${counts.like ? `, ${counts.like}` : ''}`}
          className={`${chip} ${liked ? 'bg-secondary-500/20 text-secondary-100 ring-secondary-400/40' : 'text-slate-400 ring-white/10 hover:bg-white/5 hover:text-slate-200'}`}>
          <ThumbsUp className={`h-3.5 w-3.5 ${liked ? 'fill-current' : ''}`} aria-hidden="true" />
          {counts.like ? counts.like : 'Me gusta'}
        </button>
        {shown.map((r) => (
          <button key={r.id} type="button" onClick={() => toggle(r.id)} aria-pressed={mine.includes(r.id)} aria-label={`${r.label}, ${counts[r.id]}`} title={r.label}
            className={`${chip} ${mine.includes(r.id) ? 'bg-secondary-500/20 text-secondary-100 ring-secondary-400/40' : 'text-slate-300 ring-white/10 hover:bg-white/5'}`}>
            <span aria-hidden="true">{r.emoji}</span>{counts[r.id]}
          </button>
        ))}
        <div className="relative">
          <button type="button" onClick={() => (canReact ? setOpen((v) => !v) : onRequireLogin())} aria-expanded={open} aria-haspopup="true" aria-label="Reaccionar con un emoji" title="Reaccionar"
            className={`${chip} text-slate-400 ring-white/10 hover:bg-white/5 hover:text-slate-200`}>
            <SmilePlus className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
          {open && (
            <div role="menu" aria-label="Reacciones" className="pop-in absolute bottom-full left-0 z-20 mb-2 flex gap-1 rounded-full bg-slate-800 p-1 shadow-overlay ring-1 ring-white/10">
              {REACTIONS.map((r) => (
                <button key={r.id} type="button" role="menuitemcheckbox" aria-checked={mine.includes(r.id)} onClick={() => toggle(r.id)} title={r.label} aria-label={r.label}
                  className={`flex h-9 w-9 items-center justify-center rounded-full text-lg transition-transform duration-150 hover:scale-125 motion-off:hover:scale-100 ${mine.includes(r.id) ? 'bg-white/10' : ''}`}>
                  <span aria-hidden="true">{r.emoji}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-accent-200">{error}</p>}
    </div>
  )
}
