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
  // the release left the fan — it must not be pickable a second time there
  expect(document.querySelectorAll('[data-hand-slot]').length).toBe(HAND.length - 1)
  // and it does NOT render at the plain aim/support centre slot — that render
  // is `soloStaged`'s, which excludes a release on purpose (it belongs at the
  // stage slot instead, asserted below)
  expect(screen.queryByTestId('board-centre-staged')).toBeNull()
  // the projected pending has not arrived yet (this render still passes
  // `pending: null`) — the stage slot's card is standing there anyway, off
  // staging's OWN local state (Fix round 1: without that fallback the slot
  // would show nothing for as long as the referee's answer is in flight)
  const stageBefore = document.querySelector('[data-centre-slot="stage"]') as HTMLElement
  expect(stageBefore.querySelector('[data-card]')).toBeTruthy()

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
  // the paid cost stays open at its own slot — held there, not discarded on
  // the spot (a later task moves it on)
  const cost = document.querySelector('[data-centre-slot="cost"]') as HTMLElement
  expect(cost.querySelector('[data-card="attack-bug"]')).toBeTruthy()
})

// Fix round 1 (post-review): `_useBoardStaging.ts`'s own `handItems` is what
// the fan actually renders — one shorter than `you.hand` for as long as a
// cost is owed, since the staged release is excluded from it. A regression
// that stopped excluding it (e.g. deleting `cost?.release` from that memo)
// would leave every other assertion in this file green — `clickFanCard` finds
// its target by catalogue id, not slot position — so this pins the exclusion
// directly.
it('the fan is one card shorter than the hand while a cost is owed', () => {
  render(releaseBoard({ pending: costPending(['attack-bug#0']) }, {}))
  expect(document.querySelectorAll('[data-hand-slot]').length).toBe(HAND.length - 1)
})

// Fix round 1: the release standing at the stage slot must not ALSO appear at
// the plain centre-staged slot (`soloStaged`'s own render, for a plain
// aim/support) — the two would double the same card on screen if the
// category-release exclusion in `_Board.tsx`'s `soloStaged` were ever lost.
it('the standing release never renders at the plain centre-staged slot', () => {
  render(releaseBoard({ pending: costPending(['attack-bug#0']) }, {}))
  expect(screen.queryByTestId('board-centre-staged')).toBeNull()
})

// Fix round 1 (post-review, finding 2 — "the release is on screen twice, or
// nowhere"): a stage flyer that has not finished carrying the release to the
// stage slot must not ALSO be shadowed by a static render of the same card —
// jsdom's WAAPI stub (test-setup.ts) resolves `.finished` on the very next
// microtask regardless of the preset's own duration, so the flight has to be
// held open ON PURPOSE here to observe the moment it is still "in the air" —
// in a real browser this is the ~480ms `playToCenter` window, and on a fast
// connection (the host peer's own round trip can be near-instant) the
// referee's answer can land squarely inside it.
it('does not double-render the release while its own stage flight is still carrying it', async () => {
  const animateSpy = vi.spyOn(Element.prototype, 'animate').mockImplementation(
    () =>
      ({
        cancel: () => {},
        finished: new Promise<void>(() => {}), // never settles — the flight stays "in the air"
      }) as unknown as Animation,
  )
  const { rerender } = render(releaseBoard({}, {}))
  const index = HAND.findIndex((c) => c.uid === 'release-frontend#0')
  const slot = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[index]
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50))
  })
  // the carrier is still up — the flight it started never got to finish
  const flyer = document.querySelector<HTMLElement>('[class*="flyer"]')
  expect(flyer).toBeTruthy()

  // the referee answers early, before that flight has landed
  rerender(releaseBoard({ pending: costPending(['attack-bug#0']) }, {}))
  const stage = document.querySelector('[data-centre-slot="stage"]') as HTMLElement
  // the carrier still holds it — a static render here would double it
  expect(stage.querySelector('[data-card]')).toBeNull()
  animateSpy.mockRestore()
})

// Fix round 1 (post-review, finding 1 — "the cost flight starts from a slot
// the card never occupied"): `onCostPick` used to measure the flight's origin
// against `you.hand`, which still carries BOTH cards while a cost is owed —
// one slot short of the fan `handItems` actually renders (the staged release
// is excluded from it). `slotPlacement(slot, total)` derives both x and
// rotation from `slot - (total-1)/2`, so both arguments being wrong moves the
// origin, not just its label. Pinned directly: with jsdom's default all-zero
// hand-wrap rect, the ONE eligible card sitting at `slotPlacement(0, 1)` (dead
// centre) lands at `left: -75px`; the same card measured the old, wrong way —
// `slotPlacement(1, 2)`, its position in the UN-filtered `you.hand` — would
// land 68px across at `left: -7px`.
it('the cost flight originates from the fan slot the card actually occupies', async () => {
  const animateSpy = vi.spyOn(Element.prototype, 'animate').mockImplementation(
    () =>
      ({
        cancel: () => {},
        finished: new Promise<void>(() => {}), // held open — inspected mid-flight
      }) as unknown as Animation,
  )
  render(releaseBoard({ pending: costPending(['attack-bug#0']) }, {}))
  await clickFanCard('attack-bug#0')
  const flyer = document.querySelector<HTMLElement>('[class*="flyer"]')
  if (!flyer) throw new Error('cost flyer not mounted')
  expect(flyer.style.left).toBe('-75px')
  animateSpy.mockRestore()
})

it('does not raise the pending panel for a cost — the table asks instead', () => {
  render(releaseBoard({ pending: costPending(['attack-bug#0']) }, {}))
  // every other pending owed to us still raises the prompt; this one is
  // answered by the cards on the table, so a panel would be a second asker
  expect(screen.queryByTestId('pending-prompt')).toBeNull()
})

// ===== Fix B (#101) — what the table tells the player during the cost step =====
//
// The panel is suppressed for this one kind (above), the fan is the picker,
// and until this round NOTHING said so: `_Board.tsx` passed `accentAt` to
// `<Hand>` and never `stateAt`, `accentAt` answered only for a combo partner,
// there was no line of copy anywhere, and the dock — the only voice left —
// said "reaction / you can defend" over an amber PASS key the engine rejects
// outright while a decision is open (`window.ts`'s `onPass`).

// biome-ignore lint/style/noNonNullAssertion: a known catalogue entry
const hotfix = cardById('defense-hotfix')!

// A cost step with a THIRD card in hand the engine did not offer — the whole
// point of the assertion below is that the eligible set is `pending.options`
// and not "the whole fan". With only the payer in hand, lighting everything
// and lighting the offered set are indistinguishable.
function costLitBoard(options: string[]) {
  const base = makeBoardProps()
  const props = makeBoardProps({
    state: {
      ...base.state,
      you: { ...base.state.you, hand: [...HAND, { uid: 'defense-hotfix#0', card: hotfix }] },
      turn: base.state.selfId,
      hasDrawn: true,
      playable: [], // a pending suspends normal play — `playableFor`'s own first check
      pending: costPending(options),
    },
  })
  return <Board {...props} />
}

// The Card primitive's own identity + state hooks (`data-card` / `data-state`)
// and its accent custom property, read off the face inside a fan slot.
function faceOf(cardId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[data-hand-slot] [data-card="${cardId}"]`)
}

it('lights exactly the cards that may pay the cost, in the loss hue', () => {
  render(costLitBoard(['attack-bug#0']))
  const payer = faceOf('attack-bug')
  expect(payer?.getAttribute('data-state')).toBe('playable')
  // --danger-accent is the token for "a pick that COSTS you a card"
  // (tokens.css) — the exception is the colour, not the rule
  expect(payer?.style.getPropertyValue('--accent')).toBe('var(--danger-accent)')
  // the card the engine did not offer stays dark: legality is its answer
  const other = faceOf('defense-hotfix')
  expect(other?.getAttribute('data-state')).toBe('idle')
})

// A guard, not evidence: this passed before the fix too (nothing lit at all).
// It is here so a later "just light the whole fan" cannot land quietly.
it('lights nothing while no step is waiting on the fan', () => {
  render(releaseBoard({}))
  for (const face of document.querySelectorAll<HTMLElement>('[data-hand-slot] [data-card]')) {
    expect(face.getAttribute('data-state')).toBe('idle')
  }
})

it('says on the table that the release costs a card', () => {
  const { copy } = makeBoardProps()
  render(releaseBoard({ pending: costPending(['attack-bug#0']) }, {}))
  const ask = screen.getByTestId('board-ask')
  expect(ask.getAttribute('data-shown')).toBe('true')
  expect(ask.textContent).toContain(copy.table.askCost)
})

it('says nothing when nothing is owed', () => {
  render(releaseBoard({}, {}))
  expect(screen.getByTestId('board-ask').getAttribute('data-shown')).toBe('false')
})

it('the dock names the cost step, and offers no key the engine would refuse', () => {
  const { copy } = makeBoardProps()
  render(releaseBoard({ pending: costPending(['attack-bug#0']) }, {}))
  expect(screen.getAllByText(copy.turnDock.cost).length).toBeGreaterThan(0)
  expect(screen.queryByText(copy.turnDock.canDefend)).toBeNull()
  // PASS rejects while any decision is open, so the dock offers no key at all
  expect(screen.queryByTestId('dock-key')).toBeNull()
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

// Task 9 (#101): a press on nothing valid takes the staged release back to the
// fan — the same "changed my mind" rule every other staged play already gets.
// `cancelRelease` (#101, Task 7) is owner-only, clears the pending, and emits
// nothing — safe precisely because the release play emitted nothing either.
it('a press on nothing valid takes the staged release back to the fan', async () => {
  const onResolve = vi.fn()
  render(releaseBoard({ pending: costPending(['attack-bug#0']) }, { onResolve }))
  // a press on the table, away from the fan and away from any lit target
  fireEvent.mouseDown(document.querySelector('[data-board-centre]')?.parentElement as HTMLElement)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600))
  })
  expect(onResolve).toHaveBeenCalledWith({ kind: 'cancelRelease' })
})

it('a press inside the fan is not a miss', async () => {
  const onResolve = vi.fn()
  render(releaseBoard({ pending: costPending(['attack-bug#0']) }, { onResolve }))
  const slot = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[0]
  fireEvent.mouseDown(slot)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 100))
  })
  expect(onResolve).not.toHaveBeenCalledWith({ kind: 'cancelRelease' })
})

// Fix round 1 (post-review — the cancel above renders the release TWICE):
// `_Board.tsx`'s `stagedRelease` is gated on `staging.stageLanded` plus
// `costPending`/`stagedReleaseLocal`, and the cancel above touches none of
// those — so from the moment the return flight starts until the referee's
// answer (clearing `state.pending`) actually arrives, the static stage-slot
// render and the return flight's own overlay are BOTH on screen. A real P2P
// round trip is essentially always slower than one animation frame, so this
// is not a one-frame flicker — it is the steady state for the whole flight.
// `useHandArrival`'s own `arrive()` lands on a plain timer (`FLIGHT_MS`,
// 480ms — see `useHandArrival.tsx`), not on `Element.prototype.animate`'s own
// `.finished`, so this is observed the same way `boardStaging.test.tsx`
// observes an in-flight cancel elsewhere: a short wait well inside that
// window, no `animate` mock required.
it('does not double-render the release while its own return flight is still carrying it home', async () => {
  const onResolve = vi.fn()
  const { rerender } = render(releaseBoard({}, { onResolve }))
  await pullCardFromFan('release-frontend#0')
  rerender(releaseBoard({ pending: costPending(['attack-bug#0']) }, { onResolve }))
  const stage = document.querySelector('[data-centre-slot="stage"]') as HTMLElement
  expect(stage.querySelector('[data-card]')).toBeTruthy() // standing, before the cancel

  // a press on nothing valid — the return flight starts, but THIS rerender
  // still carries the very same cost-pending props throughout the flight
  fireEvent.mouseDown(document.querySelector('[data-board-centre]')?.parentElement as HTMLElement)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 50)) // well inside FLIGHT_MS (480ms) — still airborne
  })
  expect(onResolve).toHaveBeenCalledWith({ kind: 'cancelRelease' })
  // the return flight is still up…
  const flyer = document.querySelector<HTMLElement>('[class*="arriving"]')
  expect(flyer).toBeTruthy()
  // …and the stage slot must not ALSO show a static copy of the same card
  expect(stage.querySelector('[data-card]')).toBeNull()
})

// Fix round 1: the guard for the finding above must not blank the stage slot
// during the COST-PAYMENT flight instead — the release is legitimately still
// standing there while its cost travels to pay for it (Task 8's own scene).
// Nothing pinned this before; pinning it now alongside the fix, since the
// reviewer flagged it as the exact case a careless fix breaks.
it('the standing release stays visible while its own cost is still flying to pay for it', async () => {
  const { rerender } = render(releaseBoard({}, {}))
  await pullCardFromFan('release-frontend#0')
  rerender(releaseBoard({ pending: costPending(['attack-bug#0']) }, {}))
  const stage = document.querySelector('[data-centre-slot="stage"]') as HTMLElement
  expect(stage.querySelector('[data-card]')).toBeTruthy() // standing, before paying

  const animateSpy = vi.spyOn(Element.prototype, 'animate').mockImplementation(
    () =>
      ({
        cancel: () => {},
        finished: new Promise<void>(() => {}), // the cost flight held open mid-flight
      }) as unknown as Animation,
  )
  await clickFanCard('attack-bug#0')
  // the cost card is still flying to its own slot — the release itself must
  // still be standing at the stage slot throughout
  expect(stage.querySelector('[data-card]')).toBeTruthy()
  animateSpy.mockRestore()
})

// Reduced motion's own safety net (#101, Task 11): `useBeats.ts` never runs a
// beat at all under reduced motion, so the combo beat's own clear of
// `paidCost` (comboBeat.tsx's `runRelease`) never fires either — without
// `_useBoardStaging.ts`'s own reduced-motion effect, the paid cost would
// stand at its slot for the rest of the match, the exact permanent-artifact
// defect Task 8's review caught, recurring on the one path that fix cannot
// reach. Driven entirely through props (this suite's own convention, not a
// simulated engine round trip): paying the cost sets it, and the SAME
// rerender that clears the pending is what a real referee's answer would
// look like arriving.
it('reduced motion clears the paid cost once the pending resolves, with no beat to do it', async () => {
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
  const { rerender } = render(releaseBoard({}, {}))
  await pullCardFromFan('release-frontend#0')
  rerender(releaseBoard({ pending: costPending(['attack-bug#0']) }, {}))
  await clickFanCard('attack-bug#0')
  const cost = document.querySelector('[data-centre-slot="cost"]') as HTMLElement
  expect(cost.querySelector('[data-card="attack-bug"]')).toBeTruthy() // shown, same as always

  // the referee's answer: the cost pending is gone, the release now stands
  // settled — no beat ever ran to clear `paidCost` for us
  rerender(releaseBoard({}, {}))
  expect(cost.querySelector('[data-card]')).toBeNull()
  mm.mockRestore()
})
