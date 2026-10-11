import Reveal from './Reveal.jsx'

export default function SectionHeading({ eyebrow, title, description, align = 'left' }) {
  const centered = align === 'center'
  return (
    <Reveal stagger y={16} className={`max-w-2xl ${centered ? 'mx-auto text-center' : ''}`}>
      {eyebrow && (
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-secondary-400">{eyebrow}</p>
      )}
      <h2 className="mt-3 text-3xl font-semibold tracking-tight text-white sm:text-4xl">{title}</h2>
      {description && <p className="mt-4 text-base leading-relaxed text-slate-400 sm:text-lg">{description}</p>}
    </Reveal>
  )
}
