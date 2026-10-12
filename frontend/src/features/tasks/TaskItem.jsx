import { Paperclip, User } from 'lucide-react'
import { useState } from 'react'
import { getErrorMessage, tasksApi } from '../../api.js'
import Button from '../../components/ui/Button.jsx'
import { StatusBadge } from './taskStatus.jsx'
import { formatSpan, taskCategory } from './taskMeta.js'

export default function TaskItem({ task, farmName, workerName, onUpdated, onOpen }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const isDone = task.status === 'done'
  const cat = taskCategory(task.category)

  async function toggleDone() {
    setSaving(true)
    setError(null)
    try {
      const updated = await tasksApi.update(task.id, { status: isDone ? 'pending' : 'done' })
      onUpdated?.(updated)
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <li className="flex flex-col gap-3 py-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: cat.color }} aria-hidden="true" />
          <button type="button" onClick={() => onOpen?.(task)} className={`text-left font-semibold underline-offset-2 hover:underline ${isDone ? 'text-slate-400 line-through' : 'text-slate-100'}`}>{task.title}</button>
          <StatusBadge status={task.status} />
        </div>
        {task.description && <p className="mt-1 line-clamp-2 text-sm text-slate-300">{task.description}</p>}
        <p className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-400">
          <span>{cat.label} · {formatSpan(task)}</span>
          {farmName && <span>· {farmName}</span>}
          {workerName && <span className="inline-flex items-center gap-1">· <User className="h-3 w-3" aria-hidden="true" />{workerName}</span>}
          {task.attachments?.length > 0 && <span className="inline-flex items-center gap-1">· <Paperclip className="h-3 w-3" aria-hidden="true" />{task.attachments.length}</span>}
        </p>
        {error && <p role="alert" className="mt-2 text-xs font-medium text-accent-300">{error}</p>}
      </div>
      <Button variant={isDone ? 'outline' : 'primary'} loading={saving} onClick={toggleDone} className="shrink-0">
        {isDone ? 'Reabrir' : 'Marcar completada'}
      </Button>
    </li>
  )
}
