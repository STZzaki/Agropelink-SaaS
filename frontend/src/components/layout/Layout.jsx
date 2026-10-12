import { LazyMotion, MotionConfig, domAnimation, m } from 'framer-motion'
import { Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../../auth/AuthContext.jsx'
import { isFarmerOrAdmin } from '../../auth/roles.js'
import usePageMeta from '../../hooks/usePageMeta.js'
import { FORCE_MOTION } from '../../lib/gsap.js'
import AgentChat from '../agent/AgentChat.jsx'
import HelpButton from '../support/HelpButton.jsx'
import Footer from './Footer.jsx'
import Header from './Header.jsx'

function PrivateMeta() {
  // Panel privado: título genérico y fuera de los buscadores.
  usePageMeta({ title: 'Panel', description: 'Panel de gestión de tu explotación en Agropelink.', noindex: true })
  return null
}

/**
 * Marco del panel: fondo casi negro con un halo de marca estático (degradado, sin filtros) y transición
 * de entrada por página con framer-motion (solo opacidad y transform, 260 ms). `privateMeta={false}` en
 * rutas públicas que fijan su propio título e indexación.
 */
export default function Layout({ privateMeta = true }) {
  const { user } = useAuth()
  const { pathname } = useLocation()

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={FORCE_MOTION ? 'never' : 'user'}>
        <div className="panel-shell relative isolate flex min-h-screen flex-col bg-slate-950 text-slate-200 [color-scheme:dark] selection:bg-secondary-400/30">
          {privateMeta && <PrivateMeta />}
          <div className="panel-backdrop pointer-events-none fixed inset-0 -z-10" aria-hidden="true" />
          <div className="panel-halo pointer-events-none absolute inset-x-0 top-0 -z-10 h-[32rem]" aria-hidden="true" />
          <Header />
          <m.main
            key={pathname}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.26, ease: [0.2, 0, 0, 1] }}
            className="flex-1"
          >
            <Outlet />
          </m.main>
          <Footer />
          {/* El asistente agronómico es parte del panel de agricultor; la API lo restringe igualmente por rol. */}
          {isFarmerOrAdmin(user?.role) && <AgentChat />}
          {user && <HelpButton />}
        </div>
      </MotionConfig>
    </LazyMotion>
  )
}
