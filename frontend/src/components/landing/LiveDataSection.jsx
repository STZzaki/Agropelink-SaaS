import FuelWidget from './FuelWidget.jsx'
import MarketBoard from './MarketBoard.jsx'
import Reveal from './Reveal.jsx'
import SectionHeading from './SectionHeading.jsx'
import WeatherWidget from './WeatherWidget.jsx'

export default function LiveDataSection() {
  return (
    <section id="mercado" className="relative scroll-mt-24 overflow-hidden border-t border-white/5 py-24 sm:py-32">
      <div className="pointer-events-none absolute inset-x-0 top-1/3 mx-auto h-72 max-w-4xl glow-primary" aria-hidden="true" />
      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          eyebrow="Datos de campo y mercado"
          title="Lo que pasa fuera de tu invernadero, en tiempo real"
          description="Una muestra de la información que Agropelink cruza a diario para cada explotación: meteorología, carburante y referencias de precio en origen."
        />
        <div className="mt-14 grid gap-6 lg:grid-cols-2">
          <Reveal className="h-full">
            <WeatherWidget />
          </Reveal>
          <Reveal delay={100} className="h-full">
            <FuelWidget />
          </Reveal>
          <Reveal delay={150} className="h-full lg:col-span-2">
            <MarketBoard />
          </Reveal>
        </div>
      </div>
    </section>
  )
}
