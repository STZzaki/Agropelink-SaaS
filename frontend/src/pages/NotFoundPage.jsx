import { Link } from 'react-router-dom'
import usePageMeta from '../hooks/usePageMeta.js'

export default function NotFoundPage() {
  usePageMeta({
    title: 'Página no encontrada',
    description: 'La página que buscas no existe en Agropelink. Vuelve al inicio o accede a la plataforma.',
    noindex: true,
  })

  return (
    <div className="relative mx-auto flex max-w-xl flex-col items-center px-4 py-24 text-center sm:py-32">
      <div className="pointer-events-none absolute left-1/2 top-16 h-56 w-56 -translate-x-1/2 glow-secondary" aria-hidden="true" />
      <img src="/brand/logo-mark-white.png" alt="" aria-hidden="true" className="relative h-14 w-auto opacity-80" />
      <p className="relative mt-6 bg-gradient-to-r from-primary-300 to-secondary-400 bg-clip-text text-7xl font-semibold tracking-tight text-transparent">404</p>
      <h1 className="relative mt-3 text-2xl font-semibold text-white sm:text-3xl">Esta parcela está vacía</h1>
      <p className="relative mt-3 text-slate-400">La página que buscas no existe o se ha movido. Te ayudamos a volver al camino.</p>
      <div className="relative mt-8 flex flex-col gap-3 sm:flex-row">
        <Link to="/" className="btn-primary h-12 px-7 text-sm">
          Volver al inicio
        </Link>
        <Link to="/panel" className="btn-secondary h-12 px-7 text-sm">
          Acceso Plataforma
        </Link>
      </div>
    </div>
  )
}
