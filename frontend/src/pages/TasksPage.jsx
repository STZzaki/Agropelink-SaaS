import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { farmsApi, tasksApi } from '../api.js'
import { TASK_CREATED_EVENT } from '../components/agent/AgentChat.jsx'
import Alert from '../components/ui/Alert.jsx'
import Card from '../components/ui/Card.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { LoadingBlock } from '../components/ui/Spinner.jsx'
import TaskFilters from '../features/tasks/TaskFilters.jsx'
import TaskForm from '../features/tasks/TaskForm.jsx'
import TaskList from '../features/tasks/TaskList.jsx'
import useApi from '../hooks/useApi.js'

export default function TasksPage() {
  const [status, setStatus] = useState('')
  const [farmId, setFarmId] = useState('')

  const farms = useApi((signal) => farmsApi.list({ limit: 100 }, { signal }))
  const tasks = useApi(
    (signal) =>
      tasksApi.list({ limit: 100, status: status || undefined, farm_id: farmId || undefined }, { signal }),
    [status, farmId],
  )

  // Recarga el listado cuando Agropelink AI crea una tarea aprobada por el usuario.
  const reloadTasks = tasks.reload
  useEffect(() => {
    window.addEventListener(TASK_CREATED_EVENT, reloadTasks)
    return () => window.removeEventListener(TASK_CREATED_EVENT, reloadTasks)
  }, [reloadTasks])

  const farmList = farms.data ?? []
  const farmNames = useMemo(() => Object.fromEntries(farmList.map((f) => [f.id, f.name])), [farmList])

  function matchesFilters(task) {
    return (!status || task.status === status) && (!farmId || task.farm_id === Number(farmId))
  }

  function handleCreated(task) {
    if (matchesFilters(task)) tasks.setData((list) => [...(list ?? []), task])
  }

  function handleUpdated(task) {
    tasks.setData((list) =>
      (list ?? []).flatMap((t) => (t.id !== task.id ? [t] : matchesFilters(task) ? [task] : [])),
    )
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader title="Tareas" subtitle="Planifica y sigue el trabajo de tus granjas." />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Nueva tarea" className="lg:order-2 lg:self-start">
          {farms.loading ? (
            <LoadingBlock label="Cargando granjas…" />
          ) : farms.error ? (
            <Alert variant="error" onRetry={farms.reload}>{farms.error}</Alert>
          ) : farmList.length === 0 ? (
            <Alert variant="info">
              Primero registra una granja en el <Link to="/dashboard" className="font-semibold underline">resumen</Link>.
            </Alert>
          ) : (
            <TaskForm farms={farmList} onCreated={handleCreated} />
          )}
        </Card>

        <Card title="Listado" className="lg:order-1 lg:col-span-2">
          <TaskFilters status={status} onStatusChange={setStatus} farmId={farmId} onFarmChange={setFarmId} farms={farmList} />
          <div className="mt-4">
            <TaskList
              tasks={tasks.data}
              loading={tasks.loading}
              error={tasks.error}
              onRetry={tasks.reload}
              farmNames={farmNames}
              onUpdated={handleUpdated}
            />
          </div>
        </Card>
      </div>
    </div>
  )
}
