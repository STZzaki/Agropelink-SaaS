import { Outlet } from 'react-router-dom'
import FluidBackground from '../landing/FluidBackground.jsx'
import LandingFooter from '../landing/LandingFooter.jsx'
import LandingHeader from '../landing/LandingHeader.jsx'

/** Marco oscuro para páginas públicas fuera de la landing (p. ej. privacidad y términos). */
export default function PublicLayout() {
  return (
    <div className="relative isolate flex min-h-screen flex-col overflow-x-clip bg-slate-950 font-sans text-slate-200 antialiased selection:bg-secondary-400/30">
      <FluidBackground />
      <LandingHeader />
      <main className="relative z-10 flex-1 pt-16 sm:pt-20">
        <Outlet />
      </main>
      <LandingFooter />
    </div>
  )
}
