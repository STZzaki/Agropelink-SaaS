import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { LANDING_SECTIONS, SITE } from '../../config/site.js'
import UserMenu from '../auth/UserMenu.jsx'
import { ArrowRightIcon, InstagramIcon } from './icons.jsx'

/** Enlace a una sección de la landing: ancla local en `/`, navegación completa desde otras rutas. */
const sectionHref = (pathname, id) => (pathname === '/' ? `#${id}` : `/#${id}`)

function AuthActions({ compact = false }) {
  const { status } = useAuth()
  if (status === 'loading') return <span className="skeleton h-10 w-24 rounded-full" aria-hidden="true" />
  if (status === 'authenticated') return <UserMenu showPanelLink />
  return (
    <div className="flex items-center gap-2">
      <Link to="/login" className={`whitespace-nowrap rounded-full px-4 py-2.5 text-sm font-medium text-slate-200 transition-colors hover:bg-white/5 hover:text-white ${compact ? 'hidden sm:inline-flex' : ''}`}>
        Iniciar sesión
      </Link>
      <Link
        to="/register"
        className="hidden whitespace-nowrap rounded-full border border-white/15 px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:border-white/30 hover:bg-white/5 md:inline-flex"
      >
        Registrarse
      </Link>
    </div>
  )
}

export default function LandingHeader() {
  const { status } = useAuth()
  const { pathname } = useLocation()
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 12)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  useEffect(() => setOpen(false), [pathname])

  useEffect(() => {
    if (!open) return
    const onKey = (e) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const solid = scrolled || open || pathname !== '/'

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-[background-color,border-color,backdrop-filter] duration-300 ease-out ${
        solid ? 'border-b border-white/10 bg-slate-950/95' : 'border-b border-transparent bg-transparent'
      }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:h-20 sm:px-6 lg:px-8">
        <Link to="/" className="flex shrink-0 items-center" aria-label="Agropelink, página principal">
          <img src="/brand/logo-white.png" alt="Agropelink" className="h-11 w-auto object-contain sm:h-12" />
        </Link>

        <nav className="hidden xl:block" aria-label="Secciones">
          <ul className="flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1.5">
            {LANDING_SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={sectionHref(pathname, s.id)} className="whitespace-nowrap rounded-full px-2.5 py-1.5 text-sm font-medium text-slate-300 transition-colors 2xl:px-3.5 hover:bg-white/5 hover:text-white">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <a
            href={SITE.instagramUrl}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Instagram de Agropelink (${SITE.instagramHandle})`}
            className="hidden h-10 w-10 items-center justify-center rounded-full text-slate-300 shadow-surface-sm transition-[color,background-color,transform] duration-200 ease-out hover:bg-white/[0.06] hover:text-white active:scale-[0.96] 2xl:inline-flex"
          >
            <InstagramIcon />
          </a>
          <AuthActions compact />
          <Link
            to="/panel"
            className="btn-primary group hidden whitespace-nowrap px-5 py-2.5 text-sm lg:inline-flex"
          >
            Acceso Plataforma
            <ArrowRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="landing-mobile-nav"
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-slate-200 shadow-surface-sm transition-[background-color,transform] duration-200 ease-out hover:bg-white/[0.06] active:scale-[0.96] xl:hidden"
          >
            <span className="sr-only">{open ? 'Cerrar menú' : 'Abrir menú'}</span>
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true">
              {open ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
              )}
            </svg>
          </button>
        </div>
      </div>

      {open && (
        <nav id="landing-mobile-nav" aria-label="Secciones" className="pop-in origin-top max-h-[calc(100dvh-4rem)] overflow-y-auto border-t border-white/10 px-4 pb-6 pt-2 xl:hidden">
          <ul className="space-y-1">
            {LANDING_SECTIONS.map((s) => (
              <li key={s.id}>
                <a href={sectionHref(pathname, s.id)} onClick={() => setOpen(false)} className="block rounded-xl px-4 py-3 text-base font-medium text-slate-200 hover:bg-white/5">
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
          {status === 'anonymous' && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <Link to="/login" className="btn-secondary h-12 rounded-xl text-sm">
                Iniciar sesión
              </Link>
              <Link to="/register" className="btn-secondary h-12 rounded-xl text-sm">
                Registrarse
              </Link>
            </div>
          )}
          <div className="mt-3 grid grid-cols-[auto_1fr] gap-3">
            <a href={SITE.instagramUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary h-12 rounded-xl px-4 text-sm font-medium text-slate-200">
              <InstagramIcon /> Instagram
            </a>
            <Link to="/panel" className="btn-primary h-12 rounded-xl text-sm">
              Acceso Plataforma <ArrowRightIcon />
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}
