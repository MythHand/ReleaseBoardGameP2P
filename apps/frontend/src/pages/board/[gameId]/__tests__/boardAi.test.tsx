// THE AI PAIR at the centre (#106, Task 5): three slots mounted for the whole
// life of the board — `cause`, `effect`, `picked` — and the card standing
// behind a prompt while the engine waits for an answer. `effect`'s standing
// card is the render that carries the AI card across the batch gap: `source`
// on a `crush` / `neutralize503` / `handLimit` / `pickFromDiscard` pending is
// public for every peer, not just the one being asked.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

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
})
