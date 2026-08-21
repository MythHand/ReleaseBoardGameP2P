import { fireEvent, render } from '@testing-library/react'
import { expect, it } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

// The projection stands an attack at the centre: a defence is owed by us, so
// the pending render puts the attacked card in the attack slot.
const withAttack = () => {
  const base = makeBoardProps()
  return makeBoardProps({
    state: {
      ...base.state,
      pending: {
        kind: 'defend',
        player: base.state.selfId,
        attacker: 'p2',
        attackCard: 'attack-bug',
        sudo: false,
        options: [],
        openedAt: 0,
        deadline: 0,
        scope: 'release',
      },
    },
  })
}

it('reads the card standing at the centre when the pointer is on its slot', () => {
  render(<Board {...withAttack()} />)
  const slot = document.querySelector('[data-centre-slot="attack"]') as HTMLElement
  expect(slot.hasAttribute('data-card-preview-src')).toBe(true)
  fireEvent.mouseEnter(slot)
  const preview = document.querySelector('[data-card-preview]')
  expect(preview).toBeTruthy()
  expect(preview?.querySelector('[data-card]')?.getAttribute('data-card')).toBe('attack-bug')
})

it('reads nothing from an empty slot', () => {
  render(<Board {...makeBoardProps()} />)
  const slot = document.querySelector('[data-centre-slot="cover"]') as HTMLElement
  fireEvent.mouseEnter(slot)
  expect(document.querySelector('[data-card-preview]')).toBeNull()
})
