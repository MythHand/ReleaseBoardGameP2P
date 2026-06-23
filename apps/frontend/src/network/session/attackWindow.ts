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

export function isComplete(window: AttackWindow): boolean {
  return window.pending.length === 0
}

export function resolveOrder(window: AttackWindow): AttackResponse[] {
  return window.responses
    .filter((r) => r.kind === 'attack')
    .sort((x, y) => window.seating.indexOf(x.player) - window.seating.indexOf(y.player))
}
