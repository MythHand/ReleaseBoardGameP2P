import { fireEvent, render } from '@testing-library/react'
import Input from './Input'

it('renders the label text', () => {
  const { getByText } = render(<Input label="Your nickname" />)
  expect(getByText('Your nickname')).toBeTruthy()
})

it('passes props to the input element', () => {
  const { getByRole } = render(<Input label="Code" placeholder="ABC-123" maxLength={10} />)
  const input = getByRole('textbox') as HTMLInputElement
  expect(input.placeholder).toBe('ABC-123')
  expect(input.maxLength).toBe(10)
})

it('calls onChange when the input value changes', () => {
  const onChange = vi.fn()
  const { getByRole } = render(<Input label="Name" onChange={onChange} />)
  fireEvent.change(getByRole('textbox'), { target: { value: 'dimbo' } })
  expect(onChange).toHaveBeenCalledOnce()
})

it('associates the label with the input via htmlFor', () => {
  const { getByLabelText } = render(<Input label="Nickname" />)
  expect(getByLabelText('Nickname')).toBeTruthy()
})

it('marks the field invalid via aria-invalid, with no message under the field', () => {
  const { getByRole, queryByText } = render(<Input label="Name" error="Required" />)
  // error feedback is aria-invalid + a shake (driven by the Form), not a message
  expect(getByRole('textbox').getAttribute('aria-invalid')).toBe('true')
  expect(queryByText('Required')).toBeNull()
})

it('renders trailing element inside a row wrapper', () => {
  const { getByText } = render(
    <Input label="Link" trailing={<button type="button">Copy</button>} />,
  )
  expect(getByText('Copy')).toBeTruthy()
})
