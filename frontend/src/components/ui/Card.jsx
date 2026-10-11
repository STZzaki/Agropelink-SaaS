/**
 * Tarjeta "cristal" sin `backdrop-filter`: borde translúcido, degradado vertical muy ligero y sombra
 * difuminada multicapa. El efecto se pinta una vez (no recalcula desenfoque al hacer scroll).
 */
export default function Card({ title, actions, className = '', children }) {
  return (
    <section className={`card-glass p-5 sm:p-6 ${className}`}>
      {(title || actions) && (
        <header className="mb-5 flex flex-wrap items-center justify-between gap-3">
          {title && <h2 className="text-base font-semibold tracking-tight text-white sm:text-lg">{title}</h2>}
          {actions}
        </header>
      )}
      {children}
    </section>
  )
}
