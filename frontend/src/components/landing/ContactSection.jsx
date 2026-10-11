import { SITE } from '../../config/site.js'
import ContactForm from './ContactForm.jsx'
import Reveal from './Reveal.jsx'
import SectionHeading from './SectionHeading.jsx'
import { InstagramIcon, MailIcon } from './icons.jsx'
import { ArrowRight } from 'lucide-react'

const CHANNELS = [{ label: 'Soporte, demos y comercial', value: SITE.email, href: `mailto:${SITE.email}` }]

export default function ContactSection() {
  return (
    <section id="contacto" className="relative scroll-mt-24 overflow-hidden border-t border-white/5 py-24 sm:py-32">
      <div className="pointer-events-none absolute bottom-0 left-1/2 h-72 w-[48rem] -translate-x-1/2 glow-secondary" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Contacto"
          title="Hablemos de tu explotación"
          description="Solicita una demostración o cuéntanos tu caso. Respondemos en 24–48 h laborables."
        />

        <div className="mt-14 grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <Reveal>
            <ContactForm />
          </Reveal>

          <Reveal delay={120} className="flex flex-col gap-4">
            <div className="rounded-3xl bg-gradient-to-br from-secondary-500/10 via-white/[0.02] to-primary-500/10 p-6 shadow-surface sm:p-8">
              <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-secondary-300 ring-1 ring-inset ring-white/10">
                <MailIcon />
              </span>
              <h3 className="mt-5 text-lg font-semibold text-white">Canal oficial de soporte</h3>
              <p className="mt-1 text-sm text-slate-400">
                Nuestro buzón oficial es {SITE.email}. Solo atendemos desde el dominio <span className="font-medium text-slate-200">@{SITE.domain}</span>. Desconfía de
                cualquier comunicación desde otros dominios.
              </p>
              <ul className="mt-6 space-y-3">
                {CHANNELS.map((c) => (
                  <li key={c.value}>
                    <a href={c.href} className="group flex items-center justify-between rounded-xl bg-white/[0.03] px-4 py-3 shadow-surface-sm transition-[background-color,box-shadow] duration-200 ease-out hover:bg-white/[0.06] hover:shadow-surface">
                      <span>
                        <span className="block text-xs text-slate-500">{c.label}</span>
                        <span className="text-sm font-medium text-white">{c.value}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-white" aria-hidden="true" />
                    </a>
                  </li>
                ))}
              </ul>
            </div>

            <a
              href={SITE.instagramUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="surface-interactive group flex items-center gap-4 p-6"
            >
              <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-[#f58529] via-[#dd2a7b] to-[#515bd4] text-white">
                <InstagramIcon className="h-6 w-6" />
              </span>
              <span className="flex-1">
                <span className="block text-sm font-semibold text-white">Síguenos en Instagram</span>
                <span className="text-sm text-slate-400">{SITE.instagramHandle} · novedades y casos de campo</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-500 transition-transform group-hover:translate-x-0.5 group-hover:text-white" aria-hidden="true" />
            </a>
          </Reveal>
        </div>
      </div>
    </section>
  )
}
