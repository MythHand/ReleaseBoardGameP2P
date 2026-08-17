// Forked from apps/ui/src/table/Table/Table.test.tsx (2026-08-11, #89). This
// suite is the spec for the board's behaviour — ported here unweakened, it is
// what proves the fork changed nothing (see _Board.tsx's header comment).
//
// Named `boardComponent.test.tsx`, not `Board.test.tsx` as the task brief
// says, because this repo's checkout runs on a case-insensitive filesystem
// with `git core.ignorecase=true` — `Board.test.tsx` and the pre-existing
// `board.test.tsx` (the route-level suite, which must stay untouched) are the
// same path here, and writing the former would have silently clobbered the
// latter. See task-4-report.md for the full note.
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import { vi } from 'vitest'
// Arrow's CSS Module classnames are not part of `@release/ui`'s public
// barrel (no component re-exports its own style object) — reached into the
// same way `fixture.ts` reaches into `@/mocks/table`.
import arrowStyles from '@/primitives/Arrow/Arrow.module.css'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

it('renders the local player name and every opponent seat', () => {
  const props = makeBoardProps()
  const { getByText } = render(<Board {...props} />)
  expect(getByText('kernel_panic')).toBeTruthy()
})

it('renders the participants roster from room, not state', () => {
  const props = makeBoardProps()
  // `state` is engine-shaped and has no roster at all — the roster can only
  // come from `room`.
  expect('spectators' in props.state).toBe(false)
  expect('participants' in props.state).toBe(false)

  const { getByText, queryByText, rerender } = render(<Board {...props} />)
  // open the participants drawer (Task 2 gives `panel` a controlled prop —
  // until then, drive it the way a real consumer does: click the rail tab)
  fireEvent.click(getByText(props.copy.table.tabParticipants))

  // a participant and a spectator, both sourced from `room`, must render
  expect(getByText('you')).toBeTruthy()
  expect(getByText('oracle')).toBeTruthy()

  // remove that spectator from `room.spectators` and re-render with the same
  // `state` — if the roster ever started reading from `state` instead, this
  // spectator would keep appearing and the assertion below would fail
  rerender(
    <Board
      {...props}
      room={{
        ...props.room,
        spectators: props.room.spectators.filter((s) => s.name !== 'oracle'),
      }}
    />,
  )
  expect(queryByText('oracle')).toBeNull()
})

it('opens a panel on its own when `panel` is not supplied', () => {
  const props = makeBoardProps()
  const { getByRole, getByTestId } = render(<Board {...props} />)
  fireEvent.click(getByRole('button', { name: props.copy.table.tabHistory }))
  expect(getByTestId('panel-history')).toBeTruthy()
})

it('does not update itself when `panel` is supplied', () => {
  const props = makeBoardProps()
  const onPanelChange = vi.fn()
  const { getByRole, queryByTestId } = render(
    <Board {...props} panel={null} onPanelChange={onPanelChange} />,
  )
  fireEvent.click(getByRole('button', { name: props.copy.table.tabHistory }))
  expect(onPanelChange).toHaveBeenCalledWith('history')
  // Controlled: the parent did not re-render with a new panel, so nothing opened.
  expect(queryByTestId('panel-history')).toBeNull()
})

it('reports null when the active tab is clicked again', () => {
  const props = makeBoardProps()
  const onPanelChange = vi.fn()
  const { getByRole } = render(<Board {...props} panel="history" onPanelChange={onPanelChange} />)
  fireEvent.click(getByRole('button', { name: props.copy.table.tabHistory }))
  expect(onPanelChange).toHaveBeenCalledWith(null)
})

it('marks an eliminated opponent with the eliminated badge and leaves the others alone', () => {
  const base = makeBoardProps()
  // Target index 1, not 0: the retired implementation was `i === 0`, so a
  // regression back to index-based selection would keep an index-0 target
  // green. Index 0 (`alive`) must stay the untouched live control.
  const [alive, out] = base.state.opponents
  const opponents = base.state.opponents.map((o) =>
    o.id === out.id ? { ...o, eliminated: true } : o,
  )
  const { getByTestId } = render(<Board {...base} state={{ ...base.state, opponents }} />)
  // The comparison against a live sibling is what makes this falsifiable — the
  // eliminated seat shows the eliminated badge and no card count; the live
  // sibling shows its (non-zero, per the mock) card count and no badge.
  expect(within(getByTestId(`seat-${out.id}`)).getByText(base.copy.seat.eliminated)).toBeTruthy()
  expect(within(getByTestId(`seat-${out.id}`)).queryByTestId('hand-count')).toBeNull()
  const aliveSeat = within(getByTestId(`seat-${alive.id}`))
  expect(aliveSeat.queryByText(base.copy.seat.eliminated)).toBeNull()
  expect(aliveSeat.getByTestId('hand-count').textContent).not.toBe('0')
})

it('shows the reconnect overlay from room.connection, not from a view flag', () => {
  const base = makeBoardProps()
  const { getByText } = render(
    <Board {...base} room={{ ...base.room, connection: 'reconnecting' }} />,
  )
  expect(getByText(base.copy.reconnect.label)).toBeTruthy()
})

it('shows the youEliminated badge from state.you.eliminated', () => {
  const base = makeBoardProps()
  const { getByText } = render(
    <Board {...base} state={{ ...base.state, you: { ...base.state.you, eliminated: true } }} />,
  )
  expect(getByText(base.copy.table.youEliminated)).toBeTruthy()
})

it('marks an opponent listed in room.disconnected and leaves the others alone', () => {
  const base = makeBoardProps()
  // Same index-1 rationale as the elimination test above: index 0 stays the
  // untouched live control so an `i === 0` regression cannot pass this test.
  const [alive, out] = base.state.opponents
  const { getByTestId } = render(
    <Board {...base} room={{ ...base.room, disconnected: [out.id] }} />,
  )
  expect(within(getByTestId(`seat-${out.id}`)).getByText(base.copy.seat.disconnected)).toBeTruthy()
  expect(
    within(getByTestId(`seat-${alive.id}`)).queryByText(base.copy.seat.disconnected),
  ).toBeNull()
})

it('plays a targetless card straight from the hand', () => {
  const base = makeBoardProps()
  const onPlay = vi.fn()
  const uid = base.state.you.hand[0].uid
  const { container } = render(
    <Board
      {...base}
      state={{ ...base.state, playable: [uid] }}
      actions={{ onPlay, legalTargets: () => [] }}
    />,
  )
  // Hand is always in drag mode now (#99 wires `onPlay` unconditionally outside
  // the deal), so a press this short — no movement between down and up — is a
  // CLICK, not a drag: Hand's own threshold (Hand.tsx, DRAG_THRESHOLD) decides.
  const slot = container.querySelectorAll('[data-hand-slot]')[0]
  fireEvent.mouseDown(slot)
  fireEvent.mouseUp(slot)
  expect(onPlay).toHaveBeenCalledWith(uid, undefined, undefined)
})

it('draws from the dock, once its mount lockout clears', () => {
  vi.useFakeTimers()
  const base = makeBoardProps()
  const onDraw = vi.fn()
  const { getByTestId } = render(
    <Board
      {...base}
      state={{ ...base.state, turn: 'you', hasDrawn: false }}
      actions={{ onDraw }}
    />,
  )
  // TurnDock arms `keyLocked` on mount and releases it after LOCKOUT_MS (300ms,
  // TurnDock.tsx:23). A click before that is swallowed by design, so the timer
  // has to advance or this asserts nothing about wiring.
  act(() => vi.advanceTimersByTime(400))
  fireEvent.click(getByTestId('dock-key'))
  expect(onDraw).toHaveBeenCalledTimes(1)
  vi.useRealTimers()
})

// Click-select is gone from `_useBoardInteractions` (#99) — Task 4 revives this
// scenario through the staging gesture.
// biome-ignore lint/suspicious/noSkippedTests: intentional, see comment above
it.skip('anchors the targeting arrow to the selected source card, not the last-clicked combo partner', () => {
  const base = makeBoardProps()
  const sourceUid = base.state.you.hand[0].uid
  const partnerUid = base.state.you.hand[1].uid
  const targetPlayer = base.state.opponents[0].id
  const { container } = render(
    <Board
      {...base}
      state={{
        ...base.state,
        playable: [sourceUid, partnerUid],
        comboOptions: { [sourceUid]: [partnerUid] },
      }}
      actions={{
        onPlay: vi.fn(),
        // Only the source card carries a legal target — matches the hook's
        // own combo-then-target fixture in useTableInteractions.test.ts.
        legalTargets: (card) =>
          card === sourceUid ? [{ kind: 'player', player: targetPlayer }] : [],
      }}
    />,
  )

  const slots = container.querySelectorAll<HTMLElement>('[data-hand-slot]')
  // Distinct, deterministic rects per slot (jsdom's real getBoundingClientRect
  // is always all-zero) — this is what makes the two candidate origins
  // (source vs. partner) actually distinguishable in the assertion below.
  for (const [i, el] of slots.entries()) {
    vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
      left: i * 100,
      top: 0,
      width: 10,
      height: 10,
      right: i * 100 + 10,
      bottom: 10,
      x: i * 100,
      y: 0,
      toJSON: () => {},
    })
  }

  fireEvent.mouseDown(slots[0]) // pick source — comboPending, no target awaited yet
  fireEvent.mouseDown(slots[1]) // pick partner — phase becomes 'selected'

  // Arrow's <circle class="origin"> sits at `from` — asserting on it, rather
  // than on internal hook state, pins what actually reaches the screen. This
  // leaves the arc/head geometry and the live cursor-follow (`to`) uncovered,
  // but `from` is the only part this bug affects.
  const origin = container.querySelector(`.${arrowStyles.origin}`)
  expect(origin).toBeTruthy()
  expect(origin?.getAttribute('cx')).toBe('5') // source (slot 0): left 0 + width/2
  expect(origin?.getAttribute('cy')).toBe('5')
})

// Click-select is gone from `_useBoardInteractions` (#99) — Task 4 revives this
// scenario through the staging gesture.
// biome-ignore lint/suspicious/noSkippedTests: intentional, see comment above
it.skip('keeps the tracked cursor when a fresh-but-equivalent hand array re-renders mid-selection', () => {
  const base = makeBoardProps()
  const sourceUid = base.state.you.hand[0].uid
  const targetPlayer = base.state.opponents[0].id
  const stateWithTarget = {
    ...base.state,
    playable: [sourceUid],
  }
  const actions = {
    onPlay: vi.fn(),
    legalTargets: (card: string) =>
      card === sourceUid ? [{ kind: 'player' as const, player: targetPlayer }] : [],
  }
  const { container, rerender } = render(
    <Board {...base} state={stateWithTarget} actions={actions} />,
  )

  const slot0 = container.querySelectorAll<HTMLElement>('[data-hand-slot]')[0]
  vi.spyOn(slot0, 'getBoundingClientRect').mockReturnValue({
    left: 0,
    top: 0,
    width: 10,
    height: 10,
    right: 10,
    bottom: 10,
    x: 0,
    y: 0,
    toJSON: () => {},
  })

  fireEvent.mouseDown(slot0) // select the source — phase becomes 'selected', arrow arms at (5, 5)

  // Move the tracked cursor away from the origin — this is the `mousemove`
  // listener useArrow mounts internally while `active`.
  fireEvent.mouseMove(window, { clientX: 300, clientY: 300 })

  const arrowSvg = container.querySelector(`.${arrowStyles.svg}`)
  const tipBefore = arrowSvg?.querySelector('g')?.getAttribute('transform')
  expect(tipBefore).toContain('translate(300 300)')

  // Re-render with a *fresh array reference* holding the *same cards* — this
  // is what every projection update produces in the real app (Milestone 3's
  // `toTableState` rebuilds `TableState` from scratch), and it must not be
  // mistaken for a new selection.
  rerender(
    <Board
      {...base}
      state={{
        ...stateWithTarget,
        you: { ...stateWithTarget.you, hand: [...base.state.you.hand] },
      }}
      actions={actions}
    />,
  )

  const tipAfter = arrowSvg?.querySelector('g')?.getAttribute('transform')
  // If the arming effect re-ran on this re-render (the bug), it would call
  // `aim(origin)` again, snapping `to` back to (5, 5) — the tip must instead
  // stay wherever the mouse left it.
  expect(tipAfter).toContain('translate(300 300)')
})

it('sweeps the countdown from the now it is given', () => {
  const base = makeBoardProps()
  const props = makeBoardProps({
    state: {
      ...base.state,
      window: {
        player: 'p2',
        slot: 'frontend',
        round: 1,
        openedAt: 1_000,
        deadline: 16_000,
        passed: [],
        canAttackWith: [base.state.you.hand[0]?.uid ?? 'x'],
      },
    },
    now: 6_000,
  })
  render(<Board {...props} />)
  // 16000 - 6000 = 10s left. Frozen at now=0 the dock reads 16. Asserted on the
  // readout itself rather than the page text, which would equally accept a 10
  // from a deck count and could not tell 10 from 100.
  expect(screen.getByTestId('ring-value').textContent).toBe('10')
})

it('shows no countdown readout when nothing is counting down', () => {
  // Your own turn: no window, no pending, so there is no deadline to count. The
  // dock's clock reports that as zero seconds, and a rendered `0` reads as a
  // stuck timer for the state a player spends most of the game in.
  const base = makeBoardProps()
  render(<Board {...makeBoardProps({ state: { ...base.state, turn: base.state.selfId } })} />)
  expect(screen.queryByTestId('ring-value')).toBeNull()
})

it('shows no countdown readout for a pending that carries no deadline', () => {
  // A decision owed to you puts the dock in `reaction`, but only a defence
  // carries a deadline. Without one there is nothing to count, so the ring is
  // bare here too — the same stuck `0` reached by the other branch of the clock.
  const base = makeBoardProps()
  const props = makeBoardProps({
    state: {
      ...base.state,
      pending: {
        kind: 'discardForRelease',
        player: base.state.selfId,
        options: [base.state.you.hand[0]?.uid ?? 'x'],
      },
    },
  })
  render(<Board {...props} />)
  expect(screen.queryByTestId('ring-value')).toBeNull()
})
