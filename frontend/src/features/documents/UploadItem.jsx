import Spinner from '../../components/ui/Spinner.jsx'

const STATE = {
  uploading: { label: 'Subiendo', text: 'text-secondary-300', bar: 'bg-secondary-500' },
  done: { label: 'Subido', text: 'text-primary-300', bar: 'bg-primary-500' },
  error: { label: 'Error', text: 'text-accent-300', bar: 'bg-accent-500' },
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

export default function UploadItem({ upload }) {
  const meta = STATE[upload.state]
  const progress = upload.state === 'uploading' ? upload.progress : 100

  return (
    <li className="py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-100">{upload.name}</p>
          <p className="text-xs text-slate-400">
            {formatSize(upload.size)}
            {upload.farmName && <> · {upload.farmName}</>}
          </p>
        </div>
        <span className={`flex shrink-0 items-center gap-2 text-xs font-semibold ${meta.text}`}>
          {upload.state === 'uploading' && <Spinner size="sm" />}
          {meta.label}
          {upload.state === 'uploading' && ` ${upload.progress}%`}
        </span>
      </div>
      <div
        className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/[0.06]"
        role="progressbar"
        aria-valuenow={progress}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`Progreso de ${upload.name}`}
      >
        <div className={`h-full rounded-full transition-[width,background-color] duration-300 ease-out ${meta.bar}`} style={{ width: `${progress}%` }} />
      </div>
      {upload.error && <p role="alert" className="mt-1 text-xs font-medium text-accent-300">{upload.error}</p>}
    </li>
  )
}
