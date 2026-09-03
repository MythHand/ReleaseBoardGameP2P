// THE AI PAIR at the centre (#106, Task 5): three slots mounted for the whole
// life of the board — `cause`, `effect`, `picked` — and the card standing
// behind a prompt while the engine waits for an answer. `effect`'s standing
// card is the render that carries the AI card across the batch gap: `source`
// on a `crush` / `neutralize503` / `handLimit` / `pickFromDiscard` pending is
// public for every peer, not just the one being asked.
import { centreTransform } from '@release/ui'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

// The same drag the kit's own contract expects — ported from
// `boardHandLimit.test.tsx`'s own `pullCardFromFan` rather than duplicated
// under a new shape: down on the slot, past Hand's 6px threshold, released
// well outside the hand's band.
async function pullCardFromFan(index: number) {
  const slot = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[index]
  fireEvent.mouseDown(slot, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 0, clientY: -20 })
  fireEvent.mouseUp(window, { clientX: 0, clientY: -200 })
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600))
  })
}

vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => true }))

describe('the AI pair at the centre', () => {
  it('mounts all three slots for the whole life of the board', () => {
    render(<Board {...makeBoardProps()} />)
    for (const slot of ['cause', 'effect', 'picked']) {
      expect(document.querySelector(`[data-centre-slot="${slot}"]`)).not.toBeNull()
    }
  })

  it('stands the AI card behind a prompt, for a peer who is not the one asked', () => {
    const base = makeBoardProps()
    render(
      <Board
        {...makeBoardProps({
          state: {
            ...base.state,
            selfId: 'p2',
            pending: {
              kind: 'crush',
              player: 'p1',
              slot: 'frontend',
              methods: ['debugger'],
              source: 'ai-crush-frontend',
            },
          },
        })}
      />,
    )
    expect(screen.getByTestId('board-ai-effect')).not.toBeNull()
  })

  it('stands nothing when the prompt carries no source', () => {
    const base = makeBoardProps()
    render(
      <Board
        {...makeBoardProps({
          state: {
            ...base.state,
            pending: { kind: 'handLimit', player: 'p1', excess: 2, options: [] },
          },
        })}
      />,
    )
    expect(screen.queryByTestId('board-ai-effect')).toBeNull()
  })

  // Bad Vibe-Coding borrows the hand-limit prompt (#104's whole surface) but
  // its one card must not land underneath the AI card standing at `effect` —
  // `source` on the pending is what tells the grid's one cell to take the
  // `aiPick` set's `picked` place instead of its own `gridCells(1)` shape.
  it("stands Bad Vibe's given-up card beside the AI card, not under it", async () => {
    const base = makeBoardProps()
    const uid = base.state.you.hand[0].uid
    render(
      <Board
        {...makeBoardProps({
          state: {
            ...base.state,
            pending: {
              kind: 'handLimit',
              player: base.state.selfId,
              excess: 1,
              options: [uid],
              source: 'ai-bad-vibe-coding',
            },
          },
        })}
      />,
    )
    // …after the first pull fixes the grid
    await pullCardFromFan(0)
    const cell = document.querySelector('[data-grid-cell="0"]') as HTMLElement
    // the `picked` place, not the grid's own centred cell
    expect(cell.style.transform).toBe(centreTransform('picked'))
  })

  it('keeps the ordinary hand limit on its own grid', async () => {
    const base = makeBoardProps()
    const uid = base.state.you.hand[0].uid
    render(
      <Board
        {...makeBoardProps({
          state: {
            ...base.state,
            pending: {
              kind: 'handLimit',
              player: base.state.selfId,
              excess: 1,
              options: [uid],
            },
          },
        })}
      />,
    )
    await pullCardFromFan(0)
    const cell = document.querySelector('[data-grid-cell="0"]') as HTMLElement
    expect(cell.style.transform).not.toBe(centreTransform('picked'))
  })
})
