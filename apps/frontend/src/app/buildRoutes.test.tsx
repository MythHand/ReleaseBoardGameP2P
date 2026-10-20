import { act, render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import { createModuleResource } from '~/shared/lib/moduleResource'
import { buildRoutes, type PageModule } from './buildRoutes'

it('keeps start eager and waits for both destination code and session before navigation', async () => {
  let resolvePage: (module: PageModule) => void = () => {}
  let resolveSession: () => void = () => {}
  let loads = 0
  const resources = {
    '/src/pages/board/[gameId]/index.tsx': createModuleResource(() => {
      loads++
      return new Promise<PageModule>((resolve) => {
        resolvePage = resolve
      })
    }),
  }
  const router = createMemoryRouter(
    buildRoutes(
      {
        '/src/pages/start.tsx': { default: () => <div>Start screen</div> },
      },
      resources,
      {
        requestSession: () =>
          new Promise<void>((resolve) => {
            resolveSession = resolve
          }),
      },
    ),
    { initialEntries: ['/start'] },
  )
  render(<RouterProvider router={router} />)
  expect(screen.getByText('Start screen')).toBeTruthy()
  expect(loads).toBe(0)
  let navigation: Promise<void>
  await act(async () => {
    navigation = router.navigate('/board/g1')
    await Promise.resolve()
  })
  expect(screen.getByText('Start screen')).toBeTruthy()
  await act(async () => {
    resolvePage({ default: () => <div>Game screen</div> })
    await Promise.resolve()
  })
  expect(screen.queryByText('Game screen')).toBeNull()
  await act(async () => {
    resolveSession()
    await navigation
  })
  expect(screen.getByText('Game screen')).toBeTruthy()
})
