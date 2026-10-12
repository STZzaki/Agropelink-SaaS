import AboutSection from '../components/landing/AboutSection.jsx'
import ArchitectureSection from '../components/landing/ArchitectureSection.jsx'
import BlockchainAuditSection from '../components/landing/BlockchainAuditSection.jsx'
import ContactSection from '../components/landing/ContactSection.jsx'
import ScrollWorld from '../components/landing/ScrollWorld.jsx'
import Hero from '../components/landing/Hero.jsx'
import InstagramFeed from '../components/landing/InstagramFeed.jsx'
import LandingFooter from '../components/landing/LandingFooter.jsx'
import LandingHeader from '../components/landing/LandingHeader.jsx'
import LiveDataSection from '../components/landing/LiveDataSection.jsx'
import RegulationRadar from '../components/landing/RegulationRadar.jsx'
import StickyCta from '../components/landing/StickyCta.jsx'
import TeamSection from '../components/landing/TeamSection.jsx'
import VideoShowcase from '../components/landing/VideoShowcase.jsx'
import ErrorBoundary from '../components/ui/ErrorBoundary.jsx'
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
      {/* Cada sección con su límite de errores: un dato o widget de terceros que falle no tumba la página. */}
      <main id="main" className="relative z-10">
        <ErrorBoundary name="Hero"><Hero /></ErrorBoundary>
        <ErrorBoundary name="ArchitectureSection"><ArchitectureSection /></ErrorBoundary>
        <ErrorBoundary name="BlockchainAuditSection"><BlockchainAuditSection /></ErrorBoundary>
        <ErrorBoundary name="AboutSection"><AboutSection /></ErrorBoundary>
        <ErrorBoundary name="VideoShowcase"><VideoShowcase /></ErrorBoundary>
        <ErrorBoundary name="LiveDataSection"><LiveDataSection /></ErrorBoundary>
        <ErrorBoundary name="RegulationRadar"><RegulationRadar /></ErrorBoundary>
        <ErrorBoundary name="TeamSection"><TeamSection /></ErrorBoundary>
        <ErrorBoundary name="InstagramFeed"><InstagramFeed /></ErrorBoundary>
        <ErrorBoundary name="ContactSection"><ContactSection /></ErrorBoundary>
      </main>
      <LandingFooter />
      <StickyCta />
    </div>
  )
}
