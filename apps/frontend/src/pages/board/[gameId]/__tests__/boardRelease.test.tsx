// The release-stands-at-the-centre gesture (#101, Task 8): playing a release
// sets a `discardForRelease` pending and emits nothing, so the standing
// release is purely local until the cost is paid. This suite pins that the
// board renders that standing exactly as the rules ask — the release at the
// centre, not landed — and that the fan itself is the picker for its cost.
// Same render harness as boardStaging.test.tsx — see that file's header.

import type { CardData, TableActions, TablePending } from '@release/ui'
import { cardById } from '@release/ui'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

// biome-ignore lint/style/noNonNullAssertion: both ids are known catalogue entries
const frontend = cardById('release-frontend')!
// biome-ignore lint/style/noNonNullAssertion: both ids are known catalogue entries
const bug = cardById('attack-bug')!

// The fixed hand every test in this file renders: the release, and the one
// spare card standing by to pay for it.
const HAND: { uid: string; card: CardData }[] = [
  { uid: 'release-frontend#0', card: frontend },
  { uid: 'attack-bug#0', card: bug },
]

// The brief's own sketch of this factory omits `release` — but the whole
// point of this task's projection change is that the OWNER's pending carries
// it (redacted for everyone else, exactly as `options` is). Without it here,
// `_Board.tsx`'s `stagedRelease` has nothing to resolve against `you.hand`,
// and the standing release the first test asserts on could never render.
function costPending(options: string[]): TablePending {
  return { kind: 'discardForRelease', player: 'you', release: 'release-frontend#0', options }
}

function releaseBoard(overrides: { pending?: TablePending }, actions: TableActions = {}) {
  const base = makeBoardProps()
  const props = makeBoardProps({
    state: {
      ...base.state,
      you: { ...base.state.you, hand: HAND },
      turn: base.state.selfId,
      hasDrawn: true,
      playable: HAND.map((c) => c.uid),
      pending: overrides.pending ?? null,
    },
    actions,
  })
  return <Board {...props} />
}

// Drags a card out of the fan the way a real pointer does — the Hand's own
// drag contract, verbatim from boardStaging.test.tsx.
async function pullCardFromFan(uid: string) {
  const index = HAND.findIndex((c) => c.uid === uid)
  const slot = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[index]
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600))
  })
}

// A plain click on a fan card — no movement, Hand's own click contract
// (mousedown + mouseup at the same point, under the drag threshold). Found by
// the card's own catalogue id (Card.tsx's `data-card`), not its uid — the
// standing release has already left `handItems` by the time this runs, so the
// fan's own slot order no longer lines up with `HAND`'s.
async function clickFanCard(uid: string) {
  const item = HAND.find((c) => c.uid === uid)
  const target = Array.from(document.querySelectorAll<HTMLElement>('[data-hand-slot]')).find((el) =>
    el.querySelector(`[data-card="${item?.card.id}"]`),
  )
  if (!target) throw new Error(`fan slot for ${uid} not found`)
  fireEvent.mouseDown(target, { clientX: 0, clientY: 0 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: 0 })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })
}

it('stands the release at the centre and does not land it until the cost is paid', async () => {
  const onPlay = vi.fn()
  const onResolve = vi.fn()
  const { rerender } = render(releaseBoard({}, { onPlay, onResolve }))
  await pullCardFromFan('release-frontend#0')
  expect(onPlay).toHaveBeenCalledWith('release-frontend#0', undefined, undefined)

  // the engine answers with the cost pending — and the release is standing at
  // the stage slot, NOT in its zone slot
  rerender(releaseBoard({ pending: costPending(['attack-bug#0']) }, { onPlay, onResolve }))
  const stage = document.querySelector('[data-centre-slot="stage"]') as HTMLElement
  expect(stage.querySelector('[data-card]')).toBeTruthy()

  // the fan is the picker — a click on an eligible card pays
  await clickFanCard('attack-bug#0')
  expect(onResolve).toHaveBeenCalledWith({
    kind: 'discardForRelease',
    card: 'attack-bug#0',
  })
})

it('does not raise the pending panel for a cost — the table asks instead', () => {
  render(releaseBoard({ pending: costPending(['attack-bug#0']) }, {}))
  // every other pending owed to us still raises the prompt; this one is
  // answered by the cards on the table, so a panel would be a second asker
  expect(screen.queryByTestId('pending-prompt')).toBeNull()
})

// `hasTarget`/`state.comboOptions` already gate the aim/partner branches on
// playability for free — the projection only ever populates those for a card
// it already counts playable. A release has neither to lean on, so its own
// staging must check `state.playable` itself; without that check, a release
// the hand cannot pay for (here: nothing else in hand to spend) would still
// fly to the stage slot only for the engine to reject it a beat later.
it('a release the hand cannot pay for is refused, not staged', async () => {
  const onPlay = vi.fn()
  const props = makeBoardProps({
    state: {
      ...makeBoardProps().state,
      you: { ...makeBoardProps().state.you, hand: [HAND[0]] },
      turn: makeBoardProps().state.selfId,
      hasDrawn: true,
      playable: [], // the real engine's `playableFor` excludes an unaffordable lone release
    },
    actions: { onPlay },
  })
  render(<Board {...props} />)
  await pullCardFromFan('release-frontend#0')
  expect(onPlay).not.toHaveBeenCalled()
  expect(document.querySelectorAll('[data-hand-slot]').length).toBe(1)
})
