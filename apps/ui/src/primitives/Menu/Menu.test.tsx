import { act, fireEvent, render } from '@testing-library/react'
import Menu from './Menu'
import MenuButton from './MenuButton'

it('renders a nav with role="menu"', () => {
  const { getByRole } = render(
    <Menu>
      <MenuButton>Item</MenuButton>
    </Menu>,
  )
  expect(getByRole('menu')).toBeTruthy()
})

it('gives MenuButton role="menuitem" when inside Menu', () => {
  const { getAllByRole } = render(
    <Menu>
      <MenuButton>Alpha</MenuButton>
      <MenuButton>Beta</MenuButton>
    </Menu>,
  )
  expect(getAllByRole('menuitem').length).toBe(2)
})

it('gives MenuButton role="button" when used standalone', () => {
  const { getByRole } = render(<MenuButton>Standalone</MenuButton>)
  expect(getByRole('button')).toBeTruthy()
})

it('moves focus to the next item on ArrowDown', () => {
  const { getAllByRole, getByRole } = render(
    <Menu>
      <MenuButton>First</MenuButton>
      <MenuButton>Second</MenuButton>
      <MenuButton>Third</MenuButton>
    </Menu>,
  )
  const [first, second] = getAllByRole('menuitem') as HTMLButtonElement[]
  act(() => {
    first.focus()
  })
  fireEvent.keyDown(getByRole('menu'), { key: 'ArrowDown' })
  expect(document.activeElement).toBe(second)
})

it('wraps from the last item to the first on ArrowDown', () => {
  const { getAllByRole, getByRole } = render(
    <Menu>
      <MenuButton>First</MenuButton>
      <MenuButton>Last</MenuButton>
    </Menu>,
  )
  const [first, last] = getAllByRole('menuitem') as HTMLButtonElement[]
  act(() => {
    last.focus()
  })
  fireEvent.keyDown(getByRole('menu'), { key: 'ArrowDown' })
  expect(document.activeElement).toBe(first)
})

it('moves focus to the previous item on ArrowUp', () => {
  const { getAllByRole, getByRole } = render(
    <Menu>
      <MenuButton>First</MenuButton>
      <MenuButton>Second</MenuButton>
    </Menu>,
  )
  const [first, second] = getAllByRole('menuitem') as HTMLButtonElement[]
  act(() => {
    second.focus()
  })
  fireEvent.keyDown(getByRole('menu'), { key: 'ArrowUp' })
  expect(document.activeElement).toBe(first)
})

it('wraps from the first item to the last on ArrowUp', () => {
  const { getAllByRole, getByRole } = render(
    <Menu>
      <MenuButton>First</MenuButton>
      <MenuButton>Last</MenuButton>
    </Menu>,
  )
  const [first, last] = getAllByRole('menuitem') as HTMLButtonElement[]
  act(() => {
    first.focus()
  })
  fireEvent.keyDown(getByRole('menu'), { key: 'ArrowUp' })
  expect(document.activeElement).toBe(last)
})

it('calls onClick when a MenuButton is clicked', () => {
  const onClick = vi.fn()
  const { getAllByRole } = render(
    <Menu>
      <MenuButton onClick={onClick}>Click me</MenuButton>
    </Menu>,
  )
  ;(getAllByRole('menuitem')[0] as HTMLButtonElement).click()
  expect(onClick).toHaveBeenCalledOnce()
})
