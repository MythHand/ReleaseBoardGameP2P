import { render, screen } from '@testing-library/react'
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
