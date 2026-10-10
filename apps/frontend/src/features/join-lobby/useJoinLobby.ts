import { useSession } from '~/app/providers/SessionProvider'
import type { JoinRole } from '~/entities/lobby'

export function useJoinLobby() {
  const session = useSession()
  // The first argument is the room code as typed; joinRoom parses it back to the
  // host peer id (parseRoomCode), so the displayed code is what a joiner enters.
  return (code: string, name: string, role: JoinRole = 'player') =>
    session.joinRoom(code, name, role)
}
