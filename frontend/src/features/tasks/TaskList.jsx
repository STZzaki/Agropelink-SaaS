import Alert from '../../components/ui/Alert.jsx'
import { LoadingBlock } from '../../components/ui/Spinner.jsx'
import TaskItem from './TaskItem.jsx'

export default function TaskList({ tasks, loading, error, onRetry, farmNames, workerNames = {}, onUpdated, onOpen }) {
  if (loading) return <LoadingBlock label="Cargando tareas…" />
  if (error) return <Alert variant="error" onRetry={onRetry}>{error}</Alert>
  if (!tasks?.length) {
    return <p className="py-10 text-center text-sm text-slate-400">No hay tareas con estos filtros.</p>
  }
  return (
    <ul className="divide-y divide-white/[0.06]">
      {tasks.map((task) => (
        <TaskItem key={task.id} task={task} farmName={farmNames[task.farm_id]} workerName={workerNames[task.worker_id]} onUpdated={onUpdated} onOpen={onOpen} />
      ))}
    </ul>
  )
}
