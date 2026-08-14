import { deriveDock } from './dock'
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
