import { render } from '@testing-library/react'
import ScreenShell from './ScreenShell'

const COPY = {
  title: 'Printed edition',
  lead: 'lead',
  order: 'order',
  linkLabel: 'on Instagram',
  imageAlt: 'box',
}

it('renders the column body passed as children', () => {
  const { getByText } = render(
    <ScreenShell tags={['tag one']} description="A description.">
      <button type="button">Column body</button>
    </ScreenShell>,
  )
  expect(getByText('Column body')).toBeTruthy()
})

it('renders the tags and the description', () => {
  const { getByText } = render(
    <ScreenShell tags={['tag one', 'tag two']} description="A description." />,
  )
  expect(getByText('tag one')).toBeTruthy()
  expect(getByText('tag two')).toBeTruthy()
  expect(getByText('A description.')).toBeTruthy()
})

it('draws the language corner only when both lang and onLangChange are given', () => {
  const { queryByText, rerender } = render(<ScreenShell tags={[]} description="d" lang="ru" />)
  expect(queryByText('ru')).toBeNull()

  rerender(<ScreenShell tags={[]} description="d" lang="ru" onLangChange={() => {}} />)
  expect(queryByText('ru')).toBeTruthy()
})

it('draws the printed-edition block only when its copy is given', () => {
  const { queryByText, rerender } = render(<ScreenShell tags={[]} description="d" />)
  expect(queryByText('Printed edition')).toBeNull()

  rerender(<ScreenShell tags={[]} description="d" physicalEditionCopy={COPY} />)
  expect(queryByText('Printed edition')).toBeTruthy()
})

it('renders extra corner blocks', () => {
  const { getByText } = render(
    <ScreenShell tags={[]} description="d" corners={<span>Credits</span>} />,
  )
  expect(getByText('Credits')).toBeTruthy()
})
