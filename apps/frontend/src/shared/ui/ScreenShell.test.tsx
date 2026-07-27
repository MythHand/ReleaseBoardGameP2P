import { render } from '@testing-library/react'
import { vi } from 'vitest'
import ScreenShell from './ScreenShell'

const PHYSICAL = {
  title: 'Printed edition',
  lead: 'lead',
  order: 'order',
  linkLabel: 'on Instagram',
  imageAlt: 'box',
}

// ScreenShell reads the printed-edition copy from the catalog itself, so the
// mock has to honour returnObjects rather than echoing the key back.
vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    t: (k: string, opts?: { returnObjects?: boolean }) =>
      opts?.returnObjects && k === 'physicalEdition' ? PHYSICAL : k,
    i18n: { resolvedLanguage: 'en' },
  }),
}))

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

it('always draws the printed-edition block, with copy from the catalog', () => {
  const { getByText } = render(<ScreenShell tags={[]} description="d" />)
  expect(getByText('Printed edition')).toBeTruthy()
  expect(getByText('on Instagram')).toBeTruthy()
})

it('renders extra corner blocks', () => {
  const { getByText } = render(
    <ScreenShell tags={[]} description="d" corners={<span>Credits</span>} />,
  )
  expect(getByText('Credits')).toBeTruthy()
})
