import type { Event } from '@release/engine'
import { resources } from '@release/translation'
import { act, fireEvent, render } from '@testing-library/react'
import { useState } from 'react'
import { expect, it, vi } from 'vitest'
import { toBoardState } from '~/entities/game/board'
import { forViewer } from '~/network/session/audience'
import { createScenario, engine } from '../../../../../debug/scenarios'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

// A host answers in the same React commit as the drag. Keep the real engine,
// Board, queue and carriers; only record the browser animation boundary.
it.each([
  'local',
  'local-delayed',
  'remote',
  'observer',
  'local-neutralize',
] as const)('%s answer has one incoming carrier', async (viewer) => {
  vi.useFakeTimers()
  const geometry = vi
    .spyOn(HTMLElement.prototype, 'getBoundingClientRect')
    .mockReturnValue(new DOMRect(100, 100, 150, 210))
  const incoming: Element[] = []
  const animate = Element.prototype.animate
  const movement = vi.spyOn(Element.prototype, 'animate').mockImplementation(function (
    this: Element,
    frames: Keyframe[] | PropertyIndexedKeyframes | null,
    options?: number | KeyframeAnimationOptions,
  ) {
    if (
      this.textContent?.includes(viewer === 'local-neutralize' ? 'Debugger' : 'Hotfix') &&
      Array.isArray(frames) &&
      frames.some((frame) => String(frame.transform).includes('rotate(6deg)'))
    )
      incoming.push(this)
    return animate.call(this, frames, options)
  })
  const accepted = vi.fn()
  try {
    const neutralize = viewer === 'local-neutralize'
    const initial = neutralize
      ? engine.reduce(createScenario('alarm503', 'local-handoff'), {
          type: 'DRAW',
          player: 'you',
          pile: 0,
          at: Date.now(),
        }).state
      : createScenario('handDefense', 'local-handoff')
    const local = viewer === 'local' || viewer === 'local-delayed' || neutralize
    const selfId = neutralize ? 'you' : local ? 'p2' : viewer === 'observer' ? 'p3' : 'you'
    function Table() {
      const [run, setRun] = useState({ state: initial, events: [] as Event[] })
      const view = engine.project(run.state, selfId)
      const events = forViewer(run.events, selfId)
      const resolve = () => {
        const result = engine.reduce(run.state, {
          type: 'RESOLVE',
          player: neutralize ? 'you' : 'p2',
          at: Date.now(),
          choice: neutralize
            ? { kind: 'neutralize503', method: 'debugger' }
            : { kind: 'defend', card: initial.players.p2.hand[0].uid },
        })
        accepted(result.events)
        const accept = () => setRun({ state: result.state, events: result.events })
        if (viewer === 'local-delayed') setTimeout(accept, 100)
        else accept()
      }
      return (
        <>
          {!local && (
            <button type="button" onClick={resolve}>
              Remote defense
            </button>
          )}
          <Board
            {...makeBoardProps()}
            state={toBoardState(view, events, resources.en.common.historyLabels)}
            actions={{ onResolve: resolve }}
            intro={{ gameId: 'local-handoff', view, events, onDone: () => {} }}
          />
        </>
      )
    }
    const rendered = render(<Table />)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(100)
    })
    if (local) {
      const slot = document.querySelector('[data-hand-slot]')
      if (!slot) throw new Error('missing defense card')
      fireEvent.mouseDown(slot, { clientX: 150, clientY: 200 })
      fireEvent.mouseMove(window, { clientX: 150, clientY: 150 })
      fireEvent.mouseUp(window, { clientX: 150, clientY: 50 })
    } else fireEvent.click(rendered.getByText('Remote defense'))
    for (let time = 0; time < 500; time += 20) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20)
      })
    }
    expect(accepted).toHaveBeenCalledTimes(1)
    expect(accepted.mock.calls[0][0]).toContainEqual(
      expect.objectContaining({ type: neutralize ? 'neutralized' : 'defended' }),
    )
    expect(incoming).toHaveLength(1)
    if (local) expect(document.querySelector('[data-testid="board-cover-staged"]')).not.toBeNull()
  } finally {
    movement.mockRestore()
    geometry.mockRestore()
    vi.useRealTimers()
  }
})
