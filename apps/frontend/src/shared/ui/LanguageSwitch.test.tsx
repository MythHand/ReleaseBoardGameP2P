import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import LanguageSwitch from './LanguageSwitch'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { resolvedLanguage: 'en', changeLanguage: () => Promise.resolve() },
  }),
}))

it('renders both language buttons', () => {
  render(<LanguageSwitch />)
  expect(screen.getByText('language.en')).toBeTruthy()
  expect(screen.getByText('language.ru')).toBeTruthy()
})
