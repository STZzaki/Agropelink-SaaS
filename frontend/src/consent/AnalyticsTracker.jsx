import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import { disableAnalytics, initAnalytics, trackPageview } from './analytics.js'
import { useConsent } from './ConsentContext.jsx'

/** Activa/desactiva la analítica según el consentimiento y registra cada cambio de ruta pública. */
export default function AnalyticsTracker() {
  const { consent } = useConsent()
  const { pathname } = useLocation()
  const allowed = consent?.analytics === true

  useEffect(() => {
    if (allowed) initAnalytics()
    else disableAnalytics()
  }, [allowed])

  useEffect(() => {
    if (allowed) trackPageview(pathname)
  }, [allowed, pathname])

  return null
}
