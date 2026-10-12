import { CheckCircle2, Fingerprint, Loader2, ShieldCheck } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { sensorsApi } from '../../api.js'
import Card from '../../components/ui/Card.jsx'
import { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import { useSealSimulation } from './sealing.js'

/**
 * Certificación de telemetría (DEMO): congela una lectura de temperatura en un JSON canónico y calcula su huella
 * SHA-256 con `crypto.subtle` (Web Crypto nativa del navegador: sin librerías ni datos enviados a terceros).
 *
 * El hash es REAL y reproducible (mismo JSON → mismo hash). El anclaje en Polygon L2 todavía se SIMULA (espera de
 * 2,5 s, sin red ni transacción en cadena), y la interfaz lo indica para no presentar como real lo que no lo es.
 */

const NETWORK_DELAY_MS = 2500
const STEPS = ['Contactando API Core…', 'Generando Hash SHA-256…']
const TEMP_KINDS = ['air_temperature', 'soil_temperature']

/** Lectura de temperatura más reciente de la finca (una petición al montar o al cambiar de finca). */
function useLatestTemperature(farmId) {
  const [state, setState] = useState({ loading: Boolean(farmId), sensor: null })
  useEffect(() => {
    if (!farmId) {
      setState({ loading: false, sensor: null })
      return undefined
    }
    const controller = new AbortController()
    setState((s) => ({ ...s, loading: true }))
    sensorsApi
      .list(farmId, { signal: controller.signal })
      .then((sensors) => {
        const withValue = (sensors ?? []).filter((s) => TEMP_KINDS.includes(s.kind) && Number.isFinite(s.last_value))
        withValue.sort((a, b) => TEMP_KINDS.indexOf(a.kind) - TEMP_KINDS.indexOf(b.kind))
        setState({ loading: false, sensor: withValue[0] ?? null })
      })
      .catch((err) => {
        if (err?.name !== 'CanceledError') setState({ loading: false, sensor: null })
      })
    return () => controller.abort()
  }, [farmId])
  return state
}

export default function BlockchainCertifier({ farms = [] }) {
  const [farmId, setFarmId] = useState(() => farms[0]?.id ?? null)
  const { loading, sensor } = useLatestTemperature(farmId)
  const { phase, step, result, seal: sealJson, reset } = useSealSimulation({ delayMs: NETWORK_DELAY_MS, steps: STEPS })

  // Instantánea inmutable y canónica (orden de claves fijo): es exactamente lo que se «sella».
  const snapshot = useMemo(() => {
    const demo = !sensor
    return Object.freeze({
      farm_id: farmId ?? 'DEMO-0001',
      sensor_id: sensor?.id ?? null,
      metric: sensor?.kind ?? 'air_temperature',
      temperature_c: demo ? 22.4 : Number(sensor.last_value.toFixed(2)),
      timestamp: sensor?.last_at ?? new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
      source: demo ? 'demo' : 'agropelink-api-core',
    })
    // `farmId` y `sensor` definen la lectura; el instante solo se fija para los datos de ejemplo.
  }, [farmId, sensor])
  const json = useMemo(() => JSON.stringify(snapshot, null, 2), [snapshot])

  function changeFarm(value) {
    setFarmId(value ? Number(value) : null)
    reset()
  }

  function seal() {
    if (phase !== 'sealing') sealJson(json)
  }

  const sealing = phase === 'sealing'

  return (
    <Card
      title="Certificación de telemetría"
      className={`mb-12 transition-[border-color,box-shadow] duration-500 ${phase === 'sealed' ? 'card-glass-active' : ''}`}
      actions={
        <span className="inline-flex items-center gap-1 rounded-full bg-accent-500/15 px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-accent-200 ring-1 ring-inset ring-accent-400/30">
          Demo · Polygon L2 simulado
        </span>
      }
    >
      <p className="-mt-2 mb-5 text-sm text-slate-400">Huella SHA-256 de la lectura para su trazabilidad en blockchain.</p>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="min-w-0">
          {farms.length > 1 && (
            <div className="mb-3">
              <label htmlFor="cert-farm" className="mb-1 block text-xs text-slate-400">Finca</label>
              <select
                id="cert-farm"
                value={farmId ?? ''}
                onChange={(e) => changeFarm(e.target.value)}
                disabled={sealing}
                className={`${inputClass} sm:!w-auto sm:min-w-[12rem]`}
              >
                {farms.map((f) => (
                  <option key={f.id} value={f.id} className={optionClass}>{f.name}</option>
                ))}
              </select>
            </div>
          )}
          <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-slate-400">
            <Fingerprint className="h-3.5 w-3.5" aria-hidden="true" />
            {loading ? 'Leyendo telemetría…' : sensor ? `Lectura real · ${sensor.name}` : 'Datos de ejemplo (la finca no tiene sensor de temperatura con lecturas)'}
          </p>
          <pre
            aria-label="JSON de telemetría a certificar (solo lectura)"
            className="relative max-h-64 select-all overflow-auto rounded-2xl bg-slate-950/80 p-4 font-mono text-xs leading-relaxed text-secondary-100 ring-1 ring-inset ring-white/10"
            data-lenis-prevent
          >
            {json}
          </pre>
        </div>

        <div className="flex min-w-0 flex-col justify-between gap-4">
          <div>
            <button
              type="button"
              onClick={seal}
              disabled={sealing || loading}
              className="btn-primary h-12 w-full px-6 text-sm sm:w-auto"
              aria-describedby="cert-status"
            >
              {sealing ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <ShieldCheck className="h-4 w-4" aria-hidden="true" />}
              {sealing ? 'Sellando…' : phase === 'sealed' ? 'Volver a sellar' : 'Sellar Datos en Polygon L2'}
            </button>
            <ol id="cert-status" aria-live="polite" className="mt-4 space-y-2 text-sm">
              {sealing &&
                STEPS.map((label, i) => (
                  <li key={label} className={`flex items-center gap-2 ${i <= step ? 'text-slate-200' : 'text-slate-500'}`}>
                    {i < step ? (
                      <CheckCircle2 className="h-4 w-4 text-primary-400" aria-hidden="true" />
                    ) : i === step ? (
                      <Loader2 className="h-4 w-4 animate-spin text-secondary-300" aria-hidden="true" />
                    ) : (
                      <span className="h-4 w-4 rounded-full ring-1 ring-inset ring-white/20" aria-hidden="true" />
                    )}
                    {label}
                  </li>
                ))}
            </ol>
          </div>

          {phase === 'sealed' && result?.hash && (
            <div role="status" className="swap-in rounded-2xl bg-primary-500/10 p-4 ring-1 ring-inset ring-primary-400/40">
              <p className="flex items-center gap-2 text-sm font-semibold text-primary-200">
                <CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Transacción Verificada
              </p>
              <dl className="mt-3 space-y-2 text-xs">
                <div>
                  <dt className="text-slate-400">Hash SHA-256 del JSON</dt>
                  <dd className="mt-0.5 break-all font-mono text-primary-100">0x{result.hash}</dd>
                </div>
                <div className="flex flex-wrap gap-x-6 gap-y-1">
                  <div>
                    <dt className="inline text-slate-400">Red: </dt>
                    <dd className="inline text-slate-200">Polygon L2 (simulada)</dd>
                  </div>
                  <div>
                    <dt className="inline text-slate-400">Sellado: </dt>
                    <dd className="inline text-slate-200">{new Date(result.sealedAt).toLocaleString('es-ES')}</dd>
                  </div>
                </div>
              </dl>
              <p className="mt-3 text-[11px] leading-snug text-slate-400">
                El hash es real y reproducible a partir del JSON. El anclaje en cadena es una simulación de demostración: no se ha emitido ninguna transacción.
              </p>
            </div>
          )}
          {phase === 'error' && (
            <p role="alert" className="rounded-2xl bg-accent-500/10 p-4 text-sm text-accent-200 ring-1 ring-inset ring-accent-400/30">{result?.error}</p>
          )}
        </div>
      </div>
    </Card>
  )
}
