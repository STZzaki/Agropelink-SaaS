export const TASK_STATUS = {
  pending: { label: 'Pendiente', badge: 'bg-accent-100 text-accent-200 ring-accent-400/30' },
  in_progress: { label: 'En curso', badge: 'bg-secondary-100 text-secondary-200 ring-secondary-400/30' },
  done: { label: 'Completada', badge: 'bg-primary-100 text-primary-200 ring-primary-400/30' },
}

export function StatusBadge({ status }) {
  const meta = TASK_STATUS[status] ?? TASK_STATUS.pending
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${meta.badge}`}>
      {meta.label}
    </span>
  )
}
