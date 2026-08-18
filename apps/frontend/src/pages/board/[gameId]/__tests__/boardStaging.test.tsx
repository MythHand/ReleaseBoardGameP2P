// The staging gesture (#99): pulling a card that needs a target out of the fan
// stands it at the centre and aims the arrow; a press on a lit target
// dispatches with it. Task 3 covered the pull/aim/dispatch path; Task 4 adds
// the ways staging ends without a dispatch — a miss, Escape, and a rejection
// from the engine — plus the guard that keeps a cancel-in-flight from being
// dispatched by a press on the target it just left. Same render harness as
// boardComponent.test.tsx (forked from apps/ui's own Table suite) — see that
// file's header for why.

import type { Event } from '@release/engine'
import type { CardData, TableActions, TableTarget } from '@release/ui'
import { cardById } from '@release/ui'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
// Arrow's CSS Module classnames are not part of `@release/ui`'s public barrel
// — reached into the same way `boardComponent.test.tsx` does.
import arrowStyles from '@/primitives/Arrow/Arrow.module.css'
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

// The one target every test in this file stages towards — attack-bug#0 aims
// at the opponent seat p2. Shared so a test that only cares about cancel or
// rejection doesn't restate it.
const BUG_TARGETS: Record<string, TableTarget[]> = {
  'attack-bug#0': [{ kind: 'player', player: 'p2' }],
}

// The uid the most recent `pullCardFromFan` went after — enough to tell
// `fanUids()` which uid a real slot-count drop refers to, since only one card
// can ever be staged at a time.
let lastPulled: string | null = null

function boardWith(
  overrides: { targets?: Record<string, TableTarget[]> },
  actions: TableActions = {},
  // the feed `useBoardStaging` watches for a `rejected` reply — Board only
  // hands events through via `intro.events`, so a `rejected` test routes them
  // that way. `view: null` keeps `gameKey` (_Board.tsx) null, so the opening
  // itself never arms and this stays a plain events channel.
  events: Event[] = [],
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
    intro: events.length > 0 ? { gameId: null, view: null, events, onDone: () => {} } : undefined,
  })
  return <Board {...props} />
}

// A rejection naming the staged card, shaped as the engine's own `rejected`
// event (packages/engine/src/events.ts) — enough for the hook's own watcher,
// which reads only `action.card`.
function rejectedEvent(card: string): Event {
  return {
    id: 1,
    type: 'rejected',
    action: { type: 'PLAY', player: 'you', card, at: 0 },
    reason: 'illegal',
  }
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
  render(boardWith({ targets: BUG_TARGETS }, { onPlay }))
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

it('a press on nothing valid returns the staged card to the fan', async () => {
  render(boardWith({ targets: BUG_TARGETS }))
  await pullCardFromFan('attack-bug#0')
  // the table root — a miss. Not `getByRole('presentation')` (the brief's own
  // sketch): Card renders several decorative `<img alt="">`s, which the ARIA
  // spec also gives an implicit `presentation` role, so that query is
  // ambiguous against the real component — hence the dedicated testid.
  fireEvent.click(screen.getByTestId('board-table'))
  await waitFor(() => expect(fanUids()).toContain('attack-bug#0'))
})

it('Escape cancels the staging', async () => {
  render(boardWith({ targets: BUG_TARGETS }))
  await pullCardFromFan('attack-bug#0')
  fireEvent.keyDown(window, { key: 'Escape' })
  await waitFor(() => expect(fanUids()).toContain('attack-bug#0'))
})

it('a rejected action returns the staged card', async () => {
  const onPlay = vi.fn()
  const { rerender } = render(boardWith({ targets: BUG_TARGETS }, { onPlay }))
  await pullCardFromFan('attack-bug#0')
  await pressSeat('p2')
  expect(onPlay).toHaveBeenCalledWith('attack-bug#0', { kind: 'player', player: 'p2' }, undefined)
  // the engine answers with a rejection in the feed; the projection itself is
  // unchanged (the fixture's HAND never actually loses the card) — this pins
  // the hook's own `dispatchedRef.current = false` write ahead of `cancel()`
  // in the rejected watcher: without it, `cancel()`'s own guard reads the
  // stale `true` and refuses the very return it was just called to perform.
  rerender(boardWith({ targets: BUG_TARGETS }, { onPlay }, [rejectedEvent('attack-bug#0')]))
  await waitFor(() => expect(fanUids()).toContain('attack-bug#0'))
})

// Backported from #117's bdf037f (#116 review, point 3): `useGame` accumulates
// events for the whole match (never trims), so an unwatermarked scan of the
// whole feed keeps finding a card's OWN past rejection forever. A fresh
// re-dispatch of the same card must not read that stale entry as ITS OWN
// rejection the moment anything else lands in the feed — the watermark
// discipline `useBeats` already applies to this same array (there keyed by
// event id across the whole match; here by length, captured fresh at every
// dispatch).
it('a stale rejection for a returned card does not cancel its fresh re-dispatch', async () => {
  const onPlay = vi.fn()
  const { rerender } = render(boardWith({ targets: BUG_TARGETS }, { onPlay }))
  await pullCardFromFan('attack-bug#0')
  await pressSeat('p2')
  expect(onPlay).toHaveBeenCalledTimes(1)
  // first attempt rejected — the card returns to the fan (as above)
  rerender(boardWith({ targets: BUG_TARGETS }, { onPlay }, [rejectedEvent('attack-bug#0')]))
  await waitFor(() => expect(fanUids()).toContain('attack-bug#0'))

  // a second, legitimate dispatch of the SAME card
  await pullCardFromFan('attack-bug#0')
  await pressSeat('p2')
  expect(onPlay).toHaveBeenCalledTimes(2)

  // an unrelated event lands (any sync between this dispatch and its
  // acceptance) — the feed still carries the FIRST attempt's own rejection,
  // since it only ever grows. Without a watermark this would be misread as
  // THIS dispatch's own rejection and cancel it right back to the fan.
  rerender(
    boardWith({ targets: BUG_TARGETS }, { onPlay }, [
      rejectedEvent('attack-bug#0'),
      { id: 2, type: 'turnEnded', player: 'p2' },
    ]),
  )
  await act(async () => {
    await new Promise((r) => setTimeout(r, 700))
  })
  expect(screen.getByTestId('board-centre-staged')).toBeTruthy()
  expect(fanUids()).not.toContain('attack-bug#0')
})

it('the staged card must not be cancellable after dispatch', async () => {
  render(boardWith({ targets: BUG_TARGETS }))
  await pullCardFromFan('attack-bug#0')
  await pressSeat('p2')
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.getByTestId('board-centre-staged')).toBeTruthy()
})

it('a cancel takes the target down at once — a press on the seat it just left cannot dispatch', async () => {
  const onPlay = vi.fn()
  render(boardWith({ targets: BUG_TARGETS }, { onPlay }))
  await pullCardFromFan('attack-bug#0')
  // the miss: cancels via the table root, same gesture as the "nothing valid"
  // test above
  fireEvent.click(screen.getByTestId('board-table'))
  // immediately — no wait for the ~480ms return flight (useHandArrival's
  // FLIGHT_MS) to land. Without the cancel-liveness fix, `targets` (and so the
  // seat's own targetable check) stays populated for the whole glide and this
  // press would still dispatch a play for a card already flying back to the fan.
  fireEvent.click(screen.getByTestId('seat-p2'))
  expect(onPlay).not.toHaveBeenCalled()
  await waitFor(() => expect(fanUids()).toContain('attack-bug#0'))
})

it('reduced motion stages without flights', () => {
  const mm = vi.spyOn(window, 'matchMedia').mockImplementation(
    (query: string) =>
      ({
        matches: query === '(prefers-reduced-motion: reduce)',
        media: query,
        onchange: null,
        addListener: () => {},
        removeListener: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
        dispatchEvent: () => false,
      }) as MediaQueryList,
  )
  render(boardWith({ targets: BUG_TARGETS }))
  // the drag itself, inlined rather than through `pullCardFromFan`: that
  // helper waits 600ms for a flight that reduced motion never plays, and
  // waiting would hide the very thing this test pins — that staging is
  // already on screen with no wait at all.
  const index = HAND.findIndex((c) => c.uid === 'attack-bug#0')
  const slot = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[index]
  lastPulled = 'attack-bug#0'
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  expect(screen.getByTestId('board-centre-staged')).toBeTruthy()
  mm.mockRestore()
})

it('anchors the targeting arrow at the centre it stands in, not the hand slot it left', async () => {
  render(boardWith({ targets: BUG_TARGETS }))
  const centre = document.querySelector<HTMLElement>('[data-board-centre]')
  // biome-ignore lint/style/noNonNullAssertion: _Board.tsx renders the centre node unconditionally
  vi.spyOn(centre!, 'getBoundingClientRect').mockReturnValue({
    left: 300,
    top: 200,
    width: 20,
    height: 20,
    right: 320,
    bottom: 220,
    x: 300,
    y: 200,
    toJSON: () => {},
  })
  await pullCardFromFan('attack-bug#0')
  // jsdom's real getBoundingClientRect is always all-zero, so a bug anchoring
  // the arrow anywhere else (the origin, the hand slot it left) would read as
  // (0, 0) too — this mocked rect is what makes "anchored at the centre"
  // actually falsifiable.
  const origin = document.querySelector(`.${arrowStyles.origin}`)
  expect(origin).toBeTruthy()
  expect(origin?.getAttribute('cx')).toBe('310') // centre(300,200,20,20) → 300+10
  expect(origin?.getAttribute('cy')).toBe('210')
})
