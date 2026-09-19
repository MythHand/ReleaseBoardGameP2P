import type { Action, CardInstance, Event, GameState } from '@release/engine'
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
  'blindStealPlay',
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
  const transfer = [
    'securityRequest',
    'securityGive',
    'blindStealPlay',
    'blindSteal',
    'handDefense',
  ].includes(scenario)
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
  // NOTHING APPLIED: the attack is still in the hand, so the scene runs from
  // the gesture that starts it rather than from the decision it leads to. Every
  // other preset here enters its decision through real actions for the same
  // reason a fixture never writes a pending by hand — this one simply starts a
  // step earlier, at the card.
  if (scenario === 'blindStealPlay') return state
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

// A preset drops its discard straight into the state, but the board folds the
// HEAP out of the event feed — one `discarded` event per card, each card's
// scatter keyed by that event's id. With no feed behind it the pile draws as a
// single card and a returning Cherry-pick card has no resting pose to land on,
// so it dissolves instead of lying down. So a seeded pile comes with the
// history a played match would have left it: ids below the engine's own
// sequence (`eventSeq` starts the presets at 100), reported to the board as
// already reflected so its queue plays none of them.
export function seedLog(state: GameState): Event[] {
  return state.decks.discard.map(
    (card, i) =>
      ({
        id: i + 1,
        type: 'discarded',
        player: 'you',
        card: card.id,
        reason: 'effect',
      }) as Event,
  )
}
