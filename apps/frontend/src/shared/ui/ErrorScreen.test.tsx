import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import ErrorScreen from './ErrorScreen'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({ t: (k: string) => k }),
}))

it('shows the fallback copy and recovery actions', () => {
  render(<ErrorScreen error={new Error('boom')} />)
  expect(screen.getByText('error.title')).toBeTruthy()
  expect(screen.getByText('error.reload')).toBeTruthy()
  expect(screen.getByText('error.backToStart')).toBeTruthy()
})
