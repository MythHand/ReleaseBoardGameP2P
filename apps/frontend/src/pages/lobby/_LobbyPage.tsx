import { Lobby } from '@release/ui'
import { useSession } from '~/app/providers/SessionProvider'

export default function LobbyPage() {
  const session = useSession()
  return <Lobby code={session.roomCode ?? undefined} role={session.isHost ? 'host' : 'guest'} />
}
