import type { UseLobby } from '~/network/useLobby'
import { createSessionStore } from './sessionStore'

it('activates one runtime and becomes ready only after its first publication', async () => {
  let loads = 0
  const Runtime = () => null
  const store = createSessionStore(async () => {
    await Promise.resolve()
    loads++
    return { default: Runtime }
  })
  expect(store.getSnapshot().status).toBe('idle')
  expect(loads).toBe(0)
  const first = store.request()
  const second = store.request()
  await vi.waitFor(() => expect(store.getRuntime()).toBe(Runtime))
  expect(store.getSnapshot().status).toBe('loading')
  const value = { roomCode: 'ABC-123' } as UseLobby
  store.publish(value)
  await Promise.all([first, second])
  expect(store.getSnapshot()).toEqual({ status: 'ready', value })
  await store.request()
  expect(loads).toBe(1)
})

it('can retry loading the owner after a transient failure', async () => {
  let loads = 0
  const Runtime = () => null
  const store = createSessionStore(async () => {
    await Promise.resolve()
    if (++loads === 1) throw new TypeError('offline')
    return { default: Runtime }
  })
  await expect(store.request()).rejects.toThrow('offline')
  expect(store.getSnapshot().status).toBe('error')
  const retry = store.retry()
  await vi.waitFor(() => expect(store.getRuntime()).toBe(Runtime))
  store.publish({} as UseLobby)
  await retry
  expect(store.getSnapshot().status).toBe('ready')
})
