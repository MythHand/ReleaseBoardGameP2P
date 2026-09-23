import type { Action, CardInstance, Event, GameState } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'

export const engine = createFakeEngine()
export const OPERATION_SCENARIOS = [
  'cherry',
  'rebase',
  'upgrade',
  'cherryFizzle',
  'rebaseFizzle',
  'upgradeFizzle',
] as const
export const SCENARIOS = [
  ...OPERATION_SCENARIOS,
  'branch',
  'securityRelease',
  'securityHand',
  'securityRequest',
  'securityGive',
  'blindStealPlay',
  'blindSteal',
  'handDefense',
  'release',
  'releaseCost',
  'ddos',
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
//
// NAMES, not cards: a preset takes these out of the game it was dealt rather
// than writing copies of them beside it (`fromTheGame`).
const DEFENCES = [
  'defense-hotfix', // cancel
  'defense-rubber-ducky', // cancel
  'defense-pr-approved', // cancel
  'defense-rollback', // cancel, and the attack goes back to its hand
  'defense-not-a-bug', // unicorn — works under sudo
  'defense-works-on-my-machine', // unicorn
  // …and the sudo that backs one of them (owner, 22.09). A defence has a sudo
  // effect of its own — a sudo Rollback keeps the attack for the defender
  // instead of handing it back — and without this card in the same hand that
  // half of every defence is unreachable from the stand.
  'support-sudo',
]

// The Bug family, one copy each: three cards with one effect (`cards.md`, the
// `c.bug` key), so whichever is thrown the play is the same one. They ride
// along wherever the attack is still in hand, for the same reason the defences
// do — to be reachable by name rather than by proxy (owner, 20.09).
const BUG_VARIANTS = ['attack-legacy-code', 'attack-out-of-memory']

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
  // DDoS needs a THIRD seat of its own, and not to watch: the AI pair lives
  // there. Two zones side by side is also the only way to see that a DDoS aims
  // across the table rather than at one opponent (owner, 22.09).
  // THREE SEATS ON EVERY PAGE. The stand is the real board or it is nothing, and
  // a table that is two players wide on one page and three on another is two
  // different games: everything that depends on a third seat — a relayed batch,
  // an audience, a roster a pending is owed by — is simply unreachable from the
  // pages that have only two (owner, 22.09). A preset that wants a seat out of
  // the way empties its hand; that is a layout decision, which is what a preset
  // is for.
  const initial = engine.createGame({
    gameId,
    seed: 42,
    players: [
      { id: 'you', name: 'You' },
      { id: 'p2', name: 'Opponent' },
      { id: 'p3', name: scenario === 'ddos' ? 'Second opponent' : 'Observer' },
    ],
    setup: {
      handLimit: 'base',
      releases: 'base',
      // ONE MODE ON EVERY PAGE, and it is the game's own base: a release costs a
      // card. Under `easy` the engine places a release on the spot and asks
      // nobody for anything, so the whole paying half of that move — the prompt,
      // the card given for it, its own exit — did not exist on the pages that
      // used it. A page that runs a different mode is a different game, and a
      // fix checked on it proves nothing about the rest (owner, 22.09).
      releaseCond: 'base',
      ai: 'base',
      gitBranch: 'strategic',
    },
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  if (scenario === 'securityRelease' || scenario === 'securityHand')
    return createSecurityScenario(initial, scenario)
  if (transfer) return createTransferScenario(initial, scenario)
  if (scenario === 'release' || scenario === 'releaseCost') return createReleaseScenario(initial)
  if (scenario === 'ddos') return createDdosScenario(initial)
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
  // …and the third seat only when this preset empties it: a seat that keeps the
  // hand it was dealt keeps those cards, and pooling them would stand every one
  // of them twice.
  const { take, some } = fromTheGame(
    initial,
    scenario === 'upgradeFizzle' ? ['you', 'p2', 'p3'] : ['you', 'p2'],
  )
  const hand = [take(operation), take('support-sudo')]
  hand.push(take('attack-bug'), take('defense-hotfix'), take(operation))
  // THE PILE CARDS ARE ONE SCENE, not three buttons. Branch splits a pile, Merge
  // puts every pile back together, and Sudo changes what each of them does — so
  // the hand carries enough of all three to drive the row of piles up and down
  // several times in one run, which is the only way the shape of that row gets
  // any real pressure (owner, 21.09). Two Branch and one Merge with three Sudo:
  // split, split again, and put it all back, with or without the sudo each time.
  if (scenario === 'branch')
    hand.push(take('operation-git-merge'), take('support-sudo'), take('support-sudo'))

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
          scenario === 'upgradeFizzle' ? [] : [take('release-frontend'), take('defense-hotfix')],
        release: {},
        openedAtDeal: [],
      },
      // The third seat is at every table now, so a preset that is ABOUT an empty
      // opponent hand has to empty this one too — System Upgrade asks every seat
      // that holds a card, and one seat still holding one is not a fizzle. The
      // others leave it with the hand it was dealt: a seat with cards is what a
      // real table has.
      p3: {
        ...initial.players.p3,
        ...(scenario === 'upgradeFizzle' ? { hand: [] } : {}),
        release: {},
        openedAtDeal: [],
      },
    },
    decks: {
      ...initial.decks,
      main:
        scenario === 'rebaseFizzle'
          ? [[]]
          : [cards.slice(0, 4).map(take), cards.slice(4).map(take)],
      discard: scenario === 'cherryFizzle' ? [take('trigger-error-503')] : some(cards.length),
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
// A HAND BUILT OUT OF THE GAME, never on top of it.
//
// A preset writes the hands its scene needs, and every card it writes has to
// come from somewhere: the cards the deal put in hands go back into the pool,
// the preset takes what it asks for, and whatever is left is the draw pile. A
// card written as a fresh instance beside a deck left whole is the same card in
// two places, and the table then holds more cards than the game has — which is
// exactly what the two Security Bug scenes did (ditayler, #184).
//
// Asking for a card the game has run out of throws here rather than quietly
// standing an extra copy on the table: a preset that cannot be dealt is a
// question about the scene, and it should be asked out loud.
// `rebuilt` names the seats whose hands the scene writes itself: ONLY those go
// back into the pool. A seat the scene leaves alone keeps the hand it was
// dealt, and putting those cards back would stand every one of them twice.
function fromTheGame(initial: GameState, rebuilt: string[]) {
  const pool = [
    ...initial.decks.main.flat(),
    ...rebuilt.flatMap((id) => initial.players[id]?.hand ?? []),
  ]
  const take = (id: string): CardInstance => {
    const at = pool.findIndex((c) => c.id === id)
    if (at < 0) throw new Error(`Invalid debug preset: the game has no ${id} left for the table`)
    const [card] = pool.splice(at, 1)
    return card
  }
  // …and cards whose NAMES do not matter: a discard heap is there so the pile
  // is not empty, and what lies in it is nobody's question. Taken off the top
  // of what is left, so they cost the scene nothing it asked for by name.
  const some = (n: number): CardInstance[] => pool.splice(0, n)
  // one pile, the shape a game starts in — what the scene did not take
  return { take, some, piles: () => [pool] }
}

function createSecurityScenario(initial: GameState, scenario: Scenario): GameState {
  const { take, piles } = fromTheGame(initial, ['you', 'p2'])
  const attack = take('attack-security-bug')
  const cost = take('defense-hotfix')
  const sudo = take('support-sudo')
  const debuggerCard = take('protection-debugger')
  const release = take('release-frontend')
  const defences = DEFENCES.map(take)
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
    decks: { ...initial.decks, main: piles(), discard: [] },
    players: {
      ...initial.players,
      you: {
        ...initial.players.you,
        // Sudo rides along here too: the attack is still in the hand, so one
        // run covers the card with and without it (owner, 19.09).
        hand: [attack, sudo, debuggerCard],
        release: {},
        openedAtDeal: [],
      },
      p2: {
        ...initial.players.p2,
        hand: [release, cost, ...defences],
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
  apply({ type: 'PLAY', player: 'p2', card: release.uid, at })
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
  const { take, piles } = fromTheGame(initial, ['you', 'p2', 'p3'])
  const attack = take(security ? 'attack-security-bug' : 'attack-bug')
  let state: GameState = {
    ...initial,
    eventSeq: 100,
    window: null,
    pending: null,
    turn: { ...initial.turn, player: 'you', drawnFrom: [0] },
    // what the scene did not take is the draw pile — cards it wrote into
    // hands cannot also be lying in it
    decks: { ...initial.decks, main: piles(), discard: [] },
    players: {
      ...initial.players,
      you: {
        ...initial.players.you,
        // Sudo rides along wherever the attack is still in hand to be played:
        // one preset, both readings of the card (owner, 19.09).
        hand:
          scenario === 'blindStealPlay'
            ? [attack, ...BUG_VARIANTS.map(take), take('support-sudo'), take('protection-debugger')]
            : [attack, take('protection-debugger')],
        release: {},
        openedAtDeal: [],
      },
      p2: {
        ...initial.players.p2,
        // Two Hotfix copies on purpose — the duplicate-hit preset is built on
        // them — and then one of every OTHER way a defence answers.
        hand: [take('defense-hotfix'), ...DEFENCES.map(take), take('release-backend')],
        release: {},
        openedAtDeal: [],
      },
      p3: {
        ...initial.players.p3,
        hand: [take('release-frontend')],
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
  const { take, piles } = fromTheGame(initial, ['you', 'p2'])
  return {
    ...initial,
    eventSeq: 100,
    window: null,
    pending: null,
    turn: { ...initial.turn, player: 'you', drawnFrom: [0, 1] },
    // what the scene did not take is the draw pile — cards it wrote into
    // hands cannot also be lying in it
    decks: { ...initial.decks, main: piles(), discard: [] },
    players: {
      ...initial.players,
      you: {
        ...initial.players.you,
        hand: [
          take('release-frontend'),
          take('protection-monitoring'),
          take('support-code-review'),
          take('defense-hotfix'),
        ],
        release: {},
        openedAtDeal: [],
      },
      // The window a fresh release opens is answered by somebody, so the
      // opponent holds something to answer it with.
      p2: {
        ...initial.players.p2,
        hand: [take('attack-bug'), take('support-sudo')],
        release: {},
        openedAtDeal: [],
      },
    },
  }
}

// DDOS — the one attack that aims at what is ALREADY STANDING, and the only one
// played on your own turn against the table rather than into a reaction window.
// It has three different targets and one of each is waiting for it: a Monitoring
// (destroyed), a bare release (returned to its owner's hand, frozen for a round)
// and a release under Code Review (returned too — DDoS is the only attack that
// goes through Code Review, and the Code Review is discarded with the move).
//
// The zones are written STANDING, not played into place: what this preset is for
// is the throw, and every card in those zones would otherwise cost a turn of its
// own to put there (owner, 22.09).
//
// FIVE targets across TWO opponents, because the five are not one thing: the
// second seat holds the AI pair, and an AI card does not go to the discard when
// it leaves — it goes home to the events deck, which is its own condition and
// its own road off the table (owner, 22.09). An AI card standing in a zone wears
// the PLAIN catalogue id with its event id alongside (`resolveAiEvent`), so a
// bounced release reads and plays as an ordinary one; the preset writes them the
// same way the engine does rather than inventing a shape of its own.
//
// Five DDoS in hand — one per target, so a single run can empty both zones.
//
// …AND THEY COME OUT OF THE EVENTS DECK, rather than being made up beside it.
// An AI card standing in a zone IS one of that deck's own cards — it carries
// the deck's own uid, and it goes back there when it leaves. Written as fresh
// instances while the deck was kept whole, the same card stood in two places at
// once, and every AI card this scene sent home grew the deck past its own
// supply (ditayler, #185). The deck holds one `ai-release-database` and two
// `ai-monitoring`; the scene takes one of each, and the deck is one and one
// shorter for it.
function createDdosScenario(initial: GameState): GameState {
  // the event card itself, standing in for what it grants: its own uid so it
  // can go home, the plain catalogue id so a bounced release reads and plays as
  // an ordinary one (`triggers.ts`, where the engine does exactly this)
  const events = [...initial.decks.events]
  const standing = (event: string, as: string): CardInstance => {
    const at = events.findIndex((c) => c.id === event)
    const [card] = at < 0 ? [] : events.splice(at, 1)
    return { uid: card?.uid ?? `${event}#debug`, id: as, event }
  }
  const aiRelease = standing('ai-release-database', 'release-database')
  const aiMonitoring = standing('ai-monitoring', 'protection-monitoring')
  const { take, piles } = fromTheGame(initial, ['you', 'p2', 'p3'])
  return {
    ...initial,
    eventSeq: 100,
    window: null,
    pending: null,
    turn: { ...initial.turn, player: 'you', drawnFrom: [0, 1] },
    // …and the deck the two of them came out of, that much shorter; the rest
    // of what the scene did not take is the draw pile
    decks: { ...initial.decks, main: piles(), events, discard: [] },
    players: {
      ...initial.players,
      you: {
        ...initial.players.you,
        // one per target, so a single run can empty both zones — and every one
        // of them out of the game's own six, never a sixth copy written beside
        // them
        hand: Array.from({ length: 5 }, () => take('attack-ddos')),
        release: {},
        openedAtDeal: [],
      },
      p2: {
        ...initial.players.p2,
        hand: [],
        release: {
          monitoring: take('protection-monitoring'),
          frontend: { card: take('release-frontend') },
          backend: {
            card: take('release-backend'),
            codeReview: take('support-code-review'),
          },
        },
        openedAtDeal: [],
      },
      p3: {
        ...initial.players.p3,
        hand: [],
        release: { monitoring: aiMonitoring, database: { card: aiRelease } },
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
