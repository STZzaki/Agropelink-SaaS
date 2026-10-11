import { useState } from 'react'
import { getErrorMessage, tasksApi } from '../../api.js'
import Button from '../../components/ui/Button.jsx'
import { StatusBadge } from './taskStatus.jsx'

const dateFormatter = new Intl.DateTimeFormat('es-ES', { day: 'numeric', month: 'short', year: 'numeric' })

export default function TaskItem({ task, farmName, onUpdated }) {
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState(null)
  const isDone = task.status === 'done'

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
          <h3 className={`font-semibold ${isDone ? 'text-slate-400 line-through' : 'text-slate-100'}`}>{task.title}</h3>
          <StatusBadge status={task.status} />
        </div>
        {task.description && <p className="mt-1 text-sm text-slate-300">{task.description}</p>}
        <p className="mt-1 text-xs text-slate-400">
          {dateFormatter.format(new Date(`${task.date}T00:00:00`))}
          {farmName && <> · {farmName}</>}
        </p>
        {error && <p role="alert" className="mt-2 text-xs font-medium text-accent-300">{error}</p>}
      </div>
      <Button variant={isDone ? 'outline' : 'primary'} loading={saving} onClick={toggleDone} className="shrink-0">
        {isDone ? 'Reabrir' : 'Marcar completada'}
      </Button>
    </li>
  )
}
