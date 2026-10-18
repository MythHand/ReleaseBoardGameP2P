import { useTranslation } from '@release/translation'
import { Reconnect } from '@release/ui'
import { type ReactNode, useEffect, useState } from 'react'
import { Navigate, useLocation } from 'react-router'
import { useSession } from './providers/SessionProvider'

// Keep route components unmounted until the saved session has been checked and
// its destination is current. FollowGameStart remains mounted outside this
// boundary so a restored match can navigate while its old route is still held.
export default function SessionBootstrap({ children }: { children: ReactNode }) {
  const session = useSession()
  const { t } = useTranslation()
  const { pathname, state } = useLocation()
  const [released, setReleased] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const rosterPending =
    session.status === 'in-lobby' && !!session.state && !session.state.peers[session.state.hostId]
  const waiting = rosterPending || session.bootstrapping || session.reconnect.status !== 'idle'
  const failed = session.status === 'error' || session.reconnect.status === 'failed'
  const destination =
    session.status === 'in-lobby' && session.roomCode
      ? session.gameId
        ? `/board/${session.gameId}`
        : `/lobby/${session.roomCode}`
      : null
  const lobbyResumed =
    !destination || !!session.gameId || (state as { resumed?: boolean } | null)?.resumed === true
  const ready = !waiting && !failed && lobbyResumed && (!destination || pathname === destination)

  useEffect(() => {
    if (leaving ? pathname === '/start' : ready) setReleased(true)
  }, [leaving, pathname, ready])

  if (released || (!leaving && ready)) return children
  if (leaving) return pathname === '/start' ? children : <Navigate to="/start" replace />

  if (!waiting && !failed && destination && !session.gameId) {
    return <Navigate to={destination} replace state={{ resumed: true }} />
  }

  return (
    <div aria-busy={!failed}>
      <Reconnect
        copy={t('reconnect', { returnObjects: true })}
        host={session.roomCode ?? ''}
        attempt={session.reconnect.attempt}
        maxAttempts={session.reconnect.maxAttempts}
        status={failed ? 'failed' : 'trying'}
        reason={session.errorKind === 'room-full' ? 'room-full' : undefined}
        onRetry={() => {
          if (session.reconnect.status === 'idle') window.location.reload()
          else session.reconnect.retry()
        }}
        onLeave={() => {
          session.leaveSession()
          setLeaving(true)
        }}
      />
    </div>
  )
}
