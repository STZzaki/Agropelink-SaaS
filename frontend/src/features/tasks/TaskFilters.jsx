import { TASK_STATUS } from './taskStatus.jsx'
import FarmSelect from '../farms/FarmSelect.jsx'

const OPTIONS = [{ value: '', label: 'Todas' }, ...Object.entries(TASK_STATUS).map(([value, { label }]) => ({ value, label }))]

export default function TaskFilters({ status, onStatusChange, farmId, onFarmChange, farms }) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div role="tablist" aria-label="Filtrar por estado" className="flex flex-wrap gap-2">
        {OPTIONS.map((opt) => {
          const active = status === opt.value
          return (
            <button
              key={opt.value || 'all'}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => onStatusChange(opt.value)}
              className={`rounded-full px-3 py-1 text-sm font-medium transition-colors ${
                active ? 'bg-secondary-700 text-white' : 'bg-white/[0.06] text-slate-300 hover:bg-slate-200'
              }`}
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      <div className="sm:w-64">
        <label htmlFor="filter-farm" className="sr-only">Filtrar por granja</label>
        <FarmSelect id="filter-farm" farms={farms} value={farmId} onChange={onFarmChange} placeholder="Todas las granjas" />
      </div>
    </div>
  )
}
