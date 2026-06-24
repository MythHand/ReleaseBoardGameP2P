import type { AttackResponse } from '../types'

export interface AttackWindow {
  releaseCard: string
  releasePlayer: string
  codeReview: boolean
  seating: string[]
  pending: string[]
  responses: AttackResponse[]
}

export function openWindow(args: {
  releaseCard: string
  releasePlayer: string
  codeReview: boolean
  seating: string[]
}): AttackWindow {
  return {
    releaseCard: args.releaseCard,
    releasePlayer: args.releasePlayer,
    codeReview: args.codeReview,
    seating: args.seating,
    pending: args.seating.filter((id) => id !== args.releasePlayer),
    responses: [],
  }
}

export function recordResponse(window: AttackWindow, response: AttackResponse): AttackWindow {
  if (!window.pending.includes(response.player)) return window
  return {
    ...window,
    pending: window.pending.filter((id) => id !== response.player),
    responses: [...window.responses, response],
  }
}

// Remove a player who left mid-window (WebRTC disconnect) from the pending set
// and the seating so the window can still complete. Without this, isComplete()
// never returns true for a player who never responds and the turn deadlocks.
export function dropPlayer(window: AttackWindow, player: string): AttackWindow {
  if (!window.pending.includes(player) && !window.seating.includes(player)) return window
  return {
    ...window,
    seating: window.seating.filter((id) => id !== player),
    pending: window.pending.filter((id) => id !== player),
  }
}

export function isComplete(window: AttackWindow): boolean {
  return window.pending.length === 0
}

export function resolveOrder(window: AttackWindow): AttackResponse[] {
  return window.responses
    .filter((r) => r.kind === 'attack')
    .sort((x, y) => window.seating.indexOf(x.player) - window.seating.indexOf(y.player))
}
