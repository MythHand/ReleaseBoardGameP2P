import type { Action, CardInstance, GameState } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'

export const engine = createFakeEngine()
export const OPERATION_SCENARIOS = [
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
export const SCENARIOS = [
  ...OPERATION_SCENARIOS,
  'branch',
  'branchSudo',
  'securityRequest',
  'securityGive',
  'blindSteal',
  'handDefense',
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
  const transfer = ['securityRequest', 'securityGive', 'blindSteal', 'handDefense'].includes(
    scenario,
  )
  const initial = engine.createGame({
    gameId,
    seed: 42,
    players: [
      { id: 'you', name: 'You' },
      { id: 'p2', name: 'Opponent' },
      ...(transfer ? [{ id: 'p3', name: 'Observer' }] : []),
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
  if (transfer) return createTransferScenario(initial, scenario)
  const operation = scenario.startsWith('branch')
    ? 'operation-git-branch'
    : scenario.startsWith('cherry')
      ? 'operation-git-cherry-pick'
      : scenario.startsWith('rebase')
        ? 'operation-git-rebase'
        : 'operation-system-upgrade'
  const hand = [instance(operation, 0)]
  if (scenario.endsWith('Sudo')) hand.push(instance('support-sudo', 1))
  hand.push(instance('attack-bug', 2), instance('defense-hotfix', 3))

  const state: GameState = {
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
  if (scenario.startsWith('branch')) state.decks.main = [state.decks.main.flat()]
  return state
}

// Enter an intermediate decision through real actions, so a fixture cannot
// invent a pending shape that the current engine no longer produces.
function createTransferScenario(initial: GameState, scenario: Scenario): GameState {
  const security = scenario.startsWith('security')
  const attack = instance(security ? 'attack-security-bug' : 'attack-bug', 0)
  let state: GameState = {
    ...initial,
    eventSeq: 100,
    window: null,
    pending: null,
    turn: { ...initial.turn, player: 'you', drawnFrom: [0] },
    decks: { ...initial.decks, discard: [] },
    players: {
      ...initial.players,
      you: {
        ...initial.players.you,
        hand: [attack, instance('protection-debugger', 1)],
        release: {},
        openedAtDeal: [],
      },
      p2: {
        ...initial.players.p2,
        hand: [
          instance('defense-hotfix', 2),
          instance('defense-hotfix', 3),
          instance('release-backend', 4),
        ],
        release: {},
        openedAtDeal: [],
      },
      p3: {
        ...initial.players.p3,
        hand: [instance('release-frontend', 5)],
        release: {},
        openedAtDeal: [],
      },
    },
  }
  const at = Date.now()
  const apply = (action: Action) => {
    const result = engine.reduce(state, action)
    if (result.events.some((event) => event.type === 'rejected'))
      throw new Error(`Invalid debug preset: ${scenario}`)
    state = result.state
  }
  apply({
    type: 'PLAY',
    player: 'you',
    card: attack.uid,
    target: { kind: 'player', player: 'p2' },
    at,
  })
  if (scenario === 'handDefense') return state
  apply({ type: 'RESOLVE', player: 'p2', choice: { kind: 'defend', card: null }, at })
  return state
}
