// What `arrive` REPORTS (#101, Fix D, finding 2).
//
// The step refuses a flight silently in three ways: no fan to measure, another
// arrival already in the air, and nothing measurable to fly. Every scene that
// calls it clears its own staging in `onLanded` — which is the landing of a
// flight that was taken — so a silent refusal leaves the scene holding cards it
// has already blanked for a flight that never started, with nothing left that
// will ever put them back. The board's own cancel bricked its fan exactly that
// way. So the call now answers whether it took the flight, and a scene can put
// itself back by hand when it did not.

import { act, render } from '@testing-library/react'
import type { RefObject } from 'react'
import { expect, it, vi } from 'vitest'
import type { Card as CardType } from '@/cards/types'
import { useHandArrival } from './useHandArrival'

const card: CardType = {
  id: 'attack-bug',
  name: 'Bug',
  category: 'attack',
  deck: 'base',
  art: '',
  tags: [],
  qty: 0,
}

const box = { left: 10, top: 10, width: 100, height: 140 }

// jsdom ships no WAAPI, and this package has no global test setup to add one
// (the frontend's `test-setup.ts` is where that lives). The flight itself is not
// what this suite is about — only what the call reports — so the stub is the
// smallest thing that lets `arrive` reach its own landing.
if (!Element.prototype.animate) {
  Element.prototype.animate = (() =>
    ({ cancel: () => {}, finished: Promise.resolve() }) as unknown as Animation) as never
}

const api: { step?: ReturnType<typeof useHandArrival> } = {}
const handRef: RefObject<HTMLDivElement | null> = { current: null }
const landed: string[] = []

function Probe() {
  api.step = useHandArrival(handRef, (_gap, list) => {
    for (const l of list) landed.push(l.key)
  })
  return <>{api.step.overlay}</>
}

// Same shape as `useDiscardExit.test.tsx`'s own `drive`: `arrive` spans a real
// `nextFrames()` and a real `wait(FLIGHT_MS)`, and React defers every update
// queued inside one async `act()` scope until that scope's promise settles — so
// the clock has to be advanced from OUTSIDE the call being driven.
async function drive<T>(run: () => Promise<T>): Promise<T> {
  vi.useFakeTimers()
  try {
    let out: T | undefined
    let done = false
    const finished = run().then((v) => {
      out = v
      done = true
    })
    while (!done) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20)
      })
    }
    await finished
    return out as T
  } finally {
    vi.useRealTimers()
  }
}

it('says it never took the flight when there is no fan to fly into', async () => {
  landed.length = 0
  handRef.current = null // the hand is not on screen — nothing to measure
  render(<Probe />)
  let taken: boolean | undefined
  await act(async () => {
    taken = await api.step?.arrive([{ key: 'c1', card, from: box }], 3)
  })
  expect(taken).toBe(false)
  // and it means it: no landing ever runs, which is the whole reason a scene
  // has to hear about the refusal
  expect(landed).toEqual([])
})

// ANOTHER CARD IN THE AIR IS NOT A REASON TO DROP THIS ONE (owner, 22.09). A
// card's journey into the fan does not depend on what some other card is doing,
// and the step used to answer "not taken" to anything that arrived while one
// was flying — which left the caller holding a card with nowhere to be. They
// queue now: the fan opens one gap at a time and the second card flies when the
// first has landed.
it('takes a second arrival too, and lands it after the first', async () => {
  landed.length = 0
  handRef.current = document.createElement('div')
  render(<Probe />)
  vi.useFakeTimers()
  try {
    let first: boolean | undefined
    let second: boolean | undefined
    const a = api.step?.arrive([{ key: 'c1', card, from: box }], 3).then((t) => {
      first = t
    })
    const b = api.step?.arrive([{ key: 'c2', card, from: box }], 4).then((t) => {
      second = t
    })
    // enough clock for both flights, one after the other
    for (let i = 0; i < 4 && second === undefined; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(600)
      })
    }
    await Promise.all([a, b])
    expect(first).toBe(true)
    expect(second).toBe(true)
    // …and in the order they were asked for, each landing on its own
    expect(landed).toEqual(['c1', 'c2'])
  } finally {
    vi.useRealTimers()
  }
})

it('says it took the flight once that flight has landed', async () => {
  landed.length = 0
  handRef.current = document.createElement('div')
  render(<Probe />)
  const taken = await drive(async () => api.step?.arrive([{ key: 'c1', card, from: box }], 3))
  expect(taken).toBe(true)
  expect(landed).toEqual(['c1'])
})
