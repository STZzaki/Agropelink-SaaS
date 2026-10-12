import { useLocation } from 'react-router-dom'
import ErrorBoundary from './ui/ErrorBoundary.jsx'

function RouteFallback({ reset }) {
  return (
    <div role="alert" className="flex min-h-screen flex-col items-center justify-center bg-slate-950 px-6 text-center text-slate-200">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-accent-300">Algo ha fallado</p>
      <h1 className="mt-3 text-2xl font-semibold text-white">No hemos podido mostrar esta página</h1>
      <p className="mt-2 max-w-md text-sm text-slate-400">Puede ser un problema temporal de conexión con el servidor. Tus datos están a salvo.</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => window.location.reload()} className="btn-primary h-11 px-6 text-sm">Recargar</button>
        <a href="/" onClick={reset} className="btn-secondary h-11 px-6 text-sm">Ir al inicio</a>
      </div>
    </div>
  )
}

/** Red de seguridad global: un fallo de render en cualquier ruta muestra un aviso en vez de una pantalla en blanco.
 *  Se reinicia al cambiar de ruta (`resetKey`). */
export default function RouteErrorBoundary({ children }) {
  const { pathname } = useLocation()
  return (
    <ErrorBoundary name="ruta" resetKey={pathname} fallback={(_error, reset) => <RouteFallback reset={reset} />}>
      {children}
    </ErrorBoundary>
  )
}
