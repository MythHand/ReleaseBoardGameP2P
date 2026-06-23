import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import App from '~/pages/_app'
import NotFound from '~/pages/404'
import Index from '~/pages/index'
import StartPage from '~/pages/start'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { resolvedLanguage: 'en', changeLanguage: () => Promise.resolve() },
  }),
}))

// The generated route TREE can't be imported in Vitest (generouted builds it via
// import.meta.glob at Vite build time). This mirrors generouted's nesting — _app
// root layout with index/start and a catch-all — to verify the redirect behavior.
// The actual generated tree is verified by `pnpm --filter @release/web build`.
it('redirects unknown paths to the start page', async () => {
  const router = createMemoryRouter(
    [
      {
        element: <App />,
        children: [
          { index: true, element: <Index /> },
          { path: 'start', element: <StartPage /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
    { initialEntries: ['/does-not-exist'] },
  )
  render(<RouterProvider router={router} />)
  expect(await screen.findByText('start.createGame')).toBeTruthy()
})
