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
import type { RequestPickHandoff } from '~/entities/game/board/types'
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

it('selects and changes a requested catalogue card by mouse click before confirmation', () => {
  const onResolve = vi.fn()
  const props = withPending({ kind: 'requestCard', player: 'you', target: 'p2' })
  const { getByTestId } = render(<Board {...props} actions={{ onResolve }} />)
  const band = within(getByTestId('board-request-band'))
  const confirm = band.getByRole('button', { name: /confirm/i }) as HTMLButtonElement
  expect(confirm.disabled).toBe(true)
  const option = band.getByRole('button', { name: /Code Review/i })
  fireEvent.click(option, { detail: 1 })
  expect(option.getAttribute('aria-pressed')).toBe('true')
  expect(confirm.disabled).toBe(false)
  const other = band.getByRole('button', { name: /Hotfix/i })
  fireEvent.click(other, { detail: 1 })
  expect(other.getAttribute('aria-pressed')).toBe('true')
  expect(option.getAttribute('aria-pressed')).toBe('false')
  expect(onResolve).not.toHaveBeenCalled()
  fireEvent.click(confirm)
  expect(onResolve).toHaveBeenCalledExactlyOnceWith({
    kind: 'requestCard',
    card: 'defense-hotfix',
  })
  fireEvent.click(confirm)
  expect(onResolve).toHaveBeenCalledTimes(1)
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

// WHICH PLACE THE CARD LEAVES IS THE FAN'S OWN ANSWER. A blind pick is a choice
// OF A PLACE, so the fan names the back that was pressed; a named request chose
// no place at all, so it names its middle, where the card is seen leaving rather
// than slipping off an edge. One owner, one answer — the transfer beat asks and
// does not arbitrate, which is what flew every blind pick out of the middle
// whichever back was pressed (#168).
it('names the pressed back as the place the card leaves', () => {
  const handoff: { current: RequestPickHandoff | null } = { current: null }
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
  const { result } = renderHook(() =>
    useRequestStaging({
      state: props.state,
      actions: {},
      copy: { prompt: '', action: '', confirm: '', steal: '' },
      enabled: true,
      matchKey: 'pressed-back',
      handoff,
    }),
  )
  const { getByTestId } = render(result.current.band)
  const offer = getByTestId('board-transfer-offer')
  const choices = offer.querySelectorAll<HTMLElement>('[data-transfer-choice]')
  // jsdom measures everything as zero, so the pressed back is given a rect of
  // its own — otherwise "the middle" and "the one pressed" are the same numbers
  const pressed = { left: 120, top: 640, width: 90, height: 126 } as DOMRect
  // the fan hands its own element over, so the whole of that back reports the
  // rect rather than guessing which node the gesture measures
  const mark = (el: Element) => {
    ;(el as HTMLElement).getBoundingClientRect = () => pressed
  }
  mark(choices[0])
  for (const child of choices[0].querySelectorAll('*')) mark(child)
  for (let p = choices[0].parentElement; p && p !== offer; p = p.parentElement) mark(p)
  // before anything is pressed the fan names its middle, not this
  expect(handoff.current?.slot()).not.toMatchObject({ left: 120, top: 640 })
  fireEvent.mouseDown(choices[0])
  expect(handoff.current?.slot()).toMatchObject({ left: 120, top: 640 })
})

it.each([
  'you',
  'p3',
])('shows the public request selection to target %s without allowing an answer', (target) => {
  const geometry = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(0, 0, 1000, 700))
  try {
    const onResolve = vi.fn()
    const props = withPending({ kind: 'requestCard', player: 'p2', target })
    const { getByTestId } = render(
      <Board
        {...props}
        actions={{ onResolve }}
        pickPreview={{ player: 'p2', card: 'support-code-review' }}
      />,
    )
    const band = within(getByTestId('board-request-band'))
    expect(band.queryByRole('button', { name: /confirm/i })).toBeNull()
    expect(band.getByRole('button', { name: /Code Review/i }).getAttribute('aria-pressed')).toBe(
      'true',
    )
    expect(
      document.querySelector('[data-catalog-preview] [data-card]')?.getAttribute('data-card'),
    ).toBe('support-code-review')
    fireEvent.click(band.getByRole('button', { name: /Hotfix/i }), { detail: 1 })
    expect(onResolve).not.toHaveBeenCalled()
    expect(band.getByRole('button', { name: /Code Review/i }).getAttribute('aria-pressed')).toBe(
      'true',
    )
  } finally {
    geometry.mockRestore()
  }
})
