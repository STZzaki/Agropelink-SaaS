import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { scrollToTop, startSmoothScroll } from '../lib/smoothScroll.js'

/**
 * Smooth scrolling global (Lenis) y vuelta arriba al cambiar de página
 * (las SPA conservan el scroll); las anclas (#seccion) se respetan.
 */
export default function ScrollManager() {
  const { pathname, hash } = useLocation()

  useEffect(() => startSmoothScroll(), [])

  useEffect(() => {
    if (!hash) scrollToTop()
  }, [pathname, hash])
  return null
}
