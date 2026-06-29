import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import LanguageSwitch from './LanguageSwitch'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { resolvedLanguage: 'en', changeLanguage: () => Promise.resolve() },
  }),
}))

it('renders both language options', () => {
  render(<LanguageSwitch />)
  expect(screen.getByText('en')).toBeTruthy()
  expect(screen.getByText('ru')).toBeTruthy()
})
