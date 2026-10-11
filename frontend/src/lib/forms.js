/**
 * Tras un envío con errores, lleva el foco al primer campo inválido (WCAG 3.3.1):
 * el lector de pantalla anuncia el campo y su mensaje (aria-describedby) y el usuario no se pierde.
 * Se espera un frame para que React haya pintado los atributos aria-invalid.
 */
export function focusFirstError(form) {
  if (!form) return
  requestAnimationFrame(() => {
    const field = form.querySelector('[aria-invalid="true"]')
    field?.focus()
    field?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
  })
}
