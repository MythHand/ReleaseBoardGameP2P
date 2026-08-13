import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

// The board has no intro in these: the anchors belong to the board, not to the
// opening, and that is the whole point of the registry existing.
vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => true }))

it('gives the discard a box for a flight to aim at', () => {
  const { container } = render(<Board {...makeBoardProps()} />)
  // Pile puts boxRef on its .stack — the card box, not the labelled cell (I6).
  const discard = container.querySelector('[class*="discard"] [class*="stack"]')
  expect(discard).toBeTruthy()
})

it('marks a slot for every card in the hand', () => {
  const props = makeBoardProps()
  const { container } = render(<Board {...props} />)
  expect(container.querySelectorAll('[data-hand-slot]')).toHaveLength(props.state.you.hand.length)
})

it('binds a release slot for the player and for every opponent', () => {
  const props = makeBoardProps()
  const { container } = render(<Board {...props} />)
  // One zone of the player's own plus one per seat — the anchors need a node per
  // owner, because a destroyed card leaves the slot it stood in.
  const zones = container.querySelectorAll('[class*="zone"], [class*="releaseZone"]')
  expect(zones.length).toBeGreaterThanOrEqual(1 + props.state.opponents.length)
})
