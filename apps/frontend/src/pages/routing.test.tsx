import { render, screen } from '@testing-library/react'
import { createMemoryRouter, Outlet, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import NotFound from './404'
import Index from './index'
import StartPage from './start'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { resolvedLanguage: 'en', changeLanguage: () => Promise.resolve() },
  }),
}))

const routes = [
  {
    path: '/',
    Component: () => <Outlet />,
    children: [
      { index: true, Component: Index },
      { path: 'start', Component: StartPage },
      { path: '*', Component: NotFound },
    ],
  },
]

it('redirects unknown paths to the start page', async () => {
  const router = createMemoryRouter(routes, { initialEntries: ['/does-not-exist'] })
  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('start-page')).toBeTruthy()
})
