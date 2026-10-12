import { useState } from 'react'
import { farmsApi, getErrorMessage } from '../../api.js'
import Button from '../../components/ui/Button.jsx'
import FormField, { inputClass } from '../../components/ui/FormField.jsx'
import FarmSelect from '../farms/FarmSelect.jsx'

const todayISO = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

/** Registro manual de riego/humedad (mientras no haya sensores IoT conectados). */
export default function ReadingQuickForm({ farms, onSaved }) {
  const [values, setValues] = useState({ farm_id: farms.length === 1 ? String(farms[0].id) : '', recorded_on: todayISO(), water_liters: '', soil_moisture_pct: '' })
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    setSaved(false)
  }
  const num = (v) => (String(v).trim() === '' ? null : Number(String(v).replace(',', '.')))

  async function handleSubmit(e) {
    e.preventDefault()
    const water = num(values.water_liters)
    const moisture = num(values.soil_moisture_pct)
    if (!values.farm_id) return setError('Elige la finca.')
    if (water === null && moisture === null) return setError('Indica el agua usada, la humedad o ambas.')
    if ((water !== null && (!Number.isFinite(water) || water < 0)) || (moisture !== null && (!Number.isFinite(moisture) || moisture < 0 || moisture > 100))) {
      return setError('Revisa los valores: agua ≥ 0 y humedad entre 0 y 100 %.')
    }
    setSaving(true)
    setError(null)
    try {
      await farmsApi.addReading(values.farm_id, { recorded_on: values.recorded_on, water_liters: water, soil_moisture_pct: moisture })
      setValues((v) => ({ ...v, water_liters: '', soil_moisture_pct: '' }))
      setSaved(true)
      onSaved?.()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5 lg:items-end">
      <FormField id="rd-farm" label="Finca">
        <FarmSelect id="rd-farm" farms={farms} value={values.farm_id} onChange={(v) => setValues((s) => ({ ...s, farm_id: v }))} />
      </FormField>
      <FormField id="rd-date" label="Fecha">
        <input id="rd-date" type="date" max={todayISO()} value={values.recorded_on} onChange={set('recorded_on')} className={inputClass} />
      </FormField>
      <FormField id="rd-water" label="Agua usada (L)">
        <input id="rd-water" inputMode="decimal" value={values.water_liters} onChange={set('water_liters')} className={inputClass} placeholder="1200" />
      </FormField>
      <FormField id="rd-moist" label="Humedad del suelo (%)">
        <input id="rd-moist" inputMode="decimal" value={values.soil_moisture_pct} onChange={set('soil_moisture_pct')} className={inputClass} placeholder="32" />
      </FormField>
      <Button type="submit" loading={saving} className="h-[42px]">Registrar lectura</Button>
      {(error || saved) && (
        <p role={error ? 'alert' : 'status'} className={`text-xs font-medium sm:col-span-2 lg:col-span-5 ${error ? 'text-accent-300' : 'text-primary-300'}`}>
          {error ?? 'Lectura guardada.'}
        </p>
      )}
    </form>
  )
}
