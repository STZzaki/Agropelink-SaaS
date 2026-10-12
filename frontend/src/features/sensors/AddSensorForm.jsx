import { useState } from 'react'
import { getErrorMessage, sensorsApi } from '../../api.js'
import Button from '../../components/ui/Button.jsx'
import FormField, { inputClass, optionClass } from '../../components/ui/FormField.jsx'
import { SENSOR_KINDS } from './sensorMeta.js'

const EMPTY = { name: '', kind: 'soil_moisture', zone: '' }

/** Alta de un sensor en la finca. La unidad y los rangos los asigna el servidor según el tipo. */
export default function AddSensorForm({ farmId, onCreated, onCancel }) {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [busy, setBusy] = useState(false)
  const [serverError, setServerError] = useState(null)
  const set = (field) => (e) => setValues((v) => ({ ...v, [field]: e.target.value }))

  async function submit(e) {
    e.preventDefault()
    const name = values.name.trim()
    const found = {}
    if (!name) found.name = 'Pon un nombre al sensor.'
    else if (name.length > 80) found.name = 'Máximo 80 caracteres.'
    if (values.zone.trim().length > 80) found.zone = 'Máximo 80 caracteres.'
    setErrors(found)
    if (Object.keys(found).length) return
    setBusy(true)
    setServerError(null)
    try {
      const sensor = await sensorsApi.create(farmId, { name, kind: values.kind, zone: values.zone.trim() || null })
      setValues(EMPTY)
      onCreated(sensor)
    } catch (err) {
      setServerError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <form onSubmit={submit} noValidate className="card-glass grid grid-cols-1 gap-4 p-5 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
      <FormField id="sensor-name" label="Nombre" error={errors.name}>
        <input id="sensor-name" value={values.name} onChange={set('name')} maxLength={80} placeholder="Sonda sector norte" className={inputClass} aria-invalid={errors.name ? true : undefined} />
      </FormField>
      <FormField id="sensor-kind" label="Tipo">
        <select id="sensor-kind" value={values.kind} onChange={set('kind')} className={inputClass}>
          {SENSOR_KINDS.map((k) => <option className={optionClass} key={k.id} value={k.id}>{k.label}</option>)}
        </select>
      </FormField>
      <FormField id="sensor-zone" label="Zona (opcional)" error={errors.zone}>
        <input id="sensor-zone" value={values.zone} onChange={set('zone')} maxLength={80} placeholder="Nave A, sector 2…" className={inputClass} aria-invalid={errors.zone ? true : undefined} />
      </FormField>
      <div className="flex gap-2">
        <Button type="submit" loading={busy}>Añadir</Button>
        <Button variant="outline" onClick={onCancel} disabled={busy}>Cancelar</Button>
      </div>
      {serverError && <p role="alert" className="text-sm text-accent-200 sm:col-span-4">{serverError}</p>}
    </form>
  )
}
