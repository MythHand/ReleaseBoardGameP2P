// The staging gesture (#99, Task 3): pulling a card that needs a target out of
// the fan stands it at the centre and aims the arrow; a press on a lit target
// dispatches with it. Same render harness as boardComponent.test.tsx (forked
// from apps/ui's own Table suite) — see that file's header for why.

import type { CardData, TableActions, TableTarget } from '@release/ui'
import { cardById } from '@release/ui'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

// biome-ignore lint/style/noNonNullAssertion: both ids are known catalogue entries
const bug = cardById('attack-bug')!
// biome-ignore lint/style/noNonNullAssertion: both ids are known catalogue entries
const frontend = cardById('release-frontend')!

// The fixed hand every test in this file renders: one card that needs a
// target (attack-bug#0) and one that does not (release-frontend#0). Fixed
// and never mutated by the hook itself — the engine's own `you.hand` does not
// change until a play is actually dispatched, so the DOM's `[data-hand-slot]`
// order tracks this array (minus, at most, the one card currently staged) for
// the whole life of a test.
const HAND: { uid: string; card: CardData }[] = [
  { uid: 'attack-bug#0', card: bug },
  { uid: 'release-frontend#0', card: frontend },
]

// The uid the most recent `pullCardFromFan` went after — enough to tell
// `fanUids()` which uid a real slot-count drop refers to, since only one card
// can ever be staged at a time.
let lastPulled: string | null = null

function boardWith(
  overrides: { targets?: Record<string, TableTarget[]> },
  actions: TableActions = {},
) {
  const base = makeBoardProps()
  const props = makeBoardProps({
    state: {
      ...base.state,
      you: { ...base.state.you, hand: HAND },
      turn: base.state.selfId,
      hasDrawn: true,
      playable: HAND.map((c) => c.uid),
      targets: overrides.targets ?? {},
    },
    actions,
  })
  return <Board {...props} />
}

// Drags a card out of the fan the way a real pointer does: down on its slot,
// past Hand's own 6px threshold, released well outside the hand's band (Hand.tsx
// `onSlotDown`/`inBand`) — the same drag contract `onHandPlay` is wired to.
// Waits past both outcomes' own settle time: an accepted pull's two-rAF-frame
// flight into the centre, or a refused one's 460ms glide back into the slot
// (Hand's own SETTLE_MS) — so the DOM is in its steady state either way before
// the caller asserts on it.
async function pullCardFromFan(uid: string) {
  const index = HAND.findIndex((c) => c.uid === uid)
  const slot = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[index]
  lastPulled = uid
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600))
  })
}

// A press on an opponent's seat — Seat's own targetable div, plain onClick.
// Seat does not stop propagation for a `player`-kind target, so this click
// also bubbles to the table's own onClick in the same tick `onTargetPick`
// runs in — waits past `useHandArrival`'s FLIGHT_MS (480ms) so that IF the
// bubble incorrectly triggered a cancel (the race `_useBoardStaging`'s
// synchronous `dispatchedRef` write guards against), its return flight would
// have already finished and be observable by the caller.
async function pressSeat(player: string) {
  fireEvent.click(screen.getByTestId(`seat-${player}`))
  await act(async () => {
    await new Promise((r) => setTimeout(r, 700))
  })
}

// The fan's current uids: the known, fixed hand minus whichever one a real DOM
// slot-count drop says actually left (see `lastPulled` above).
function fanUids(): string[] {
  const rendered = document.querySelectorAll('[data-hand-slot]').length
  if (rendered === HAND.length) return HAND.map((c) => c.uid)
  return HAND.filter((c) => c.uid !== lastPulled).map((c) => c.uid)
}

it('a pulled attack stages at the centre, aims, and a press on the seat dispatches with the target', async () => {
  const onPlay = vi.fn()
  render(boardWith({ targets: { 'attack-bug#0': [{ kind: 'player', player: 'p2' }] } }, { onPlay }))
  // drag the card out of the fan: pointer down on the slot, move past the
  // 6px threshold, release over the table (Hand's own drag contract)
  await pullCardFromFan('attack-bug#0')
  // the staged card left the fan and stands at the centre
  expect(screen.getByTestId('board-centre-staged')).toBeTruthy()
  expect(fanUids()).not.toContain('attack-bug#0')
  // the seat is lit and a press on it dispatches
  await pressSeat('p2')
  expect(onPlay).toHaveBeenCalledWith('attack-bug#0', { kind: 'player', player: 'p2' }, undefined)
  // the dispatch stands: the same click bubbling to the table's own cancel
  // must NOT have sent the card flying back to the fan (the seat-propagation
  // race `_useBoardStaging`'s synchronous `dispatchedRef` write guards against)
  expect(screen.getByTestId('board-centre-staged')).toBeTruthy()
  expect(fanUids()).not.toContain('attack-bug#0')
})

it('a pull of a no-target card is refused and the fan keeps it', async () => {
  render(boardWith({ targets: {} }))
  await pullCardFromFan('release-frontend#0')
  expect(fanUids()).toContain('release-frontend#0')
})
