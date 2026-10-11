import { useCallback, useEffect, useRef, useState } from 'react'
import { agentApi, documentsApi, farmsApi, getErrorMessage, tasksApi } from '../../api.js'
import ChatInput from './ChatInput.jsx'
import ChatMessage from './ChatMessage.jsx'

export const TASK_CREATED_EVENT = 'agropelink:task-created'
export const DOCUMENT_FILED_EVENT = 'agropelink:document-filed'

// Turnos previos enviados como contexto (el backend acepta como máximo 20).
const HISTORY_LIMIT = 20

let nextId = 0
const newId = () => ++nextId

const WELCOME = {
  id: newId(),
  role: 'agent',
  welcome: true,
  text: '¡Hola! Soy Agropelink AI. Pregúntame dudas de campo, pídeme que programe una labor o adjunta una factura, albarán o análisis para archivarlo.',
}

function ThinkingIndicator() {
  return (
    <li className="flex justify-start" aria-live="polite">
      <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm border border-white/10 bg-white/[0.035] px-4 py-3 text-sm text-slate-400 shadow-sm">
        <span className="flex gap-1" aria-hidden="true">
          {[0, 150, 300].map((d) => (
            <span key={d} className="h-2 w-2 animate-bounce rounded-full bg-secondary-400" style={{ animationDelay: `${d}ms` }} />
          ))}
        </span>
        Agropelink AI está pensando…
      </div>
    </li>
  )
}

function buildHistory(messages) {
  return messages
    .filter((m) => !m.welcome && !m.error)
    .slice(-HISTORY_LIMIT)
    .map((m) => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text.slice(0, 4000) }))
}

export default function AgentChat() {
  const [open, setOpen] = useState(false)
  // El historial vive solo en memoria: no se persiste en localStorage.
  const [messages, setMessages] = useState([WELCOME])
  const [thinking, setThinking] = useState(false)
  const [farms, setFarms] = useState([])
  const [farmsLoading, setFarmsLoading] = useState(false)
  const listRef = useRef(null)
  const inputRef = useRef(null)

  const patchMessage = useCallback(
    (id, changes) => setMessages((list) => list.map((m) => (m.id === id ? { ...m, ...changes } : m))),
    [],
  )

  // Las granjas se cargan al abrir el chat: la tarjeta de confirmación las necesita para crear la tarea.
  useEffect(() => {
    if (!open) return
    inputRef.current?.focus()
    const controller = new AbortController()
    setFarmsLoading(true)
    farmsApi
      .list({ limit: 100 }, { signal: controller.signal })
      .then(setFarms)
      .catch(() => {})
      .finally(() => {
        if (!controller.signal.aborted) setFarmsLoading(false)
      })
    return () => controller.abort()
  }, [open])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages, thinking])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // Con archivo: se sube como borrador privado y la IA propone sus metadatos (nada se archiva sin aprobar).
  async function analyzeFile(text, file) {
    const draft = await documentsApi.analyze(file, text)
    const lines = ['He analizado el documento. Revisa los datos propuestos y apruébalos para archivarlo.']
    if (draft.proposal.summary) lines.push(draft.proposal.summary)
    return { id: newId(), role: 'agent', text: lines.join('\n\n'), draft, docState: 'pending' }
  }

  async function handleSend(text, file) {
    const history = buildHistory(messages)
    setMessages((list) => [...list, { id: newId(), role: 'user', text: text || 'Archiva este documento.', attachment: file?.name }])
    setThinking(true)
    try {
      if (file) {
        const message = await analyzeFile(text, file)
        setMessages((list) => [...list, message])
        return
      }
      const { reply, action } = await agentApi.chat({ message: text, history })
      setMessages((list) => [
        ...list,
        {
          id: newId(),
          role: 'agent',
          text: reply,
          action: action?.type === 'create_task' ? action : null,
          actionStatus: action?.type === 'create_task' ? 'pending' : undefined,
          docProposal: action?.type === 'file_document' ? action.proposal : null,
          docState: action?.type === 'file_document' ? 'pending' : undefined,
        },
      ])
    } catch (err) {
      setMessages((list) => [...list, { id: newId(), role: 'agent', error: true, text: getErrorMessage(err) }])
    } finally {
      setThinking(false)
      inputRef.current?.focus()
    }
  }

  async function handleApprove(messageId, { farm_id, date }) {
    const message = messages.find((m) => m.id === messageId)
    if (!message?.action || message.actionStatus !== 'pending') return

    patchMessage(messageId, { actionStatus: 'submitting', actionError: null })
    try {
      const task = await tasksApi.create({
        title: message.action.title,
        description: message.action.description || null,
        date,
        farm_id,
      })
      patchMessage(messageId, { actionStatus: 'approved', createdTaskId: task.id })
      window.dispatchEvent(new CustomEvent(TASK_CREATED_EVENT, { detail: task }))
    } catch (err) {
      patchMessage(messageId, { actionStatus: 'pending', actionError: getErrorMessage(err) })
    }
  }

  function handleReject(messageId) {
    patchMessage(messageId, { actionStatus: 'rejected', actionError: null })
  }

  const handleDocDone = (messageId, doc) => {
    patchMessage(messageId, { docState: 'done', docReference: doc.reference })
    window.dispatchEvent(new CustomEvent(DOCUMENT_FILED_EVENT, { detail: doc }))
  }
  const handleDocDiscarded = (messageId) => patchMessage(messageId, { docState: 'discarded' })

  return (
    <>
      {open && (
        <section
          id="agent-chat-panel"
          role="dialog"
          aria-label="Chat con Agropelink AI"
          className="fixed inset-x-3 bottom-24 z-50 flex max-h-[min(75vh,calc(100dvh-7rem))] flex-col overflow-hidden rounded-2xl border border-white/10 bg-slate-900 shadow-overlay sm:inset-x-auto sm:right-6 sm:w-[26rem]"
        >
          <header className="flex items-center justify-between bg-secondary-950 px-4 py-3 text-white">
            <div className="flex items-center gap-3">
              <img src="/assets/Logo sin texto blanco sin fondo.png" alt="" aria-hidden="true" className="h-8 w-8 object-contain" />
              <div>
                <p className="text-sm font-semibold">Agropelink AI</p>
                <p className="text-[11px] text-primary-300">Asistente agronómico</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Cerrar chat"
              className="rounded-md p-1 text-white/80 hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </header>

          <ul ref={listRef} data-lenis-prevent className="flex-1 space-y-4 overflow-y-auto px-3 py-4" aria-live="polite">
            {messages.map((m) => (
              <ChatMessage
                key={m.id}
                message={m}
                farms={farms}
                farmsLoading={farmsLoading}
                onApprove={handleApprove}
                onReject={handleReject}
                onDocDone={handleDocDone}
                onDocDiscarded={handleDocDiscarded}
              />
            ))}
            {thinking && <ThinkingIndicator />}
          </ul>

          <ChatInput ref={inputRef} onSend={handleSend} disabled={thinking} />
        </section>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="agent-chat-panel"
        aria-label={open ? 'Cerrar Agropelink AI' : 'Abrir Agropelink AI'}
        className="fixed bottom-5 right-5 z-50 inline-flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-secondary-600 text-white shadow-lg ring-4 ring-slate-950 transition-transform hover:scale-105 focus:outline-none focus-visible:ring-primary-300 sm:bottom-6 sm:right-6"
      >
        {open ? (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
          </svg>
        ) : (
          <svg className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
            <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h8M8 14h5m-9 6 2.5-3H18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14z" />
          </svg>
        )}
      </button>
    </>
  )
}
