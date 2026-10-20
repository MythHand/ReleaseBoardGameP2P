import { type ReactNode, useEffect, useState } from 'react'
import { useLocation } from 'react-router'
import { createModuleResource } from '~/shared/lib/moduleResource'
import { readSession } from '~/shared/lib/sessionPersistence'
import DeferredContent from '~/shared/ui/DeferredContent'
import { preloadBoard } from '../routeModules'
import SessionGate from './SessionGate'
import { useSessionStatus, useSessionStore } from './SessionProvider'

const follow = createModuleResource(() => import('../FollowGameStart'))
const bootstrap = createModuleResource(() => import('../SessionBootstrap'))

export function SessionRestore({ children }: { children: ReactNode }) {
  // Keep the cold-start tree stable when a modal activates the runtime later.
  const [restoring] = useState(() => !!readSession())
  if (!restoring) return children
  return (
    <SessionGate>
      <DeferredContent resource={bootstrap}>
        {({ default: Bootstrap }) => <Bootstrap>{children}</Bootstrap>}
      </DeferredContent>
    </SessionGate>
  )
}

export default function SessionActivation() {
  const { pathname, search } = useLocation()
  const store = useSessionStore()
  const snapshot = useSessionStatus()
  const inLobby = snapshot.status === 'ready' && snapshot.value.status === 'in-lobby'
  useEffect(() => {
    if (inLobby && pathname.startsWith('/lobby/')) void preloadBoard().catch(() => {})
  }, [inLobby, pathname])
  useEffect(() => {
    const modal = new URLSearchParams(search).get('modal')
    if (
      /^\/(lobby|board)\//.test(pathname) ||
      modal === 'create' ||
      modal === 'join' ||
      readSession()
    ) {
      void store.request().catch(() => {})
    }
  }, [store, pathname, search])
  if (snapshot.status !== 'ready') return null
  return (
    <DeferredContent resource={follow} fallback={null}>
      {({ default: Follow }) => <Follow />}
    </DeferredContent>
  )
}
