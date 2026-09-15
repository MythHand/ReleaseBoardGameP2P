import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { useGame } from '~/features/play-game/useGame'
import { clearKeeper, clearSession } from '~/shared/lib/persistence'
import { createMemoryNetwork } from './session/memoryNetwork'
import { type UseLobby, useLobby } from './useLobby'

let session: UseLobby
vi.mock('~/app/providers/SessionProvider', () => ({ useSession: () => session }))
vi.mock('./transport/peer', () => ({
  createTransport: async () => createMemoryNetwork(['hostxx']).transport('hostxx'),
}))

beforeEach(() => {
  sessionStorage.clear()
  clearSession()
  clearKeeper()
  vi.useFakeTimers()
  vi.setSystemTime(1_000_000)
  // This deal gives the human a clean draw and the bot a release.
  vi.spyOn(crypto, 'getRandomValues').mockImplementation(((array: Uint32Array) => {
    array[0] = 17
    return array
  }) as typeof crypto.getRandomValues)
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.useRealTimers()
})

async function startWithBot() {
  const rendered = renderHook(() => {
    session = useLobby()
    return { lobby: session, game: useGame() }
  })
  await act(async () => {
    await rendered.result.current.lobby.createRoom('Host', 6)
  })
  act(() => rendered.result.current.lobby.setBots(1))
  act(() => rendered.result.current.lobby.startGame(['Bot 1']))
  act(() => rendered.result.current.lobby.introReady())
  return rendered
}

// Separate SYNCs in one timer callback lose the first batch to React batching.
it('keeps window closure in the host feed when the bot acts on the same tick', async () => {
  const { result, unmount } = await startWithBot()
  try {
    act(() => result.current.game.draw())
    act(() => result.current.game.push())
    expect(result.current.game.view?.turn.player).toBe('p2')
    for (let i = 0; i < 100 && result.current.game.view?.turn.player === 'p2'; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
    }
    expect(result.current.game.view?.turn.player).toBe('p1')
    expect(result.current.game.events).toContainEqual(
      expect.objectContaining({ type: 'windowClosed', player: 'p2', slot: 'frontend' }),
    )
  } finally {
    unmount()
  }
})

it('keeps the timed-out human draw and turn change before the next bot action', async () => {
  const { result, unmount } = await startWithBot()
  try {
    for (let i = 0; i < 125 && result.current.game.view?.turn.player === 'p1'; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(250)
      })
    }
    expect(result.current.game.view?.turn.player).toBe('p2')
    expect(result.current.game.events).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'drawn', player: 'p1' }),
        expect.objectContaining({ type: 'turnEnded', player: 'p1' }),
        expect.objectContaining({ type: 'turnStarted', player: 'p2' }),
      ]),
    )
    const ids = result.current.game.events.map((event) => event.id)
    expect(new Set(ids).size).toBe(ids.length)
  } finally {
    unmount()
  }
})
