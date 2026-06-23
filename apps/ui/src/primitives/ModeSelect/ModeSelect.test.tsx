import { render } from '@testing-library/react'
import ModeSelect from './ModeSelect'

const options = [
  { value: 'a', label: 'Option A', desc: 'Desc A' },
  { value: 'b', label: 'Option B', desc: 'Desc B' },
]

it('renders one button per option', () => {
  const { getAllByRole } = render(<ModeSelect title="Test" options={options} value="a" />)
  expect(getAllByRole('button').length).toBe(2)
})

it('disables all buttons when the disabled prop is set', () => {
  const { getAllByRole } = render(<ModeSelect title="Test" options={options} value="a" disabled />)
  for (const btn of getAllByRole('button') as HTMLButtonElement[]) {
    expect(btn.disabled).toBe(true)
  }
})

it('does not call onChange when disabled', () => {
  const onChange = vi.fn()
  const { getAllByRole } = render(
    <ModeSelect title="Test" options={options} value="a" disabled onChange={onChange} />,
  )
  ;(getAllByRole('button')[0] as HTMLButtonElement).click()
  expect(onChange).not.toHaveBeenCalled()
})
