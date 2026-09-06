import * as React from 'react'
import { ApiError } from '@/api/client'

/**
 * A deliberately small data-fetching hook.
 *
 * The app does not need a caching library: every screen wants fresh, server-
 * scoped data, and staleness after a mutation is exactly the bug we are trying
 * to avoid. So this fetches on mount, refetches when its dependencies change,
 * exposes an explicit `refetch`, and cancels in-flight work on unmount.
 */

export interface QueryState<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

export function useApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  deps: React.DependencyList,
): QueryState<T> {
  const [data, setData] = React.useState<T | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [nonce, setNonce] = React.useState(0)

  // Keep the latest fetcher without making it a dependency — callers define it
  // inline, so including it would refetch on every render.
  const fetcherRef = React.useRef(fetcher)
  fetcherRef.current = fetcher

  React.useEffect(() => {
    const controller = new AbortController()
    let active = true

    setLoading(true)
    setError(null)

    fetcherRef
      .current(controller.signal)
      .then((result) => {
        if (active) setData(result)
      })
      .catch((err: unknown) => {
        if (!active || (err as Error).name === 'AbortError') return
        setError(err instanceof ApiError ? err.message : 'Could not load this data')
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    return () => {
      active = false
      controller.abort()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  const refetch = React.useCallback(() => setNonce((n) => n + 1), [])

  return { data, loading, error, refetch }
}

/**
 * Polls on an interval, for views that need to stay current without a realtime
 * connection — the trainer's live monitoring screen.
 *
 * Polling pauses while the tab is hidden so a forgotten dashboard does not
 * hammer the API all night.
 */
export function usePolledApi<T>(
  fetcher: (signal: AbortSignal) => Promise<T>,
  intervalMs: number,
  deps: React.DependencyList = [],
): QueryState<T> {
  const query = useApi(fetcher, deps)
  const refetch = query.refetch

  React.useEffect(() => {
    if (intervalMs <= 0) return
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') refetch()
    }, intervalMs)

    const onVisible = () => {
      if (document.visibilityState === 'visible') refetch()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [intervalMs, refetch])

  return query
}

/** Debounces a rapidly-changing value, e.g. a search box feeding a query. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = React.useState(value)
  React.useEffect(() => {
    const id = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(id)
  }, [value, delayMs])
  return debounced
}
