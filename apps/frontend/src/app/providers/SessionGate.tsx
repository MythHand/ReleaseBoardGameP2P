import type { ReactNode } from 'react'
import LoadingStatus from '~/shared/ui/LoadingStatus'
import { useSessionStatus, useSessionStore } from './SessionProvider'

export default function SessionGate({ children }: { children: ReactNode }) {
  const snapshot = useSessionStatus()
  const store = useSessionStore()
  if (snapshot.status === 'ready') return children
  return (
    <LoadingStatus
      error={snapshot.status === 'error' ? snapshot.error : undefined}
      onRetry={() => {
        void store.retry().catch(() => {})
      }}
    />
  )
}
