import { render, screen } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router'
import BoardPage from './_layout'
import StatsPage from './stats'

it('keeps the board mounted and shows stats in its outlet', async () => {
  const router = createMemoryRouter(
    [
      {
        path: '/board/:gameId',
        element: <BoardPage />,
        children: [{ path: 'stats', element: <StatsPage /> }],
      },
    ],
    { initialEntries: ['/board/g1/stats'] },
  )
  render(<RouterProvider router={router} />)
  expect(await screen.findByTestId('board-page')).toBeTruthy()
  expect(await screen.findByTestId('stats-page')).toBeTruthy()
})
