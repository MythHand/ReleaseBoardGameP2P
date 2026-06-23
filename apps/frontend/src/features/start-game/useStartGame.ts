import { useNavigate } from 'react-router'
import { runViewTransition } from '~/app/lib/viewTransition'
import { useSession } from '~/app/providers/SessionProvider'

// Host-start trigger. The board route is keyed by the room id (host peer id).
// When @release/ui exposes a Start button callback, wire it to this.
export function useStartGame() {
  const session = useSession()
  const navigate = useNavigate()
  return () => {
    const gameId = session.state?.hostId
    if (!gameId) return
    runViewTransition(() => {
      navigate(`/board/${gameId}`, { viewTransition: true })
    })
  }
}
