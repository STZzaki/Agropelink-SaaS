import { Link } from 'react-router-dom'
import { LANDING_SECTIONS, LEGAL, SITE } from '../../config/site.js'
import { CookieSettingsLink } from '../../consent/CookieBanner.jsx'
import { InstagramIcon } from './icons.jsx'

export default function LandingFooter() {
  const year = new Date().getFullYear()
  return (
    <footer className="relative z-10 border-t border-white/10 bg-slate-950/90 pb-28 pt-14 md:pb-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-10 md:flex-row md:items-start md:justify-between">
          <div className="max-w-sm">
            <img src="/brand/logo-white.png" alt="Agropelink" className="h-14 w-auto object-contain" />
            <p className="mt-4 text-sm leading-relaxed text-slate-400">
              Plataforma AgTech de sensorización, gestión e inteligencia de mercado para explotaciones agrícolas.
            </p>
            <a href={`mailto:${SITE.email}`} className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-secondary-300 hover:text-secondary-200">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.75} aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16v12H4z" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7l8 6 8-6" />
              </svg>
              {SITE.email}
            </a>
          </div>
          <nav aria-label="Pie de página" className="grid grid-cols-2 gap-x-12 gap-y-3 text-sm">
            {LANDING_SECTIONS.map((s) => (
              <a key={s.id} href={`/#${s.id}`} className="text-slate-400 hover:text-white">{s.label}</a>
            ))}
            <Link to="/foro" className="text-slate-400 hover:text-white">Foro</Link>
            <Link to="/panel" className="text-slate-400 hover:text-white">Acceso Plataforma</Link>
            <a href={SITE.instagramUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-slate-400 hover:text-white">
              <InstagramIcon className="h-4 w-4" /> Instagram
            </a>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-4 border-t border-white/10 pt-6 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <p>© {year} Agropelink · {SITE.domain}. Co-fundado por la Unión Europea.</p>
            <p>
              Titular: {LEGAL.owner} · NIF {LEGAL.taxId} ·{' '}
              <a href={`mailto:${LEGAL.email}`} className="hover:text-slate-300">{LEGAL.email}</a>
            </p>
            <p>{LEGAL.address}</p>
          </div>
          <nav aria-label="Enlaces legales" className="flex flex-wrap gap-x-6 gap-y-2">
            <Link to="/privacidad" className="hover:text-slate-300">Privacidad</Link>
            <Link to="/terminos" className="hover:text-slate-300">Aviso legal y términos</Link>
            <CookieSettingsLink className="hover:text-slate-300" />
          </nav>
        </div>
      </div>
    </footer>
  )
}
