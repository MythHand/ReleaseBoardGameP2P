import { type ReactNode, useEffect, useState } from 'react'
import type { ModuleResource } from '../lib/moduleResource'
import LoadingStatus from './LoadingStatus'

export default function DeferredContent<T>({
  resource,
  children,
  fallback,
}: {
  resource: ModuleResource<T>
  children: (module: T) => ReactNode
  fallback?: ReactNode
}) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{ value?: T; error?: unknown }>(() => ({
    value: resource.peek(),
  }))
  useEffect(() => {
    let active = true
    setState({ value: resource.peek() })
    void (attempt ? resource.retry() : resource.load()).then(
      (value) => {
        if (active) setState({ value })
      },
      (error: unknown) => {
        if (active) setState({ error })
      },
    )
    return () => {
      active = false
    }
  }, [resource, attempt])
  if (state.value !== undefined) return children(state.value)
  if (!state.error && fallback !== undefined) return fallback
  return <LoadingStatus error={state.error} onRetry={() => setAttempt((n) => n + 1)} />
}
