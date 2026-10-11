import AboutSection from '../components/landing/AboutSection.jsx'
import ContactSection from '../components/landing/ContactSection.jsx'
import ScrollWorld from '../components/landing/ScrollWorld.jsx'
import ForumPromo from '../components/landing/ForumPromo.jsx'
import Hero from '../components/landing/Hero.jsx'
import InstagramFeed from '../components/landing/InstagramFeed.jsx'
import LandingFooter from '../components/landing/LandingFooter.jsx'
import LandingHeader from '../components/landing/LandingHeader.jsx'
import LiveDataSection from '../components/landing/LiveDataSection.jsx'
import RegulationRadar from '../components/landing/RegulationRadar.jsx'
import StickyCta from '../components/landing/StickyCta.jsx'
import TeamSection from '../components/landing/TeamSection.jsx'
import VideoShowcase from '../components/landing/VideoShowcase.jsx'
import usePageMeta from '../hooks/usePageMeta.js'

export default function Landing() {
  usePageMeta({
    title: 'Agropelink — Digitalización, sensores e IA para el campo',
    description:
      'Plataforma AgTech para explotaciones agrícolas: sensorización de riego, asistente agronómico con IA supervisada, cotizaciones de lonja, gasóleo B y normativa. Co-fundado por la Unión Europea.',
    path: '/',
  })

  return (
    <div className="relative isolate min-h-screen overflow-x-clip bg-slate-950 font-sans text-slate-200 antialiased selection:bg-secondary-400/30">
      <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-slate-900">
        Saltar al contenido
      </a>
      {/* Fondo 3D "Scroll World" (diferido); mientras carga o sin WebGL, las ondas ligeras. */}
      <ScrollWorld />
      <LandingHeader />
      <main id="main" className="relative z-10">
        <Hero />
        <AboutSection />
        <VideoShowcase />
        <LiveDataSection />
        <RegulationRadar />
        <ForumPromo />
        <TeamSection />
        <InstagramFeed />
        <ContactSection />
      </main>
      <LandingFooter />
      <StickyCta />
    </div>
  )
}
