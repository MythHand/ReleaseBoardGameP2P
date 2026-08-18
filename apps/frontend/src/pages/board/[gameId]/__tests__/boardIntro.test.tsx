import { act, render, screen } from '@testing-library/react'
import { StrictMode } from 'react'
import { expect, it, vi } from 'vitest'
import Board from '../_Board'
import { introFixture, makeBoardProps } from './fixture'

// Reduced motion is the deterministic path through the sequencer: no WAAPI, no
// layout, straight to the end state. It is also the path that must render the
// finished board, which is what makes it the right one to assert on. It is a
// mutable flag rather than a fixed `true`, because one assertion below needs
// the intro to be RUNNING — and under reduced motion it never is.
const motion = vi.hoisted(() => ({ reduced: true }))
vi.mock('~/shared/lib/useReducedMotion', () => ({
  useReducedMotion: () => motion.reduced,
}))

// The fan's slots — the Hand marks each one `data-hand-slot` (there is no
// `hand-card` test id on the kit's Hand; the brief assumed one).
const slots = (root: HTMLElement) => root.querySelectorAll('[data-hand-slot]')

it('lands on the dealt board when motion is reduced', () => {
  motion.reduced = true
  const onDone = vi.fn()
  const props = makeBoardProps()
  const { container } = render(<Board {...props} intro={{ ...introFixture(), onDone }} />)
  // The projection's own hand, whole and face up: the intro is over, so what is
  // on screen is the live state, not a shadow of it.
  expect(slots(container as HTMLElement)).toHaveLength(props.state.you.hand.length)
  expect(onDone).toHaveBeenCalledTimes(1)
})

// What is NOT asserted here, deliberately: that a click on a hand card cannot
// play it while the intro runs. During the intro the fan is empty — the cards
// have not landed yet — so there is nothing to click, and the version of this
// test that clicked one ran under reduced motion, where the intro is already
// over. It therefore passed with the whole feature deleted. The guarantee it
// claimed lives one layer down and is properly tested there: the keeper buffers
// every intent while the gate is shut (session/remoteLink.test.ts), so no seat
// can act into another's animation whatever the UI allows.
//
// What IS assertable at this level is reachability, and it matters on its own:
// the rail is faded to nothing during the opening, but a faded button still
// takes a click and still holds a Tab stop.
it('puts the faded rail out of reach while the intro runs', () => {
  // Not reduced: the sequencer arms in a layout effect, so the first committed
  // frame is already the running intro.
  motion.reduced = false
  const props = makeBoardProps()
  const { container } = render(<Board {...props} intro={{ ...introFixture(), onDone: () => {} }} />)
  const rail = container.querySelector('[class*="railLayer"]')
  expect(rail).toBeTruthy()
  expect(rail?.hasAttribute('inert')).toBe(true)
})

// StrictMode mounts, tears down, and mounts again — and the teardown is not a
// formality: `useDealIntro`'s cleanup cancels the run in flight by bumping the
// id that every `await` in the sequence checks. So the arm that says "this
// opening has already been queued" outlives the teardown that cancelled what it
// armed. The second mount declines to queue anything, the first run halts at its
// next check, and nothing ever reports.
//
// The cost is the entire screen. The board holds every block at `opacity: 0`
// until the opening says it is done, and the host's start gate waits on the same
// word — so a silent non-report is a permanently black table AND a match that
// never begins. It reproduced in the browser on the first two-peer run and in no
// test, because jsdom renders these suites without StrictMode's double invoke.
it('still reports the opening when StrictMode mounts the board twice', async () => {
  motion.reduced = false
  const onDone = vi.fn()
  const props = makeBoardProps()
  render(
    <StrictMode>
      <Board {...props} intro={{ ...introFixture(), onDone }} />
    </StrictMode>,
  )
  // The whole choreography, on jsdom's real timers — the sequence is seconds
  // long and every leg of it is a wait() the run has to get through.
  await act(async () => {
    await new Promise((r) => setTimeout(r, 9000))
  })
  expect(onDone).toHaveBeenCalledTimes(1)
}, 20000)
// The regression this guards: before #97's centre refactor, the whole wrapper
// div was itself gated by `{intro && …}`, so any test that rendered with an
// intro at least proved the staged-card map inside it had mounted. Now the
// wrapper is unconditional and only the map is still gated — its presence
// proves nothing about whether `deal.staged` (useDealIntro.ts:321) actually
// produces a card. This drives the real sequence far enough into the deal for
// the first card to leave the pile and land at the centre, and checks a real
// `.stagedCard` element is there — not a count, an element `cardById` could
// silently have failed to resolve.
//
// Fake timers stand in for wall-clock time: `wait()` (@release/ui/animations)
// is plain `setTimeout`, and the choreography's own beats sum to several real
// seconds before a card ever lands. `play()` is a no-op here regardless
// (jsdom has no `Element.animate`), so nothing but `wait()` gates the timing.
it('stages a real card at the centre while the deal is running', async () => {
  vi.useFakeTimers()
  try {
    motion.reduced = false
    const props = makeBoardProps()
    const { container } = render(
      <Board {...props} intro={{ ...introFixture(), onDone: () => {} }} />,
    )

    // Advance in small steps rather than one lump: the exact moment the first
    // card lands is an implementation detail of the choreography's own beat
    // timings, and the centre empties again once the whole heap has moved on
    // to the fan. Checking after every step catches the card inside that
    // window, however long it turns out to be, without pinning this test to
    // the beat constants themselves.
    let staged: Element | null = null
    for (let elapsed = 0; elapsed < 10_000 && !staged; elapsed += 50) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(50)
      })
      staged = container.querySelector('[data-board-centre] [class*="stagedCard"]')
    }

    expect(staged).not.toBeNull()
  } finally {
    vi.useRealTimers()
    motion.reduced = true
  }
})

it('hands the rail back when the opening is over', () => {
  motion.reduced = true
  const props = makeBoardProps()
  const { container } = render(<Board {...props} intro={{ ...introFixture(), onDone: () => {} }} />)
  const rail = container.querySelector('[class*="railLayer"]')
  expect(rail?.hasAttribute('inert')).toBe(false)
})

it('leaves the rail reachable when there is no intro at all', () => {
  const props = makeBoardProps()
  const { container } = render(<Board {...props} />)
  const rail = container.querySelector('[class*="railLayer"]')
  expect(rail?.hasAttribute('inert')).toBe(false)
})

it('names the moment in the dock instead of a player', () => {
  // Not reduced: the sequencer arms itself in a layout effect, so the very
  // first committed frame is already the running intro.
  motion.reduced = false
  const props = makeBoardProps()
  render(<Board {...props} intro={{ ...introFixture(), onDone: () => {} }} />)
  // getAllBy: the dock's Swap renders an invisible sizer copy of the widest
  // phase string alongside the live one, and "game start" is that widest.
  expect(screen.getAllByText(props.copy.turnDock.gameStart).length).toBeGreaterThan(0)
  motion.reduced = true
})

// The handover's other half. Task 10 made the shadow's last frame carry the
// projection's own DATA; this asserts the board's RENDERING of it is the same
// too — the intro's final state differs from the live one by `introPhase`
// alone, so if any class, style or branch keyed off it, the switch would
// flicker on a state that is otherwise identical.
it("renders a 'settling' state byte for byte as it renders a live one", () => {
  const props = makeBoardProps()
  const live = render(<Board {...props} />).container.innerHTML
  const settling = render(<Board {...props} state={{ ...props.state, introPhase: 'settling' }} />)
    .container.innerHTML
  expect(settling).toBe(live)
})

it('renders the live board when no intro is given', () => {
  motion.reduced = true
  const props = makeBoardProps()
  render(<Board {...props} />)
  expect(screen.queryAllByText(props.copy.turnDock.gameStart)).toHaveLength(0)
})
