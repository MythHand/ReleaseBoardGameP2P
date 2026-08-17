import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { Card as CardType } from '@/cards/types'
import { scatterAt } from './scatter'
import type { Leaving } from './useDiscardExit'
import { useDiscardExit } from './useDiscardExit'

// `useDiscardExit`'s own `send` calls `play` through a SIBLING import (`./play`
// — see its own header comment), not through the package barrel. Every OTHER
// suite that touches this step (drawBeat.test.tsx, comboBeat.test.tsx) mocks
// the whole hook instead of this leaf, precisely because mocking the barrel's
// `play` never reaches it. This suite IS the hook, so it mocks that one leaf.
const calls = vi.hoisted(() => ({ params: [] as { rotate?: number; dx?: number; dy?: number }[] }))
vi.mock('./play', () => ({
  play: (_name: string, _el: Element, params: { rotate?: number; dx?: number; dy?: number }) => {
    calls.params.push(params)
    return { finished: Promise.resolve() } as unknown as Animation
  },
}))

const card: CardType = {
  id: 'attack-bug',
  name: 'Bug',
  category: 'attack',
  deck: 'base',
  art: '',
  tags: [],
  qty: 0,
}
const auxCard: CardType = { ...card, id: 'support-sudo', name: 'Sudo' }

const api: { step?: ReturnType<typeof useDiscardExit> } = {}
const boxRef = { current: document.createElement('div') }
function Probe() {
  api.step = useDiscardExit(boxRef)
  return <>{api.step.overlay}</>
}

// Same shape as `deckBeat.test.tsx`/`comboBeat.test.tsx`'s own `drive`: `send`
// spans a real `nextFrames()` (two rAF ticks), and React defers every update
// queued inside one async `act()` scope until that scope's own promise
// settles — so a naive `act(async () => await send())` would never see the
// flyer mount mid-flight, and `refs.current[key]` would read null the whole
// way through.
async function drive(run: () => Promise<void> | undefined) {
  vi.useFakeTimers()
  try {
    let done = false
    const finished = Promise.resolve(run()).then(() => {
      done = true
    })
    while (!done) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(20)
      })
    }
    await finished
  } finally {
    vi.useRealTimers()
  }
}

// The bug this pins: `expand()` used to hardcode `scatter: jitter()` for the
// AUX half regardless of what the caller knew — so a pair split (comboBeat.tsx)
// flew its aux to a random rest and then snapped to its REAL one (I7's own
// `scatterAt(auxEventId)`, the same value `toBoardState.toDiscardHeap` rests it
// on) the instant the heap took over. `scatterAt` is deterministic, so an exact
// equality here is decisive — a leftover `jitter()` would fail it every run.
it('flies the aux half of a split pair onto its OWN scatter, not a random jitter', async () => {
  calls.params = []
  render(<Probe />)
  const pairEl = document.createElement('div')
  pairEl.innerHTML = '<div data-aux></div><div data-main></div>'
  const item: Leaving = {
    key: 'p10',
    card,
    aux: auxCard,
    el: pairEl,
    from: { left: 0, top: 0, width: 120, height: 168 },
    scatter: scatterAt(10),
    auxScatter: scatterAt(11),
  }
  await drive(() => api.step?.send([item]))
  // two flights fired: the aux (under its main, per `expand()`'s own order)
  // and the main — both hit `play('centerToDiscard', …)`.
  expect(calls.params).toHaveLength(2)
  const auxWant = scatterAt(11)
  const mainWant = scatterAt(10)
  const auxParams = calls.params.find((p) => p.rotate === auxWant.rot)
  expect(auxParams).toMatchObject({ rotate: auxWant.rot, dx: auxWant.dx, dy: auxWant.dy })
  // …and the main half is unaffected — still its own `scatter`, not the aux's.
  const mainParams = calls.params.find((p) => p.rotate === mainWant.rot)
  expect(mainParams).toMatchObject({ rotate: mainWant.rot, dx: mainWant.dx, dy: mainWant.dy })
})

// Omitting `auxScatter` still works — same fallback as before (a fresh
// `jitter()`), just no longer the ONLY option.
it('falls back to a fresh scatter for the aux half when the caller has none', async () => {
  calls.params = []
  render(<Probe />)
  const pairEl = document.createElement('div')
  pairEl.innerHTML = '<div data-aux></div><div data-main></div>'
  const item: Leaving = {
    key: 'p20',
    card,
    aux: auxCard,
    el: pairEl,
    from: { left: 0, top: 0, width: 120, height: 168 },
    scatter: scatterAt(20),
  }
  await drive(() => api.step?.send([item]))
  expect(calls.params).toHaveLength(2)
  const mainWant = scatterAt(20)
  const auxParams = calls.params.find((p) => p.rotate !== mainWant.rot)
  // some scatter was produced for the aux — just not `scatterAt(20)` (the
  // main's own), and not `undefined`
  expect(auxParams).toBeDefined()
  expect(typeof auxParams?.rotate).toBe('number')
})
