import { act, fireEvent, render, screen } from '@testing-library/react'
import { useEffect } from 'react'
import { MemoryRouter, useSearchParams } from 'react-router'
import type { UseLobby } from '~/network/useLobby'
import { clearSession } from '~/shared/lib/sessionPersistence'
import SessionActivation, { SessionRestore } from './SessionActivation'
import { SessionProvider } from './SessionProvider'
import { createSessionStore, type SessionRuntimeComponent } from './sessionStore'

afterEach(() => clearSession())

it('keeps the start mounted when a closed modal finishes activating the runtime', async () => {
  let loads = 0
  let mounts = 0
  let resolveRuntime: (module: { default: SessionRuntimeComponent }) => void = () => {}
  const store = createSessionStore(() => {
    loads++
    return new Promise((resolve) => {
      resolveRuntime = resolve
    })
  })
  function Start() {
    const [, setParams] = useSearchParams()
    useEffect(() => {
      mounts++
    }, [])
    return (
      <>
        <input aria-label="name" />
        <button type="button" onClick={() => setParams({ modal: 'create' })}>
          open
        </button>
        <button type="button" onClick={() => setParams({})}>
          close
        </button>
      </>
    )
  }
  render(
    <SessionProvider store={store}>
      <MemoryRouter initialEntries={['/start']}>
        <SessionActivation />
        <SessionRestore>
          <Start />
        </SessionRestore>
      </MemoryRouter>
    </SessionProvider>,
  )
  expect(loads).toBe(0)
  fireEvent.change(screen.getByLabelText('name'), { target: { value: 'Ann' } })
  fireEvent.click(screen.getByText('open'))
  await vi.waitFor(() => expect(loads).toBe(1))
  fireEvent.click(screen.getByText('close'))
  await act(async () => {
    resolveRuntime({ default: () => null })
    await Promise.resolve()
    store.publish({ gameId: null } as UseLobby)
  })
  expect(mounts).toBe(1)
  expect((screen.getByLabelText('name') as HTMLInputElement).value).toBe('Ann')
})
