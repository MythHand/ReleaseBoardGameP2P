import { rulesFor } from '../cards'
import type { CardUid, GameState, PlayerId, Released } from '../state'
import type { PlayerView, ReleasedView, ReleaseView } from '../view'
import { pendingView } from './attacks'
import { attackTargets } from './core'
import { canAttackWith } from './window'

const releasedView = (r: Released | undefined): ReleasedView | undefined =>
  r && { uid: r.card.uid, card: r.card.id, codeReview: r.codeReview?.id }

function releaseView(state: GameState, id: PlayerId): ReleaseView {
  const z = state.players[id].release
  const view: ReleaseView = {
    frontend: releasedView(z.frontend),
    backend: releasedView(z.backend),
    database: releasedView(z.database),
  }
  if (z.monitoring) view.monitoring = { uid: z.monitoring.uid, card: z.monitoring.id }
  return view
}

// Which of a player's cards may be played right now. Exported so validation and
// projection share one answer — two copies of legality drift silently.
export function playableFor(state: GameState, viewerId: PlayerId): CardUid[] {
  if (state.over) return []
  // A pending decision suspends normal play; its own options are carried on the
  // pending view instead.
  if (state.pending) return []
  if (state.window) return []
  if (state.turn.player !== viewerId) return []
  if (state.eliminated.includes(viewerId)) return []

  const me = state.players[viewerId]
  const releaseCap = state.setup.releases === 'fast' ? Number.POSITIVE_INFINITY : 1

  return me.hand
    .filter((c) => {
      if (me.frozen.includes(c.uid)) return false
      const rules = rulesFor(c.id)
      if (!rules) return false
      switch (rules.kind) {
        case 'release': {
          if (state.turn.releasesPlayed >= releaseCap) return false
          // One card of each type only; the slot must be free.
          if (me.release[rules.slot as 'frontend']) return false
          // Unless the mode makes releases free, the cost is a second card, so
          // a lone release is unplayable — `onPlay` (release.ts) rejects it.
          // Listing it anyway would show a player a card that bounces back as
          // a rejection with nothing to explain it, and would send any policy
          // reading this list (bots.ts, the keeper driving an absent seat) into
          // a move the engine refuses.
          if (state.setup.releaseCond !== 'easy' && me.hand.length < 2) return false
          return true
        }
        case 'protection':
          // Monitoring goes to the zone (one at a time); Debugger only answers a
          // trigger, so it is never played proactively.
          return c.id === 'protection-monitoring' ? !me.release.monitoring : false
        case 'attack':
          return attackTargets(state, viewerId, c.id).length > 0
        // Defences answer an attack, supports ride along with another card, and
        // triggers fire on the draw — none is a standalone play.
        case 'cancel':
        case 'unicorn':
        case 'support':
        case 'trigger':
        case 'ai':
          return false
        default:
          return false
      }
    })
    .map((c) => c.uid)
}

export function project(state: GameState, viewerId: PlayerId): PlayerView {
  const me = state.players[viewerId]
  const top = state.decks.discard[state.decks.discard.length - 1]

  return {
    self: {
      id: me.id,
      name: me.name,
      hand: me.hand.map((c) => ({ ...c })),
      release: releaseView(state, viewerId),
      playable: playableFor(state, viewerId),
      frozen: [...me.frozen],
    },
    opponents: state.seating
      .filter((id) => id !== viewerId)
      .map((id) => ({
        id,
        name: state.players[id].name,
        handCount: state.players[id].hand.length,
        release: releaseView(state, id),
        eliminated: state.eliminated.includes(id),
      })),
    decks: {
      piles: state.decks.main.map((p) => p.length),
      events: state.decks.events.length,
      discardTop: top?.id,
      discardCount: state.decks.discard.length,
    },
    turn: {
      player: state.turn.player,
      index: state.turn.index,
      hasDrawn: state.turn.hasDrawn,
    },
    window: state.window && {
      player: state.window.target.player,
      slot: state.window.target.slot,
      round: state.window.round,
      openedAt: state.window.openedAt,
      deadline: state.window.deadline,
      passed: [...state.window.passed],
      canAttackWith: canAttackWith(state, viewerId),
    },
    pending: pendingView(state, viewerId),
    setup: { ...state.setup },
    over: state.over && { ...state.over },
  }
}
