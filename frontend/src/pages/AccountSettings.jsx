import { m } from 'framer-motion'
import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getErrorMessage, usersApi } from '../api.js'
import { useAuth } from '../auth/AuthContext.jsx'
import { ROLE_LABELS } from '../auth/roles.js'
import Alert from '../components/ui/Alert.jsx'
import Avatar from '../components/ui/Avatar.jsx'
import Button from '../components/ui/Button.jsx'
import Card from '../components/ui/Card.jsx'
import FormField, { inputClass } from '../components/ui/FormField.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import { birthDateError, latestAdultBirthDate } from '../lib/age.js'
import AvatarSelector from '../features/account/AvatarSelector.jsx'
import { focusFirstError } from '../lib/forms.js'

/** Mi cuenta: nombre, fecha de nacimiento, avatar del catálogo y acceso al cambio de contraseña. */
export default function AccountSettings() {
  const { user, setUser } = useAuth()
  const navigate = useNavigate()
  const initial = { name: user.name, birth_date: user.birth_date ?? '', avatar: user.avatar ?? null }
  const [values, setValues] = useState(initial)
  const [errors, setErrors] = useState({})
  const [state, setState] = useState('idle') // idle | saving | saved
  const [serverError, setServerError] = useState(null)
  const dirty = values.name !== initial.name || values.birth_date !== initial.birth_date || values.avatar !== initial.avatar

  const set = (field) => (e) => {
    setValues((v) => ({ ...v, [field]: e.target.value }))
    setState('idle')
    if (errors[field]) setErrors((er) => ({ ...er, [field]: undefined }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const found = {}
    const name = values.name.trim()
    if (!name) found.name = 'Indica tu nombre.'
    else if (name.length > 100) found.name = 'Máximo 100 caracteres.'
    const birth = birthDateError(values.birth_date)
    if (birth) found.birth_date = birth
    setErrors(found)
    if (Object.keys(found).length) {
      focusFirstError(e.currentTarget)
      return
    }
    setState('saving')
    setServerError(null)
    try {
      setUser(await usersApi.updateProfile({ name, birth_date: values.birth_date, avatar: values.avatar }))
      setState('saved')
    } catch (err) {
      setServerError(getErrorMessage(err))
      setState('idle')
    }
  }

  const aria = (field) => ({ 'aria-invalid': errors[field] ? true : undefined, 'aria-describedby': errors[field] ? `acc-${field}-error` : undefined })

  return (
    <div className="mx-auto max-w-4xl px-4 py-10 sm:px-6 lg:px-8">
      <PageHeader eyebrow="Cuenta" title="AgroProfile B2B" subtitle="Gestiona tu perfil profesional en Agropelink y la seguridad de tu acceso." />

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_18rem]">
        <form onSubmit={handleSubmit} noValidate>
          <Card title="AgroProfile B2B">
            <div className="mb-6 flex items-center gap-4">
              <Avatar avatar={values.avatar} name={values.name} size="xl" />
              <div className="min-w-0">
                <p className="truncate text-lg font-semibold text-white">{values.name.trim() || 'Tu nombre'}</p>
                <p className="truncate text-sm text-slate-400">{user.email}</p>
                <p className="mt-1 inline-flex rounded-full bg-secondary-500/15 px-2 py-0.5 text-[11px] font-semibold text-secondary-200">{ROLE_LABELS[user.role]}</p>
              </div>
            </div>

            <AvatarSelector value={values.avatar} name={values.name} onChange={(avatar) => { setValues((v) => ({ ...v, avatar })); setState('idle') }} />

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <FormField id="acc-name" label="Nombre" error={errors.name}>
                <input id="acc-name" autoComplete="name" maxLength={100} value={values.name} onChange={set('name')} className={inputClass} {...aria('name')} />
              </FormField>
              <FormField id="acc-birth_date" label="Fecha de nacimiento" error={errors.birth_date} hint={!user.birth_date ? 'Necesaria para confirmar que eres mayor de 18 años.' : undefined}>
                <input id="acc-birth_date" type="date" min="1900-01-01" max={latestAdultBirthDate()} value={values.birth_date} onChange={set('birth_date')} className={inputClass} {...aria('birth_date')} />
              </FormField>
            </div>

            {serverError && <div className="mt-5"><Alert variant="error">{serverError}</Alert></div>}

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <Button type="submit" loading={state === 'saving'} disabled={!dirty && state !== 'saving'}>Guardar cambios</Button>
              {state === 'saved' && (
                <m.span initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} role="status" className="text-sm font-medium text-primary-300">
                  Cambios guardados
                </m.span>
              )}
            </div>
          </Card>
        </form>

        <div className="space-y-6 lg:self-start">
          <Card title="Seguridad">
            <p className="text-sm text-slate-400">Te enviaremos un enlace de un solo uso, válido durante 15 minutos.</p>
            <Button variant="outline" className="mt-4 w-full" onClick={() => navigate('/forgot-password', { state: { email: user.email } })}>
              Cambiar contraseña
            </Button>
          </Card>
          <Card title="Datos de acceso">
            <dl className="space-y-3 text-sm">
              <div>
                <dt className="text-slate-500">Email</dt>
                <dd className="truncate text-slate-200">{user.email}</dd>
              </div>
              <div>
                <dt className="text-slate-500">Rol</dt>
                <dd className="text-slate-200">{ROLE_LABELS[user.role]}</dd>
              </div>
            </dl>
            <p className="mt-4 text-xs text-slate-500">
              Para cambiar el email o eliminar la cuenta, abre un ticket desde <span className="text-slate-300">Ayuda</span> o consulta la{' '}
              <Link to="/privacidad" className="text-secondary-300 underline-offset-2 hover:underline">política de privacidad</Link>.
            </p>
          </Card>
        </div>
      </div>
    </div>
  )
}
