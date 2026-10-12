import { Component, Suspense, lazy, useEffect, useState } from 'react'
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
  const [faded, setFaded] = useState(false)

  useEffect(() => {
    // Sin WebGL o con "ahorro de datos" se queda el fondo ligero. Con movimiento reducido el relieve 3D también se
    // muestra, pero en plano fijo (CameraRig no enlaza el scroll): el paisaje se ve, solo se quita el movimiento.
    if (navigator.connection?.saveData || !supportsWebGL()) return undefined
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
      {!faded && <FluidBackground />}
      {enabled && (
        <WebGLBoundary
          onError={() => {
            setEnabled(false)
            setReady(false)
            setFaded(false)
          }}
        >
          <Suspense fallback={null}>
            {/* `isolate`: el 3D (z-[-1]) se pinta siempre por encima de las ondas durante el fundido y después.
                Las ondas se retiran al TERMINAR el fundido (no con un temporizador: con la pestaña en segundo plano la
                transición se congela y quedaría un fondo liso). */}
            <div
              className={`isolate transition-opacity duration-1000 ease-out ${ready ? 'opacity-100' : 'opacity-0'}`}
              onTransitionEnd={(e) => {
                if (ready && e.target === e.currentTarget && e.propertyName === 'opacity') setFaded(true)
              }}
            >
              <ScrollWorldBackground onReady={() => setReady(true)} />
            </div>
          </Suspense>
        </WebGLBoundary>
      )}
    </>
  )
}
