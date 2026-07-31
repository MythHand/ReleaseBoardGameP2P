import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import type { Card } from '@/cards/types'
import type { HandItem } from '@/table/Hand/Hand'
import type { TableActions, TableTarget } from './intents'
import { useTableInteractions } from './useTableInteractions'

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
]

// TableState requires more than this test cares about; Options only picks
// selfId/you/playable/frozen, so the fixture completes exactly that slice
// (name + release on `you`) rather than loosening the hook's type.
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
    legalTargets: vi.fn((): TableTarget[] => []),
  } satisfies TableActions,
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
