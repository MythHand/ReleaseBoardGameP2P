import { useFollowGameStart } from '~/features/start-game/useStartGame'

// The navigation half of starting a game, mounted for the whole session rather
// than by the lobby alone. A peer reading the results of one match must be
// carried into the next, and the lobby is exactly the screen it is not on.
//
// Renders nothing, and lives inside <SessionProvider> because the hook consumes
// the session context that App itself provides.
export default function FollowGameStart() {
  useFollowGameStart()
  return null
}
