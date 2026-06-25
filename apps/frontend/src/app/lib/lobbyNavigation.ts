import { useCallback } from 'react'
import { useNavigate } from '~/app/router'

// Single source of the lobby-resume navigation contract: route to
// /lobby/:lobbyId carrying the `resumed` flag that [lobbyId].tsx reads to skip
// the Continue/Leave interstitial. Centralized so the three entry points
// (create, join, resume-from-start) stay in lockstep, and routed through the
// generouted-typed navigate so a route rename is caught at build time.
export function useGoToLobby() {
  const navigate = useNavigate()
  return useCallback(
    (code: string) =>
      navigate('/lobby/:lobbyId', { params: { lobbyId: code }, state: { resumed: true } }),
    [navigate],
  )
}
