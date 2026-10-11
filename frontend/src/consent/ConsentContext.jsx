import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

/**
 * Consentimiento de cookies y contenido de terceros (RGPD + LSSI art. 22.2, guía de cookies de la AEPD).
 *
 * - `necessary`: siempre activas (cookie de sesión HttpOnly y esta propia preferencia). No requieren consentimiento.
 * - `analytics`: medición de audiencia. Solo se carga tras aceptar.
 * - `external`: contenido de terceros que puede usar cookies (feed de Instagram vía Elfsight).
 *
 * La elección se guarda en localStorage (no es un token: solo la preferencia) y caduca a los 12 meses.
 */
const STORAGE_KEY = 'agropelink_consent'
const CONSENT_VERSION = 1
const MAX_AGE_MS = 365 * 24 * 60 * 60 * 1000

export const CONSENT_CATEGORIES = [
  {
    id: 'necessary',
    label: 'Necesarias',
    description: 'Imprescindibles para iniciar sesión de forma segura y recordar esta elección. No se pueden desactivar.',
    locked: true,
  },
  {
    id: 'analytics',
    label: 'Analítica',
    description: 'Nos ayudan a entender qué secciones se usan para mejorar la web. Datos agregados, sin publicidad.',
  },
  {
    id: 'external',
    label: 'Contenido de terceros',
    description: 'Permite mostrar el feed de Instagram (servicio de Elfsight), que puede establecer sus propias cookies.',
  },
]

function readStored() {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (parsed?.version !== CONSENT_VERSION || Date.now() - Date.parse(parsed.decidedAt) > MAX_AGE_MS) return null
    return { analytics: parsed.analytics === true, external: parsed.external === true, decidedAt: parsed.decidedAt }
  } catch {
    return null
  }
}

function writeStored(choice) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: CONSENT_VERSION, ...choice }))
  } catch {
    // Navegación privada o almacenamiento bloqueado: la elección dura solo esta sesión.
  }
}

const ConsentContext = createContext(null)

export function ConsentProvider({ children }) {
  const [consent, setConsentState] = useState(() => readStored())
  const [settingsOpen, setSettingsOpen] = useState(false)

  const save = useCallback((choice) => {
    const value = { analytics: !!choice.analytics, external: !!choice.external, decidedAt: new Date().toISOString() }
    writeStored(value)
    setConsentState(value)
    setSettingsOpen(false)
  }, [])

  // Sincroniza la elección entre pestañas abiertas.
  useEffect(() => {
    const onStorage = (e) => e.key === STORAGE_KEY && setConsentState(readStored())
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const value = useMemo(
    () => ({
      consent, // null = aún no ha decidido
      hasDecided: consent !== null,
      acceptAll: () => save({ analytics: true, external: true }),
      rejectAll: () => save({ analytics: false, external: false }),
      save,
      settingsOpen,
      openSettings: () => setSettingsOpen(true),
      closeSettings: () => setSettingsOpen(false),
    }),
    [consent, save, settingsOpen],
  )
  return <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
}

export function useConsent() {
  const ctx = useContext(ConsentContext)
  if (!ctx) throw new Error('useConsent debe usarse dentro de <ConsentProvider>')
  return ctx
}
