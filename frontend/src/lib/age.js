// Control de mayoría de edad (UX). El backend aplica la misma regla en el registro y en el alta desde el panel.

export const MIN_AGE = 18
export const UNDERAGE_MESSAGE = 'Debes ser mayor de 18 años para registrarte en Agropelink.'

const pad = (n) => String(n).padStart(2, '0')
const isoLocal = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

/** Años cumplidos a fecha de hoy para una fecha `AAAA-MM-DD` (null si no es válida). */
export function ageFrom(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '')
  if (!m) return null
  const [y, mo, d] = m.slice(1).map(Number)
  const today = new Date()
  const ty = today.getFullYear()
  const tm = today.getMonth() + 1
  const td = today.getDate()
  return ty - y - (tm < mo || (tm === mo && td < d) ? 1 : 0)
}

/** Fecha máxima seleccionable: hoy hace 18 años. */
export function latestAdultBirthDate() {
  const today = new Date()
  const d = new Date(today.getFullYear() - MIN_AGE, today.getMonth(), today.getDate())
  // 29 de febrero en año no bisiesto: Date lo desplaza al 1 de marzo, que sigue siendo correcto.
  return isoLocal(d)
}

/** Mensaje de error para una fecha de nacimiento, o null si es válida. */
export function birthDateError(iso) {
  if (!iso) return 'Indica tu fecha de nacimiento.'
  const age = ageFrom(iso)
  if (age === null || age > 120 || iso > isoLocal(new Date())) return 'Introduce una fecha de nacimiento válida.'
  if (age < MIN_AGE) return UNDERAGE_MESSAGE
  return null
}
