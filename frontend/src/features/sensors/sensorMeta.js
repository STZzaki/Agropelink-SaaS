// Tipos de sensor (mismo catálogo que backend/sensor_catalog.py; la unidad y los rangos los fija el servidor).
// El color identifica el tipo en tarjetas y gráfica; nunca va solo: siempre acompaña al nombre y la unidad.
export const SENSOR_KINDS = [
  { id: 'soil_moisture', label: 'Humedad del suelo', color: '#24a58c' },
  { id: 'soil_temperature', label: 'Temperatura del suelo', color: '#c6804b' },
  { id: 'air_temperature', label: 'Temperatura ambiente', color: '#d9a476' },
  { id: 'air_humidity', label: 'Humedad relativa', color: '#7fc982' },
  { id: 'conductivity', label: 'Conductividad (CE)', color: '#4bc2a8' },
  { id: 'ph', label: 'pH del suelo', color: '#97cf99' },
  { id: 'water_flow', label: 'Caudal de riego', color: '#4bc2a8' },
  { id: 'solar_radiation', label: 'Radiación solar', color: '#e8c8a9' },
  { id: 'co2', label: 'CO₂', color: '#b2e8da' },
]
export const kindColor = (kind) => SENSOR_KINDS.find((k) => k.id === kind)?.color ?? '#7fd6c2'

export const WINDOWS = [
  { hours: 6, label: '6 h' },
  { hours: 24, label: '24 h' },
  { hours: 168, label: '7 días' },
]

export const POLL_MS = 30_000
// Sin lecturas en este tiempo, el sensor se muestra como "sin señal".
const OFFLINE_MS = 2 * 60 * 60 * 1000

export function formatValue(value, decimals = 1) {
  if (value === null || value === undefined) return '—'
  return new Intl.NumberFormat('es-ES', { minimumFractionDigits: decimals, maximumFractionDigits: decimals }).format(value)
}

const rtf = new Intl.RelativeTimeFormat('es-ES', { numeric: 'auto' })
export function ago(iso, now = Date.now()) {
  if (!iso) return 'sin lecturas'
  const minutes = Math.round((now - new Date(iso).getTime()) / 60000)
  if (minutes < 1) return 'ahora mismo'
  if (minutes < 60) return rtf.format(-minutes, 'minute')
  if (minutes < 60 * 24) return rtf.format(-Math.round(minutes / 60), 'hour')
  return rtf.format(-Math.round(minutes / 1440), 'day')
}

/** Estado del sensor: sin señal · bajo · alto · en rango (o sin rango recomendado). */
export function sensorStatus(sensor, now = Date.now()) {
  if (!sensor.last_at || now - new Date(sensor.last_at).getTime() > OFFLINE_MS) return 'offline'
  if (!sensor.optimal) return 'ok'
  const [lo, hi] = sensor.optimal
  if (sensor.last_value < lo) return 'low'
  if (sensor.last_value > hi) return 'high'
  return 'ok'
}

// ---------------------------------------------------------------------------------------------------
// Datos de EJEMPLO (deterministas, sin aleatoriedad) para previsualizar el panel cuando la finca aún no tiene
// sensores. Siempre se muestran etiquetados como ejemplo y nunca se mezclan con datos reales.

const DEMO_SENSORS = [
  { id: -1, kind: 'soil_moisture', name: 'Sonda sector norte', zone: 'Sector 1', label: 'Humedad del suelo', unit: '%', optimal: [30, 60], decimals: 1, base: 44, amp: 9, period: 9 },
  { id: -2, kind: 'air_temperature', name: 'Termómetro invernadero', zone: 'Nave A', label: 'Temperatura ambiente', unit: '°C', optimal: [12, 30], decimals: 1, base: 22, amp: 8, period: 24 },
  { id: -3, kind: 'air_humidity', name: 'Higrómetro invernadero', zone: 'Nave A', label: 'Humedad relativa', unit: '%', optimal: [50, 85], decimals: 0, base: 70, amp: 14, period: 24, phase: Math.PI },
  { id: -4, kind: 'conductivity', name: 'Sonda CE gotero', zone: 'Sector 1', label: 'Conductividad (CE)', unit: 'dS/m', optimal: [0.5, 2.5], decimals: 2, base: 1.9, amp: 0.35, period: 12 },
]

export function demoData(hours) {
  const bucket = { 6: 5, 24: 15, 168: 120 }[hours]
  const now = Date.now()
  const step = bucket * 60 * 1000
  const end = Math.floor(now / step) * step
  const count = Math.round((hours * 60) / bucket)
  const series = DEMO_SENSORS.map((s) => {
    const points = []
    for (let i = count - 1; i >= 0; i -= 1) {
      const t = end - i * step
      const h = t / 3_600_000
      const v = s.base + s.amp * Math.sin((2 * Math.PI * h) / s.period + (s.phase ?? 0)) + (s.amp / 6) * Math.sin(h * 1.7)
      points.push([new Date(t).toISOString(), Math.round(v * 100) / 100])
    }
    return { sensor_id: s.id, points }
  })
  const sensors = DEMO_SENSORS.map((s, i) => {
    const last = series[i].points.at(-1)
    return { ...s, farm_id: 0, last_value: last[1], last_at: new Date(now).toISOString() }
  })
  return { sensors, series: { hours, bucket_minutes: bucket, generated_at: new Date(now).toISOString(), series } }
}
