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

// …AND EVERY OTHER CARD THAT STANDS THERE. The slot used to name two cases,
// an attack and a 503 alarm, so an operation waiting at the centre for its own
// effect — a git card, which anyone at the table might want to read — could not
// be read by anybody (#168). What the preview offers is now whatever is
// standing, named once beside the renders that put it there.
it('reads a git operation standing at the centre while its effect is open', () => {
  const base = makeBoardProps()
  const props = makeBoardProps({
    state: {
      ...base.state,
      pending: {
        kind: 'pickFromDiscard',
        player: 'p2',
        source: 'operation-git-cherry-pick',
        picks: 1,
        options: [],
      },
    },
  })
  render(<Board {...props} />)
  const slot = document.querySelector('[data-centre-slot="attack"]') as HTMLElement
  fireEvent.mouseEnter(slot)
  const preview = document.querySelector('[data-card-preview]')
  expect(preview?.querySelector('[data-card]')?.getAttribute('data-card')).toBe(
    'operation-git-cherry-pick',
  )
})

it('reads nothing from an empty slot', () => {
  render(<Board {...makeBoardProps()} />)
  const slot = document.querySelector('[data-centre-slot="cover"]') as HTMLElement
  fireEvent.mouseEnter(slot)
  expect(document.querySelector('[data-card-preview]')).toBeNull()
})
