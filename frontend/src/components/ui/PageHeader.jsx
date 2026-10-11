export default function PageHeader({ title, subtitle, eyebrow }) {
  return (
    <div className="mb-8 sm:mb-10">
      {eyebrow && <p className="mb-2 text-xs font-semibold uppercase tracking-[0.18em] text-secondary-300">{eyebrow}</p>}
      <h1 className="text-balance text-2xl font-semibold tracking-tight text-white sm:text-3xl">{title}</h1>
      {subtitle && <p className="mt-2 max-w-2xl text-pretty text-slate-400">{subtitle}</p>}
    </div>
  )
}
