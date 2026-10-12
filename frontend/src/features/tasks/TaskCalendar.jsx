import { Check, ChevronLeft, ChevronRight } from 'lucide-react'
import { useMemo } from 'react'
import { TASK_STATUS } from './taskStatus.jsx'
import { TASK_CATEGORIES, addDays, dayDiff, formatSpan, fromISO, taskCategory, taskEnd, toISO } from './taskMeta.js'

const WEEKDAY_HEAD = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom']
const MAX_LANES = 3
const LANE_H = 24 // px por carril
const HEAD_H = 28 // px de la cabecera de cada día (número)

/** Lunes de la semana que contiene `d`. */
const weekStart = (d) => addDays(d, -((d.getDay() + 6) % 7))

export function monthRange(month) {
  const first = new Date(month.getFullYear(), month.getMonth(), 1)
  const last = new Date(month.getFullYear(), month.getMonth() + 1, 0)
  const start = weekStart(first)
  const weeks = Math.ceil((dayDiff(start, last) + 1) / 7)
  return { start, end: addDays(start, weeks * 7 - 1), weeks }
}

/**
 * Segmentos de cada semana: una tarea de varios días se corta por semanas y se dibuja como un bloque continuo
 * (`continuesLeft/Right` quitan el redondeo del lado por el que sigue). Carriles por asignación voraz.
 */
function layoutWeek(tasks, start) {
  const end = addDays(start, 6)
  const segments = tasks
    .filter((t) => fromISO(t.date) <= end && fromISO(taskEnd(t)) >= start)
    .map((t) => {
      const s = fromISO(t.date) < start ? start : fromISO(t.date)
      const e = fromISO(taskEnd(t)) > end ? end : fromISO(taskEnd(t))
      return { task: t, col: dayDiff(start, s), span: dayDiff(s, e) + 1, continuesLeft: fromISO(t.date) < start, continuesRight: fromISO(taskEnd(t)) > end }
    })
    .sort((a, b) => a.col - b.col || b.span - a.span || a.task.id - b.task.id)
  const lanes = []
  for (const seg of segments) {
    let lane = lanes.findIndex((occupied) => occupied.every((o) => seg.col > o.end || seg.col + seg.span - 1 < o.start))
    if (lane === -1) {
      lane = lanes.length
      lanes.push([])
    }
    lanes[lane].push({ start: seg.col, end: seg.col + seg.span - 1 })
    seg.lane = lane
  }
  const hidden = Array(7).fill(0)
  for (const seg of segments) if (seg.lane >= MAX_LANES) for (let c = seg.col; c < seg.col + seg.span; c += 1) hidden[c] += 1
  return { segments: segments.filter((s) => s.lane < MAX_LANES), hidden }
}

function Bar({ seg, onOpen }) {
  const { task } = seg
  const cat = taskCategory(task.category)
  const done = task.status === 'done'
  return (
    <button
      type="button"
      onClick={() => onOpen(task)}
      title={`${task.title} · ${cat.label} · ${formatSpan(task)}`}
      aria-label={`${task.title}. ${cat.label}. ${formatSpan(task)}. ${TASK_STATUS[task.status]?.label ?? ''}`}
      className={`absolute flex h-[20px] items-center gap-1 overflow-hidden px-1.5 text-left text-[11px] font-medium leading-none text-white transition-[filter,transform] duration-200 hover:brightness-125 focus:outline-none focus-visible:ring-2 focus-visible:ring-white/80 ${
        seg.continuesLeft ? 'rounded-l-none' : 'rounded-l-md'
      } ${seg.continuesRight ? 'rounded-r-none' : 'rounded-r-md'} ${done ? 'opacity-55' : ''}`}
      style={{
        left: `calc(${(seg.col / 7) * 100}% + ${seg.continuesLeft ? 0 : 3}px)`,
        width: `calc(${(seg.span / 7) * 100}% - ${(seg.continuesLeft ? 0 : 3) + (seg.continuesRight ? 0 : 3)}px)`,
        top: HEAD_H + seg.lane * LANE_H,
        background: `${cat.color}66`, // 40 %: el tipo se distingue y el texto blanco mantiene contraste ≥ 7:1
        boxShadow: `inset ${seg.continuesLeft ? 0 : 3}px 0 0 ${cat.color}`,
      }}
    >
      {done && <Check className="h-3 w-3 shrink-0" strokeWidth={3} aria-hidden="true" />}
      <span className={`truncate ${done ? 'line-through' : ''}`}>{task.title}</span>
    </button>
  )
}

/** Calendario mensual con código de colores por tipo de labor; las tareas largas son bloques continuos. */
export default function TaskCalendar({ month, onMonthChange, tasks, selectedDay, onSelectDay, onOpenTask, loading }) {
  const { start, weeks } = monthRange(month)
  const today = toISO(new Date())
  const rows = useMemo(() => Array.from({ length: weeks }, (_, w) => ({ start: addDays(start, w * 7), ...layoutWeek(tasks, addDays(start, w * 7)) })), [tasks, start.getTime(), weeks]) // eslint-disable-line react-hooks/exhaustive-deps
  // «octubre de 2026» → «Octubre de 2026» (CSS `capitalize` pondría también «De» en mayúscula).
  const rawTitle = month.toLocaleDateString('es-ES', { month: 'long', year: 'numeric' })
  const title = rawTitle.charAt(0).toUpperCase() + rawTitle.slice(1)

  return (
    <div>
      <div className="mb-4 flex flex-col items-start gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-1">
          <button type="button" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() - 1, 1))} aria-label="Mes anterior" className="rounded-lg p-2 text-slate-300 hover:bg-white/5 hover:text-white"><ChevronLeft className="h-4 w-4" aria-hidden="true" /></button>
          <h3 className="min-w-[9rem] text-center text-base font-semibold text-white sm:min-w-[10rem]" aria-live="polite">{title}</h3>
          <button type="button" onClick={() => onMonthChange(new Date(month.getFullYear(), month.getMonth() + 1, 1))} aria-label="Mes siguiente" className="rounded-lg p-2 text-slate-300 hover:bg-white/5 hover:text-white"><ChevronRight className="h-4 w-4" aria-hidden="true" /></button>
          <button type="button" onClick={() => { const n = new Date(); onMonthChange(new Date(n.getFullYear(), n.getMonth(), 1)); onSelectDay(toISO(n)) }} className="ml-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-300 ring-1 ring-inset ring-white/10 hover:bg-white/5">Hoy</button>
        </div>
        <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-400" aria-label="Leyenda de colores">
          {TASK_CATEGORIES.map((c) => (
            <li key={c.id} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: c.color }} aria-hidden="true" />{c.label}</li>
          ))}
        </ul>
      </div>

      <div className={`overflow-hidden rounded-2xl ring-1 ring-inset ring-white/[0.08] transition-opacity duration-300 ${loading ? 'opacity-60' : ''}`} aria-busy={loading}>
        <div className="grid grid-cols-7 border-b border-white/[0.08] bg-white/[0.02]">
          {WEEKDAY_HEAD.map((d) => <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500">{d}</div>)}
        </div>
        {rows.map((row) => (
          <div key={toISO(row.start)} className="relative border-b border-white/[0.06] last:border-b-0" style={{ height: HEAD_H + MAX_LANES * LANE_H + 14 }}>
            <div className="absolute inset-0 grid grid-cols-7">
              {Array.from({ length: 7 }, (_, c) => {
                const day = addDays(row.start, c)
                const iso = toISO(day)
                const outside = day.getMonth() !== month.getMonth()
                const selected = iso === selectedDay
                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => onSelectDay(iso)}
                    aria-pressed={selected}
                    aria-label={day.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' })}
                    className={`relative border-r border-white/[0.06] text-left transition-colors duration-200 last:border-r-0 hover:bg-white/[0.03] focus:outline-none focus-visible:bg-white/[0.05] ${selected ? 'bg-secondary-500/[0.08]' : ''} ${outside ? 'bg-black/10' : ''}`}
                  >
                    <span className={`absolute left-1.5 top-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-[11px] font-semibold tabular-nums ${iso === today ? 'bg-secondary-400 text-slate-950' : outside ? 'text-slate-600' : 'text-slate-300'}`}>
                      {day.getDate()}
                    </span>
                    {row.hidden[c] > 0 && <span className="absolute bottom-1 right-1.5 text-[10px] font-semibold text-slate-400">+{row.hidden[c]}</span>}
                  </button>
                )
              })}
            </div>
            {row.segments.map((seg) => <Bar key={`${seg.task.id}-${toISO(row.start)}`} seg={seg} onOpen={onOpenTask} />)}
          </div>
        ))}
      </div>
    </div>
  )
}
