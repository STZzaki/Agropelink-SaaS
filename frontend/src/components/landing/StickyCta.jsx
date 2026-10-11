import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ArrowRightIcon } from './icons.jsx'

/** CTA fijo inferior en móvil: aparece al pasar el Hero y se oculta al llegar al formulario de contacto. */
export default function StickyCta() {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const onScroll = () => {
      const contact = document.getElementById('contacto')
      const pastHero = window.scrollY > window.innerHeight * 0.7
      const atContact = contact ? contact.getBoundingClientRect().top < window.innerHeight * 0.8 : false
      setVisible(pastHero && !atContact)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <div
      className={`fixed inset-x-0 bottom-0 z-40 border-t border-white/10 bg-slate-950/95 px-4 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 transition-[transform,opacity] duration-500 ease-out-expo md:hidden ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-full opacity-0'
      }`}
      aria-hidden={!visible}
    >
      <div className="flex gap-3">
        <a href="#contacto" tabIndex={visible ? 0 : -1} className="btn-secondary h-12 flex-1 text-sm">
          Solicitar demo
        </a>
        <Link
          to="/panel"
          tabIndex={visible ? 0 : -1}
          className="btn-primary h-12 flex-[1.3] text-sm"
        >
          Acceso Plataforma <ArrowRightIcon />
        </Link>
      </div>
    </div>
  )
}
