import { useSession } from '~/app/providers/SessionProvider'

export function useJoinLobby() {
  const session = useSession()
  return (hostId: string, name: string) => session.joinRoom(hostId, name)
}
