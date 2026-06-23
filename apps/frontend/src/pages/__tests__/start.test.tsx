import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import StartPage from '../start'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

it('renders the @release/ui Start screen with mapped copy', () => {
  // t() is mocked to echo keys; <Start> renders the createGame CTA on its main view.
  render(<StartPage />)
  expect(screen.getByText('start.createGame')).toBeTruthy()
})
