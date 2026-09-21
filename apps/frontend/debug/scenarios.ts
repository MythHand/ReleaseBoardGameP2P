import type { Action, CardInstance, Event, GameState } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'

export const engine = createFakeEngine()
export const OPERATION_SCENARIOS = [
  'cherry',
  'rebase',
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
  'securityRelease',
  'securityHand',
  'securityRequest',
  'securityGive',
  'blindStealPlay',
  'blindSteal',
  'handDefense',
  'release',
  'alarm503',
  'aiTrigger',
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

// WHAT THE DEFENDER HOLDS while an attack is aimed at them. Every preset where
// a card is thrown puts these in that player's hand, so a defence can actually
// be answered with instead of only watched (owner, 20.09).
//
// EVERY defence card, one copy each, by name (owner, 20.09) — a stand is where
// you reach for the card you want to look at, so having the outcome covered by
// some other card is not the same as having this card in hand.
const DEFENCES: CardInstance[] = [
  instance('defense-hotfix', 10), // cancel
  instance('defense-rubber-ducky', 11), // cancel
  instance('defense-pr-approved', 12), // cancel
  instance('defense-rollback', 13), // cancel, and the attack goes back to its hand
  instance('defense-not-a-bug', 14), // unicorn — works under sudo
  instance('defense-works-on-my-machine', 15), // unicorn
]

// The Bug family, one copy each: three cards with one effect (`cards.md`, the
// `c.bug` key), so whichever is thrown the play is the same one. They ride
// along wherever the attack is still in hand, for the same reason the defences
// do — to be reachable by name rather than by proxy (owner, 20.09).
const BUG_VARIANTS: CardInstance[] = [
  instance('attack-legacy-code', 16),
  instance('attack-out-of-memory', 17),
]

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
  if (scenario === 'securityRelease' || scenario === 'securityHand')
    return createSecurityScenario(initial, scenario)
  if (transfer) return createTransferScenario(initial, scenario)
  if (scenario === 'release') return createReleaseScenario(initial)
  if (scenario === 'alarm503' || scenario === 'aiTrigger')
    return createTriggerScenario(initial, scenario)
  const operation = scenario.startsWith('branch')
    ? 'operation-git-branch'
    : scenario.startsWith('cherry')
      ? 'operation-git-cherry-pick'
      : scenario.startsWith('rebase')
        ? 'operation-git-rebase'
        : 'operation-system-upgrade'
  // SUDO IS ALWAYS IN THE HAND, and whether the play uses it is the player's to
  // decide at the table — which is what a preset is for. Cherry-pick and Rebase
  // used to have a second button each for the same board with this one card
  // added; the same run covers both now (owner, 19.09).
  // TWO COPIES OF THE OPERATION, so the same card can be played TWICE in one
  // run. A turn counts only releases, so nothing stops it — and the board used
  // to: it identified an offer by its contents, so a second Rebase with the same
  // piles in the same order looked like the one it had already answered and the
  // row never dealt (#168). It is checkable only with a second copy in hand.
  // …and the second copy goes at the END, not beside the first: the operation is
  // the hand's first card and the sudo its second, and both this stand's own
  // checks and the instruction beneath the toolbar read them by that position.
  const hand = [instance(operation, 0), instance('support-sudo', 1)]
  hand.push(instance('attack-bug', 2), instance('defense-hotfix', 3), instance(operation, 18))

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

// SECURITY BUG HAS TWO EFFECTS, and they are two different moments at the table
// — so they are two presets rather than one board you have to steer into the
// half you meant. Both start with the card in YOUR hand and nothing played for
// you: what you aim it at is the whole question.
//
//   securityRelease — the opponent has just put a release down and paid for it,
//     so its reaction window is open. That window IS the fresh release the card
//     attacks; a release seeded straight into a zone has no window and nothing
//     to attack (`resolution.md` §1, `fake/window.ts`).
//   securityHand — your own turn, the opponent holding cards, nothing in any
//     zone: the only thing to aim at is the hand, which is the other effect —
//     name a card and they hand it over, or they do not have it and the attack
//     is simply spent.
function createSecurityScenario(initial: GameState, scenario: Scenario): GameState {
  const attack = instance('attack-security-bug', 0)
  const cost = instance('defense-hotfix', 3)
  let state: GameState = {
    ...initial,
    eventSeq: 100,
    window: null,
    pending: null,
    // The release path needs the OPPONENT on turn — a release is played on its
    // owner's turn, and the window it opens is what the attacker answers.
    turn: {
      ...initial.turn,
      player: scenario === 'securityRelease' ? 'p2' : 'you',
      drawnFrom: [0],
    },
    decks: { ...initial.decks, discard: [] },
    players: {
      ...initial.players,
      you: {
        ...initial.players.you,
        // Sudo rides along here too: the attack is still in the hand, so one
        // run covers the card with and without it (owner, 19.09).
        hand: [attack, instance('support-sudo', 5), instance('protection-debugger', 1)],
        release: {},
        openedAtDeal: [],
      },
      p2: {
        ...initial.players.p2,
        hand: [instance('release-frontend', 2), cost, ...DEFENCES],
        release: {},
        openedAtDeal: [],
      },
    },
  }
  if (scenario === 'securityHand') return state
  const at = Date.now()
  const apply = (action: Action) => {
    const result = engine.reduce(state, action)
    const refused = result.events.find((event) => event.type === 'rejected')
    // the reason, not just the fact: a preset that stops building is a question
    // about the rules, and the engine already answered it
    if (refused)
      throw new Error(
        `Invalid debug preset: ${scenario} — ${'reason' in refused ? refused.reason : 'rejected'}`,
      )
    state = result.state
  }
  apply({ type: 'PLAY', player: 'p2', card: instance('release-frontend', 2).uid, at })
  // Its cost, when the setup charges one. `releaseCond` decides, so this asks
  // the state rather than assuming: a preset that hardcodes a step the rules
  // did not take is the fixture inventing a pending again.
  if (state.pending?.kind === 'discardForRelease')
    apply({
      type: 'RESOLVE',
      player: 'p2',
      choice: { kind: 'discardForRelease', card: cost.uid },
      at,
    })
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
        // Sudo rides along wherever the attack is still in hand to be played:
        // one preset, both readings of the card (owner, 19.09).
        hand:
          scenario === 'blindStealPlay'
            ? [
                attack,
                ...BUG_VARIANTS,
                instance('support-sudo', 6),
                instance('protection-debugger', 1),
              ]
            : [attack, instance('protection-debugger', 1)],
        release: {},
        openedAtDeal: [],
      },
      p2: {
        ...initial.players.p2,
        // Two Hotfix copies on purpose — the duplicate-hit preset is built on
        // them — and then one of every OTHER way a defence answers.
        hand: [instance('defense-hotfix', 2), ...DEFENCES, instance('release-backend', 4)],
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

// THE ORDINARY TURN, and the one that had no preset at all: every board here
// started with an operation or an attack in the hand, while the move a player
// actually makes every round — putting a release down — had nowhere to be
// played. The cost is paid if the setup charges one, so the hand carries a card
// to pay with, and Code Review is there as the other way to pay: it rides the
// release instead of being spent.
//
// Monitoring comes along because it is the OTHER thing that goes into a zone,
// and nothing else on this stand ever puts one there (owner, 20.09).
function createReleaseScenario(initial: GameState): GameState {
  return {
    ...initial,
    eventSeq: 100,
    window: null,
    pending: null,
    turn: { ...initial.turn, player: 'you', drawnFrom: [0, 1] },
    decks: { ...initial.decks, discard: [] },
    players: {
      ...initial.players,
      you: {
        ...initial.players.you,
        hand: [
          instance('release-frontend', 0),
          instance('protection-monitoring', 1),
          instance('support-code-review', 2),
          instance('defense-hotfix', 3),
        ],
        release: {},
        openedAtDeal: [],
      },
      // The window a fresh release opens is answered by somebody, so the
      // opponent holds something to answer it with.
      p2: {
        ...initial.players.p2,
        hand: [instance('attack-bug', 8), instance('support-sudo', 9)],
        release: {},
        openedAtDeal: [],
      },
    },
  }
}

// THE TRIGGERS ARE DRAWN, NEVER PLAYED — both fire the moment they turn up
// (`fireTrigger`), and neither ever reaches a hand. So their presets put one on
// TOP of a draw pile and leave the turn's draw still owed: the scene starts
// with the gesture that finds the card, which is the whole point of it.
//
//   alarm503 — the alarm STANDS, because there is something to answer it with:
//     a Debugger in hand and a release in the zone are two of the three methods
//     (`neutralizeOptions`), so the board asks instead of eliminating on the
//     spot. The third, a standing Monitoring, would answer inside the draw
//     itself and show nothing — that case belongs to the release preset, where
//     a Monitoring can actually be put down first.
//   aiTrigger — the AI card reveals ONE event, picked out of the events deck by
//     the seed. The deck is seeded with a single card so the preset shows the
//     same event every run: a Crush aimed at the release standing in the zone,
//     which is the AI effect that asks a question rather than passing by.
function createTriggerScenario(initial: GameState, scenario: Scenario): GameState {
  const alarm = scenario === 'alarm503'
  const trigger = instance(alarm ? 'trigger-error-503' : 'trigger-ai', 30)
  return {
    ...initial,
    eventSeq: 100,
    window: null,
    pending: null,
    // NOT drawn yet — the draw is the gesture this preset is about
    turn: { ...initial.turn, player: 'you', drawnFrom: [] },
    decks: {
      ...initial.decks,
      // the trigger on top, and cards under it so the pile is not left empty
      main: [[trigger, ...cards.slice(0, 3).map((id, i) => instance(id, i + 40))]],
      discard: [],
      events: alarm ? initial.decks.events : [instance('ai-crush-frontend', 31)],
    },
    players: {
      ...initial.players,
      you: {
        ...initial.players.you,
        hand: [instance('protection-debugger', 0), instance('defense-hotfix', 1)],
        // the release both presets need: the 503's `sacrifice` method, and the
        // slot a Crush aims at
        release: { frontend: { card: instance('release-frontend', 32) } },
        openedAtDeal: [],
      },
      p2: {
        ...initial.players.p2,
        hand: [instance('attack-bug', 8)],
        release: {},
        openedAtDeal: [],
      },
    },
  }
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
