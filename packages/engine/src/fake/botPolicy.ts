import type { Target } from '../actions'
import { rulesFor } from '../cards'
import type { CardUid } from '../state'
import type { OpponentView, PlayerView } from '../view'

interface Attack {
  card: CardUid
  target: Target
}

function releaseCount(opponent: OpponentView): number {
  const { frontend, backend, database } = opponent.release
  return Number(!!frontend) + Number(!!backend) + Number(!!database)
}

function attackScore(opponent: OpponentView, target: Target): number {
  // These are policy preferences, not legality rules. Removing a release
  // directly slows a leader; removing Monitoring only exposes them to a
  // future threat. Code Review makes the returned release costlier to rebuild.
  const threat = releaseCount(opponent) * 100
  switch (target.kind) {
    case 'release':
      return threat + 80 + (opponent.release[target.slot]?.codeReview ? 20 : 0)
    case 'monitoring':
      return threat + 30
    case 'player':
      return opponent.handCount > 0 ? threat + 10 : 0
    default:
      return 0
  }
}

// Only projected information enters the policy. Targets and playable cards
// are the engine's offers, so scoring cannot introduce a new legal action or
// consult an opponent's private hand to guess whether a theft will succeed.
export function chooseAttack(view: PlayerView, random: number): Attack | null {
  const playable = new Set(view.self.playable)
  let bestScore = 0
  let best: Attack[] = []
  for (const card of view.self.hand) {
    if (!playable.has(card.uid) || rulesFor(card.id)?.kind !== 'attack') continue
    for (const target of view.self.targets[card.uid] ?? []) {
      if (!('player' in target)) continue
      const opponent = view.opponents.find((seat) => seat.id === target.player)
      if (!opponent || opponent.eliminated) continue
      const score = attackScore(opponent, target)
      if (score <= 0 || score < bestScore) continue
      if (score > bestScore) {
        bestScore = score
        best = []
      }
      best.push({ card: card.uid, target })
    }
  }
  // Canonical ordering makes ties independent of seating and hand order.
  // Episode-seeded entropy varies equal choices without sacrificing replay.
  best.sort((a, b) => {
    const key = (attack: Attack) =>
      `${attack.card}:${'player' in attack.target ? attack.target.player : ''}:${
        attack.target.kind
      }:${attack.target.kind === 'release' ? attack.target.slot : ''}`
    const left = key(a)
    const right = key(b)
    return left < right ? -1 : left > right ? 1 : 0
  })
  return best[Math.floor(random * best.length)] ?? null
}
