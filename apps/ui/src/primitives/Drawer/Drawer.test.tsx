import { fireEvent, render, waitFor } from '@testing-library/react'
import Drawer from './Drawer'
import styles from './Drawer.module.css'

// A tab change under an open panel fades the old content out beside the new one
// (owner, 25.09) — and the old one is the SAME node that was on screen, not a
// fresh copy of it, or a scrolled list would jump back to its top as it fades.
it('keeps the old content on screen, as the same node, while a new tab arrives', () => {
  const { container, getByText, rerender } = render(
    <Drawer open contentKey="history">
      <p>history</p>
    </Drawer>,
  )
  const before = getByText('history')

  rerender(
    <Drawer open contentKey="rules">
      <p>rules</p>
    </Drawer>,
  )

  expect(getByText('history')).toBe(before)
  expect(before.parentElement?.className).toContain(styles.leaving)
  expect(before.parentElement?.hasAttribute('inert')).toBe(true)
  expect(getByText('rules').parentElement?.className).toContain(styles.entering)

  // the fade over, only the new content is left. jsdom's style object has no
  // `animation` property, so React listens under the prefixed name there.
  fireEvent(before.parentElement as HTMLElement, new Event('webkitAnimationEnd', { bubbles: true }))
  expect(container.textContent).toBe('rules')
})

// The rules stalled the widening they were built during (owner, 25.09): a
// prebuilt tab is up before anyone asks for it, and opening it shows that very
// node rather than building another.
it('builds a prebuilt tab ahead, hidden, and shows the same node when asked', async () => {
  const prebuilt = { rules: { node: <p>rules</p>, width: 680 } }
  const { getByText, rerender } = render(
    <Drawer open={false} contentKey={null} prebuilt={prebuilt}>
      {null}
    </Drawer>,
  )
  const ahead = await waitFor(() => getByText('rules'))
  expect(ahead.parentElement?.className).toContain(styles.waiting)
  expect(ahead.parentElement?.hasAttribute('inert')).toBe(true)

  rerender(
    <Drawer open contentKey="rules" prebuilt={prebuilt}>
      {null}
    </Drawer>,
  )
  expect(getByText('rules')).toBe(ahead)
  expect(ahead.parentElement?.className).not.toContain(styles.waiting)
  expect(ahead.parentElement?.hasAttribute('inert')).toBe(false)
})

// Opened onto a tab of another width, the panel used to change width while
// sliding out, and the content lagged behind its edge (owner, 25.09): the width
// is taken at once on the commit the panel comes out in, and travels only
// between tabs of a panel that is already out.
it('takes the new width at once when it comes out, and animates it only once out', () => {
  const { container, rerender } = render(
    <Drawer open={false} width={680} contentKey={null}>
      {null}
    </Drawer>,
  )
  const drawer = container.firstElementChild as HTMLElement

  rerender(
    <Drawer open width={420} contentKey="participants">
      <p>participants</p>
    </Drawer>,
  )
  expect(drawer.className).toContain(styles.arriving)

  rerender(
    <Drawer open width={680} contentKey="rules">
      <p>rules</p>
    </Drawer>,
  )
  expect(drawer.className).not.toContain(styles.arriving)
})

it('fades nothing when the panel opens straight onto another tab', () => {
  const { container, rerender } = render(
    <Drawer open={false} contentKey="history">
      <p>history</p>
    </Drawer>,
  )
  rerender(
    <Drawer open contentKey="rules">
      <p>rules</p>
    </Drawer>,
  )
  expect(container.textContent).toBe('rules')
  expect(container.querySelector(`.${styles.leaving}`)).toBeNull()
})

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
