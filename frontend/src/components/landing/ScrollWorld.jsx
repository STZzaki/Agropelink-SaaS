import { Component, Suspense, lazy, useEffect, useState } from 'react'
import { prefersReducedMotion } from '../../lib/gsap.js'
import FluidBackground from './FluidBackground.jsx'

// three.js + R3F van en su propio chunk y se descargan DESPUÉS de pintar la página (no retrasan el LCP).
const ScrollWorldBackground = lazy(() => import('./ScrollWorldBackground.jsx'))

function supportsWebGL() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')))
  } catch {
    return false
  }
}

/** Un fallo del 3D (driver, contexto WebGL perdido, chunk no descargado…) nunca debe tumbar la landing. */
class WebGLBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch() {
    this.props.onError?.()
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

/** Fondo de la landing: mundo 3D si el equipo lo permite; si no (o mientras carga), las ondas ligeras de siempre. */
export default function ScrollWorld() {
  const [enabled, setEnabled] = useState(false)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    // Sin WebGL, con movimiento reducido real o con "ahorro de datos" se queda el fondo ligero.
    if (prefersReducedMotion() || navigator.connection?.saveData || !supportsWebGL()) return undefined
    const start = () => setEnabled(true)
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(start, { timeout: 2500 })
      return () => window.cancelIdleCallback(id)
    }
    const id = window.setTimeout(start, 1200)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <>
      {!ready && <FluidBackground />}
      {enabled && (
        <WebGLBoundary
          onError={() => {
            setEnabled(false)
            setReady(false)
          }}
        >
          <Suspense fallback={null}>
            <div className={`transition-opacity duration-1000 ease-out ${ready ? 'opacity-100' : 'opacity-0'}`}>
              <ScrollWorldBackground onReady={() => setReady(true)} />
            </div>
          </Suspense>
        </WebGLBoundary>
      )}
    </>
  )
}
