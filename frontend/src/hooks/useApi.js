import { useCallback, useEffect, useState } from 'react'
import { getErrorMessage } from '../api.js'

/**
 * Ejecuta `fetcher(signal)` al montar y cuando cambian `deps`.
 * Devuelve { data, setData, loading, error, reload }.
 */
export default function useApi(fetcher, deps = []) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [version, setVersion] = useState(0)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setError(null)
    fetcher(controller.signal)
      .then((result) => setData(result))
      .catch((err) => {
        const message = getErrorMessage(err)
        if (message) setError(message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version])

  const reload = useCallback(() => setVersion((v) => v + 1), [])

  return { data, setData, loading, error, reload }
}
