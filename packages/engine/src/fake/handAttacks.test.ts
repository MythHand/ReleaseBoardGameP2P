import type { GameConfig } from '../engine'
import type { CardInstance, GameState, Setup } from '../state'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import { reduce } from './reduce'

const engine = createFakeEngine()

const EASY: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'easy',
  ai: 'base',
  gitBranch: 'base',
}

const config = (): GameConfig => ({
  gameId: 'g1',
  seed: 4242,
  players: [
    { id: 'p1', name: 'you' },
    { id: 'p2', name: 'kernel_panic' },
  ],
  setup: EASY,
  deck: FAKE_DECK,
  events: FAKE_EVENTS,
})

const BUG: CardInstance = { uid: 'attack-bug#0', id: 'attack-bug' }
const SEC: CardInstance = { uid: 'attack-security-bug#0', id: 'attack-security-bug' }
const DDOS: CardInstance = { uid: 'attack-ddos#0', id: 'attack-ddos' }
const MON: CardInstance = { uid: 'protection-monitoring#0', id: 'protection-monitoring' }
const FE: CardInstance = { uid: 'release-frontend#0', id: 'release-frontend' }
const CR: CardInstance = { uid: 'support-code-review#0', id: 'support-code-review' }
const HOTFIX: CardInstance = { uid: 'defense-hotfix#0', id: 'defense-hotfix' }
const NOTABUG: CardInstance = { uid: 'defense-not-a-bug#0', id: 'defense-not-a-bug' }
const ROLLBACK: CardInstance = { uid: 'defense-rollback#0', id: 'defense-rollback' }
const WORKS: CardInstance = {
  uid: 'defense-works-on-my-machine#0',
  id: 'defense-works-on-my-machine',
}
const SUDO: CardInstance = { uid: 'support-sudo#0', id: 'support-sudo' }
const SUDO2: CardInstance = { uid: 'support-sudo#1', id: 'support-sudo' }
const SPARE: CardInstance = { uid: 'protection-debugger#0', id: 'protection-debugger' }

const table = (p1: CardInstance[], p2: CardInstance[]): GameState => {
  const s = engine.createGame(config())
  return {
    ...s,
    players: {
      ...s.players,
      p1: { ...s.players.p1, hand: p1 },
      p2: { ...s.players.p2, hand: p2 },
    },
  }
}

it('opens a hand-scoped defence when Bug targets a player', () => {
  const r = reduce(table([BUG], [HOTFIX]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  expect(r.state.pending).toMatchObject({ kind: 'defend', player: 'p2', scope: 'hand' })
  expect(r.state.window).toBeNull()
})

it('steals one card when the hand attack is taken', () => {
  const victim: CardInstance = { uid: 'support-sudo#0', id: 'support-sudo' }
  const attacked = reduce(table([BUG], [victim]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const opened = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 1001,
  })
  const r = reduce(opened.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'stealCard', index: 0 },
    at: 1002,
  })
  expect(r.state.players.p2.hand).toEqual([])
  expect(r.state.players.p1.hand.map((c) => c.uid)).toEqual([victim.uid])
  // The identity of a stolen card is private to the two parties.
  const transfer = r.events.find((e) => e.type === 'handTransfer')
  expect(transfer?.visibleTo).toBeUndefined()
})

it('leaves the hand intact when the attack is cancelled', () => {
  // A spare card beyond the defence itself: if a cancelled attack still stole,
  // this is the card that would go missing — a single-card hand would empty
  // out either way and hide that failure.
  const spare: CardInstance = { uid: 'support-sudo#0', id: 'support-sudo' }
  const attacked = reduce(table([BUG], [HOTFIX, spare]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: HOTFIX.uid },
    at: 1001,
  })
  expect(r.state.players.p2.hand).toEqual([spare])
  expect(r.state.players.p1.hand).toEqual([])
  expect(r.state.window).toBeNull()
})

it('returns the attack card to the attacker when Rollback defends a hand attack', () => {
  const attacked = reduce(table([BUG], [ROLLBACK]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: ROLLBACK.uid },
    at: 1001,
  })
  expect(r.state.players.p1.hand.map((c) => c.uid)).toEqual([BUG.uid])
  expect(r.state.players.p2.hand).toEqual([])
  expect(r.state.decks.discard.map((c) => c.uid)).toContain(ROLLBACK.uid)
})

it('sudo Rollback keeps the attack card with the defender instead of the attacker', () => {
  const attacked = reduce(table([BUG], [ROLLBACK, SUDO]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: ROLLBACK.uid, combo: SUDO.uid },
    at: 1001,
  })
  expect(r.state.players.p2.hand.map((c) => c.uid)).toEqual([BUG.uid])
  expect(r.state.players.p1.hand).toEqual([])
})

it('holds the sudo half on a hand-attack pending, not in the discard', () => {
  const r = reduce(table([BUG, SUDO], []), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    combo: SUDO.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  expect(r.state.decks.discard).not.toContainEqual(SUDO)
  expect(r.state.pending).toMatchObject({ kind: 'defend', combo: SUDO })
  expect(r.events.map((e) => e.type)).toEqual(['attacked'])
})

it('banks both halves with attackSpent when a hand-attack hit is taken', () => {
  const attacked = reduce(table([BUG, SUDO], []), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    combo: SUDO.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 1001,
  })
  const discards = r.events.filter((e) => e.type === 'discarded')
  expect(discards).toMatchObject([
    { card: BUG.id, reason: 'attackSpent', player: 'p1' },
    { card: SUDO.id, reason: 'attackSpent', player: 'p1' },
  ])
  const hit = r.events.find((e) => e.type === 'tookHit')
  for (const d of discards) expect(d.parent).toBe(hit?.id)
  expect(r.state.decks.discard).toEqual(expect.arrayContaining([BUG, SUDO]))
})

it('banks a sudo-comboed hand attack’s both halves, then the cancelling defence, when it is repelled', () => {
  // Not a Bug is the only cancel-effect card `defencesFor` still offers against
  // a sudo attack (it is 'unicorn' kind, exempt from the sudo block that
  // 'cancel' kind cards like Hotfix hit) — the one way to reach this shape.
  const attacked = reduce(table([BUG, SUDO], [NOTABUG]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    combo: SUDO.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: NOTABUG.uid },
    at: 1001,
  })
  const discards = r.events.filter((e) => e.type === 'discarded')
  // Order: the attack card banks before its sudo half, both before the defence.
  expect(discards).toMatchObject([
    { card: BUG.id, reason: 'attackSpent', player: 'p1' },
    { card: SUDO.id, reason: 'attackSpent', player: 'p1' },
    { card: NOTABUG.id, reason: 'defenceSpent', player: 'p2' },
  ])
  const defended = r.events.find((e) => e.type === 'defended')
  for (const d of discards) expect(d.parent).toBe(defended?.id)
  expect(r.state.decks.discard).toEqual(expect.arrayContaining([BUG, SUDO, NOTABUG]))
})

it('reflects a random-steal attack: the defender steals from the attacker instead', () => {
  // SPARE is the only card left in the attacker's hand once BUG is thrown, so
  // it is the one thing the reflected steal could possibly take.
  const attacked = reduce(table([BUG, SPARE], [WORKS]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const opened = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: WORKS.uid },
    at: 1001,
  })
  const r = reduce(opened.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'stealCard', index: 0 },
    at: 1002,
  })
  expect(r.state.players.p1.hand).toEqual([])
  expect(r.state.players.p2.hand.map((c) => c.uid)).toEqual([SPARE.uid])
  const transfer = r.events.find((e) => e.type === 'handTransfer')
  expect(transfer).toMatchObject({ from: 'p1', to: 'p2' })
})

it('reflects Security Bug: the roles swap, defender becomes the requester', () => {
  const attacked = reduce(table([SEC], [WORKS]), {
    type: 'PLAY',
    player: 'p1',
    card: SEC.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: WORKS.uid },
    at: 1001,
  })
  expect(r.state.pending).toMatchObject({ kind: 'requestCard', player: 'p2', target: 'p1' })
})

it('asks Security Bug for a card type, and misses when it is absent', () => {
  const attacked = reduce(table([SEC], []), {
    type: 'PLAY',
    player: 'p1',
    card: SEC.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const taken = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 1001,
  })
  expect(taken.state.pending).toMatchObject({ kind: 'requestCard', player: 'p1', target: 'p2' })

  const r = reduce(taken.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'requestCard', card: 'support-sudo' },
    at: 1002,
  })
  expect(r.state.pending).toBeNull()
  expect(r.events.some((e) => e.type === 'requested' && e.hit === false)).toBe(true)
})

it('surrenders the requested card on a hit, moving it from target to attacker', () => {
  const attacked = reduce(table([SEC], [SUDO2, SUDO]), {
    type: 'PLAY',
    player: 'p1',
    card: SEC.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const missed = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 1001,
  })
  const hit = reduce(missed.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'requestCard', card: 'support-sudo' },
    at: 1002,
  })
  expect(hit.state.pending).toBeNull()
  expect(hit.events.map((e) => e.type)).toEqual(['requested', 'handTransfer', 'discarded'])
  expect(hit.events[0]).toMatchObject({ hit: true })
  const r = hit
  expect(r.state.players.p2.hand).toEqual([SUDO])
  expect(r.state.players.p1.hand.map((c) => c.uid)).toEqual([SUDO2.uid])
  const transfer = r.events.find((e) => e.type === 'handTransfer')
  expect(transfer).toMatchObject({ from: 'p2', to: 'p1', card: 'support-sudo' })
  expect(transfer?.visibleTo).toBeUndefined()
})

it('destroys a Monitoring with DDoS', () => {
  const s = table([DDOS], [])
  const guarded: GameState = {
    ...s,
    players: { ...s.players, p2: { ...s.players.p2, release: { monitoring: MON } } },
  }
  const r = reduce(guarded, {
    type: 'PLAY',
    player: 'p1',
    card: DDOS.uid,
    target: { kind: 'monitoring', player: 'p2' },
    at: 1000,
  })
  expect(r.state.players.p2.release.monitoring).toBeUndefined()
  expect(r.state.decks.discard.map((c) => c.uid)).toContain(MON.uid)
  // And the feed says so. It used to be banked by a direct write, so everything
  // built from the feed ran a card behind the projection's discardCount — the
  // board's discard heap carried a stand-in for exactly this. Parented to the
  // destruction, the way triggers.ts parents a destroyed release's spoils.
  const destroyed = r.events.find((e) => e.type === 'monitoringDestroyed')
  expect(r.events).toContainEqual(
    expect.objectContaining({
      type: 'discarded',
      player: 'p2',
      card: MON.id,
      reason: 'destroyed',
      parent: destroyed?.id,
    }),
  )
})

it('returns a protected release to hand and freezes it', () => {
  const s = table([DDOS], [])
  const guarded: GameState = {
    ...s,
    players: {
      ...s.players,
      p2: { ...s.players.p2, release: { frontend: { card: FE, codeReview: CR } } },
    },
  }
  const r = reduce(guarded, {
    type: 'PLAY',
    player: 'p1',
    card: DDOS.uid,
    target: { kind: 'release', player: 'p2', slot: 'frontend' },
    at: 1000,
  })
  expect(r.state.players.p2.release.frontend).toBeUndefined()
  expect(r.state.players.p2.hand.map((c) => c.uid)).toEqual([FE.uid])
  expect(r.state.players.p2.frozen).toEqual([FE.uid])
  // Code Review is discarded rather than returned with it.
  expect(r.state.decks.discard.map((c) => c.uid)).toContain(CR.uid)
  // The release bounces to hand, so it gets no discard — but the Code Review
  // does, and that was the second card this path banked in silence.
  const returned = r.events.find((e) => e.type === 'releaseReturned')
  expect(r.events).toContainEqual(
    expect.objectContaining({
      type: 'discarded',
      player: 'p2',
      card: CR.id,
      reason: 'destroyed',
      parent: returned?.id,
    }),
  )
  expect(r.events.some((e) => e.type === 'discarded' && e.card === FE.id)).toBe(false)
})

it('thaws a frozen card when its owner’s next turn ends', () => {
  const s = table([], [])
  const frozen: GameState = {
    ...s,
    players: { ...s.players, p1: { ...s.players.p1, frozen: [FE.uid], hand: [FE] } },
    turn: { player: 'p1', index: 0, drawnFrom: [0], releasesPlayed: 0 },
  }
  const r = reduce(frozen, { type: 'PUSH', player: 'p1', at: 1000 })
  expect(r.state.players.p1.frozen).toEqual([])
})

// The hand scope has its own attack emission (`openHandAttack`), so the link
// the release scope makes is a separate one here — same field, other site (#138).
it('parents a defence to the hand attack it answered', () => {
  const attacked = reduce(table([BUG], [HOTFIX]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const attack = attacked.events.find((e) => e.type === 'attacked')
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: HOTFIX.uid },
    at: 1001,
  })
  const defended = r.events.find((e) => e.type === 'defended')
  expect(attack?.id).toBeDefined()
  expect(defended?.parent).toBe(attack?.id)
})

it('parents a taken hand hit to the attack that landed it', () => {
  const attacked = reduce(table([BUG], [SPARE]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const attack = attacked.events.find((e) => e.type === 'attacked')
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 1001,
  })
  const hit = r.events.find((e) => e.type === 'tookHit')
  expect(attack?.id).toBeDefined()
  expect(hit?.parent).toBe(attack?.id)
})

// A DDoS is the one attack whose target is the thrower's choice — any
// opponent's Monitoring or release (cards.md, DDoS) — and it is never answered,
// so nothing arrives later to carry that choice. It reaches the table only
// through what the attack DID. Unless the consequence names its cause, the move
// history shows a DDoS and what it hit as two unrelated rows.
it('parents a Monitoring a DDoS destroyed to the attack', () => {
  const s = table([DDOS], [])
  const guarded: GameState = {
    ...s,
    players: { ...s.players, p2: { ...s.players.p2, release: { monitoring: MON } } },
  }
  const r = reduce(guarded, {
    type: 'PLAY',
    player: 'p1',
    card: DDOS.uid,
    target: { kind: 'monitoring', player: 'p2' },
    at: 1000,
  })
  const attack = r.events.find((e) => e.type === 'attacked')
  expect(attack?.id).toBeDefined()
  expect(r.events.find((e) => e.type === 'monitoringDestroyed')?.parent).toBe(attack?.id)
})

it('parents a release a DDoS returned to the attack', () => {
  const s = table([DDOS], [])
  const guarded: GameState = {
    ...s,
    players: { ...s.players, p2: { ...s.players.p2, release: { frontend: { card: FE } } } },
  }
  const r = reduce(guarded, {
    type: 'PLAY',
    player: 'p1',
    card: DDOS.uid,
    target: { kind: 'release', player: 'p2', slot: 'frontend' },
    at: 1000,
  })
  const attack = r.events.find((e) => e.type === 'attacked')
  expect(attack?.id).toBeDefined()
  expect(r.events.find((e) => e.type === 'releaseReturned')?.parent).toBe(attack?.id)
})

// Every other spent attack card hangs off its cause — the defence or the hit
// that answered it. A DDoS has no answer, so its own card hangs off the throw.
it('parents the spent DDoS card to the attack', () => {
  const s = table([DDOS], [])
  const guarded: GameState = {
    ...s,
    players: { ...s.players, p2: { ...s.players.p2, release: { monitoring: MON } } },
  }
  const r = reduce(guarded, {
    type: 'PLAY',
    player: 'p1',
    card: DDOS.uid,
    target: { kind: 'monitoring', player: 'p2' },
    at: 1000,
  })
  const attack = r.events.find((e) => e.type === 'attacked')
  const spent = r.events.find((e) => e.type === 'discarded' && e.reason === 'attackSpent')
  expect(attack?.id).toBeDefined()
  expect(spent?.parent).toBe(attack?.id)
})

it('holds the attack and sudo until a blind position is chosen, without projecting hand identities', () => {
  const attacked = reduce(table([BUG, SUDO], [SPARE, SUDO2]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    combo: SUDO.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const opened = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 1001,
  })
  expect(opened.state.pending).toMatchObject({ kind: 'stealCard', player: 'p1', target: 'p2' })
  expect(opened.state.decks.discard).not.toContainEqual(BUG)
  expect(opened.events.some((e) => e.type === 'handTransfer')).toBe(false)
  const pending = engine.project(opened.state, 'p1').pending
  expect(pending).toMatchObject({ count: 2, attack: BUG.id, sudo: true })
  expect(JSON.stringify(pending)).not.toContain(SPARE.uid)
  expect(JSON.stringify(pending)).not.toContain(SUDO2.uid)
  const action = {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'stealCard', index: 1 },
    at: 1002,
  } as const
  const resolved = reduce(opened.state, action)
  expect(resolved).toEqual(reduce(JSON.parse(JSON.stringify(opened.state)), action))
  expect(resolved.state.pending).toBeNull()
  expect(resolved.state.players.p1.hand).toHaveLength(1)
  expect(resolved.state.players.p2.hand).toHaveLength(1)
  expect(resolved.state.decks.discard).toEqual(expect.arrayContaining([BUG, SUDO]))
  expect(resolved.events.find((e) => e.type === 'handTransfer')?.visibleTo).toBeUndefined()
})

it('keeps Security Bug in the centre until the request immediately transfers its known card', () => {
  const attacked = reduce(table([SEC], [SUDO2]), {
    type: 'PLAY',
    player: 'p1',
    card: SEC.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1000,
  })
  const requested = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 1001,
  })
  expect(requested.state.decks.discard).not.toContainEqual(SEC)
  const done = reduce(requested.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'requestCard', card: SUDO2.id },
    at: 1002,
  })
  expect(done.events.find((e) => e.type === 'handTransfer')).toMatchObject({
    publicCard: true,
    card: SUDO2.id,
  })
  expect(done.state.decks.discard).toContainEqual(SEC)
})

it.each([
  -1,
  2,
  0.5,
  NaN,
])('rejects invalid blind position %s without advancing or losing the held attack', (index) => {
  const attacked = reduce(table([BUG], [SPARE, SUDO2]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1,
  })
  const opened = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 2,
  })
  const rejected = reduce(opened.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'stealCard', index },
    at: 3,
  })
  expect(rejected.state).toBe(opened.state)
  expect(rejected.events[0]).toMatchObject({ type: 'rejected' })
  const impostor = reduce(opened.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'stealCard', index: 0 },
    at: 3,
  })
  expect(impostor.state).toBe(opened.state)
})

it('finishes an empty reflected hand attack without opening an impossible choice', () => {
  const attacked = reduce(table([BUG], [WORKS]), {
    type: 'PLAY',
    player: 'p1',
    card: BUG.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1,
  })
  const done = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: WORKS.uid },
    at: 2,
  })
  expect(done.state.pending).toBeNull()
  expect(done.state.decks.discard).toEqual(expect.arrayContaining([BUG, WORKS]))
  expect(done.events.some((e) => e.type === 'handTransfer')).toBe(false)
})

it.each(
  [undefined, null, {}, [], '', 'not-a-card', 'support-sudo#0', '__proto__', 'constructor'].map(
    (card) => ({ card }),
  ),
)('rejects a malformed Security Bug card type $card without publishing or spending anything', ({
  card,
}) => {
  const played = reduce(table([SEC], [SUDO2]), {
    type: 'PLAY',
    player: 'p1',
    card: SEC.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1,
  })
  const request = reduce(played.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 2,
  })
  const result = reduce(request.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'requestCard', card },
    at: 3,
  } as never)
  expect(result.state).toBe(request.state)
  expect(result.events).toHaveLength(1)
  expect(result.events[0]).toMatchObject({ type: 'rejected' })
})

it.each([
  BUG,
  SEC,
])('keeps original ownership when a sudo $id is reflected through its final choice', (attack) => {
  const played = reduce(table([attack, SUDO, SPARE, SUDO2], [WORKS]), {
    type: 'PLAY',
    player: 'p1',
    card: attack.uid,
    combo: SUDO.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1,
  })
  const reflected = reduce(played.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: WORKS.uid },
    at: 2,
  })
  expect(reflected.state.pending).toMatchObject({
    player: 'p2',
    context: { owner: 'p1', attack, combo: SUDO, cover: { player: 'p2', cards: [WORKS] } },
  })
  // the defence is LYING ON THE TABLE, not spent: it stays over the attack it
  // answered until that attack leaves, and goes to the discard with it
  expect(reflected.state.decks.discard).toEqual([])
  expect(reflected.events.filter((e) => e.type === 'discarded')).toEqual([])
  const done =
    attack.id === SEC.id
      ? reduce(reflected.state, {
          type: 'RESOLVE',
          player: 'p2',
          choice: { kind: 'requestCard', card: SUDO2.id },
          at: 3,
        })
      : reduce(reflected.state, {
          type: 'RESOLVE',
          player: 'p2',
          choice: { kind: 'stealCard', index: 0 },
          at: 4,
        })
  expect(done.state.pending).toBeNull()
  expect(done.state.players.p2.hand).toHaveLength(1)
  expect(done.state.players.p1.hand).toHaveLength(1)
  // …and here it leaves, in the same breath as the attack: the attacker's
  // cards first, the defender's after, the order every resolution banks in
  expect(done.state.decks.discard).toEqual([attack, SUDO, WORKS])
  expect(done.events.filter((e) => e.type === 'discarded')).toMatchObject([
    { player: 'p1', card: attack.id, reason: 'attackSpent' },
    { player: 'p1', card: SUDO.id, reason: 'attackSpent' },
    { player: 'p2', card: WORKS.id, reason: 'defenceSpent' },
  ])
  expect(done.events.find((e) => e.type === 'handTransfer')).toMatchObject({ from: 'p1', to: 'p2' })
})

it('resolves a legacy giveCard snapshot while rejecting another card without losing the prompt', () => {
  const played = reduce(table([SEC], [SUDO, SUDO2, SPARE]), {
    type: 'PLAY',
    player: 'p1',
    card: SEC.uid,
    target: { kind: 'player', player: 'p2' },
    at: 1,
  })
  const request = reduce(played.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'defend', card: null },
    at: 2,
  })
  const give = {
    state: {
      ...request.state,
      pending: {
        kind: 'giveCard' as const,
        player: 'p2',
        attacker: 'p1',
        requested: SUDO.id,
        context:
          request.state.pending?.kind === 'requestCard' ? request.state.pending.context : undefined,
      },
    },
  }
  const wrong = reduce(give.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'giveCard', card: SPARE.uid },
    at: 4,
  })
  expect(wrong.state).toBe(give.state)
  const done = reduce(wrong.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'giveCard', card: SUDO2.uid },
    at: 5,
  })
  expect(done.state.players.p1.hand).toEqual([SUDO2])
  expect(done.state.players.p2.hand).toEqual([SUDO, SPARE])
  expect(done.state.decks.discard).toEqual([SEC])
})

it.each([
  BUG,
  SEC,
])('opens a 25 second choice after a 15 second defence for $id, including reflection', (attack) => {
  for (const reflection of [false, true]) {
    const played = reduce(table([attack, SPARE], [WORKS, SUDO2]), {
      type: 'PLAY',
      player: 'p1',
      card: attack.uid,
      target: { kind: 'player', player: 'p2' },
      at: 1000,
    })
    expect(played.state.pending).toMatchObject({ openedAt: 1000, deadline: 16000 })
    const opened = reduce(played.state, {
      type: 'RESOLVE',
      player: 'p2',
      choice: { kind: 'defend', card: reflection ? WORKS.uid : null },
      at: 2000,
    })
    expect(opened.state.pending).toMatchObject({
      player: reflection ? 'p2' : 'p1',
      openedAt: 2000,
      deadline: 27000,
    })
  }
})
