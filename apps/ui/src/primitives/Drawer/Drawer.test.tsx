import { render } from '@testing-library/react'
import Drawer from './Drawer'

it('makes a closed drawer inert so controls behind it stay interactive', () => {
  const { container, rerender } = render(
    <Drawer open={false}>
      <button type="button">inside</button>
    </Drawer>,
  )

  const drawer = container.firstElementChild as HTMLElement
  expect(drawer.hasAttribute('inert')).toBe(true)

  rerender(
    <Drawer open>
      <button type="button">inside</button>
    </Drawer>,
  )
  expect(drawer.hasAttribute('inert')).toBe(false)
})
