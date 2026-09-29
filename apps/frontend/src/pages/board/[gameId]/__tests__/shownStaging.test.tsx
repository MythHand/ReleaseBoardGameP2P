import type { Event } from '@release/engine'
import { cardById, type TableActions } from '@release/ui'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import pairStyles from '@/animations/usePairFold.module.css'
import { type BoardState, useBoardAnchors } from '~/entities/game/board'
import { mockReducedMotion } from '~/test/reducedMotion'
import Board from '../_Board'
import { useBoardStaging } from '../_useBoardStaging'
import { makeBoardProps } from './fixture'

function card(id: string) {
  const data = cardById(id)
  if (!data) throw new Error(`missing card ${id}`)
  return { uid: `${id}#0`, card: data }
}
const sudo = card('support-sudo')
const bug = card('attack-bug')
const review = card('support-code-review')
const release = card('release-frontend')
const target = { kind: 'player' as const, player: 'p2' }

function stateWith(shown: string[] = []): BoardState {
  const base = makeBoardProps().state
  const hand = [sudo, bug, review, release]
  return {
    ...base,
    turn: base.selfId,
    hasDrawn: true,
    you: { ...base.you, hand },
    playable: hand.map((c) => c.uid),
    comboOptions: { [sudo.uid]: [bug.uid], [review.uid]: [release.uid] },
    targets: { [bug.uid]: [target] },
    shown: hand.filter((c) => shown.includes(c.uid)).map((c) => ({ ...c, player: base.selfId })),
  }
}

function staging(initial: BoardState, actions: TableActions = {}) {
  return renderHook(
    ({ state, events }: { state: BoardState; events: Event[] }) => {
      const anchors = useBoardAnchors()
      anchors.centre.current ??= document.createElement('div')
      return useBoardStaging({ state, anchors, actions, events, enabled: true })
    },
    { initialProps: { state: initial, events: [] as Event[] }, wrapper: StrictMode },
  )
}

beforeEach(() => mockReducedMotion(true))
afterEach(() => vi.restoreAllMocks())

it('restores a shown support after reconnect so its partner can be selected', () => {
  const hook = staging(stateWith([sudo.uid]))
  expect(hook.result.current.staged?.phase).toBe('partner')
  const index = hook.result.current.handItems.findIndex((c) => c.uid === bug.uid)
  expect(hook.result.current.stateAt(index)).toBe('selected')
  act(() => {
    hook.result.current.onCardClick(index)
  })
  expect(hook.result.current.staged?.main?.uid).toBe(bug.uid)
  expect(hook.result.current.targets).toEqual([target])
})

it('restores an aimed attack and dispatches the chosen legal target', () => {
  const onPlay = vi.fn()
  const hook = staging(stateWith([bug.uid]), { onPlay })
  expect(hook.result.current.targets).toEqual([target])
  act(() => hook.result.current.onTargetPick(target))
  expect(onPlay).toHaveBeenCalledWith(bug.uid, target, undefined)
})

it('Escape takes back a shown support on a rebuilt Board', () => {
  const onTakeBack = vi.fn()
  render(<Board {...makeBoardProps({ state: stateWith([sudo.uid]), actions: { onTakeBack } })} />)
  expect(document.querySelector(`[data-hand-slot="${sudo.uid}"]`)).toBeNull()
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(onTakeBack).toHaveBeenCalledTimes(1)
  expect(document.querySelector(`[data-hand-slot="${sudo.uid}"]`)).not.toBeNull()
})

it('restores a shown Sudo attack pair in its resting pose with live target controls', () => {
  const onPlay = vi.fn()
  render(
    <Board {...makeBoardProps({ state: stateWith([sudo.uid, bug.uid]), actions: { onPlay } })} />,
  )
  expect(
    document.querySelector('[data-shown="true"] [data-main] [data-card="attack-bug"]'),
  ).not.toBeNull()
  fireEvent.click(screen.getByTestId('seat-p2'))
  expect(onPlay).toHaveBeenCalledWith(bug.uid, target, sudo.uid)
})

it('releases the restored pair after its accepted play under reduced motion', () => {
  const state = stateWith([sudo.uid, bug.uid])
  const props = makeBoardProps({ state, actions: { onPlay: vi.fn() } })
  const board = render(<Board {...props} />)
  fireEvent.click(screen.getByTestId('seat-p2'))
  board.rerender(
    <Board
      {...props}
      state={{
        ...state,
        shown: [],
        you: { ...state.you, hand: [review, release] },
      }}
    />,
  )
  expect(document.querySelector('[data-shown="true"] [data-main]')).toBeNull()
})

it('sends TAKE_BACK after an unacknowledged SHOW and does not restore the delayed projection', () => {
  const sent: string[] = []
  const initial = stateWith()
  const hook = staging(initial, {
    onShow: () => sent.push('SHOW'),
    onTakeBack: () => sent.push('TAKE_BACK'),
  })
  act(() =>
    hook.result.current.onHandPlay(sudo.uid, { x: 0, y: 0, rect: new DOMRect(0, 0, 120, 168) }),
  )
  act(() => hook.result.current.cancel())
  expect(sent).toEqual(['SHOW', 'TAKE_BACK'])
  hook.rerender({
    state: stateWith([sudo.uid]),
    events: [{ id: 1, type: 'shown', player: 'you', card: sudo.card.id }],
  })
  expect(hook.result.current.staged).toBeNull()
  expect(hook.result.current.handItems.map((c) => c.uid)).toContain(sudo.uid)
  expect(hook.result.current.holdingCentre).toBe(true)
  hook.rerender({
    state: stateWith(),
    events: [{ id: 2, type: 'takenBack', player: 'you', cards: [sudo.card.id] }],
  })
  expect(hook.result.current.holdingCentre).toBe(false)
  act(() =>
    hook.result.current.onHandPlay(sudo.uid, { x: 0, y: 0, rect: new DOMRect(0, 0, 120, 168) }),
  )
  expect(hook.result.current.staged?.support?.uid).toBe(sudo.uid)
})

it('does not restore stale shown cards while a cancel awaits acknowledgement', () => {
  const onTakeBack = vi.fn()
  const hook = staging(stateWith([sudo.uid]), { onTakeBack })
  act(() => hook.result.current.cancel())
  hook.rerender({ state: stateWith([sudo.uid]), events: [] })
  act(() => hook.result.current.cancel())
  expect(onTakeBack).toHaveBeenCalledTimes(1)
  expect(hook.result.current.staged).toBeNull()
})

it('recovers shown controls when another pending decision finishes after reconnect', () => {
  const state = stateWith([sudo.uid])
  const hook = staging({
    ...state,
    pending: { kind: 'discardForRelease', player: 'p2', release: 'other-release', options: [] },
  })
  expect(hook.result.current.staged).toBeNull()
  hook.rerender({ state: { ...state, pending: null }, events: [] })
  expect(hook.result.current.staged?.support?.uid).toBe(sudo.uid)
})

it('drops a restored gesture when the host takes its shown cards back', () => {
  const hook = staging(stateWith([sudo.uid]))
  hook.rerender({ state: stateWith(), events: [] })
  expect(hook.result.current.staged).toBeNull()
  expect(hook.result.current.handItems.map((c) => c.uid)).toContain(sudo.uid)
})

it('continues a legal restored Code Review release that had not dispatched before reconnect', () => {
  const onPlay = vi.fn()
  const hook = staging(stateWith([review.uid, release.uid]), { onPlay })
  expect(onPlay).toHaveBeenCalledExactlyOnceWith(release.uid, undefined, review.uid)
  hook.rerender({ state: stateWith([review.uid, release.uid]), events: [] })
  expect(onPlay).toHaveBeenCalledTimes(1)
})

it('restores Code Review at its first row cell rather than the middle of the table', () => {
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue(
    new DOMRect(500, 300, 150, 210),
  )
  render(<Board {...makeBoardProps({ state: stateWith([review.uid, release.uid]) })} />)
  const carrier = document.querySelector<HTMLElement>(`.${pairStyles.flyer}`)
  expect(carrier?.style.left).toBe('416px')
})

it('continues a restored attack through the still-open release window', () => {
  const onAttack = vi.fn()
  const state = stateWith([bug.uid])
  staging(
    {
      ...state,
      turn: 'p2',
      playable: [],
      targets: {},
      window: {
        player: 'p2',
        round: 0,
        passed: [],
        slot: 'frontend',
        canAttackWith: [bug.uid],
        openedAt: 0,
        deadline: 10_000,
      },
    },
    { onAttack },
  )
  expect(onAttack).toHaveBeenCalledExactlyOnceWith(bug.uid, undefined)
})
