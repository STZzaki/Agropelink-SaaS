import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { LEGAL } from '../../config/site.js'

/** Muestra un dato legal o un aviso visible si aún no se ha completado en `LEGAL` (config/site.js). */
export function LegalValue({ value, label }) {
  if (value) return <>{value}</>
  return (
    <mark className="rounded bg-accent-500/20 px-1.5 py-0.5 text-accent-100">[Pendiente: {label}]</mark>
  )
}

export function Section({ id, title, children }) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-28">
      <h2 id={`${id}-title`} className="text-xl font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-300 sm:text-[15px] [&_a]:font-medium [&_a]:text-secondary-300 [&_a]:underline [&_a]:underline-offset-2 [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-white">
        {children}
      </div>
    </section>
  )
}

export function DataTable({ caption, head, rows }) {
  return (
    <div className="-mx-4 overflow-x-auto sm:mx-0">
      <table className="w-full min-w-[34rem] border-collapse text-left text-xs sm:text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-white/15 text-slate-400">
            {head.map((h) => <th key={h} scope="col" className="px-4 py-2 font-medium sm:px-3">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row[0]} className="border-b border-white/5 align-top">
              {row.map((cell, i) => (
                <td key={i} className={`px-4 py-2.5 sm:px-3 ${i === 0 ? 'font-medium text-white' : 'text-slate-300'}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Marco común de las páginas legales: título, fecha de actualización e índice navegable. */
export default function LegalPage({ eyebrow, title, intro, toc, children }) {
  const { hash } = useLocation()

  // Las anclas (#cookies…) no se resuelven solas en una SPA: se desplaza tras el render.
  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(decodeURIComponent(hash.slice(1)))
    el?.scrollIntoView()
  }, [hash])

  const updated = new Date(`${LEGAL.updatedAt}T00:00:00`).toLocaleDateString('es-ES', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16 lg:px-8">
      <header className="max-w-3xl">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary-400">{eyebrow}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h1>
        <p className="mt-2 text-sm text-slate-500">Última actualización: {updated}</p>
        {intro && <p className="mt-5 text-base leading-relaxed text-slate-400">{intro}</p>}
      </header>

      <div className="mt-10 grid gap-10 lg:grid-cols-[15rem_1fr]">
        <nav aria-label="Índice" className="lg:sticky lg:top-28 lg:self-start">
          <ol className="space-y-1 border-l border-white/10 text-sm">
            {toc.map((item) => (
              <li key={item.id}>
                <a href={`#${item.id}`} className="-ml-px block border-l border-transparent py-1 pl-4 text-slate-400 hover:border-secondary-400 hover:text-white">
                  {item.label}
                </a>
              </li>
            ))}
          </ol>
        </nav>
        <article className="max-w-3xl space-y-10">{children}</article>
      </div>
    </div>
  )
}
