import { ImagePlus, Smile, X } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { FORUM_MEDIA, forumApi, getErrorMessage } from '../../api.js'
import Avatar from '../../components/ui/Avatar.jsx'
import { COMPOSER_EMOJIS } from './forumMeta.js'

const MAX_PHOTOS = 4
const RIGHTS_TEXT = 'Confirmo que tengo los derechos de estas fotos, asumo la responsabilidad legal sobre su contenido y acepto las condiciones de publicación.'

/** Consulta de mención activa: «@texto» justo antes del cursor, en la misma línea (máx. 40 caracteres). */
function activeQuery(text, caret) {
  const before = text.slice(0, caret)
  const at = before.lastIndexOf('@')
  if (at < 0 || (at > 0 && !/\s/.test(before[at - 1]))) return null
  const query = before.slice(at + 1)
  if (query.length > 40 || /\n/.test(query) || query.startsWith(' ')) return null
  return { at, query }
}

function checkPhoto(file) {
  if (!FORUM_MEDIA.image.types.includes(file.type)) return `${file.name}: solo fotos PNG, JPEG o WEBP.`
  if (file.size > FORUM_MEDIA.image.maxBytes) return `${file.name}: supera 5 MB.`
  return null
}

/**
 * Caja de respuesta: @menciones con autocompletado (combobox accesible), selector de emojis, fotos con
 * declaración de derechos. Las fotos se suben al enviar (mismo pipeline seguro que los temas).
 */
export default function ReplyComposer({ threadId, onPosted }) {
  const uid = useId()
  const textRef = useRef(null)
  const fileRef = useRef(null)
  const [body, setBody] = useState('')
  const [mentions, setMentions] = useState([]) // [{ id, name }]
  const [query, setQuery] = useState(null) // { at, query }
  const [options, setOptions] = useState([])
  const [active, setActive] = useState(0)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const [photos, setPhotos] = useState([]) // [{ file, preview }]
  const [rights, setRights] = useState(false)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState(null)

  // Autocompletado con espera de 200 ms y cancelación de la petición anterior.
  useEffect(() => {
    if (!query || !query.query.trim()) {
      setOptions([])
      return undefined
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      forumApi.mentionable(query.query.trim(), { signal: controller.signal }).then((list) => { setOptions(list); setActive(0) }).catch(() => setOptions([]))
    }, 200)
    return () => { clearTimeout(timer); controller.abort() }
  }, [query])

  useEffect(() => () => photos.forEach((p) => URL.revokeObjectURL(p.preview)), []) // eslint-disable-line react-hooks/exhaustive-deps

  function onType(e) {
    setBody(e.target.value)
    setQuery(activeQuery(e.target.value, e.target.selectionStart))
  }

  function pick(user) {
    const el = textRef.current
    const caret = el.selectionStart
    const next = `${body.slice(0, query.at)}@${user.name} ${body.slice(caret)}`
    setBody(next)
    setMentions((m) => (m.some((x) => x.id === user.id) ? m : [...m, { id: user.id, name: user.name }]))
    setQuery(null)
    setOptions([])
    const pos = query.at + user.name.length + 2
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(pos, pos) })
  }

  function onKeyDown(e) {
    if (!options.length) return
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => (i + 1) % options.length) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => (i - 1 + options.length) % options.length) }
    else if (e.key === 'Enter' || e.key === 'Tab') { e.preventDefault(); pick(options[active]) }
    else if (e.key === 'Escape') { e.preventDefault(); setOptions([]); setQuery(null) }
  }

  function insertEmoji(emoji) {
    const el = textRef.current
    const start = el?.selectionStart ?? body.length
    const end = el?.selectionEnd ?? body.length
    const next = `${body.slice(0, start)}${emoji}${body.slice(end)}`.slice(0, 3000)
    setBody(next)
    setEmojiOpen(false)
    requestAnimationFrame(() => { el?.focus(); el?.setSelectionRange(start + emoji.length, start + emoji.length) })
  }

  function addPhotos(list) {
    const files = [...list]
    const problem = files.map(checkPhoto).find(Boolean)
    const ok = files.filter((f) => !checkPhoto(f)).slice(0, MAX_PHOTOS - photos.length)
    setPhotos((p) => [...p, ...ok.map((file) => ({ file, preview: URL.createObjectURL(file) }))])
    setError(problem ?? null)
  }

  async function submit(e) {
    e.preventDefault()
    const text = body.trim()
    if (text.length < 2) return setError('Escribe una respuesta.')
    if (photos.length && !rights) return setError('Marca la declaración de derechos para publicar fotos.')
    setSending(true)
    setError(null)
    const uploaded = []
    try {
      for (const p of photos) uploaded.push((await forumApi.uploadMedia(p.file)).id)
      // Solo las menciones cuyo «@Nombre» sigue en el texto (el servidor vuelve a comprobarlo).
      const ids = mentions.filter((m) => text.toLocaleLowerCase('es').includes(`@${m.name}`.toLocaleLowerCase('es'))).map((m) => m.id)
      const created = await forumApi.reply(threadId, { body: text, media_ids: uploaded, mentions: ids })
      photos.forEach((p) => URL.revokeObjectURL(p.preview))
      setBody('')
      setMentions([])
      setPhotos([])
      setRights(false)
      onPosted(created)
    } catch (err) {
      // Fotos subidas que no llegaron a publicarse: se descartan (el servidor también las purga a las 24 h).
      uploaded.forEach((id) => forumApi.discardMedia(id).catch(() => {}))
      setError(getErrorMessage(err))
    } finally {
      setSending(false)
    }
  }

  const listId = `${uid}-mentions`
  const showList = options.length > 0
  return (
    <form onSubmit={submit} noValidate>
      <label htmlFor={`${uid}-body`} className="text-sm font-medium text-slate-300">Tu respuesta</label>
      <div className="relative mt-2">
        <textarea
          id={`${uid}-body`}
          ref={textRef}
          rows={4}
          maxLength={3000}
          value={body}
          onChange={onType}
          onKeyDown={onKeyDown}
          onBlur={() => setTimeout(() => setOptions([]), 150)}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={listId}
          aria-activedescendant={showList ? `${listId}-${active}` : undefined}
          className="block w-full resize-y rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3 text-sm text-white placeholder:text-slate-500 focus:border-secondary-400/60 focus:outline-none focus:ring-2 focus:ring-secondary-400/20"
          placeholder="Comparte tu experiencia… Escribe @ para mencionar a alguien del foro."
        />
        {showList && (
          <ul id={listId} role="listbox" aria-label="Personas para mencionar" className="pop-in absolute left-3 top-full z-20 mt-1 w-64 overflow-hidden rounded-xl bg-slate-800 py-1 shadow-overlay ring-1 ring-white/10">
            {options.map((o, i) => (
              <li key={o.id} id={`${listId}-${i}`} role="option" aria-selected={i === active} onPointerDown={(e) => { e.preventDefault(); pick(o) }}
                className={`flex cursor-pointer items-center gap-2 px-3 py-2 text-sm ${i === active ? 'bg-white/10 text-white' : 'text-slate-300'}`}>
                <Avatar avatar={o.avatar} name={o.name} className="!h-6 !w-6 text-[10px]" />
                <span className="truncate">{o.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {photos.length > 0 && (
        <>
          <ul className="mt-3 flex flex-wrap gap-2" aria-label="Fotos para publicar">
            {photos.map((p, i) => (
              <li key={p.preview} className="relative h-20 w-20 overflow-hidden rounded-xl ring-1 ring-white/10">
                <img src={p.preview} alt={p.file.name} className="h-full w-full object-cover" />
                <button type="button" onClick={() => { URL.revokeObjectURL(p.preview); setPhotos((ps) => ps.filter((_, j) => j !== i)) }} aria-label={`Quitar ${p.file.name}`}
                  className="absolute right-1 top-1 rounded-full bg-slate-950/70 p-0.5 text-white hover:bg-slate-950"><X className="h-3.5 w-3.5" aria-hidden="true" /></button>
              </li>
            ))}
          </ul>
          <label className={`mt-3 flex cursor-pointer items-start gap-3 rounded-xl border px-4 py-3 text-xs transition-colors duration-300 ${rights ? 'border-primary-400/40 bg-primary-500/[0.07] text-slate-200' : 'border-white/10 bg-white/[0.02] text-slate-400'}`}>
            <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 rounded accent-secondary-400" />
            {RIGHTS_TEXT}
          </label>
        </>
      )}

      {error && <p role="alert" className="mt-2 text-xs font-medium text-accent-300">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <div className="relative">
          <button type="button" onClick={() => setEmojiOpen((v) => !v)} aria-expanded={emojiOpen} aria-label="Insertar emoji" title="Insertar emoji"
            className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white"><Smile className="h-5 w-5" aria-hidden="true" /></button>
          {emojiOpen && (
            <div role="dialog" aria-label="Emojis" className="pop-in absolute bottom-full left-0 z-20 mb-2 grid w-64 grid-cols-8 gap-0.5 rounded-xl bg-slate-800 p-2 shadow-overlay ring-1 ring-white/10"
              onKeyDown={(e) => e.key === 'Escape' && setEmojiOpen(false)}>
              {COMPOSER_EMOJIS.map((em) => (
                <button key={em} type="button" onClick={() => insertEmoji(em)} aria-label={`Insertar ${em}`} className="flex h-7 w-7 items-center justify-center rounded-md text-lg hover:bg-white/10">{em}</button>
              ))}
            </div>
          )}
        </div>
        <button type="button" onClick={() => fileRef.current?.click()} disabled={photos.length >= MAX_PHOTOS} aria-label="Añadir fotos" title="Añadir fotos (máx. 4)"
          className="rounded-lg p-2 text-slate-400 hover:bg-white/5 hover:text-white disabled:opacity-40"><ImagePlus className="h-5 w-5" aria-hidden="true" /></button>
        <input ref={fileRef} type="file" multiple accept={FORUM_MEDIA.image.types.join(',')} className="sr-only" tabIndex={-1} onChange={(e) => { addPhotos(e.target.files ?? []); e.target.value = '' }} />
        <span className="ml-auto text-xs text-slate-500">{body.length}/3000</span>
        <button type="submit" disabled={sending || (photos.length > 0 && !rights)} className="btn-primary h-10 px-5 text-sm">
          {sending && <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-950/30 border-t-slate-950" aria-hidden="true" />}
          {photos.length ? 'Subir y responder' : 'Responder'}
        </button>
      </div>
    </form>
  )
}
