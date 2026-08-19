// Answering an attack (#101, Task 16): pulling a defence out of the fan and
// dropping it on the attack answers the open `defend` pending owed to us.
// `_useDefenseStaging.ts` is the sibling hook that owns this — active only
// while the engine owes us that decision; `_useBoardStaging.ts` (this file's
// own sibling suite, boardStaging.test.tsx) owns the TURN's plays and the two
// never run at once. Same render harness (real `<Board>`, no mocks).

import type { Event } from '@release/engine'
import type { CardData, TableActions } from '@release/ui'
import { cardById } from '@release/ui'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

// biome-ignore lint/style/noNonNullAssertion: a known catalogue entry
const hotfix = cardById('defense-hotfix')!

// The fixed hand every test in this file renders: the one defence card these
// tests pull. Never mutated by the hook itself, same discipline as
// boardStaging.test.tsx's own HAND.
const HAND: { uid: string; card: CardData }[] = [{ uid: 'defense-hotfix#0', card: hotfix }]

// The uid the most recent pull went after — same role as boardStaging.test.tsx's
// own `lastPulled`.
let lastPulled: string | null = null

// Builds a board whose `state.pending` is a `defend` owed to `selfId` — the
// engine's own shape (packages/engine/src/fake/attacks.ts's `pendingView`):
// `scope: 'release'`, a fixed attacker/attackCard, sudo false, and `options`
// from `over` (legality is the projection's answer, never re-derived here).
function defenceBoard(
  over: { options: string[] },
  actions: TableActions = {},
  // routed through `intro.events`, same as boardStaging.test.tsx's own
  // `boardWith` — Board only ever sees the feed that way.
  events: Event[] = [],
) {
  const base = makeBoardProps()
  const props = makeBoardProps({
    state: {
      ...base.state,
      you: { ...base.state.you, hand: HAND },
      // no pending → nothing playable is a real engine invariant
      // (playableFor's own first check); a defend pending is no exception.
      playable: [],
      pending: {
        kind: 'defend',
        player: base.state.selfId,
        attacker: 'p2',
        attackCard: 'attack-bug',
        sudo: false,
        options: over.options,
        openedAt: 0,
        deadline: 15_000,
        scope: 'release',
      },
    },
    actions,
    intro: events.length > 0 ? { gameId: null, view: null, events, onDone: () => {} } : undefined,
  })
  return <Board {...props} />
}

// A rejection naming the defend pending's own choice — the REAL shape a
// rejected RESOLVE carries (packages/engine/src/fake/core.ts's `reject()`:
// `{type: 'rejected', action, reason}`, where `action` is the whole original
// Action). A RESOLVE action has no top-level `card` — the card lives inside
// `action.choice`, which is why the hook's own watcher cannot reuse
// `_useBoardStaging`'s `'card' in e.action` check.
function rejectedDefendEvent(card: string): Event {
  return {
    id: 9,
    type: 'rejected',
    action: { type: 'RESOLVE', player: 'you', choice: { kind: 'defend', card }, at: 0 },
    reason: 'illegal',
  }
}

// Drags a card out of the fan — same drag contract as boardStaging.test.tsx's
// own `pullCardFromFan`: down on its slot, past the 6px threshold, released
// well outside the hand's band. Waits past the accepted flight's own settle
// time (the SAME `playToCenter` preset boardStaging's own solo-release path
// uses to reach a centre slot).
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

// The fan's current uids — same construction as boardStaging.test.tsx's own
// `fanUids`.
function fanUids(): string[] {
  const rendered = document.querySelectorAll('[data-hand-slot]').length
  if (rendered === HAND.length) return HAND.map((c) => c.uid)
  return HAND.filter((c) => c.uid !== lastPulled).map((c) => c.uid)
}

it('drops a defence on the attack and answers with it', async () => {
  const onResolve = vi.fn()
  render(defenceBoard({ options: ['defense-hotfix#0'] }, { onResolve }))
  await pullCardFromFan('defense-hotfix#0')
  expect(onResolve).toHaveBeenCalledWith({
    kind: 'defend',
    card: 'defense-hotfix#0',
    combo: undefined,
  })
  // the card left the fan and stands, landed, over the attack — pins the
  // static cover render this hook's own `landed` gate produces, the same way
  // boardStaging.test.tsx pins `board-centre-staged` for a plain aim.
  expect(fanUids()).not.toContain('defense-hotfix#0')
  expect(screen.getByTestId('board-cover-staged')).toBeTruthy()
})

it('offers nothing the projection did not offer', async () => {
  // legality is the engine's answer, never the UI's — a card the pending does
  // not list cannot be pulled to answer with
  const onResolve = vi.fn()
  render(defenceBoard({ options: [] }, { onResolve }))
  await pullCardFromFan('defense-hotfix#0')
  expect(onResolve).not.toHaveBeenCalled()
  expect(fanUids()).toContain('defense-hotfix#0')
})

it('a rejected defence comes back to the fan', async () => {
  const onResolve = vi.fn()
  const { rerender } = render(defenceBoard({ options: ['defense-hotfix#0'] }, { onResolve }))
  await pullCardFromFan('defense-hotfix#0')
  expect(onResolve).toHaveBeenCalledWith({
    kind: 'defend',
    card: 'defense-hotfix#0',
    combo: undefined,
  })
  rerender(
    defenceBoard({ options: ['defense-hotfix#0'] }, { onResolve }, [
      rejectedDefendEvent('defense-hotfix#0'),
    ]),
  )
  await act(async () => {
    await new Promise((r) => setTimeout(r, 700))
  })
  expect(fanUids()).toContain('defense-hotfix#0')
  expect(screen.queryByTestId('board-cover-staged')).toBeNull()
})

it('reduced motion stages without a flight', () => {
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
  const onResolve = vi.fn()
  render(defenceBoard({ options: ['defense-hotfix#0'] }, { onResolve }))
  // the drag itself, inlined rather than through `pullCardFromFan`: that
  // helper waits 600ms for a flight reduced motion never plays.
  const index = HAND.findIndex((c) => c.uid === 'defense-hotfix#0')
  const slot = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[index]
  lastPulled = 'defense-hotfix#0'
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  expect(onResolve).toHaveBeenCalledWith({
    kind: 'defend',
    card: 'defense-hotfix#0',
    combo: undefined,
  })
  expect(screen.getByTestId('board-cover-staged')).toBeTruthy()
  mm.mockRestore()
})

// Fix round 1 (Important 1): `PendingPrompt` is a SECOND door onto the same
// `defend` decision — its own card list + confirm button call `onResolve`
// directly, bypassing `_useDefenseStaging` entirely. Before this fix that
// left `defenseStaging.staged` (and so `handoffRef`) untouched, reopening
// Carry #2 through this door: `defenseBeat.runCovered` would find no handoff
// and fall back to `a.seatBox(plan.defender)`, null for the local player —
// nothing at the cover slot for the whole exchange. The property to hold is
// that BOTH doors produce the identical result.
it('a defence chosen through the pending panel also covers the attack', async () => {
  const onResolve = vi.fn()
  const { copy } = makeBoardProps()
  render(defenceBoard({ options: ['defense-hotfix#0'] }, { onResolve }))
  const prompt = screen.getByTestId('pending-prompt')
  const option = prompt.querySelector<HTMLElement>('[role="option"]')
  if (!option) throw new Error('no card option rendered in the pending panel')
  fireEvent.click(option)
  const confirmBtn = screen.getByText(copy.pending.confirm).closest('button')
  if (!confirmBtn) throw new Error('confirm button not found')
  fireEvent.click(confirmBtn)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600))
  })
  expect(onResolve).toHaveBeenCalledWith({
    kind: 'defend',
    card: 'defense-hotfix#0',
    combo: undefined,
  })
  // the same visual the drag path produces — not the panel's own confirm
  // alone, which the pre-fix code already satisfied
  expect(screen.getByTestId('board-cover-staged')).toBeTruthy()
})
