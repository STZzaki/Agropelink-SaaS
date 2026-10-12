import { CheckCircle2, Fingerprint, Loader2, ShieldCheck } from 'lucide-react'
import { useId, useMemo, useRef, useState } from 'react'
import { useSealSimulation } from '../../features/blockchain/sealing.js'
import { MOTION_OK, gsap, useGSAP } from '../../lib/gsap.js'
import SectionHeading from './SectionHeading.jsx'

/**
 * Demo pública (sin login) de la auditoría blockchain: una «tablet» flotante que se inclina con el scroll (GSAP +
 * perspectiva CSS) y replica el certificador del panel con datos FICTICIOS.
 *
 * - Hash real: SHA-256 del JSON mostrado, calculado en el navegador del visitante (`crypto.subtle`). Nada se envía.
 * - Red simulada: no se emite ninguna transacción; la interfaz lo dice («Polygon L2 (Simulada)»).
 */

const DELAY_MS = 2000
const STEPS = ['Generando Hash…']
// Si el navegador falla al calcular el hash, la demo pública termina igualmente con este valor estático.
const FALLBACK_HASH = 'dd9c1cc67416672d0e632818b78f2d88f2d7ecc0b8f8b1e7e8f24cb268fb9f80'

// Fincas y sensores de ejemplo (no son datos de clientes).
const DEMO_FARMS = [
  {
    id: 'FN-ALM-0004',
    name: 'Invernaderos El Alquián · Almería',
    sensors: [
      { id: 'SN-TH-0112', name: 'Termohigrómetro nave A', temperature: 24.6, humidity: 71 },
      { id: 'SN-TH-0118', name: 'Termohigrómetro nave B', temperature: 23.9, humidity: 68 },
    ],
  },
  {
    id: 'FN-SEV-0017',
    name: 'Olivar Los Olivos · Carmona',
    sensors: [{ id: 'SN-WS-0420', name: 'Estación agroclimática', temperature: 27.3, humidity: 41 }],
  },
  {
    id: 'FN-HUE-0009',
    name: 'Frutos rojos Doñana · Huelva',
    sensors: [
      { id: 'SN-TH-0907', name: 'Macrotúnel 3', temperature: 19.8, humidity: 82 },
      { id: 'SN-TH-0911', name: 'Macrotúnel 7', temperature: 20.4, humidity: 79 },
    ],
  },
]

const selectClass =
  'w-full rounded-xl border border-white/10 bg-black/50 px-3 py-2.5 text-sm text-white outline-none transition-colors focus:border-emerald-400/50 focus:ring-2 focus:ring-emerald-400/20 disabled:opacity-60'

function Tablet({ children }) {
  return (
    <div className="relative rounded-[2.25rem] border border-white/10 bg-gradient-to-b from-slate-800/80 to-black p-2.5 shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9),0_0_60px_rgba(16,185,129,0.12)] sm:p-3.5">
      {/* Cámara frontal y reflejo del cristal */}
      <span className="absolute left-1/2 top-1 h-1.5 w-1.5 -translate-x-1/2 rounded-full bg-white/15 sm:top-1.5" aria-hidden="true" />
      <div className="relative overflow-hidden rounded-[1.6rem] border border-white/[0.06] bg-[#070b0a]">
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.06),transparent_35%)]" aria-hidden="true" />
        {children}
      </div>
    </div>
  )
}

export default function BlockchainAuditSection() {
  const uid = useId()
  const sectionRef = useRef(null)
  const tabletRef = useRef(null)
  const [farmIndex, setFarmIndex] = useState(0)
  const [sensorIndex, setSensorIndex] = useState(0)
  const [stamp, setStamp] = useState(() => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'))
  const { phase, result, seal, reset } = useSealSimulation({ delayMs: DELAY_MS, steps: STEPS, fallbackHash: FALLBACK_HASH })
  const sealing = phase === 'sealing'

  const farm = DEMO_FARMS[farmIndex]
  const sensor = farm.sensors[sensorIndex] ?? farm.sensors[0]

  // JSON canónico e inmutable: exactamente lo que se «sella».
  const json = useMemo(
    () =>
      JSON.stringify(
        Object.freeze({
          farm_id: farm.id,
          sensor_id: sensor.id,
          temperature_c: sensor.temperature,
          humidity_pct: sensor.humidity,
          timestamp: stamp,
          source: 'public-demo',
        }),
        null,
        2,
      ),
    [farm, sensor, stamp],
  )

  function handleSeal() {
    console.log('¡Clic registrado!')
    try {
      if (sealing) return
      if (typeof json !== 'string' || !json) throw new Error('JSON de telemetría no definido.')
      seal(json)
    } catch (err) {
      // Nunca rompe la demo: el hook muestra el hash estático de respaldo.
      console.error('[demo blockchain]', err)
      seal(null)
    }
  }

  function select(nextFarm, nextSensor) {
    setFarmIndex(nextFarm)
    setSensorIndex(nextSensor)
    setStamp(new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')) // nueva lectura → nueva marca de tiempo
    reset()
  }

  // Inclinación 3D ligada al scroll: entra inclinada y se endereza al centrarse (scrub = sigue al scroll).
  useGSAP(
    () => {
      const mm = gsap.matchMedia()
      mm.add(MOTION_OK, () => {
        const k = window.innerWidth < 768 ? 0.45 : 1 // en móvil, menos giro: los bordes no se salen de la pantalla
        gsap.fromTo(
          tabletRef.current,
          { rotateX: 18 * k, rotateY: -16 * k, y: 60 * k },
          {
            rotateX: -4 * k,
            rotateY: 8 * k,
            y: -20 * k,
            ease: 'none',
            scrollTrigger: { trigger: sectionRef.current, start: 'top bottom', end: 'bottom top', scrub: 1 },
          },
        )
      })
      return () => mm.revert()
    },
    { scope: sectionRef },
  )

  return (
    <section id="auditoria" ref={sectionRef} className="relative scroll-mt-24 overflow-hidden border-t border-white/5 py-24 sm:py-32">
      <div className="pointer-events-none absolute right-0 top-1/3 h-96 w-[40rem] glow-secondary" aria-hidden="true" />
      <div className="relative mx-auto grid max-w-7xl grid-cols-1 items-center gap-14 px-4 sm:px-6 lg:grid-cols-5 lg:px-8">
        <div className="lg:col-span-2">
          <SectionHeading
            eyebrow="Demo pública · sin registro"
            title="Auditoría Blockchain Transparente"
            description="Cada lectura de telemetría puede sellarse con su huella criptográfica para demostrar que no se ha alterado. Pruébalo: elige una finca y un sensor de ejemplo y sella sus datos."
          />
          <ul className="mt-8 space-y-3 text-sm text-slate-300">
            {['Huella SHA-256 calculada en tu navegador', 'JSON inmutable: lo que ves es lo que se sella', 'Trazabilidad lista para auditorías y certificaciones'].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-3 [perspective:1600px]">
          {/* Sin `preserve-3d`: la tablet gira como una sola pieza (basta la perspectiva del padre). Con preserve-3d,
              el `active:scale` del botón lo sacaba del hit-test al pulsarlo y el clic acababa en el contenedor. */}
          <div ref={tabletRef} className="mx-auto max-w-2xl will-change-transform">
            <Tablet>
              {/* Barra de estado del «dispositivo» */}
              <div className="flex items-center justify-between border-b border-white/[0.06] px-4 py-2.5 sm:px-5">
                <span className="font-mono text-[11px] text-slate-500">agropelink · certifier</span>
                <span className="pill-neon">
                  <span className="pill-neon-dot motion-ok:animate-pulse" aria-hidden="true" />
                  Demo
                </span>
              </div>

              <div className="space-y-4 p-4 sm:p-6">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label htmlFor={`${uid}-farm`} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Finca</label>
                    <select id={`${uid}-farm`} value={farmIndex} disabled={sealing} onChange={(e) => select(Number(e.target.value), 0)} className={selectClass}>
                      {DEMO_FARMS.map((f, i) => (
                        <option key={f.id} value={i} className="bg-slate-900">{f.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label htmlFor={`${uid}-sensor`} className="mb-1 block text-[11px] font-medium uppercase tracking-wide text-slate-500">Sensor</label>
                    <select id={`${uid}-sensor`} value={sensorIndex} disabled={sealing} onChange={(e) => select(farmIndex, Number(e.target.value))} className={selectClass}>
                      {farm.sensors.map((s, i) => (
                        <option key={s.id} value={i} className="bg-slate-900">{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div>
                  <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                    <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" /> Telemetría a certificar (solo lectura)
                  </p>
                  <pre
                    aria-label="JSON de telemetría de ejemplo (solo lectura)"
                    data-lenis-prevent
                    className="max-h-56 overflow-auto rounded-xl border border-white/[0.06] bg-black/70 p-4 font-mono text-xs leading-relaxed text-emerald-200/90"
                  >
                    {json}
                  </pre>
                </div>

                <button
                  type="button"
                  onClick={handleSeal}
                  disabled={sealing}
                  className="btn-primary h-12 w-full text-sm"
                  aria-describedby={`${uid}-status`}
                >
                  {sealing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
                  {sealing ? 'Generando Hash…' : phase === 'sealed' ? 'Sellar de nuevo' : 'Sellar en Polygon L2'}
                </button>

                <div id={`${uid}-status`} aria-live="polite">
                  {phase === 'sealed' && result?.hash && (
                    <div className="swap-in rounded-xl border border-emerald-400/50 bg-emerald-500/[0.07] p-4 shadow-[0_0_25px_rgba(16,185,129,0.35)]">
                      <p className="flex items-center gap-2 text-sm font-semibold text-emerald-300">
                        <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Transacción Verificada
                      </p>
                      <dl className="mt-3 space-y-2 text-xs">
                        <div>
                          <dt className="text-slate-400">Hash SHA-256</dt>
                          <dd className="mt-0.5 break-all font-mono text-emerald-100">0x{result.hash}</dd>
                        </div>
                        <div>
                          <dt className="inline text-slate-400">Red: </dt>
                          <dd className="inline font-semibold text-slate-200">Polygon L2 (Simulada)</dd>
                        </div>
                      </dl>
                    </div>
                  )}
                  {phase === 'error' && (
                    <p role="alert" className="rounded-xl border border-accent-400/30 bg-accent-500/10 p-3 text-sm text-accent-200">{result?.error}</p>
                  )}
                </div>
              </div>
            </Tablet>
          </div>
          <p className="mx-auto mt-6 max-w-2xl text-center text-xs text-slate-500">
            Demo con datos ficticios. El hash es real y se calcula en tu navegador; el anclaje en Polygon L2 está simulado y no se emite ninguna transacción.
          </p>
        </div>
      </div>
    </section>
  )
}
