import { useState } from 'react'
import { getErrorMessage, tasksApi } from '../../api.js'
import Alert from '../../components/ui/Alert.jsx'
import Button from '../../components/ui/Button.jsx'
import FormField, { inputClass } from '../../components/ui/FormField.jsx'
import FarmSelect from '../farms/FarmSelect.jsx'
import { focusFirstError } from '../../lib/forms.js'

function todayISO() {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const EMPTY = { title: '', description: '', date: todayISO(), farm_id: '' }

function validate(values) {
  const errors = {}
  const title = values.title.trim()
  if (!title) errors.title = 'El título es obligatorio.'
  else if (title.length > 200) errors.title = 'Máximo 200 caracteres.'
  if (values.description.length > 5000) errors.description = 'Máximo 5000 caracteres.'
  if (!values.date) errors.date = 'La fecha es obligatoria.'
  if (!values.farm_id) errors.farm_id = 'Selecciona una granja.'
  return errors
}

export default function TaskForm({ farms, onCreated }) {
  const [values, setValues] = useState(EMPTY)
  const [errors, setErrors] = useState({})
  const [submitting, setSubmitting] = useState(false)
  const [serverError, setServerError] = useState(null)

  const set = (field) => (value) => setValues((v) => ({ ...v, [field]: value }))

  async function handleSubmit(e) {
    e.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length) {
      focusFirstError(e.currentTarget)
      return
    }

    setSubmitting(true)
    setServerError(null)
    try {
      const task = await tasksApi.create({
        title: values.title.trim(),
        description: values.description.trim() || null,
        date: values.date,
        farm_id: Number(values.farm_id),
      })
      setValues({ ...EMPTY, farm_id: values.farm_id, date: values.date })
      onCreated?.(task)
    } catch (err) {
      setServerError(getErrorMessage(err))
    } finally {
      setSubmitting(false)
    }
  }

  const fieldProps = (field) => ({
    'aria-invalid': errors[field] ? true : undefined,
    'aria-describedby': errors[field] ? `task-${field}-error` : undefined,
  })

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {serverError && <Alert variant="error" onClose={() => setServerError(null)}>{serverError}</Alert>}

      <FormField id="task-title" label="Título" error={errors.title}>
        <input
          id="task-title"
          className={inputClass}
          value={values.title}
          maxLength={200}
          onChange={(e) => set('title')(e.target.value)}
          placeholder="Ej. Riego sector 3"
          {...fieldProps('title')}
        />
      </FormField>

      <FormField id="task-description" label="Descripción (opcional)" error={errors.description}>
        <textarea
          id="task-description"
          rows={3}
          className={inputClass}
          value={values.description}
          maxLength={5000}
          onChange={(e) => set('description')(e.target.value)}
          {...fieldProps('description')}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="task-date" label="Fecha" error={errors.date}>
          <input
            id="task-date"
            type="date"
            className={inputClass}
            value={values.date}
            onChange={(e) => set('date')(e.target.value)}
            {...fieldProps('date')}
          />
        </FormField>
        <FormField id="task-farm_id" label="Granja" error={errors.farm_id}>
          <FarmSelect id="task-farm_id" farms={farms} value={values.farm_id} onChange={set('farm_id')} invalid={!!errors.farm_id} />
        </FormField>
      </div>

      <Button type="submit" loading={submitting} className="w-full sm:w-auto">
        Crear tarea
      </Button>
    </form>
  )
}
