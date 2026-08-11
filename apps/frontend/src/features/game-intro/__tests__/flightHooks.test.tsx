import { cardById } from '@release/ui'
import { render } from '@testing-library/react'
import { createRef } from 'react'
import { expect, it } from 'vitest'
import { useFlyer } from '../useFlyer'
import { useHandArrival } from '../useHandArrival'

// jsdom has no layout and no WAAPI, so this asserts what a port can break:
// the hooks mount, render their overlay, and expose their surface.
function Probe() {
  const flyer = useFlyer()
  const handRef = createRef<HTMLDivElement>()
  const arrival = useHandArrival(handRef, () => {})
  return (
    <div>
      <div data-testid="surface">
        {typeof flyer.raise}:{typeof flyer.drop}:{typeof arrival.arrive}
      </div>
      {flyer.overlay}
      {arrival.overlay}
    </div>
  )
}

it('mounts both flight hooks and exposes their surface', () => {
  const { getByTestId } = render(<Probe />)
  expect(getByTestId('surface').textContent).toBe('function:function:function')
})

it('resolves a card id the deal will fly', () => {
  // The port must keep reading the same catalogue the story read.
  expect(cardById('protection-debugger')).toBeTruthy()
})
