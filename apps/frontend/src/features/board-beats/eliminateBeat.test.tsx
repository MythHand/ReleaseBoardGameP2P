import { act, fireEvent, render } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import type { BeatRun, BoardState } from '~/entities/game/board'
import {
  ELIM_CEILING_MS,
  ELIM_DELAY,
  ELIM_MIN_MS,
  ELIMINATION_CLIPS,
  useEliminateBeat,
} from './eliminateBeat'
import type { BeatPlan } from './planBeats'

// jsdom implements no media pipeline: `play()` is a stub that throws "Not
// implemented", and no clip ever fires `ended` on its own. Replaced here so the
// runner's own loop can be driven by hand — which is the point, since what is
// under test is what the runner does with those callbacks.
const plays = { count: 0 }
beforeEach(() => {
  plays.count = 0
  HTMLMediaElement.prototype.play = vi.fn(() => {
    plays.count++
    return Promise.resolve()
  })
})

// A test that fails mid-run never reaches its own `useRealTimers`, and the next
// one would then start against a clock somebody else left running — which is how
// a broken runner can look green here. Put back unconditionally instead.
afterEach(() => {
  vi.useRealTimers()
})

const base = {
  you: { name: 'You', hand: [], release: {} },
  opponents: [],
  decks: { main: [10], events: 5, discardCount: 0, discardHeap: [] },
  selfId: 'p1',
  history: [],
  setup: {},
  playable: [],
  frozen: [],
} as unknown as BoardState

const ctx: BeatRun = { base, publish: () => {} }

const plan = (eventId: number, player = 'p1'): Extract<BeatPlan, { kind: 'eliminated' }> => ({
  kind: 'eliminated',
  key: `eliminated:${eventId}`,
  eventId,
  player,
})

function harness() {
  const api: { beat?: ReturnType<typeof useEliminateBeat> } = {}
  function Probe() {
    api.beat = useEliminateBeat()
    return <>{api.beat.overlay}</>
  }
  return { api, Probe }
}

// Starts the beat and hands back the running promise plus a way to let time
// pass without waiting for it to finish — the runner has to be observed mid-run
// (the clip on screen) as well as at its end.
async function start(eventId = 20) {
  vi.useFakeTimers()
  const { api, Probe } = harness()
  render(<Probe />)
  let done = false
  const finished = Promise.resolve(api.beat?.run(plan(eventId), ctx)).then(() => {
    done = true
  })
  const tick = async (ms: number) => {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms)
    })
  }
  // past the delay that lets the emptied table read before the video covers it
  await tick(ELIM_DELAY + 20)
  return {
    api,
    finished,
    tick,
    isDone: () => done,
    video: () => document.querySelector('video'),
    settle: async () => {
      while (!done) await tick(200)
      await finished
      vi.useRealTimers()
    },
  }
}

it('holds the emptied table before the clip covers it', async () => {
  vi.useFakeTimers()
  const { api, Probe } = harness()
  render(<Probe />)
  const finished = Promise.resolve(api.beat?.run(plan(20), ctx))
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ELIM_DELAY - 50)
  })
  expect(document.querySelector('video')).toBeNull()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  expect(document.querySelector('video')).not.toBeNull()
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ELIM_CEILING_MS)
  })
  await finished
  vi.useRealTimers()
})

// The pick is derived from the event every peer already has, so one
// elimination is one clip on every screen — not four private ones.
it('resolves one clip from the elimination itself', async () => {
  const run = await start(21)
  expect(run.video()?.getAttribute('src')).toBe(ELIMINATION_CLIPS[21 % ELIMINATION_CLIPS.length])
  await run.settle()

  const again = await start(21)
  expect(again.video()?.getAttribute('src')).toBe(ELIMINATION_CLIPS[21 % ELIMINATION_CLIPS.length])
  await again.settle()
})

it('loops a clip that ends before the floor', async () => {
  const run = await start()
  await run.tick(1000)
  const before = plays.count
  act(() => {
    fireEvent.ended(run.video() as HTMLVideoElement)
  })
  expect(plays.count).toBe(before + 1) // played again
  expect(run.video()).not.toBeNull() // and still on screen
  expect(run.isDone()).toBe(false)
  await run.settle()
})

it('leaves once a loop finishes past the floor', async () => {
  const run = await start()
  await run.tick(ELIM_MIN_MS + 100)
  act(() => {
    fireEvent.ended(run.video() as HTMLVideoElement)
  })
  await run.finished
  expect(run.isDone()).toBe(true)
  expect(run.video()).toBeNull()
  vi.useRealTimers()
})

// A missing file or a codec the browser refuses. The beat owns the table while
// it runs, so a clip that cannot play must hand it straight back — the board is
// already in its eliminated state, which is what carries the news.
it('hands the table back when the clip cannot play', async () => {
  const run = await start()
  act(() => {
    fireEvent.error(run.video() as HTMLVideoElement)
  })
  await run.finished
  expect(run.isDone()).toBe(true)
  expect(run.video()).toBeNull()
  vi.useRealTimers()
})

// `ended` is the only thing that ends the loop, and a stalled stream never
// fires it. Without a ceiling that would hold this player's board dead for the
// rest of the match.
it('gives the table back on its own when the clip never ends', async () => {
  const run = await start()
  await run.tick(ELIM_CEILING_MS + 100)
  await run.finished
  expect(run.isDone()).toBe(true)
  expect(run.video()).toBeNull()
  vi.useRealTimers()
})

it('drops the clip when a new match cancels what is in the air', async () => {
  const run = await start()
  expect(run.video()).not.toBeNull()
  act(() => {
    run.api.beat?.reset()
  })
  expect(run.video()).toBeNull()
  await run.settle()
})
