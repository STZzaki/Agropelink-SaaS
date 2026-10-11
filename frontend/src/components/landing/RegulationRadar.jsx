import { useId, useState } from 'react'
import { REGULATION_AREAS, REGULATIONS_REVIEWED_AT } from '../../data/regulations.js'
import CountUp from './CountUp.jsx'
import Reveal from './Reveal.jsx'
import SectionHeading from './SectionHeading.jsx'

const STATUS = {
  vigor: { label: 'En vigor', cls: 'bg-primary-500/10 text-primary-300 ring-primary-400/25', dot: 'bg-primary-400' },
  proxima: { label: 'Próxima exigencia', cls: 'bg-accent-500/10 text-accent-200 ring-accent-400/30', dot: 'bg-accent-400 animate-pulse' },
  prevista: { label: 'Prevista', cls: 'bg-secondary-500/10 text-secondary-300 ring-secondary-400/25', dot: 'bg-secondary-400' },
}

function StatusBadge({ status }) {
  const s = STATUS[status]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold ring-1 ring-inset ${s.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${s.dot}`} aria-hidden="true" />
      {s.label}
    </span>
  )
}

function RequirementItem({ item, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen)
  const panelId = useId()
  return (
    <li className={`rounded-2xl transition-[box-shadow,background-color] duration-300 ease-out ${open ? 'bg-white/[0.04] shadow-surface' : 'bg-white/[0.02] shadow-surface-sm hover:bg-white/[0.035]'}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={panelId}
        className="flex w-full items-start gap-4 rounded-2xl p-4 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400 sm:items-center sm:p-6"
      >
        <span className="flex-1">
          <span className="block font-medium text-white">{item.title}</span>
          <span className="mt-1 block text-xs text-slate-500">{item.date}</span>
        </span>
        <StatusBadge status={item.status} />
        <svg className={`mt-1 h-5 w-5 shrink-0 text-slate-500 transition-[transform,color] duration-300 ease-out-expo sm:mt-0 ${open ? 'rotate-180 text-secondary-300' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
          <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      <div
        id={panelId}
        className={`grid transition-[grid-template-rows,opacity] ease-out-expo ${open ? 'grid-rows-[1fr] opacity-100 duration-300' : 'grid-rows-[0fr] opacity-0 duration-200'}`}
      >
        <div className="overflow-hidden">
          <p className={`px-4 pb-6 text-sm leading-relaxed text-slate-400 transition-transform duration-300 ease-out-expo sm:px-6 ${open ? 'translate-y-0' : '-translate-y-1'}`}>
            {item.text}
          </p>
        </div>
      </div>
    </li>
  )
}

export default function RegulationRadar() {
  const [activeId, setActiveId] = useState(REGULATION_AREAS[0].id)
  const area = REGULATION_AREAS.find((a) => a.id === activeId)
  const counts = REGULATION_AREAS.flatMap((a) => a.items).reduce((acc, i) => ({ ...acc, [i.status]: (acc[i.status] ?? 0) + 1 }), {})
  const reviewed = new Date(`${REGULATIONS_REVIEWED_AT}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <section id="normativa" className="relative scroll-mt-24 border-t border-white/5 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <SectionHeading
            eyebrow="Radar de normativa"
            title="Las obligaciones que afectan a tu explotación, explicadas claro"
            description="Seguimos la normativa agraria para que sepas qué está en vigor y qué llega próximamente."
          />
          <Reveal stagger className="flex gap-4">
            {Object.entries(STATUS).map(([key, s]) => (
              <div key={key} className="rounded-2xl bg-white/[0.03] px-4 py-3 text-center shadow-surface-sm">
                <p className="text-2xl font-semibold text-white"><CountUp value={counts[key] ?? 0} from={0} duration={0.9} /></p>
                <p className="mt-0.5 text-[11px] text-slate-400">{s.label}</p>
              </div>
            ))}
          </Reveal>
        </div>

        <Reveal className="mt-12 grid gap-6 lg:grid-cols-[18rem_1fr]">
          <div role="tablist" aria-label="Áreas normativas" aria-orientation="vertical" className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible">
            {REGULATION_AREAS.map((a) => {
              const active = a.id === activeId
              const upcoming = a.items.filter((i) => i.status !== 'vigor').length
              return (
                <button
                  key={a.id}
                  type="button"
                  role="tab"
                  id={`tab-${a.id}`}
                  aria-selected={active}
                  aria-controls={`panel-${a.id}`}
                  onClick={() => setActiveId(a.id)}
                  className={`flex shrink-0 items-center justify-between gap-4 rounded-2xl px-4 py-4 text-left text-sm font-medium transition-[color,background-color,box-shadow,transform] duration-200 ease-out focus:outline-none focus-visible:ring-2 focus-visible:ring-secondary-400 active:scale-[0.98] lg:w-full ${
                    active
                      ? 'bg-secondary-500/10 text-white shadow-[0_0_0_1px_rgb(75_194_168_/_0.35),0_8px_24px_-12px_rgb(45_181_154_/_0.5)]'
                      : 'text-slate-400 shadow-surface-sm hover:bg-white/[0.04] hover:text-white'
                  }`}
                >
                  <span className="whitespace-nowrap lg:whitespace-normal">{a.short}</span>
                  {upcoming > 0 && (
                    <span className="rounded-full bg-accent-500/15 px-2 py-0.5 text-[10px] font-semibold text-accent-200" title="Requisitos próximos o previstos">
                      {upcoming} nuevo{upcoming > 1 ? 's' : ''}
                    </span>
                  )}
                </button>
              )
            })}
          </div>

          <div key={area.id} role="tabpanel" id={`panel-${area.id}`} aria-labelledby={`tab-${area.id}`} className="surface swap-in p-6 sm:p-8">
            <h3 className="text-xl font-semibold text-white sm:text-2xl">{area.title}</h3>
            <p className="mt-3 max-w-3xl text-sm leading-relaxed text-slate-400 sm:text-base">{area.summary}</p>
            <ul className="mt-6 space-y-4">
              {area.items.map((item, i) => (
                <RequirementItem key={item.title} item={item} defaultOpen={i === 0} />
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              {area.sources.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-full px-3 py-2 text-xs text-slate-300 shadow-surface-sm transition-[color,background-color] duration-200 ease-out hover:bg-white/[0.05] hover:text-white">
                  {s.label}
                  <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} aria-hidden="true"><path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M8 7h9v9" /></svg>
                </a>
              ))}
            </div>
          </div>
        </Reveal>

        <p className="mt-6 text-xs leading-relaxed text-slate-500">
          Información divulgativa revisada el {reviewed}. No constituye asesoramiento jurídico: los calendarios pueden cambiar y existen
          particularidades autonómicas. Confirma siempre en el BOE, en tu comunidad autónoma o con tu técnico/OCA.
        </p>
      </div>
    </section>
  )
}
