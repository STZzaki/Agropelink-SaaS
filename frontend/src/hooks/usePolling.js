import { useEffect, useRef } from 'react'

/**
 * Sondeo ligero: ejecuta `task(signal)` al montar, cada `intervalMs` y al volver a la pestaña.
 * Mientras la pestaña está oculta no se hace ninguna petición (ahorra batería, datos y servidor).
 * Cada ejecución cancela la anterior si aún no ha terminado (sin carreras ni respuestas viejas).
 */
export default function usePolling(task, intervalMs, deps = []) {
  const taskRef = useRef(task)
  taskRef.current = task

  useEffect(() => {
    let controller = null
    let timer = null

    const run = () => {
      controller?.abort()
      controller = new AbortController()
      taskRef.current(controller.signal)
    }
    const start = () => {
      clearInterval(timer)
      timer = setInterval(run, intervalMs)
    }
    const onVisibility = () => {
      if (document.hidden) {
        clearInterval(timer)
        timer = null
      } else {
        run()
        start()
      }
    }

    run()
    if (!document.hidden) start()
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      document.removeEventListener('visibilitychange', onVisibility)
      clearInterval(timer)
      controller?.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [intervalMs, ...deps])
}
