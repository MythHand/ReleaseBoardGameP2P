import { fireEvent, render } from '@testing-library/react'
import { vi } from 'vitest'
import type { Card } from '@/cards/types'
import type { HandItem } from '@/table/Hand/Hand'
import type { TablePending } from '../intents'
import PendingPrompt, { type PendingPromptCopy } from './PendingPrompt'

const makeCard = (id: string): Card => ({
  id,
  name: id,
  category: 'attack',
  deck: 'base',
  art: '',
  tags: [],
  qty: 1,
})

const hand: HandItem[] = [
  { uid: 'c1', card: makeCard('attack-bug') },
  { uid: 'c2', card: makeCard('release-frontend') },
]

const copy: PendingPromptCopy = {
  confirm: 'Confirm',
  decline: 'Decline',
  discardForRelease: { prompt: 'Discard a card to fund the release', action: 'Discard' },
  defend: { prompt: 'Block the attack', action: 'Block' },
  neutralize503: { prompt: 'Neutralize the 503', action: 'Neutralize' },
  crush: { prompt: 'Crush the release', action: 'Crush' },
  requestCard: { prompt: 'Request a card', action: 'Request' },
  giveCard: { prompt: 'Give up a card', action: 'Give' },
  handLimit: { prompt: 'Discard down to the hand limit', action: 'Discard' },
}

const defendPending: TablePending = {
  kind: 'defend',
  player: 'you',
  attacker: 'p2',
  attackCard: 'attack-bug',
  sudo: false,
  options: ['c1', 'c2'],
  openedAt: 0,
  deadline: 10_000,
  scope: 'hand',
}

it('resolves discardForRelease with the picked card', () => {
  const onResolve = vi.fn()
  const { getAllByRole, getByRole } = render(
    <PendingPrompt
      pending={{ kind: 'discardForRelease', player: 'you', options: ['c1', 'c2'] }}
      hand={[
        { uid: 'c1', card: { id: 'attack-bug' } as Card },
        { uid: 'c2', card: { id: 'release-frontend' } as Card },
      ]}
      copy={copy}
      onResolve={onResolve}
    />,
  )
  fireEvent.click(getAllByRole('option')[1])
  fireEvent.click(getByRole('button', { name: copy.confirm }))
  expect(onResolve).toHaveBeenCalledWith({ kind: 'discardForRelease', card: 'c2' })
})

it('lets you decline a defence explicitly', () => {
  const onResolve = vi.fn()
  const { getByRole } = render(
    <PendingPrompt pending={defendPending} hand={hand} copy={copy} onResolve={onResolve} />,
  )
  fireEvent.click(getByRole('button', { name: copy.decline }))
  expect(onResolve).toHaveBeenCalledWith({ kind: 'defend', card: null })
})

it('keeps confirm inert until a selection exists', () => {
  const { getByRole } = render(
    <PendingPrompt pending={defendPending} hand={hand} copy={copy} onResolve={vi.fn()} />,
  )
  expect(getByRole('button', { name: copy.confirm })).toHaveProperty('disabled', true)
})
