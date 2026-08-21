// Task 11 (#102): `PendingPrompt`'s `crush` case can now name the release a
// sacrifice burns, but that fix is inert unless the board actually hands it
// one — `_Board.tsx` renders `<PendingPrompt>` without a `release` prop
// otherwise, and the picker would show nothing to pick. This suite is about
// that wiring alone: `you.release` (card data) and `you.releaseUid` (uids)
// reaching the panel, not the panel's own behaviour (covered in
// apps/ui/src/table/Table/PendingPrompt/PendingPrompt.test.tsx).

import type { CardData, TableActions } from '@release/ui'
import { cardById } from '@release/ui'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

// biome-ignore lint/style/noNonNullAssertion: a known catalogue entry
const card = (id: string): CardData => cardById(id)!

function withCrush(actions: TableActions = {}) {
  const base = makeBoardProps()
  return (
    <Board
      {...makeBoardProps({
        state: {
          ...base.state,
          you: {
            ...base.state.you,
            release: { ...base.state.you.release, frontend: card('release-frontend') },
            releaseUid: { frontend: 'release-frontend#3' },
          },
          // no pending → nothing playable is a real engine invariant; a crush
          // pending is no exception.
          playable: [],
          pending: {
            kind: 'crush',
            player: base.state.selfId,
            slot: 'frontend',
            methods: ['sacrifice'],
          },
        },
        actions,
      })}
    />
  )
}

it('offers the standing release as a sacrifice target, wired from the board', () => {
  const onResolve = vi.fn()
  render(withCrush({ onResolve }))

  // options[0] is the 'sacrifice' method itself; the release only becomes an
  // option once that method is picked — same order as the ui-level test.
  const options = screen.getAllByRole('option')
  fireEvent.click(options[0])
  const afterMethod = screen.getAllByRole('option')
  expect(afterMethod).toHaveLength(2)
  fireEvent.click(afterMethod[1])
  fireEvent.click(screen.getByRole('button', { name: /confirm/i }))

  // The uid the engine's choice must carry — `you.releaseUid.frontend` — not
  // just a slot name: without the board's wiring there would be nothing here
  // to click at all, and `onResolve` would never fire with a `card`.
  expect(onResolve).toHaveBeenCalledWith({
    kind: 'crush',
    method: 'sacrifice',
    card: 'release-frontend#3',
  })
})
