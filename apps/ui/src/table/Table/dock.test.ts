import { deriveDock, isCounting } from './dock'
import type { TablePending, TableWindow } from './intents'
import type { TableState } from './types'

// `base` covers every TableState field except `turn` / `hasDrawn`, which each
// test sets explicitly — that's the axis under test.
const base: Omit<TableState, 'turn' | 'hasDrawn'> = {
  you: { name: 'you', hand: [], release: {} },
  opponents: [{ id: 'p2', name: 'kernel_panic', handCount: 5, release: {} }],
  decks: { main: [40], events: 12, discardCount: 0 },
  history: [],
  setup: {},
  selfId: 'you',
  playable: [],
  frozen: [],
}

const defendPending: TablePending = {
  kind: 'defend',
  player: 'you',
  attacker: 'p2',
  attackCard: 'attack-bug',
  sudo: false,
  options: ['c1'],
  openedAt: 0,
  deadline: 10_000,
  scope: 'hand',
}

it('is `draw` on your turn before you have drawn', () => {
  const d = deriveDock({ ...base, turn: 'you', hasDrawn: false }, 'you', 0)
  expect(d.state).toBe('draw')
})

it('is `push` on your turn once you have drawn', () => {
  const d = deriveDock({ ...base, turn: 'you', hasDrawn: true }, 'you', 0)
  expect(d.state).toBe('push')
})

it('is `waiting` on someone else’s turn, and names them', () => {
  const d = deriveDock({ ...base, turn: 'p2', hasDrawn: true }, 'you', 0)
  expect(d.state).toBe('waiting')
  expect(d.activePlayer).toBe('kernel_panic')
})

it('falls back to `waiting` with no name when turn names nobody on the roster', () => {
  const d = deriveDock({ ...base, turn: 'ghost', hasDrawn: true }, 'you', 0)
  expect(d.state).toBe('waiting')
  expect(d.activePlayer).toBeUndefined()
})

it('is a danger reaction while a defence is pending against you', () => {
  const d = deriveDock({ ...base, turn: 'p2', pending: defendPending }, 'you', 0)
  expect(d.state).toBe('reaction')
  expect(d.danger).toBe(true)
})

const costPending: TablePending = {
  kind: 'discardForRelease',
  player: 'you',
  release: 'release-frontend#0',
  options: ['c1'],
}

// #101 (review round 2): a release's own price is one action inside a turn,
// not a state of the table. The phase has not changed and the turn is still
// yours, so the dock keeps the turn's own phase, accent and clock — no sixth
// TurnDockState, and no phase word repeating what the ask on the table says.
it('keeps the turn its own phase while your release waits to be paid', () => {
  const clock = { openedAt: 0, deadline: 30_000 }
  const d = deriveDock(
    { ...base, turn: 'you', hasDrawn: true, pending: costPending, turnClock: clock },
    'you',
    10_000,
  )
  expect(d.state).toBe('push')
  expect(d.danger).toBe(false)
  // the turn's OWN clock, still running — not a flat ring, and not the
  // pending's (a `discardForRelease` carries no deadline of its own)
  expect(d.seconds).toBe(20)
})

// The other half of the same rule: it is not a state of the table for the
// people watching either. On your turn they read `waiting`, and staging a
// release must not flip them to `hold` — that would announce a decision the
// table is stuck on, when the turn is simply still yours.
it('leaves everyone else on `waiting` while your release waits to be paid', () => {
  const d = deriveDock(
    { ...base, turn: 'p2', hasDrawn: true, pending: { ...costPending, player: 'p2' } },
    'you',
    0,
  )
  expect(d.state).toBe('waiting')
  expect(d.activePlayer).toBe('kernel_panic')
})

// The narrowness of that exclusion, not the exclusion itself: only the one
// pending the cards on the table answer falls through to the turn. Every OTHER
// decision owed to you still raises its panel and still reads as a reaction.
// `handLimit` is the subject on purpose — the `defend` case above already
// covers itself, so pointing this at `defend` too would be the same call with
// fewer assertions and would guard nothing. Widen the exclusion past
// `discardForRelease` and this is what fails.
it('lets that one decision through only, not every pending of yours', () => {
  const pending: TablePending = { kind: 'handLimit', player: 'you', excess: 1, options: ['c1'] }
  const d = deriveDock({ ...base, turn: 'you', hasDrawn: true, pending }, 'you', 0)
  expect(d.state).toBe('reaction')
})

// `isCounting` and the ring are one rule (see its own note in dock.ts). The
// cost is the case where the two would most easily drift: the pending has no
// deadline, so the old `'deadline' in pending` answer said "not counting"
// while the ring drawn above is the turn's own live clock.
it('ticks through the cost, because the ring it mirrors is the turn’s own', () => {
  const clock = { openedAt: 0, deadline: 30_000 }
  const state = { ...base, turn: 'you', hasDrawn: true, pending: costPending, turnClock: clock }
  expect(isCounting(state, 'you')).toBe(true)
})

it('sweeps the ring across the window’s own span, not a constant', () => {
  const window: TableWindow = {
    player: 'p2',
    slot: 'frontend',
    round: 1,
    openedAt: 0,
    deadline: 10_000,
    passed: [],
    canAttackWith: ['c1'],
  }
  const d = deriveDock({ ...base, turn: 'p2', window }, 'you', 4_000)
  expect(d.seconds).toBe(6)
  // 6s left of a 10s span — exact, so a wrong span cannot pass this.
  expect(d.progress).toBeCloseTo(0.6)
})

const windowOnYou: TableWindow = {
  player: 'you',
  slot: 'frontend',
  round: 1,
  openedAt: 0,
  deadline: 15_000,
  passed: [],
  // The owner can never attack their own release, so this is always empty for
  // them — which is exactly why the old canAttackWith gate showed them a live
  // PUSH the engine then rejected for the whole window.
  canAttackWith: [],
}

it('is `exposed` with the window’s clock while your own release is contested', () => {
  const d = deriveDock({ ...base, turn: 'you', hasDrawn: true, window: windowOnYou }, 'you', 6_000)
  // Its own phase, not `hold`: `hold` is waiting on somebody else's decision,
  // and this is waiting on the table. The clock is yours to read — it is how
  // long opponents have to hit you — and it is still your turn, so no name.
  expect(d.state).toBe('exposed')
  expect(d.seconds).toBe(9)
  expect(d.progress).toBeCloseTo(0.6)
  expect(d.activePlayer).toBeUndefined()
  // one dot per seat that may hit it — everyone alive except you
  expect(d.passes).toEqual({ total: 1, lit: 0 })
})

it('counts the passes made on your own release, never the players who made them', () => {
  const window: TableWindow = { ...windowOnYou, passed: ['p2'] }
  const d = deriveDock({ ...base, turn: 'you', hasDrawn: true, window }, 'you', 0)
  expect(d.passes).toEqual({ total: 1, lit: 1 })
})

it('leaves an eliminated seat out of the dots, so a full row means the window is done', () => {
  // The row fills exactly as the window runs out — the engine closes it early
  // when every LIVING responder has passed, so a dead seat must not hold a dot
  // that can never light.
  const state: TableState = {
    ...base,
    turn: 'you',
    hasDrawn: true,
    window: { ...windowOnYou, passed: ['p2'] },
    opponents: [
      ...base.opponents,
      { id: 'p3', name: 'segfault', handCount: 3, release: {}, eliminated: true },
    ],
  }
  const d = deriveDock(state, 'you', 0)
  expect(d.passes).toEqual({ total: 1, lit: 1 })
})

it('offers `attack` to a responder holding no attack card — passing is theirs too', () => {
  const window: TableWindow = { ...windowOnYou, player: 'p2' }
  const d = deriveDock({ ...base, turn: 'p2', window }, 'you', 0)
  // Its own phase, not a shade of `reaction`: being free to hit and being owed
  // an answer are opposite situations, and the dock is read at a glance.
  expect(d.state).toBe('attack')
  expect(d.passed).toBe(false)
})

it('tells the attack phase that this seat has already passed', () => {
  // The pass is not a forfeit and not a closed door: the window still stands,
  // so the dock says so and the key turns into "unpass" (TurnDock).
  const window: TableWindow = { ...windowOnYou, player: 'p2', passed: ['you'] }
  const d = deriveDock({ ...base, turn: 'p2', window }, 'you', 0)
  expect(d.state).toBe('attack')
  expect(d.passed).toBe(true)
  // and the clock is still yours to watch — it is the time YOU have to hit
  expect(d.seconds).toBeGreaterThan(0)
})

it('keeps an eliminated viewer at `waiting` even while a window runs', () => {
  const window: TableWindow = { ...windowOnYou, player: 'p2' }
  const state: TableState = {
    ...base,
    you: { ...base.you, eliminated: true },
    turn: 'p2',
    window,
  }
  expect(deriveDock(state, 'you', 0).state).toBe('waiting')
})

it('is `hold` naming the decider while someone else’s decision blocks the table', () => {
  const pending: TablePending = { ...defendPending, player: 'p2' }
  const d = deriveDock({ ...base, turn: 'you', hasDrawn: true, pending }, 'you', 4_000)
  expect(d.state).toBe('hold')
  expect(d.activePlayer).toBe('kernel_panic')
  // Whose decision it is, and nothing else. A watcher is never shown somebody
  // else's countdown: it is not their time to spend, and a number they cannot
  // act on only twitches at them while they wait. The same rule the inactivity
  // clock already followed two tests down — this makes the pending obey it too.
  expect(d.seconds).toBeUndefined()
  expect(d.progress).toBe(0)
})

it('shows a full, numberless ring everywhere when the host switched the clocks off', () => {
  // Full, not empty and not zero: empty is what a finished countdown looks
  // like and zero is what an expired one looks like, while a table without
  // clocks has all the time there is. Checked on both kinds of deadline — the
  // turn's own and the window's — because they reach the ring by different
  // branches and one of them going numberless alone would be worse than
  // neither.
  const turnClock = { openedAt: 0, deadline: 30_000 }
  const own = deriveDock({ ...base, turn: 'you', hasDrawn: true, turnClock }, 'you', 12_000, false)
  expect(own.state).toBe('push')
  expect(own.seconds).toBeUndefined()
  expect(own.progress).toBe(1)

  const window: TableWindow = { ...windowOnYou, player: 'p2' }
  const win = deriveDock({ ...base, turn: 'p2', window }, 'you', 0, false)
  expect(win.state).toBe('attack')
  expect(win.seconds).toBeUndefined()
  expect(win.progress).toBe(1)

  // and nothing anywhere is left to tick
  expect(isCounting({ ...base, turn: 'you', turnClock }, 'you', false)).toBe(false)
})

it('counts your own turn down from the projection’s inactivity clock', () => {
  const turnClock = { openedAt: 0, deadline: 30_000 }
  const d = deriveDock({ ...base, turn: 'you', hasDrawn: true, turnClock }, 'you', 12_000)
  expect(d.state).toBe('push')
  expect(d.seconds).toBe(18)
  expect(d.progress).toBeCloseTo(0.6)
})

it('shows a watcher no countdown for the active player’s inactivity clock', () => {
  const turnClock = { openedAt: 0, deadline: 30_000 }
  const d = deriveDock({ ...base, turn: 'p2', hasDrawn: true, turnClock }, 'you', 12_000)
  expect(d.state).toBe('waiting')
  expect(d.seconds).toBeUndefined()
  expect(d.progress).toBe(0)
})

it('ticks the clock in exactly the states that draw a counting ring', () => {
  const turnClock = { openedAt: 0, deadline: 30_000 }
  const window: TableWindow = { ...windowOnYou }
  // your turn, clock running
  expect(isCounting({ ...base, turn: 'you', turnClock }, 'you')).toBe(true)
  // your turn, clock not yet started
  expect(isCounting({ ...base, turn: 'you' }, 'you')).toBe(false)
  // your release under the window
  expect(isCounting({ ...base, turn: 'you', window }, 'you')).toBe(true)
  // a watcher of someone else's turn
  expect(isCounting({ ...base, turn: 'p2', turnClock }, 'you')).toBe(false)
  // someone else's timed decision — a flat ring, so nothing to tick
  expect(
    isCounting({ ...base, turn: 'p2', pending: { ...defendPending, player: 'p2' } }, 'you'),
  ).toBe(false)
  // …and your own, which is the one that does count
  expect(
    isCounting({ ...base, turn: 'p2', pending: { ...defendPending, player: 'you' } }, 'you'),
  ).toBe(true)
  // ELIMINATED, but the window is on your own release: deriveDock still draws
  // the hold ring with a live clock (the owner branch never asks who is
  // alive), so the tick rule must say true here too — a false freezes the ring
  // mid-count, the one defect this function exists to prevent. Likely
  // unreachable today (elimination discards your releases), but the invariant
  // is written as total, so the mirror is kept total.
  expect(
    isCounting({ ...base, you: { ...base.you, eliminated: true }, turn: 'you', window }, 'you'),
  ).toBe(true)
  // …while an eliminated WATCHER of someone else's window gets no ring at all.
  expect(
    isCounting(
      {
        ...base,
        you: { ...base.you, eliminated: true },
        turn: 'p2',
        window: { ...window, player: 'p2' },
      },
      'you',
    ),
  ).toBe(false)
})
