import type { Setup } from '@release/ui'
import { useSession } from '~/app/providers/SessionProvider'

// Ready for when @release/ui exposes a create-game callback (see spec open
// questions). Until then it is unit-tested and called by the lobby flow.
export function useCreateLobby() {
  const session = useSession()
  return (name: string, maxPlayers: number, setup?: Setup) =>
    session.createRoom(name, maxPlayers, setup)
}
