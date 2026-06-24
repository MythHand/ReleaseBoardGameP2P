import { useSession } from '~/app/providers/SessionProvider'
import type { PeerInfo } from '~/entities/lobby'

export function useLobbyRoster() {
  const session = useSession()
  const players: PeerInfo[] = session.state ? Object.values(session.state.peers) : []
  return {
    players,
    isHost: session.isHost,
    canStart: session.canStart,
    ready: session.ready,
    kick: session.kick,
  }
}
