import { useState } from 'react'
import Reveal from './Reveal.jsx'
import SectionHeading from './SectionHeading.jsx'

// Fotografías en `public/team/`. Si un archivo aún no existe, se muestra el avatar con iniciales.
// Biografías provisionales: revisar con cada fundador antes de publicar.
const TEAM = [
  {
    name: 'Zakaryae Abechar',
    role: 'CEO & Fundador',
    photo: '/team/zakaryae.jpg',
    bio: 'Lidera la visión de producto y la arquitectura tecnológica de Agropelink: IA aplicada, plataforma cloud y seguridad de datos agrícolas.',
    focus: ['Producto', 'IA', 'Arquitectura'],
    gradient: 'from-primary-400 to-secondary-500',
  },
  {
    name: 'Julio',
    role: 'CRO & Co-fundador',
    photo: '/team/julio.jpg',
    bio: 'Dirige la estrategia comercial y las alianzas con explotaciones, cooperativas y comercializadoras del sector hortofrutícola.',
    focus: ['Ventas', 'Alianzas', 'Mercado'],
    gradient: 'from-secondary-400 to-primary-600',
  },
  {
    name: 'Álvaro',
    role: 'COO & Co-fundador',
    photo: '/team/alvaro.jpg',
    bio: 'Coordina las operaciones y el despliegue en campo: instalación de sensores, implantación con clientes y soporte técnico.',
    focus: ['Operaciones', 'Despliegue', 'Soporte'],
    gradient: 'from-primary-300 to-secondary-600',
  },
]

const initials = (name) => name.split(' ').map((n) => n[0]).slice(0, 2).join('')

function Avatar({ member }) {
  // 'loading' → 'loaded' | 'error'. Mientras carga (o si falla) se ven las iniciales: sin saltos de layout.
  const [state, setState] = useState(member.photo ? 'loading' : 'error')

  return (
    <div className={`relative h-20 w-20 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br ${member.gradient} p-px shadow-lg shadow-secondary-900/40`}>
      <div className="flex h-full w-full items-center justify-center rounded-[15px] bg-slate-950 text-xl font-semibold tracking-wide text-white" aria-hidden={state === 'loaded'}>
        <span className={`bg-gradient-to-br ${member.gradient} bg-clip-text text-transparent`}>{initials(member.name)}</span>
      </div>
      {state !== 'error' && (
        <img
          src={member.photo}
          alt={`Fotografía de ${member.name}`}
          loading="lazy"
          decoding="async"
          onLoad={() => setState('loaded')}
          onError={() => setState('error')}
          className={`absolute inset-px h-[calc(100%-2px)] w-[calc(100%-2px)] rounded-[15px] object-cover outline outline-1 -outline-offset-1 outline-white/10 transition-opacity duration-500 ${state === 'loaded' ? 'opacity-100' : 'opacity-0'}`}
        />
      )}
    </div>
  )
}

export default function TeamSection() {
  return (
    <section id="equipo" className="relative scroll-mt-24 border-t border-white/5 py-24 sm:py-32">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Equipo fundador"
          title="Tecnología y campo, en el mismo equipo"
          description="Un equipo que combina desarrollo de software, conocimiento comercial del sector y experiencia operativa en explotaciones."
        />
        <ul className="mt-14 grid gap-5 md:grid-cols-3">
          {TEAM.map((m, i) => (
            <Reveal
              as="li"
              key={m.name}
              delay={(i + 1) * 100}
              className="surface-interactive group relative overflow-hidden p-6 sm:p-8"
            >
              <div className="glow-secondary pointer-events-none absolute -right-20 -top-20 h-56 w-56 opacity-60 transition-opacity duration-300 group-hover:opacity-100" aria-hidden="true" />
              <Avatar member={m} />
              <h3 className="mt-6 text-lg font-semibold text-white">{m.name}</h3>
              <p className="text-sm font-medium text-secondary-300">{m.role}</p>
              <p className="mt-4 text-sm leading-relaxed text-slate-400">{m.bio}</p>
              <ul className="mt-6 flex flex-wrap gap-2">
                {m.focus.map((f) => (
                  <li key={f} className="rounded-full border border-white/10 px-2.5 py-1 text-[11px] font-medium text-slate-300">
                    {f}
                  </li>
                ))}
              </ul>
            </Reveal>
          ))}
        </ul>
      </div>
    </section>
  )
}
