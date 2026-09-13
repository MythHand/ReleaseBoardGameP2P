import type { CardInstance, GameState } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'

export const engine = createFakeEngine()
export const SCENARIOS = [
  'cherry',
  'cherrySudo',
  'rebase',
  'rebaseSudo',
  'upgrade',
  'upgradeSudo',
  'cherryFizzle',
  'rebaseFizzle',
  'upgradeFizzle',
] as const
export type Scenario = (typeof SCENARIOS)[number]

const cards = [
  'release-frontend',
  'release-backend',
  'release-database',
  'attack-bug',
  'defense-hotfix',
  'protection-debugger',
  'support-code-review',
  'attack-ddos',
]
const instance = (id: string, n: number): CardInstance => ({ uid: `${id}#debug${n}`, id })

// Deliberately stable card UIDs: restarting must reset the board's private
// arrangement even when every card identity appears again in the next run.
export function createScenario(scenario: Scenario, gameId: string): GameState {
  const initial = engine.createGame({
    gameId,
    seed: 42,
    players: [
      { id: 'you', name: 'You' },
      { id: 'p2', name: 'Opponent' },
    ],
    setup: {
      handLimit: 'base',
      releases: 'base',
      releaseCond: 'easy',
      ai: 'base',
      gitBranch: 'strategic',
    },
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const operation = scenario.startsWith('cherry')
    ? 'operation-git-cherry-pick'
    : scenario.startsWith('rebase')
      ? 'operation-git-rebase'
      : 'operation-system-upgrade'
  const hand = [instance(operation, 0)]
  if (scenario.endsWith('Sudo')) hand.push(instance('support-sudo', 1))
  hand.push(instance('attack-bug', 2), instance('defense-hotfix', 3))

  return {
    ...initial,
    eventSeq: 100,
    window: null,
    pending: null,
    turn: { ...initial.turn, player: 'you', drawnFrom: [0, 1] },
    players: {
      ...initial.players,
      you: { ...initial.players.you, hand, release: {}, openedAtDeal: [] },
      p2: {
        ...initial.players.p2,
        hand:
          scenario === 'upgradeFizzle'
            ? []
            : [instance('release-frontend', 8), instance('defense-hotfix', 9)],
        release: {},
        openedAtDeal: [],
      },
    },
    decks: {
      ...initial.decks,
      main:
        scenario === 'rebaseFizzle'
          ? [[]]
          : [
              cards.slice(0, 4).map((id, i) => instance(id, i + 40)),
              cards.slice(4).map((id, i) => instance(id, i + 50)),
            ],
      discard:
        scenario === 'cherryFizzle'
          ? [instance('trigger-error-503', 90)]
          : cards.map((id, i) => instance(id, i + 20)),
    },
  }
}
