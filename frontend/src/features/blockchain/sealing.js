import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Lógica común del «sellado» de telemetría (panel privado y demo pública de la landing).
 *
 * - La huella es REAL: SHA-256 del JSON con `crypto.subtle` (Web Crypto nativa; nada sale del navegador).
 * - El anclaje en Polygon L2 se SIMULA con una espera; no hay red ni transacción en cadena. Las interfaces que usan
 *   este hook lo indican siempre («Polygon L2 (Simulada)»).
 */

export async function sha256Hex(text) {
  if (typeof text !== 'string' || !text) throw new Error('No hay datos que sellar.')
  const subtle = typeof window !== 'undefined' ? window.crypto?.subtle : undefined
  if (!subtle?.digest) throw new Error('Este navegador no permite calcular hashes (requiere HTTPS).')
  const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

/**
 * @param {{ delayMs: number, steps: string[], fallbackHash?: string }} options  `steps` se reparten a partes iguales
 *   durante la espera. Con `fallbackHash` (solo demos), cualquier fallo se registra en consola y la demo termina
 *   igualmente con ese hash estático en lugar de mostrar un error.
 * @returns {{ phase: 'idle'|'sealing'|'sealed'|'error', step: number, result: null|{hash?: string, sealedAt?: string, error?: string}, seal: (json: string) => void, reset: () => void }}
 */
export function useSealSimulation({ delayMs, steps, fallbackHash }) {
  const [phase, setPhase] = useState('idle')
  const [step, setStep] = useState(0)
  const [result, setResult] = useState(null)
  const timers = useRef([])
  const alive = useRef(true)

  const clear = () => {
    timers.current.forEach(clearTimeout)
    timers.current = []
  }

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
      clear()
    }
  }, [])

  const reset = useCallback(() => {
    clear()
    setPhase('idle')
    setStep(0)
    setResult(null)
  }, [])

  const fail = useCallback(
    (err) => {
      console.error('[sellado] no se pudo calcular el hash:', err)
      if (!alive.current) return
      if (fallbackHash) {
        setResult({ hash: fallbackHash, sealedAt: new Date().toISOString(), fallback: true })
        setPhase('sealed')
      } else {
        setResult({ error: err?.message || 'No se pudo calcular el hash.' })
        setPhase('error')
      }
    },
    [fallbackHash],
  )

  const seal = useCallback(
    (json) => {
      try {
        clear()
        setPhase('sealing')
        setStep(0)
        setResult(null)
        // Lo que se sella es exactamente el texto mostrado en ese instante; nunca `undefined`.
        if (typeof json !== 'string' || !json.trim()) throw new Error('JSON de telemetría vacío o no definido.')
        const frozen = json
        const slice = delayMs / Math.max(1, steps.length)
        for (let i = 1; i < steps.length; i += 1) timers.current.push(setTimeout(() => setStep(i), slice * i))
        timers.current.push(
          setTimeout(() => {
            // La promesa siempre se resuelve aquí (then/catch): ningún rechazo queda «sin capturar».
            sha256Hex(frozen)
              .then((hash) => {
                if (!alive.current) return
                setResult({ hash, sealedAt: new Date().toISOString() })
                setPhase('sealed')
              })
              .catch(fail)
          }, delayMs),
        )
      } catch (err) {
        clear()
        fail(err)
      }
    },
    [delayMs, steps.length, fail],
  )

  return { phase, step, result, seal, reset }
}
