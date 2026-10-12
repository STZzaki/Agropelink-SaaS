import { CalendarDays, List, Plus, Users } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { farmsApi, tasksApi, workersApi } from '../api.js'
import { TASK_CREATED_EVENT } from '../components/agent/AgentChat.jsx'
import Alert from '../components/ui/Alert.jsx'
import Card from '../components/ui/Card.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { LoadingBlock } from '../components/ui/Spinner.jsx'
import SiexGenerator from '../features/siex/SiexGenerator.jsx'
import TaskCalendar, { monthRange } from '../features/tasks/TaskCalendar.jsx'
import TaskDetail from '../features/tasks/TaskDetail.jsx'
import TaskFilters from '../features/tasks/TaskFilters.jsx'
import TaskForm from '../features/tasks/TaskForm.jsx'
import TaskList from '../features/tasks/TaskList.jsx'
import { fromISO, taskEnd, toISO } from '../features/tasks/taskMeta.js'
import WorkersPanel from '../features/workers/WorkersPanel.jsx'
import useApi from '../hooks/useApi.js'

const TABS = [
  { id: 'calendar', label: 'Calendario', icon: CalendarDays },
  { id: 'list', label: 'Lista', icon: List },
  { id: 'workers', label: 'Trabajadores', icon: Users },
]

const firstOfMonth = (d = new Date()) => new Date(d.getFullYear(), d.getMonth(), 1)

export default function TasksPage() {
  const [tab, setTab] = useState('calendar')
  const [month, setMonth] = useState(firstOfMonth)
  const [selectedDay, setSelectedDay] = useState(() => toISO(new Date()))
  const [status, setStatus] = useState('')
  const [farmId, setFarmId] = useState('')
  const [openTask, setOpenTask] = useState(null)

  const farms = useApi((signal) => farmsApi.list({ limit: 100 }, { signal }))
  const workers = useApi((signal) => workersApi.list({ signal }))
  const { start, end } = monthRange(month)
  const monthTasks = useApi((signal) => tasksApi.list({ from: toISO(start), to: toISO(end), farm_id: farmId || undefined, limit: 500 }, { signal }), [toISO(start), toISO(end), farmId])
  const listTasks = useApi((signal) => tasksApi.list({ limit: 100, status: status || undefined, farm_id: farmId || undefined }, { signal }), [status, farmId])

  // Recarga cuando Agropelink AI crea una tarea aprobada por el usuario.
  const reloadMonth = monthTasks.reload
  const reloadList = listTasks.reload
  useEffect(() => {
    const reload = () => { reloadMonth(); reloadList() }
    window.addEventListener(TASK_CREATED_EVENT, reload)
    return () => window.removeEventListener(TASK_CREATED_EVENT, reload)
  }, [reloadMonth, reloadList])

  const farmList = farms.data ?? []
  const workerList = workers.data ?? []
  const farmNames = useMemo(() => Object.fromEntries(farmList.map((f) => [f.id, f.name])), [farmList])
  const workerById = useMemo(() => Object.fromEntries(workerList.map((w) => [w.id, w])), [workerList])
  const workerNames = useMemo(() => Object.fromEntries(workerList.map((w) => [w.id, w.name])), [workerList])

  // Una tarea creada o modificada se refleja en las dos vistas sin volver a pedir todo.
  function upsert(task) {
    const replace = (list) => (list ?? []).some((t) => t.id === task.id) ? list.map((t) => (t.id === task.id ? task : t)) : [...(list ?? []), task]
    monthTasks.setData(replace)
    listTasks.setData(replace)
    if (openTask?.id === task.id) setOpenTask(task)
    workers.reload()
  }
  function removeTask(task) {
    const drop = (list) => (list ?? []).filter((t) => t.id !== task.id)
    monthTasks.setData(drop)
    listTasks.setData(drop)
    workers.reload()
  }

  const dayTasks = (monthTasks.data ?? []).filter((t) => fromISO(t.date) <= fromISO(selectedDay) && fromISO(taskEnd(t)) >= fromISO(selectedDay))
  const visibleList = (listTasks.data ?? []).filter((t) => (!status || t.status === status) && (!farmId || t.farm_id === Number(farmId)))

  const newTaskCard = (
    <Card title={tab === 'calendar' ? `Nueva tarea · ${fromISO(selectedDay).toLocaleDateString('es-ES', { day: 'numeric', month: 'short' })}` : 'Nueva tarea'} className="lg:self-start">
      {farms.loading ? (
        <LoadingBlock label="Cargando granjas…" />
      ) : farms.error ? (
        <Alert variant="error" onRetry={farms.reload}>{farms.error}</Alert>
      ) : farmList.length === 0 ? (
        <Alert variant="info">Primero registra una granja en el <Link to="/dashboard" className="font-semibold underline">resumen</Link>.</Alert>
      ) : (
        <TaskForm farms={farmList} workers={workerList} defaultDate={tab === 'calendar' ? selectedDay : undefined} onCreated={upsert} />
      )}
    </Card>
  )

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6 lg:px-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <PageHeader title="Tareas" subtitle="Planifica las labores, asígnalas a tu equipo y lleva el cuaderno de campo al día." />
        <SiexGenerator farms={farmList} />
      </div>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div role="tablist" aria-label="Vistas de tareas" className="flex gap-1 rounded-xl bg-white/[0.04] p-1 ring-1 ring-inset ring-white/10">
          {TABS.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors duration-300 ${tab === t.id ? 'bg-white/10 text-white' : 'text-slate-400 hover:text-slate-200'}`}>
              <t.icon className="h-4 w-4" aria-hidden="true" /> {t.label}
            </button>
          ))}
        </div>
      </div>

      {tab === 'calendar' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="space-y-6 lg:col-span-2">
            <Card>
              {monthTasks.error ? (
                <Alert variant="error" onRetry={monthTasks.reload}>{monthTasks.error}</Alert>
              ) : (
                <TaskCalendar month={month} onMonthChange={setMonth} tasks={monthTasks.data ?? []} loading={monthTasks.loading} selectedDay={selectedDay} onSelectDay={setSelectedDay} onOpenTask={setOpenTask} />
              )}
            </Card>
            <Card title={`Tareas del ${fromISO(selectedDay).toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}`}>
              {dayTasks.length ? (
                <TaskList tasks={dayTasks} farmNames={farmNames} workerNames={workerNames} onUpdated={upsert} onOpen={setOpenTask} />
              ) : (
                <p className="flex items-center gap-2 text-sm text-slate-400"><Plus className="h-4 w-4" aria-hidden="true" /> Sin tareas este día: créala en el panel «Nueva tarea».</p>
              )}
            </Card>
          </div>
          {newTaskCard}
        </div>
      )}

      {tab === 'list' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <Card title="Listado" className="lg:col-span-2">
            <TaskFilters status={status} onStatusChange={setStatus} farmId={farmId} onFarmChange={setFarmId} farms={farmList} />
            <div className="mt-4">
              <TaskList tasks={visibleList} loading={listTasks.loading} error={listTasks.error} onRetry={listTasks.reload} farmNames={farmNames} workerNames={workerNames} onUpdated={upsert} onOpen={setOpenTask} />
            </div>
          </Card>
          {newTaskCard}
        </div>
      )}

      {tab === 'workers' && (
        <Card title="Equipo">
          <WorkersPanel workers={workers.data} loading={workers.loading} error={workers.error} onReload={workers.reload} />
        </Card>
      )}

      <TaskDetail
        task={openTask}
        farmName={openTask ? farmNames[openTask.farm_id] : null}
        worker={openTask ? workerById[openTask.worker_id] : null}
        onClose={() => setOpenTask(null)}
        onChanged={upsert}
        onDeleted={removeTask}
      />
    </div>
  )
}
