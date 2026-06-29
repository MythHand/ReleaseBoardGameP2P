import { render } from '@testing-library/react'
import scale from '../../design/typography.module.css'
import Typography from './Typography'

it('applies the variant base + tk scale classes', () => {
  const { getByText } = render(<Typography variant="tag">PLAY</Typography>)
  const el = getByText('PLAY')
  expect(el.classList.contains(scale.label)).toBe(true)
  expect(el.classList.contains(scale['tk-16'])).toBe(true)
})

it('renders the variant default tag', () => {
  const { getByText } = render(<Typography variant="pageTitle">Title</Typography>)
  expect(getByText('Title').tagName).toBe('H1')
})

it('renders a variant without tk using only its base class', () => {
  const { getByText } = render(<Typography variant="body">Text</Typography>)
  const el = getByText('Text')
  expect(el.classList.contains(scale['body-lg'])).toBe(true)
  expect(el.tagName).toBe('P')
})

it('supports the raw base + tk escape hatch (defaults to span)', () => {
  const { getByText } = render(
    <Typography base="mono-strong" tk="tk-02">
      Solo
    </Typography>,
  )
  const el = getByText('Solo')
  expect(el.classList.contains(scale['mono-strong'])).toBe(true)
  expect(el.classList.contains(scale['tk-02'])).toBe(true)
  expect(el.tagName).toBe('SPAN')
})

it('overrides the element via the as prop', () => {
  const { getByText } = render(
    <Typography variant="tag" as="div">
      X
    </Typography>,
  )
  expect(getByText('X').tagName).toBe('DIV')
})

it('passes className through alongside the scale classes', () => {
  const { getByText } = render(
    <Typography variant="tag" className="text-cat-release">
      X
    </Typography>,
  )
  const el = getByText('X')
  expect(el.classList.contains('text-cat-release')).toBe(true)
  expect(el.classList.contains(scale.label)).toBe(true)
})
