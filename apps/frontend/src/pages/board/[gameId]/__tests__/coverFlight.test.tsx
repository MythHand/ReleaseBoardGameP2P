import type { Event } from '@release/engine'
import { cardById } from '@release/ui'
import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { useCoverFlight } from '../_useCoverFlight'

const played = vi.hoisted(() => ({
  calls: [] as { name: string; params: Record<string, unknown> }[],
}))
vi.mock('@release/ui/animations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@release/ui/animations')>()
  return {
    ...real,
    play: (name: string, _el: unknown, params: Record<string, unknown> = {}) => {
      played.calls.push({ name, params })
      return { finished: Promise.resolve() } as unknown as Animation
    },
  }
})

// biome-ignore lint/style/noNonNullAssertion: a known catalogue entry
const hotfix = cardById('defense-hotfix')!
const POSE = { rot: 6, dx: 16, dy: -12 }

function harness() {
  const api: { flight?: ReturnType<typeof useCoverFlight> } = {}
  function Probe() {
    api.flight = useCoverFlight()
    return <>{api.flight.overlay}</>
  }
  render(<Probe />)
  return api
}

it('is not landed until the flight finishes, and lands with the pose it was given', async () => {
  const api = harness()
  expect(api.flight?.landed).toBe(false)
  const to = document.createElement('div')
  // two `act`s, not one: `flyer.raise` mounts its carrier through a state
  // update and then waits two frames for it to paint. An `act` that awaits the
  // WHOLE flight never gets to commit that update before those frames fire, so
  // `raise` hands back an unmounted node and the flight is skipped — the same
  // reason comboHandoff.test.tsx drives its flights through `drive` rather
  // than a bare `act`. The first scope flushes the mount, the second waits the
  // flight out.
  let flight: Promise<void> | undefined
  await act(() => {
    flight = api.flight?.fly({
      card: hotfix,
      from: { left: 0, top: 0, width: 150, height: 210 },
      to: () => to.getBoundingClientRect(),
      pose: POSE,
    })
  })
  await act(async () => {
    await flight
  })
  expect(played.calls.at(-1)?.name).toBe('playToCenter')
  expect(played.calls.at(-1)?.params).toMatchObject({ rotate: 6, dx: 16, dy: -12 })
  expect(api.flight?.landed).toBe(true)
})

it('reports landed even when the animation is cancelled mid-flight', async () => {
  // the `finally` that #101 Fix D round 4 made load-bearing: a rejecting
  // `.finished` must still report the carrier gone, or a dispatched play
  // leaves a hole in the fan for the rest of the match
  played.calls.length = 0
  const api = harness()
  const to = document.createElement('div')
  await act(async () => {
    await api.flight?.fly({
      card: hotfix,
      from: undefined, // no source to measure — the flight cannot run at all
      to: () => to.getBoundingClientRect(),
      pose: POSE,
    })
  })
  expect(api.flight?.landed).toBe(true)
})

it('sees only rejections that arrive after the mark', () => {
  const api = harness()
  // a rejection that was already on the feed when we dispatched is not OURS —
  // the same watermark discipline `_useBoardStaging.ts` applies to this array
  const before: Event[] = [{ id: 1, type: 'rejected', action: {}, reason: 'nope' } as Event]
  act(() => api.flight?.mark(before))
  expect(api.flight?.rejectedSince(before)).toBe(false)
  const after: Event[] = [...before, { id: 2, type: 'rejected', action: {}, reason: 'no' } as Event]
  expect(api.flight?.rejectedSince(after)).toBe(true)
})
