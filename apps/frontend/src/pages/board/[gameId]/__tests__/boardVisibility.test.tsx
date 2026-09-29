import type { Event } from '@release/engine'
import { cardById } from '@release/ui'
import { act, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import Board from '../_Board'
import { introFixture, makeBoardProps } from './fixture'

vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => false }))

// Keep the real Board, queue, planner, and projection. Only park the browser's
// discard carrier so a visibility change can interrupt a beat deterministically.
const flights = vi.hoisted(() => ({
  sends: 0,
  release: [] as Array<() => void>,
}))
vi.mock('@release/ui/animations', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@release/ui/animations')>()
  const { createElement, useState } = await import('react')
  return {
    ...actual,
    useDiscardExit: () => {
      const [flying, setFlying] = useState(false)
      return {
        overlay: flying
          ? [createElement('div', { key: 'flight', 'data-testid': 'discard-flight' })]
          : [],
        send: () => {
          flights.sends++
          setFlying(true)
          return new Promise<void>((resolve) => {
            flights.release.push(() => {
              setFlying(false)
              resolve()
            })
          })
        },
        reset: () => setFlying(false),
        FLIGHT_MS: 420,
      }
    },
  }
})

let visible = true
let originalVisibility: PropertyDescriptor | undefined
const setVisible = (value: boolean) => {
  visible = value
  act(() => document.dispatchEvent(new window.Event('visibilitychange')))
}
const tick = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
const restored = introFixture()
const liveIntro = (events: Event[]) => ({
  gameId: restored.gameId,
  view: { ...restored.view, turn: { player: 'p1', index: 1, hasDrawn: true } },
  events,
  onDone: () => {},
})

beforeEach(() => {
  visible = true
  flights.sends = 0
  flights.release = []
  originalVisibility = Object.getOwnPropertyDescriptor(document, 'visibilityState')
  Object.defineProperty(document, 'visibilityState', {
    configurable: true,
    get: () => (visible ? 'visible' : 'hidden'),
  })
})

afterEach(() => {
  act(() => {
    for (const release of flights.release) release()
  })
  if (originalVisibility) Object.defineProperty(document, 'visibilityState', originalVisibility)
  else Reflect.deleteProperty(document, 'visibilityState')
})

it('completes a hidden opening once and shows the current hand on return', async () => {
  const props = makeBoardProps()
  const onDone = vi.fn()
  const { container } = render(<Board {...props} intro={{ ...introFixture(), onDone }} />)
  expect(onDone).not.toHaveBeenCalled()

  setVisible(false)
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  setVisible(true)
  await tick()
  expect(container.querySelectorAll('[data-hand-slot]')).toHaveLength(props.state.you.hand.length)
  expect(onDone).toHaveBeenCalledTimes(1)
})

it('does not start the opening when the board mounts in an already hidden tab', async () => {
  visible = false
  const props = makeBoardProps()
  const onDone = vi.fn()
  const { container } = render(<Board {...props} intro={{ ...introFixture(), onDone }} />)
  await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1))
  expect(container.querySelector('[data-testid="board-table"]')).toBeNull()

  setVisible(true)
  await tick()
  expect(container.querySelectorAll('[data-hand-slot]')).toHaveLength(props.state.you.hand.length)
  expect(onDone).toHaveBeenCalledTimes(1)
})

it('keeps an uncontrolled open panel across the visibility reset', async () => {
  const props = makeBoardProps()
  const rendered = render(<Board {...props} />)
  fireEvent.click(rendered.getByRole('button', { name: props.copy.table.tabHistory }))
  expect(rendered.getByTestId('panel-history')).toBeTruthy()

  setVisible(false)
  setVisible(true)
  await tick()
  expect(rendered.getByTestId('panel-history')).toBeTruthy()
})

it('clears a public Cherry-pick preview when its choosing tab disappears', async () => {
  const base = makeBoardProps()
  const onPickPreview = vi.fn()
  const props = makeBoardProps({
    state: {
      ...base.state,
      pending: {
        kind: 'pickFromDiscard',
        raisedAt: 1,
        player: base.state.selfId,
        options: [
          { uid: 'offer-bug', id: 'attack-bug' },
          { uid: 'offer-release', id: 'release-frontend' },
        ],
        picks: 1,
        source: 'operation-git-cherry-pick',
      },
    },
    onPickPreview,
  })
  const rendered = render(<Board {...props} />)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 850))
  })
  fireEvent.click(rendered.getByTestId('cherry-cell-offer-bug'))
  await waitFor(() => expect(onPickPreview).toHaveBeenLastCalledWith('attack-bug'))

  setVisible(false)
  expect(onPickPreview).toHaveBeenLastCalledWith(null)
  setVisible(true)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 100))
  })
  expect(onPickPreview).toHaveBeenLastCalledWith(null)
})

it('does not clear another player’s active pick when an observer tab hides', () => {
  const base = makeBoardProps()
  const onPickPreview = vi.fn()
  const props = makeBoardProps({
    state: {
      ...base.state,
      pending: {
        kind: 'pickFromDiscard',
        raisedAt: 1,
        player: 'p2',
        options: [],
        picks: 1,
        source: 'operation-git-cherry-pick',
      },
    },
    pickPreview: { player: 'p2', card: 'attack-bug' },
    onPickPreview,
  })
  render(<Board {...props} />)
  expect(onPickPreview).not.toHaveBeenCalled()
  setVisible(false)
  expect(onPickPreview).not.toHaveBeenCalled()
})

it.each([
  'clears during catch-up',
  'remains valid',
] as const)('handles a single-option Cherry-pick that %s on return', async (outcome) => {
  visible = false
  const base = makeBoardProps()
  const pending = {
    kind: 'pickFromDiscard' as const,
    raisedAt: 1,
    player: base.state.selfId,
    options: [{ uid: 'only', id: 'attack-bug' }],
    picks: 1 as const,
    source: 'operation-git-cherry-pick',
  }
  const onResolve = vi.fn()
  const props = makeBoardProps({
    state: { ...base.state, pending },
    actions: { onResolve },
  })
  const { rerender } = render(<Board {...props} />)
  expect(onResolve).not.toHaveBeenCalled()

  setVisible(true)
  if (outcome === 'clears during catch-up') {
    rerender(<Board {...props} state={{ ...props.state, pending: null }} />)
  }
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80))
  })
  if (outcome === 'clears during catch-up') expect(onResolve).not.toHaveBeenCalled()
  else expect(onResolve).toHaveBeenCalledExactlyOnceWith({ kind: 'pickFromDiscard', card: 'only' })
})

it('drops an old discard flight on hide and renders the newest projection on return', async () => {
  const base = makeBoardProps()
  const card = base.state.you.hand[0]
  const event: Event = {
    id: 1,
    type: 'discarded',
    player: base.state.selfId,
    card: card.card.id,
    reason: 'effect',
  }
  const { container, rerender, queryByTestId } = render(<Board {...base} intro={liveIntro([])} />)
  await tick()
  const latest = {
    ...base,
    state: {
      ...base.state,
      you: { ...base.state.you, hand: base.state.you.hand.slice(1) },
      decks: { ...base.state.decks, discardCount: base.state.decks.discardCount + 1 },
      turn: 'p2',
    },
  }
  rerender(<Board {...latest} intro={liveIntro([event])} />)
  await waitFor(() => expect(queryByTestId('discard-flight')).not.toBeNull())
  expect(flights.sends).toBe(1)

  setVisible(false)
  setVisible(true)
  await tick()
  expect(queryByTestId('discard-flight')).toBeNull()
  expect(container.querySelectorAll('[data-hand-slot]')).toHaveLength(latest.state.you.hand.length)

  // A promise from the discarded Board instance must not resurrect its shadow.
  await act(async () => {
    flights.release[0]?.()
    await tick()
  })
  expect(queryByTestId('discard-flight')).toBeNull()
  expect(container.querySelectorAll('[data-hand-slot]')).toHaveLength(latest.state.you.hand.length)
})

it('skips hidden and immediate-return events, then animates a later visible action', async () => {
  const base = makeBoardProps()
  const hand = base.state.you.hand.slice(0, 3)
  const events = hand.map(
    (card, index): Event => ({
      id: index + 1,
      type: 'discarded',
      player: base.state.selfId,
      card: card.card.id,
      reason: 'effect',
    }),
  )
  const stateAfter = (count: number) => ({
    ...base.state,
    you: {
      ...base.state.you,
      hand: base.state.you.hand.filter(
        (c) => !hand.slice(0, count).some((gone) => gone.uid === c.uid),
      ),
    },
    decks: { ...base.state.decks, discardCount: base.state.decks.discardCount + count },
  })
  const { rerender, queryByTestId } = render(<Board {...base} intro={liveIntro([])} />)
  await tick()
  setVisible(false)
  rerender(<Board {...base} state={stateAfter(1)} intro={liveIntro(events.slice(0, 1))} />)
  setVisible(true)
  // Delivery can continue in the same task as visibilitychange. It belongs to
  // catch-up, even though document.visibilityState is already 'visible'.
  rerender(<Board {...base} state={stateAfter(2)} intro={liveIntro(events.slice(0, 2))} />)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80))
  })
  expect(flights.sends).toBe(0)
  expect(queryByTestId('discard-flight')).toBeNull()

  rerender(<Board {...base} state={stateAfter(3)} intro={liveIntro(events)} />)
  await waitFor(() => expect(flights.sends).toBe(1))
  expect(queryByTestId('discard-flight')).not.toBeNull()
  await act(async () => {
    flights.release.at(-1)?.()
    await new Promise((resolve) => setTimeout(resolve, 80))
  })
})

it.each([
  'already pending',
  'arrives on return',
] as const)('keeps an unpaid release visible and its cost payable when it %s', async (timing) => {
  const base = makeBoardProps()
  const releaseCard = cardById('release-frontend')
  const payerCard = cardById('attack-bug')
  if (!releaseCard || !payerCard) throw new Error('missing catalogue cards')
  const release = { uid: 'release-frontend#0', card: releaseCard }
  const payer = { uid: 'attack-bug#0', card: payerCard }
  const onResolve = vi.fn()
  const props = makeBoardProps({
    state: {
      ...base.state,
      you: { ...base.state.you, hand: [release, payer] },
      turn: base.state.selfId,
      hasDrawn: true,
      playable: [],
      pending: {
        kind: 'discardForRelease',
        player: base.state.selfId,
        release: release.uid,
        options: [payer.uid],
      },
    },
    actions: { onResolve },
  })
  const initial =
    timing === 'already pending' ? props : { ...props, state: { ...props.state, pending: null } }
  const { container, rerender } = render(<Board {...initial} />)
  setVisible(false)
  setVisible(true)
  if (timing === 'arrives on return') rerender(<Board {...props} />)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 80))
  })

  expect(
    container.querySelector('[data-centre-slot="stage"] [data-card="release-frontend"]'),
  ).not.toBeNull()
  const payerSlot = container.querySelector<HTMLElement>(
    '[data-hand-slot]:has([data-card="attack-bug"])',
  )
  if (!payerSlot) throw new Error('missing payable card in hand')
  fireEvent.mouseDown(payerSlot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 600))
  })
  expect(onResolve).toHaveBeenCalledWith({ kind: 'discardForRelease', card: payer.uid })
})
