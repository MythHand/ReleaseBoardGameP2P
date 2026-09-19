// Naming a card, and losing one (#105, Task 8). `_useRequestStaging` replaces
// the panel for `requestCard` — the same reason `defend` and `neutralize503`
// left it before: `.prompt` is `inset: 0` at z-index 92 over an opaque
// `.panel`, so the question covers the very table the scene plays on, and the
// `chosen` hold (the named card standing enlarged while the rest of the
// catalog slides away) is the first beat of the transfer, which a panel that
// unmounts with the pending cannot hold. `giveCard` answers itself, with no
// panel at all — the copies differ only by uid, so there is nothing to choose.

import type { TablePending } from '@release/ui'
import { fireEvent, render, renderHook, within } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import type { BoardState } from '~/entities/game/board'
import Board from '../_Board'
import { useRequestStaging } from '../_useRequestStaging'
import { makeBoardProps } from './fixture'

const withPending = (pending: TablePending | null, over: Partial<BoardState> = {}) => {
  const base = makeBoardProps()
  return {
    ...base,
    state: { ...base.state, selfId: 'you', pending, ...over },
  }
}

// The last test replaces `window.matchMedia` to force reduced motion — saved
// and restored so that mock does not leak into every test that runs after
// this file.
const originalMatchMedia = window.matchMedia
afterEach(() => {
  window.matchMedia = originalMatchMedia
})

it('answers a requestCard on the table, not through the panel', () => {
  // Same reason `defend` and `neutralize503` left the panel: `.prompt` is
  // inset:0 at z 92 over an opaque panel, so the question covers the table it
  // is about — and the `chosen` hold is the first beat of the transfer, which
  // a panel that unmounts with the pending cannot hold.
  const props = withPending({ kind: 'requestCard', player: 'you', target: 'p2' })
  const { queryByTestId } = render(<Board {...props} />)
  expect(queryByTestId('pending-prompt')).toBeNull()
  expect(queryByTestId('board-request-band')).not.toBeNull()
})

it('automatically resolves a legacy giveCard with the first matching copy exactly once', () => {
  const onResolve = vi.fn()
  const base = makeBoardProps()
  const held = base.state.you.hand[0]
  const hand = [
    { ...held, uid: 'first' },
    { ...held, uid: 'second' },
  ]
  const props = withPending(
    { kind: 'giveCard', player: 'you', requested: held.card.id },
    { you: { ...base.state.you, hand } },
  )
  const { rerender } = render(<Board {...props} actions={{ onResolve }} />)
  expect(onResolve).toHaveBeenCalledExactlyOnceWith({ kind: 'giveCard', card: 'first' })
  expect(document.querySelector('[data-testid="board-request-band"]')).toBeNull()
  rerender(<Board {...props} actions={{ onResolve }} />)
  expect(onResolve).toHaveBeenCalledTimes(1)
})

it('stands the named card at the centre for a peer who is not a party', () => {
  // `giveCard` is projected unredacted (fake/attacks.ts:444), and the rules
  // make the request public (cards.md:125). A spectator answers nothing and
  // still has to see what was asked for.
  const onResolve = vi.fn()
  const props = withPending({ kind: 'giveCard', player: 'p2', requested: 'attack-bug' })
  const { queryByTestId } = render(<Board {...props} actions={{ onResolve }} />)
  expect(onResolve).not.toHaveBeenCalled()
  expect(queryByTestId('board-requested-card')).not.toBeNull()
})

it('automatically resolves a legacy giveCard under reduced motion', () => {
  window.matchMedia = ((q: string) => ({
    matches: q.includes('reduce'),
    media: q,
    addEventListener: () => {},
    removeEventListener: () => {},
  })) as unknown as typeof window.matchMedia
  const onResolve = vi.fn()
  const base = makeBoardProps()
  const held = base.state.you.hand[0]
  const props = withPending(
    { kind: 'giveCard', player: 'you', requested: held.card.id },
    { you: base.state.you },
  )
  render(<Board {...props} actions={{ onResolve }} />)
  expect(onResolve).toHaveBeenCalledExactlyOnceWith({ kind: 'giveCard', card: held.uid })
})

// A CARD IS NAMED BY CLICKING IT, and confirmed on the bar — the scene's own
// gesture (`PickSpecificCardStory`). This used to assert the opposite: that a
// click left the bar disabled and only Enter armed it. That was not a rule, it
// was the catalogue's DRAG form written down — the board had handed it an
// `onDrop`, which turns every cell into a pull and drops the click entirely, so
// the choice was on screen with no way to make it (#168).
it('names a catalogue card on a click, and asks only once it is confirmed', () => {
  const onResolve = vi.fn()
  const props = withPending({ kind: 'requestCard', player: 'you', target: 'p2' })
  const { getByTestId } = render(<Board {...props} actions={{ onResolve }} />)
  const band = within(getByTestId('board-request-band'))
  const confirm = band.getByRole('button', { name: /confirm/i }) as HTMLButtonElement
  expect(confirm.disabled).toBe(true)
  fireEvent.click(band.getByRole('button', { name: /Code Review/i }))
  // named, and nothing asked yet: the bar is what asks
  expect(onResolve).not.toHaveBeenCalled()
  expect(confirm.disabled).toBe(false)
  fireEvent.click(confirm)
  expect(onResolve).toHaveBeenCalledExactlyOnceWith({
    kind: 'requestCard',
    card: 'support-code-review',
  })
})

// The closed offer is the `Hand` component itself, and a position is taken by
// CLICKING it — the scene's own gesture (`PickOpponentCardStory`), and the
// owner's call (18.09): no drag, no keyboard pick. What the positions are is
// still anonymous — a count, not the donor's hand.
it('offers anonymous positions and takes one on a click', () => {
  const onResolve = vi.fn()
  const props = withPending({
    kind: 'stealCard',
    player: 'you',
    target: 'p2',
    count: 3,
    attack: 'attack-bug',
    sudo: false,
    openedAt: 0,
    deadline: 15000,
  })
  const { getByTestId } = render(<Board {...props} actions={{ onResolve }} />)
  const offer = getByTestId('board-transfer-offer')
  const choices = offer.querySelectorAll<HTMLElement>('[data-transfer-choice]')
  expect(choices).toHaveLength(3)
  // pressed, not clicked: the fan turns a press into its own gesture, and with
  // no drag armed that IS the click (`Hand`'s `onSlotDown`)
  fireEvent.mouseDown(choices[1])
  expect(onResolve).toHaveBeenCalledExactlyOnceWith({ kind: 'stealCard', index: 1 })
})

it.each([
  'requestCard',
  'giveCard',
  'stealCard',
] as const)('keeps the spent attack visible during %s', (kind) => {
  const common = {
    player: 'p2',
    attack: 'attack-security-bug',
    sudo: true,
    openedAt: 0,
    deadline: 15000,
  }
  const pending =
    kind === 'giveCard'
      ? { ...common, kind, requested: 'defense-hotfix' }
      : kind === 'stealCard'
        ? { ...common, kind, target: 'you', count: 3 }
        : { ...common, kind, target: 'you' }
  const { getByTestId } = render(<Board {...withPending(pending)} />)
  expect(getByTestId('board-centre-pending').textContent).toMatch(/Security Bug/)
})

it('does not resolve the visual giveCard pending while transfer beats own the board', () => {
  const onResolve = vi.fn()
  const base = makeBoardProps()
  const held = base.state.you.hand[0]
  const props = withPending({ kind: 'giveCard', player: 'you', requested: held.card.id })
  renderHook(() =>
    useRequestStaging({
      state: props.state,
      actions: { onResolve },
      copy: { prompt: '', action: '', confirm: '', steal: '' },
      enabled: false,
      matchKey: 'visual-transfer',
    }),
  )
  expect(onResolve).not.toHaveBeenCalled()
})
