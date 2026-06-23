import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { vi } from 'vitest'
import App from '~/pages/_app'
import NotFound from '~/pages/404'
import Index from '~/pages/index'

vi.mock('@release/translation', () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: { resolvedLanguage: 'en', changeLanguage: () => Promise.resolve() },
  }),
}))

// The generated route TREE can't be imported in Vitest (generouted builds it via
// import.meta.glob at Vite build time). This mirrors generouted's nesting — _app
// root layout with the index landing and a catch-all — to verify routing. The
// actual generated tree is verified by `pnpm --filter @release/web build`.
function routerFor(path: string) {
  return createMemoryRouter(
    [
      {
        element: <App />,
        children: [
          { index: true, element: <Index /> },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
    { initialEntries: [path] },
  )
}

it('renders the landing at /', () => {
  render(<RouterProvider router={routerFor('/')} />)
  expect(screen.getByText('start.description')).toBeTruthy()
})

it('redirects unknown paths to the landing', async () => {
  render(<RouterProvider router={routerFor('/does-not-exist')} />)
  expect(await screen.findByText('start.description')).toBeTruthy()
})
