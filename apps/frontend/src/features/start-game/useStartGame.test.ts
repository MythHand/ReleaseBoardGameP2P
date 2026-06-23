import { renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { useStartGame } from './useStartGame'

const navigate = vi.fn()
vi.mock('react-router', () => ({ useNavigate: () => navigate }))
vi.mock('~/app/lib/viewTransition', () => ({
  runViewTransition: (update: () => void) => update(),
}))
vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => ({ state: { hostId: 'host-peer-1' } }),
}))

it('navigates to the board route keyed by the host id', () => {
  const { result } = renderHook(() => useStartGame())
  result.current()
  expect(navigate).toHaveBeenCalledWith('/board/host-peer-1', { viewTransition: true })
})
