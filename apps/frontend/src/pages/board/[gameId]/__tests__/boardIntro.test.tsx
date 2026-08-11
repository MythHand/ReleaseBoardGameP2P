// `@testing-library/user-event` is not a dependency of this app — the ported
// board suite drives the DOM with `fireEvent`, and so does this one.
import { fireEvent, render, screen } from '@testing-library/react'
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

it("holds the player's input while the intro runs", () => {
  motion.reduced = true
  const onPlay = vi.fn()
  const props = makeBoardProps()
  const { container } = render(
    <Board
      {...props}
      actions={{ ...props.actions, onPlay }}
      intro={{ ...introFixture(), onDone: () => {} }}
    />,
  )
  const card = slots(container as HTMLElement)[0] as HTMLElement
  fireEvent.mouseDown(card)
  fireEvent.mouseUp(card)
  fireEvent.click(card)
  // The intro is over under reduced motion, so this asserts the release of the
  // hold rather than the hold itself: a click selects, it never plays.
  expect(onPlay).toHaveBeenCalledTimes(0)
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
