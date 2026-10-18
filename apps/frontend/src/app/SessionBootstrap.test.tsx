import { fireEvent, render, screen } from '@testing-library/react'
import { useLayoutEffect } from 'react'
import { MemoryRouter, Outlet, Route, Routes, useLocation } from 'react-router'
import { beforeEach, expect, it, vi } from 'vitest'
import FollowGameStart from './FollowGameStart'
import SessionBootstrap from './SessionBootstrap'

const reconnectCopy = {
  label: 'restoring session',
  retry: 'retry',
  leave: 'leave',
  confirmLeave: 'confirm leave',
  cancel: 'cancel',
  abortPrompt: 'abort?',
  roomFull: 'room full',
}
vi.mock('@release/translation', () => ({
  useTranslation: () => ({ t: () => reconnectCopy }),
}))

const retry = vi.fn()
const leaveSession = vi.fn()
let session: ReturnType<typeof initialSession>
const mounted: string[] = []
function initialSession() {
  return {
    bootstrapping: true,
    state: null as { hostId: string; peers: Record<string, { id: string }> } | null,
    status: 'idle' as 'idle' | 'connecting' | 'in-lobby' | 'error',
    gameId: null as string | null,
    roomCode: null as string | null,
    errorKind: null,
    reconnect: {
      status: 'idle' as 'idle' | 'trying' | 'failed',
      attempt: 0,
      maxAttempts: 5,
      retry,
    },
    leaveSession,
  }
}
vi.mock('./providers/SessionProvider', () => ({ useSession: () => session }))

function Page({ name }: { name: string }) {
  const { pathname, state } = useLocation()
  useLayoutEffect(() => {
    mounted.push(`${name}:${pathname}`)
  }, [name, pathname])
  return (
    <div>
      {name}:{pathname}:{String(state?.resumed ?? false)}
    </div>
  )
}

function Harness({ entry = '/lobby/NEW-123' }: { entry?: string }) {
  return (
    <MemoryRouter initialEntries={[entry]}>
      <Routes>
        <Route
          element={
            <>
              <FollowGameStart />
              <SessionBootstrap>
                <Outlet />
              </SessionBootstrap>
            </>
          }
        >
          <Route path="/lobby/:code" element={<Page name="invite" />} />
          <Route path="/board/:gameId" element={<Page name="board" />} />
          <Route path="/start" element={<Page name="start" />} />
        </Route>
      </Routes>
    </MemoryRouter>
  )
}

beforeEach(() => {
  session = initialSession()
  mounted.length = 0
  vi.clearAllMocks()
})

it('does not mount the invitation before the initial session check completes', () => {
  const ui = render(<Harness />)
  expect(mounted).toEqual([])
  expect(screen.getByText('restoring session')).toBeTruthy()

  session = { ...session, bootstrapping: false }
  ui.rerender(<Harness />)
  expect(mounted).toEqual(['invite:/lobby/NEW-123'])
})

it('mounts only the recovered board when a host or guest match is restored', () => {
  const ui = render(<Harness />)
  session = {
    ...session,
    bootstrapping: false,
    status: 'in-lobby',
    roomCode: 'OLD-123',
    gameId: 'old-1',
  }
  ui.rerender(<Harness />)
  expect(mounted).toEqual(['board:/board/old-1'])
})

it('replaces the invitation with the restored lobby before mounting it', () => {
  const ui = render(<Harness />)
  session = { ...session, bootstrapping: false, status: 'in-lobby', roomCode: 'OLD-123' }
  ui.rerender(<Harness />)
  expect(mounted).toEqual(['invite:/lobby/OLD-123'])
  expect(screen.getByText('invite:/lobby/OLD-123:true')).toBeTruthy()
})

it('keeps a failed guest reconnect actionable without mounting the invitation', () => {
  session = {
    ...session,
    bootstrapping: false,
    status: 'error',
    reconnect: { ...session.reconnect, status: 'failed' },
  }
  render(<Harness />)
  expect(mounted).toEqual([])
  fireEvent.click(screen.getByRole('button', { name: /retry/ }))
  expect(retry).toHaveBeenCalledOnce()
  fireEvent.click(screen.getByRole('button', { name: /leave/ }))
  fireEvent.click(screen.getByRole('button', { name: /confirm leave/ }))
  expect(leaveSession).toHaveBeenCalledOnce()
  expect(mounted).toEqual(['start:/start'])
})

it('lets the player leave while host recovery is still in flight', () => {
  render(<Harness />)
  fireEvent.click(screen.getByRole('button', { name: /leave/ }))
  fireEvent.click(screen.getByRole('button', { name: /confirm leave/ }))
  expect(leaveSession).toHaveBeenCalledOnce()
  expect(mounted).toEqual(['start:/start'])
})

it('does not gate later session operations after a cold start', () => {
  session = { ...session, bootstrapping: false }
  const ui = render(<Harness />)
  session = {
    ...session,
    status: 'connecting',
    reconnect: { ...session.reconnect, status: 'trying' },
  }
  ui.rerender(<Harness />)
  expect(screen.queryByText('restoring session')).toBeNull()
  expect(mounted).toEqual(['invite:/lobby/NEW-123'])
})

it('waits for the restored guest roster before mounting the lobby', () => {
  session = {
    ...session,
    bootstrapping: false,
    status: 'in-lobby',
    roomCode: 'OLD-123',
    state: { hostId: 'host', peers: {} },
  }
  const ui = render(<Harness />)
  expect(mounted).toEqual([])
  session = { ...session, state: { hostId: 'host', peers: { host: { id: 'host' } } } }
  ui.rerender(<Harness />)
  expect(mounted).toEqual(['invite:/lobby/OLD-123'])
})

it('marks a same-path restored lobby as resumed before mounting it', () => {
  const ui = render(<Harness entry="/lobby/OLD-123" />)
  session = { ...session, bootstrapping: false, status: 'in-lobby', roomCode: 'OLD-123' }
  ui.rerender(<Harness entry="/lobby/OLD-123" />)
  expect(mounted).toEqual(['invite:/lobby/OLD-123'])
  expect(screen.getByText('invite:/lobby/OLD-123:true')).toBeTruthy()
})
