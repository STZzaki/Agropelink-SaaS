import { Link } from 'react-router-dom'
import { SITE } from '../../config/site.js'
import { CookieSettingsLink } from '../../consent/CookieBanner.jsx'

const INSTITUTIONAL = [
  {
    text: 'Co-fundado por la Unión Europea',
    src: '/assets/EN_Co-fundedbytheEU_RGB_Monochrome.png',
    alt: 'Emblema de la Unión Europea: Co-funded by the European Union',
  },
  {
    text: 'Soportado por el programa Give a Chance',
    src: '/assets/Give A Chance PNG 2.png',
    alt: 'Logotipo del programa Give a Chance',
  },
]

export default function Footer() {
  const year = new Date().getFullYear()

  return (
    <footer className="border-t border-white/[0.06] bg-slate-950 text-slate-300">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 lg:px-8">
        {/* Sección institucional destacada */}
        <section
          aria-labelledby="footer-institucional"
          className="card-glass p-6 sm:p-8"
        >
          <h2
            id="footer-institucional"
            className="mb-6 text-xs font-semibold uppercase tracking-widest text-secondary-300"
          >
            Financiación y apoyo
          </h2>

          <ul className="grid gap-6 md:grid-cols-2 md:gap-10">
            {INSTITUTIONAL.map((item) => (
              <li
                key={item.src}
                className="flex flex-col items-center gap-4 text-center sm:flex-row sm:text-left"
              >
                <div className="flex h-16 w-full max-w-[15rem] shrink-0 items-center justify-center rounded-xl bg-white px-4 py-2 shadow-btn sm:h-[4.5rem] sm:w-60">
                  <img
                    src={item.src}
                    alt={item.alt}
                    loading="lazy"
                    className="h-full max-h-full w-auto max-w-full object-contain"
                  />
                </div>
                <p className="text-sm font-medium leading-snug text-slate-100 sm:text-base">
                  {item.text}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-white/[0.06] pt-6 text-sm text-slate-400 sm:flex-row">
          <p>
            &copy; {year} <span className="font-semibold text-primary-300">Agropelink</span> ·{' '}
            <a href={`mailto:${SITE.email}`} className="transition-colors duration-300 hover:text-white">{SITE.email}</a>
          </p>
          <nav aria-label="Enlaces legales">
            <ul className="flex flex-wrap justify-center gap-x-6 gap-y-2">
              <li>
                <Link to="/privacidad" className="transition-colors duration-300 hover:text-white">Privacidad</Link>
              </li>
              <li>
                <Link to="/terminos" className="transition-colors duration-300 hover:text-white">Aviso legal y términos</Link>
              </li>
              <li>
                <CookieSettingsLink className="transition-colors duration-300 hover:text-white" />
              </li>
            </ul>
          </nav>
        </div>
      </div>
    </footer>
  )
}
