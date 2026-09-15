import { useTranslation } from '@release/translation'
import { useEffect } from 'react'
import { useNavigate } from 'react-router'
import { runViewTransition } from '~/app/lib/viewTransition'
import { useSession } from '~/app/providers/SessionProvider'
import { effectiveBots } from '~/network'

// Host-start trigger. It broadcasts rather than navigating: the host used to
// walk to the board alone, leaving every guest behind in the lobby.
//
// The bot names are built HERE and handed down. `network/` may not import
// i18next, so the layer that owns the copy is the layer that supplies it.
export function useStartGame() {
  const session = useSession()
  const { t } = useTranslation()
  return () => {
    const bots = session.state ? effectiveBots(session.state) : 0
    session.startGame(
      Array.from({ length: bots }, (_, i) => t('lobbyScreen.botName', { n: i + 1 })),
    )
  }
}

// The navigation half, run by host and guests alike. Both watch the one `gameId`
// signal — the host sets it when it starts a game, a guest when the host's
// GAME_STARTING arrives — so neither can take a route the other doesn't.
export function useFollowGameStart() {
  const session = useSession()
  const navigate = useNavigate()
  const gameId = session.gameId
  useEffect(() => {
    if (!gameId) return
    // runViewTransition already wraps the navigation in a single View Transition;
    // passing { viewTransition: true } too would start a second, overlapping one.
    runViewTransition(() => {
      void navigate(`/board/${gameId}`)
    })
  }, [gameId, navigate])
}
