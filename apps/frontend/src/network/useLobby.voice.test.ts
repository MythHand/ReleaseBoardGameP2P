import { act, renderHook, waitFor } from '@testing-library/react'
import { createElement, type ReactNode, StrictMode } from 'react'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { clearChat, clearKeeper, clearSession, readSession } from '~/shared/lib/persistence'
import { createTransport, type Transport } from './transport/peer'
import type { WireMessage } from './types'
import { useLobby } from './useLobby'
import { FakeCall, FakeTrack, fakeAudio, fakePort, fakeStream } from './voice/testing/fakes'

interface HarnessTransport extends Transport {
  args: Parameters<typeof createTransport>[0]
  mediaHarness: ReturnType<typeof fakePort>
}
const transports: HarnessTransport[] = []
const audioGraphs: ReturnType<typeof fakeAudio>[] = []
vi.mock('./transport/peer', () => ({ createTransport: vi.fn() }))
vi.mock('./voice/audio', async (original) => ({
  ...(await original<typeof import('./voice/audio')>()),
  createVoiceAudio: () => {
    const graph = fakeAudio()
    audioGraphs.push(graph)
    return graph.audio
  },
}))
const getUserMedia = vi.fn()
const hooks: ReturnType<typeof renderHook<ReturnType<typeof useLobby>, unknown>>[] = []
function mount(strict = false) {
  const hook = renderHook(
    () => useLobby(),
    strict
      ? {
          wrapper: ({ children }: { children: ReactNode }) =>
            createElement(StrictMode, null, children),
        }
      : undefined,
  )
  hooks.push(hook)
  return hook
}
function frame(
  transport: HarnessTransport,
  type: WireMessage['type'],
  payload: unknown,
  from: string,
) {
  act(() => transport.args.onMessage({ type, payload, from, seq: 1 } as WireMessage))
}
beforeEach(() => {
  clearChat()
  clearKeeper()
  clearSession()
  sessionStorage.clear()
  transports.length = 0
  audioGraphs.length = 0
  vi.stubGlobal('AudioContext', class {})
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } })
  getUserMedia.mockReset().mockResolvedValue(fakeStream())
  vi.mocked(createTransport).mockImplementation(async (args) => {
    const mediaHarness = fakePort()
    const t: HarnessTransport = {
      id: args.peerId ?? `guest-${transports.length}`,
      args,
      mediaHarness,
      media: mediaHarness.port,
      connectTo: vi.fn(),
      authenticate: vi.fn(),
      send: vi.fn(),
      broadcast: vi.fn(),
      relay: vi.fn(),
      connectedIds: () => [],
      disconnectPeer: vi.fn((peerId) => {
        args.onDisconnect?.(peerId)
        return Promise.resolve()
      }),
      close: vi.fn(),
    }
    transports.push(t)
    await Promise.resolve()
    return t
  })
})
afterEach(async () => {
  await act(async () => {
    for (const hook of hooks.splice(0)) {
      hook.result.current.leaveSession()
      hook.unmount()
    }
    await Promise.resolve()
  })
  vi.unstubAllGlobals()
  clearChat()
  clearKeeper()
  clearSession()
})
it('exposes a working voice facade after StrictMode effect replay and releases capture before room close', async () => {
  const track = new FakeTrack()
  getUserMedia.mockResolvedValue(fakeStream(track))
  const hook = mount(true)
  await act(async () => {
    await hook.result.current.createRoom('Host', 6)
  })
  await act(async () => {
    await hook.result.current.voice.connect()
  })
  expect(hook.result.current.voice.status).toBe('connected')
  expect(hook.result.current.voice.selfMemberId).toBe(hook.result.current.chat.selfMemberId)
  vi.mocked(transports[0].close).mockImplementation(() => {
    expect(track.readyState).toBe('ended')
  })
  act(() => hook.result.current.leaveSession())
  expect(hook.result.current.voice.status).toBe('off')
  expect(track.stop).toHaveBeenCalledOnce()
  expect(transports[0].close).toHaveBeenCalledOnce()
})
it('keeps voice and one capture through match, results, lobby and rematch', async () => {
  const hook = mount()
  await act(async () => {
    await hook.result.current.createRoom('Host', 6)
    await hook.result.current.voice.connect()
  })
  const sessionId = hook.result.current.voice.roster[0].voiceSessionId
  act(() => {
    hook.result.current.setBots(1)
    hook.result.current.startGame(['Bot'])
  })
  expect(hook.result.current.gameId).toBeTruthy()
  act(() => {
    hook.result.current.setWhere('stats')
    hook.result.current.leaveGame()
    hook.result.current.setWhere('lobby')
    hook.result.current.startGame(['Bot'])
  })
  expect(hook.result.current.voice.status).toBe('connected')
  expect(hook.result.current.voice.roster[0].voiceSessionId).toBe(sessionId)
  expect(getUserMedia).toHaveBeenCalledOnce()
  expect(audioGraphs[0].audio.dispose).not.toHaveBeenCalled()
  expect(JSON.stringify(readSession())).not.toContain('voiceSessionId')
})
it('gives a newly admitted voice-off spectator the snapshot and isolates call failure from the game', async () => {
  const hook = mount()
  await act(async () => {
    await hook.result.current.createRoom('Host', 6)
    await hook.result.current.voice.connect()
  })
  const t = transports[0]
  frame(
    t,
    'JOIN_REQUEST',
    { name: 'Viewer', resumeToken: 'viewer', requestedRole: 'spectator' },
    'viewer-peer',
  )
  expect(hook.result.current.state?.peers['viewer-peer'].role).toBe('guest')
  expect(vi.mocked(t.broadcast).mock.calls.at(-1)?.[0]).toMatchObject({
    type: 'VOICE_ROSTER',
    payload: { participants: [expect.objectContaining({ micOff: false })] },
  })
  frame(t, 'VOICE_JOIN', { voiceSessionId: 'viewer-voice', micOff: true }, 'viewer-peer')
  const self = hook.result.current.voice.roster.find((p) => p.peerId === t.id)
  const viewer = hook.result.current.voice.roster.find((p) => p.peerId === 'viewer-peer')
  if (!self || !viewer) throw new Error('Missing canonical voice roster')
  let call = t.mediaHarness.calls[0]
  if (!call) {
    call = new FakeCall('viewer-peer', {
      version: 1,
      callerSessionId: viewer.voiceSessionId,
      calleeSessionId: self.voiceSessionId,
    })
    act(() => t.mediaHarness.deliver(call))
  }
  act(() => call.ready())
  expect(hook.result.current.voice.status).toBe('connected')
  act(() => call.emit({ type: 'error', error: new Error('media failed') }))
  expect(hook.result.current.voice.status).toBe('interrupted')
  expect(hook.result.current.status).toBe('in-lobby')
  act(() => hook.result.current.setWhere('stats'))
  expect(hook.result.current.state?.peers[t.id].where).toBe('stats')
  act(() => hook.result.current.kick('viewer-peer'))
  expect(hook.result.current.voice.roster).toHaveLength(1)
  expect(hook.result.current.voice.status).toBe('connected')
  act(() => call.ready())
  expect(hook.result.current.voice.roster).toHaveLength(1)
})
it('waits for both roster admission and chat identity before announcing voice on a guest', async () => {
  const hook = mount()
  await act(async () => {
    await hook.result.current.joinRoom('ABC-DEF', 'Viewer', 'spectator')
  })
  const t = transports[0]
  const hostId = 'abcdef'
  const peers = [
    {
      id: hostId,
      memberId: 'host-member',
      name: 'Host',
      role: 'host',
      ready: true,
      where: 'lobby',
    },
    {
      id: t.id,
      memberId: 'viewer-member',
      name: 'Viewer',
      role: 'guest',
      ready: false,
      where: 'lobby',
    },
  ]
  frame(t, 'PEER_LIST', { peers, yourRole: 'guest' }, hostId)
  await act(async () => {
    await hook.result.current.voice.connect()
  })
  expect(getUserMedia).not.toHaveBeenCalled()
  frame(t, 'CHAT_HISTORY', { entries: [], selfMemberId: 'viewer-member' }, hostId)
  await act(async () => {
    await hook.result.current.voice.connect()
  })
  expect(getUserMedia).toHaveBeenCalledOnce()
  expect(t.send).toHaveBeenCalledWith(hostId, expect.objectContaining({ type: 'VOICE_JOIN' }))
  frame(t, 'PLAYER_KICKED', { peerId: t.id }, hostId)
  expect(hook.result.current.voice.status).toBe('off')
  expect(hook.result.current.status).toBe('kicked')
})
it('rejects a late microphone grant after leaving and starts another room voice off', async () => {
  let grant!: (stream: MediaStream) => void
  getUserMedia.mockImplementation(
    () =>
      new Promise<MediaStream>((resolve) => {
        grant = resolve
      }),
  )
  const hook = mount()
  await act(async () => {
    await hook.result.current.createRoom('Host', 6)
  })
  let pending: Promise<void> = Promise.resolve()
  await act(async () => {
    pending = hook.result.current.voice.connect()
    await Promise.resolve()
  })
  await act(async () => {
    hook.result.current.leaveSession()
    await hook.result.current.createRoom('New host', 6)
  })
  const track = new FakeTrack()
  await act(async () => {
    grant(fakeStream(track))
    await pending
  })
  expect(track.stop).toHaveBeenCalledOnce()
  expect(hook.result.current.voice.status).toBe('off')
})
it('restores the room after a reload with voice off and no capture', async () => {
  const hook = mount()
  await act(async () => {
    await hook.result.current.createRoom('Host', 6)
    await hook.result.current.voice.connect()
  })
  hook.unmount()
  hooks.splice(hooks.indexOf(hook), 1)
  getUserMedia.mockClear()
  const restored = mount()
  await waitFor(() => expect(restored.result.current.status).toBe('in-lobby'))
  expect(restored.result.current.voice.status).toBe('off')
  expect(getUserMedia).not.toHaveBeenCalled()
})

function admitGuest(t: HarnessTransport) {
  frame(
    t,
    'PEER_LIST',
    {
      peers: [
        {
          id: 'abcdef',
          memberId: 'host-member',
          name: 'Host',
          role: 'host',
          ready: true,
          where: 'lobby',
        },
        {
          id: t.id,
          memberId: 'viewer-member',
          name: 'Viewer',
          role: 'guest',
          ready: false,
          where: 'lobby',
        },
      ],
      yourRole: 'guest',
    },
    'abcdef',
  )
  frame(t, 'CHAT_HISTORY', { entries: [], selfMemberId: 'viewer-member' }, 'abcdef')
}
it('retains the microphone through a data reconnect but waits for readmission to announce a new voice session', async () => {
  const track = new FakeTrack()
  getUserMedia.mockResolvedValue(fakeStream(track))
  const hook = mount()
  await act(async () => {
    await hook.result.current.joinRoom('ABC-DEF', 'Viewer', 'spectator')
  })
  admitGuest(transports[0])
  await act(async () => {
    await hook.result.current.voice.connect()
  })
  const firstJoin = vi
    .mocked(transports[0].send)
    .mock.calls.find(([, msg]) => msg.type === 'VOICE_JOIN')?.[1]
  if (firstJoin?.type !== 'VOICE_JOIN') throw new Error('Missing first voice session')
  act(() => transports[0].args.onDisconnect?.('abcdef'))
  await waitFor(() => expect(transports).toHaveLength(2))
  expect(track.stop).not.toHaveBeenCalled()
  expect(hook.result.current.voice.status).toBe('interrupted')
  expect(transports[1].send).not.toHaveBeenCalledWith(
    'abcdef',
    expect.objectContaining({ type: 'VOICE_JOIN' }),
  )
  admitGuest(transports[1])
  const secondJoin = vi
    .mocked(transports[1].send)
    .mock.calls.find(([, msg]) => msg.type === 'VOICE_JOIN')?.[1]
  expect(secondJoin).toMatchObject({ type: 'VOICE_JOIN', payload: { micOff: false } })
  if (secondJoin?.type !== 'VOICE_JOIN') throw new Error('Missing renewed voice session')
  expect(secondJoin.payload.voiceSessionId).not.toBe(firstJoin.payload.voiceSessionId)
  expect(getUserMedia).toHaveBeenCalledOnce()
})
it('stops a retained microphone when renewed admission is refused', async () => {
  const track = new FakeTrack()
  getUserMedia.mockResolvedValue(fakeStream(track))
  const hook = mount()
  await act(async () => {
    await hook.result.current.joinRoom('ABC-DEF', 'Viewer', 'spectator')
  })
  admitGuest(transports[0])
  await act(async () => {
    await hook.result.current.voice.connect()
  })
  act(() => transports[0].args.onDisconnect?.('abcdef'))
  await waitFor(() => expect(transports).toHaveLength(2))
  frame(
    transports[1],
    'JOIN_REJECTED',
    { reason: 'room-full', availability: { player: false, spectator: false } },
    'abcdef',
  )
  expect(track.stop).toHaveBeenCalledOnce()
  expect(hook.result.current.voice.status).toBe('off')
})
