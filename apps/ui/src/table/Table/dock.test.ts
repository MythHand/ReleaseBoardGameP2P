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

it('is `hold` with the window’s clock while your own release is contested', () => {
  const d = deriveDock({ ...base, turn: 'you', hasDrawn: true, window: windowOnYou }, 'you', 6_000)
  expect(d.state).toBe('hold')
  expect(d.seconds).toBe(9)
  expect(d.progress).toBeCloseTo(0.6)
  expect(d.activePlayer).toBeUndefined()
})

it('offers `reaction` to a responder holding no attack card — passing is theirs too', () => {
  const window: TableWindow = { ...windowOnYou, player: 'p2' }
  const d = deriveDock({ ...base, turn: 'p2', window }, 'you', 0)
  expect(d.state).toBe('reaction')
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
  // A timed foreign pending still shows the live clock — it is the table's wait.
  expect(d.seconds).toBe(6)
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
  // someone else's timed decision
  expect(
    isCounting({ ...base, turn: 'p2', pending: { ...defendPending, player: 'p2' } }, 'you'),
  ).toBe(true)
})
