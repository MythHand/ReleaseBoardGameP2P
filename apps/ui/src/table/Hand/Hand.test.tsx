import { fireEvent, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { cardById } from '@/cards'
import Hand from './Hand'

const knownCard = (id: string) => {
  const card = cardById(id)
  if (!card) throw new Error(`missing test catalogue card: ${id}`)
  return card
}

it('does not initiate a fan drag while another interaction is carrying a card', () => {
  const onReorder = vi.fn()
  const { container } = render(
    <Hand
      items={[
        { uid: 'attack-bug#0', card: knownCard('attack-bug') },
        { uid: 'protection-debugger#0', card: knownCard('protection-debugger') },
      ]}
      carrying
      onReorder={onReorder}
    />,
  )
  const first = container.querySelectorAll<HTMLElement>('[data-hand-slot]')[0]

  fireEvent.mouseDown(first, { clientX: 0, clientY: 0 })
  fireEvent.mouseMove(window, { clientX: 20, clientY: 0 })

  expect(container.querySelectorAll('[data-hand-slot]')).toHaveLength(2)
  expect(onReorder).not.toHaveBeenCalled()
})
