import { fireEvent, render } from '@testing-library/react'
import InputField from './InputField'

it('renders the label text', () => {
  const { getByText } = render(<InputField label="Your nickname" />)
  expect(getByText('Your nickname')).toBeTruthy()
})

it('passes props to the input element', () => {
  const { getByRole } = render(<InputField label="Code" placeholder="ABC-123" maxLength={10} />)
  const input = getByRole('textbox') as HTMLInputElement
  expect(input.placeholder).toBe('ABC-123')
  expect(input.maxLength).toBe(10)
})

it('calls onChange when the input value changes', () => {
  const onChange = vi.fn()
  const { getByRole } = render(<InputField label="Name" onChange={onChange} />)
  fireEvent.change(getByRole('textbox'), { target: { value: 'dimbo' } })
  expect(onChange).toHaveBeenCalledOnce()
})

it('wraps the input inside a label element', () => {
  const { getByRole } = render(<InputField label="Nickname" />)
  expect(getByRole('textbox').closest('label')).toBeTruthy()
})
