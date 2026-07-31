import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import type { Card } from '@/cards/types'
import type { HandItem } from '@/table/Hand/Hand'
import type { TableActions, TableTarget } from './intents'
import { type Options, useTableInteractions } from './useTableInteractions'

// Minimal but complete Card fixtures — the hook never reads beyond `id`, but
// the type is not loosened for the test.
const makeCard = (id: string): Card => ({
  id,
  name: id,
  category: 'attack',
  deck: 'base',
  art: '',
  tags: [],
  qty: 1,
})

const hand: HandItem[] = [
  { uid: 'c1', card: makeCard('attack-bug') },
  { uid: 'c2', card: makeCard('release-frontend') },
  { uid: 'c3', card: makeCard('attack-other') },
]

// TableState requires more than this test cares about; Options only picks
// selfId/you/playable/frozen/window, so the fixture completes exactly that
// slice (name + release on `you`) rather than loosening the hook's type.
const setup = (over: Record<string, unknown> = {}) => ({
  state: {
    selfId: 'you',
    you: { name: 'You', hand, release: {} },
    playable: ['c1'],
    frozen: [] as string[],
    ...over,
  },
  actions: {
    onPlay: vi.fn(),
    onAttack: vi.fn(),
    legalTargets: vi.fn((): TableTarget[] => []),
  } satisfies TableActions,
  comboOptions: undefined as Options['comboOptions'],
})

it('ignores a card that is not playable', () => {
  const opts = setup()
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(1))
  expect(result.current.phase).toBe('idle')
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
})

it('plays a targetless card immediately', () => {
  const opts = setup()
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  expect(opts.actions.onPlay).toHaveBeenCalledWith('c1', undefined, undefined)
  expect(result.current.phase).toBe('idle')
})

it('waits for a target when the card has legal targets', () => {
  const opts = setup()
  opts.actions.legalTargets = vi.fn(() => [{ kind: 'player', player: 'p2' }])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  expect(result.current.phase).toBe('selected')
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
})

it('dispatches exactly one intent on a legal target pick', () => {
  const opts = setup()
  const target = { kind: 'player', player: 'p2' } as const
  opts.actions.legalTargets = vi.fn(() => [target])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  act(() => result.current.onTargetPick(target))
  expect(opts.actions.onPlay).toHaveBeenCalledTimes(1)
  expect(opts.actions.onPlay).toHaveBeenCalledWith('c1', target, undefined)
  expect(result.current.phase).toBe('idle')
})

it('dispatches nothing on an illegal target pick', () => {
  const opts = setup()
  opts.actions.legalTargets = vi.fn(() => [{ kind: 'player', player: 'p2' }])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  act(() => result.current.onTargetPick({ kind: 'player', player: 'p3' }))
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
  expect(result.current.phase).toBe('selected')
})

it('cancels back to idle without dispatching', () => {
  const opts = setup()
  opts.actions.legalTargets = vi.fn(() => [{ kind: 'player', player: 'p2' }])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  act(() => result.current.cancel())
  expect(result.current.phase).toBe('idle')
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
})

it('accents the selected card and no other, clearing on cancel', () => {
  const opts = setup()
  opts.actions.legalTargets = vi.fn(() => [{ kind: 'player', player: 'p2' }])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  expect(result.current.accentAt(0)).toBe('var(--turn-accent)')
  expect(result.current.accentAt(1)).toBeUndefined()
  act(() => result.current.cancel())
  expect(result.current.accentAt(0)).toBeUndefined()
  expect(result.current.accentAt(1)).toBeUndefined()
})

it('enters comboPending when the selected card has combo partners', () => {
  const opts = setup()
  opts.comboOptions = vi.fn(() => ['c2'])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  expect(result.current.phase).toBe('comboPending')
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
})

it('dispatches one intent carrying the combo once the partner is picked', () => {
  const opts = setup({ playable: ['c1', 'c2'] })
  opts.comboOptions = vi.fn((card) => (card === 'c1' ? ['c2'] : []))
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  act(() => result.current.onCardClick(1))
  expect(opts.actions.onPlay).toHaveBeenCalledTimes(1)
  expect(opts.actions.onPlay).toHaveBeenCalledWith('c1', undefined, 'c2')
  expect(result.current.phase).toBe('idle')
})

it('refuses a partner outside the offered options', () => {
  const opts = setup({ playable: ['c1', 'c2'] })
  opts.comboOptions = vi.fn(() => ['c3'])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  act(() => result.current.onCardClick(1))
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
  expect(result.current.phase).toBe('comboPending')
})

it('waits for a target after the combo partner is picked, dispatching nothing yet', () => {
  const opts = setup({ playable: ['c1', 'c2'] })
  const target = { kind: 'player', player: 'p2' } as const
  opts.comboOptions = vi.fn((card) => (card === 'c1' ? ['c2'] : []))
  opts.actions.legalTargets = vi.fn(() => [target])
  const { result } = renderHook(() => useTableInteractions(opts))

  act(() => result.current.onCardClick(0))
  expect(result.current.phase).toBe('comboPending')
  expect(opts.actions.onPlay).not.toHaveBeenCalled()

  act(() => result.current.onCardClick(1))
  expect(result.current.phase).toBe('selected')
  expect(opts.actions.onPlay).not.toHaveBeenCalled()

  act(() => result.current.onTargetPick(target))
  expect(opts.actions.onPlay).toHaveBeenCalledTimes(1)
  expect(opts.actions.onPlay).toHaveBeenCalledWith('c1', target, 'c2')
})

it('drops a chosen combo when selection moves to an unrelated card', () => {
  // A picks combo partner B and also has a legal target — lands in
  // combo='c2', selected='c1', phase='selected'. Reselecting a different
  // playable card C (no combo options of its own, but its own legal target)
  // must not let B leak into C's eventual dispatch: `combo` may only survive
  // alongside its own source, never a reselection.
  const opts = setup({ playable: ['c1', 'c2', 'c3'] })
  const target = { kind: 'player', player: 'p2' } as const
  opts.comboOptions = vi.fn((card) => (card === 'c1' ? ['c2'] : []))
  opts.actions.legalTargets = vi.fn(() => [target])
  const { result } = renderHook(() => useTableInteractions(opts))

  act(() => result.current.onCardClick(0)) // pick A (c1) — comboPending
  act(() => result.current.onCardClick(1)) // pick partner B (c2) — combo='c2', selected='c1'
  expect(result.current.phase).toBe('selected')

  act(() => result.current.onCardClick(2)) // reselect C (c3), which has no combo options
  expect(result.current.phase).toBe('selected')
  expect(opts.actions.onPlay).not.toHaveBeenCalled()

  act(() => result.current.onTargetPick(target))
  expect(opts.actions.onPlay).toHaveBeenCalledTimes(1)
  expect(opts.actions.onPlay).toHaveBeenCalledWith('c3', target, undefined)
})

it('treats a target with the same fields in a different key order as legal', () => {
  const opts = setup()
  // legalTargets returns `kind` first; the click site (Task 8) may build the
  // object with `slot`/`player` first instead — the comparison must not care.
  opts.actions.legalTargets = vi.fn(() => [{ kind: 'release', player: 'p2', slot: 'frontend' }])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  act(() => result.current.onTargetPick({ slot: 'frontend', player: 'p2', kind: 'release' }))
  expect(opts.actions.onPlay).toHaveBeenCalledWith(
    'c1',
    { slot: 'frontend', player: 'p2', kind: 'release' },
    undefined,
  )
  expect(result.current.phase).toBe('idle')
})

it('attacks through the window when the card is offered, bypassing playable', () => {
  // `playable` is deliberately empty — the window's own `canAttackWith` gates
  // this path instead, and the dispatch goes through onAttack, not onPlay.
  const opts = setup({
    playable: [],
    window: { player: 'p2', slot: 'frontend', round: 1, canAttackWith: ['c1'], passed: [] },
  })
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  expect(opts.actions.onAttack).toHaveBeenCalledWith('c1', undefined)
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
  expect(result.current.phase).toBe('idle')
})

it('leaves a card outside canAttackWith untouched while a window is open', () => {
  const opts = setup({
    playable: [],
    window: { player: 'p2', slot: 'frontend', round: 1, canAttackWith: ['c1'], passed: [] },
  })
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(1)) // c2 — not offered by the window
  expect(opts.actions.onAttack).not.toHaveBeenCalled()
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
  expect(result.current.phase).toBe('idle')
})
