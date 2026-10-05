import { act, fireEvent, render } from '@testing-library/react'
import TurnDock, { type TurnDockCopy } from './TurnDock'

const copy: TurnDockCopy = {
  yourTurn: 'your turn',
  turnOf: 'opponent turn',
  reaction: 'reaction',
  reactionDanger: 'error 503',
  attack: 'attack',
  canAttack: 'their release is open to you',
  exposed: 'awaiting attack',
  draw: 'draw',
  push: 'PUSH',
  pass: 'pass',
  drawn: 'draw ✓',
  locked: 'PUSH after draw',
  canDefend: 'you can defend',
  underAttack: 'your release is exposed',
}

const dotsOf = (container: HTMLElement) =>
  [...container.querySelectorAll('[class*="dots"] > span')].map((d) => /dotLit/.test(d.className))

// the key ignores presses for a beat after it appears (inertia clicks)
const pastLockout = () => act(() => vi.advanceTimersByTime(400))

beforeEach(() => vi.useFakeTimers())
afterEach(() => vi.useRealTimers())

it('stands an attack that is out at the centre: the attack, its name, no key, no dots', () => {
  const { getAllByText, queryByTestId, container } = render(
    <TurnDock
      state="attacking"
      copy={copy}
      seconds={7}
      progress={0.7}
      activePlayer="switch"
      passes={{ total: 3, lit: 1 }}
    />,
  )
  expect(getAllByText('attack').length).toBeGreaterThan(0)
  expect(getAllByText('switch').length).toBeGreaterThan(0)
  expect(queryByTestId('dock-key')).toBeNull()
  expect(dotsOf(container)).toEqual([])
})

it('fills the pass dots from the right', () => {
  const { container } = render(
    <TurnDock
      state="attack"
      copy={copy}
      seconds={9}
      progress={0.6}
      passes={{ total: 3, lit: 2 }}
    />,
  )
  expect(dotsOf(container)).toEqual([false, true, true])
})

it('passes with the key, and takes the pass back with the lit key', () => {
  const onPass = vi.fn()
  const onUnpass = vi.fn()
  const dock = (passed: boolean) => (
    <TurnDock
      state="attack"
      copy={copy}
      seconds={9}
      progress={0.6}
      passed={passed}
      onPass={onPass}
      onUnpass={onUnpass}
    />
  )
  const { getByTestId, rerender } = render(dock(false))
  pastLockout()
  fireEvent.click(getByTestId('dock-key'))
  expect(onPass).toHaveBeenCalledTimes(1)

  rerender(dock(true))
  pastLockout()
  fireEvent.click(getByTestId('dock-key'))
  expect(onUnpass).toHaveBeenCalledTimes(1)
  expect(onPass).toHaveBeenCalledTimes(1)
})
