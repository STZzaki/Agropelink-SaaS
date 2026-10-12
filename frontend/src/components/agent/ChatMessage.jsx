import { Link } from 'react-router-dom'
import DraftReviewCard from '../../features/documents/DraftReviewCard.jsx'
import ProposalUploadCard from '../../features/documents/ProposalUploadCard.jsx'
import ConfirmationCard from './ConfirmationCard.jsx'

function DocOutcome({ message }) {
  if (message.docState === 'done') {
    return (
      <p className="mt-3 rounded-lg bg-primary-500/10 px-3 py-2 text-xs font-semibold text-primary-200 ring-1 ring-inset ring-primary-400/30">
        Archivado como <span className="font-mono">{message.docReference}</span>.{' '}
        <Link to="/documents" className="underline underline-offset-2">Ver archivo</Link>
      </p>
    )
  }
  return (
    <p className="mt-3 inline-flex rounded-full bg-white/[0.06] px-2.5 py-0.5 text-xs font-semibold text-slate-300 ring-1 ring-inset ring-white/10">
      Documento descartado
    </p>
  )
}

/** Negritas «**texto**» del agente como <strong>. Todo es texto: React lo escapa (nunca HTML del modelo). */
function RichText({ text }) {
  return String(text ?? '').split(/(\*\*[^*\n]+\*\*)/g).map((part, i) =>
    part.startsWith('**') && part.endsWith('**') && part.length > 4 ? <strong key={i} className="font-semibold text-white">{part.slice(2, -2)}</strong> : part,
  )
}

export default function ChatMessage({ message, farms, workers, farmsLoading, onApprove, onReject, onDocDone, onDocDiscarded }) {
  const isUser = message.role === 'user'
  const wide = message.action || message.draft || message.docProposal

  return (
    <li className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex max-w-[85%] flex-col ${isUser ? 'items-end' : 'items-start'} ${wide ? 'w-full' : ''}`}>
        <span className="mb-1 px-1 text-[11px] font-medium text-slate-400">
          {isUser ? 'Tú' : 'Agropelink AI'}
        </span>
        <div
          className={`w-full whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2.5 text-sm shadow-sm ${
            isUser
              ? 'rounded-br-sm bg-primary-600 text-white'
              : message.error
                ? 'rounded-bl-sm border border-accent-400/30 bg-accent-500/10 text-accent-200'
                : 'rounded-bl-sm border border-white/10 bg-white/[0.035] text-slate-100'
          }`}
        >
          {/* Texto plano: React escapa el contenido; nunca dangerouslySetInnerHTML (también con salida del LLM). */}
          {isUser ? message.text : <RichText text={message.text} />}
          {message.attachment && (
            <span className="mt-2 flex items-center gap-1.5 rounded-lg bg-white/15 px-2 py-1 text-xs">
              <svg className="h-3.5 w-3.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="m15 7-6.5 6.5a2.1 2.1 0 0 0 3 3L18 10a4 4 0 0 0-5.7-5.7l-6.5 6.6a6 6 0 0 0 8.5 8.5L20 13" /></svg>
              <span className="truncate">{message.attachment}</span>
            </span>
          )}
          {message.action && (
            <ConfirmationCard
              action={message.action}
              status={message.actionStatus}
              error={message.actionError}
              farms={farms}
              workers={workers}
              farmsLoading={farmsLoading}
              onApprove={(details) => onApprove(message.id, details)}
              onReject={() => onReject(message.id)}
            />
          )}
          {message.docState && message.docState !== 'pending' && <DocOutcome message={message} />}
          {message.docState === 'pending' && message.draft && (
            <div className="mt-3 whitespace-normal">
              <DraftReviewCard
                draft={message.draft}
                farms={farms}
                compact
                onConfirmed={(doc) => onDocDone(message.id, doc)}
                onDiscarded={() => onDocDiscarded(message.id)}
              />
            </div>
          )}
          {message.docState === 'pending' && message.docProposal && (
            <div className="whitespace-normal">
              <ProposalUploadCard
                proposal={message.docProposal}
                farms={farms}
                onUploaded={(doc) => onDocDone(message.id, doc)}
                onDismiss={() => onDocDiscarded(message.id)}
              />
            </div>
          )}
        </div>
      </div>
    </li>
  )
}
