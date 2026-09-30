import { afterEach, expect, it, vi } from 'vitest'
import { createPermissionService } from '~/shared/lib/permissions'
import { createRoomVoice, type VoiceRoomContext } from './runtime'
import {
  FakeCall,
  FakeTrack,
  fakeAudio,
  fakePort,
  fakeStream,
  fakeTransport,
} from './testing/fakes'

let nextInstance = 0
function setup(
  getUserMedia = vi.fn().mockRejectedValue(new DOMException('denied', 'NotAllowedError')),
) {
  const port = fakePort()
  const audio = fakeAudio()
  const transport = fakeTransport(port.port)
  const peers = {
    pa: {
      id: 'pa',
      memberId: 'a',
      name: 'A',
      role: 'host' as const,
      ready: true,
      where: 'lobby' as const,
    },
  }
  const context: VoiceRoomContext = {
    roomCode: 'room',
    roomGeneration: 1,
    transportGeneration: 1,
    transport,
    selfPeerId: 'pa',
    selfMemberId: 'a',
    hostPeerId: 'pa',
    peers,
    admitted: true,
  }
  let id = 0
  const instance = ++nextInstance
  const permissions = createPermissionService({
    mediaDevices: { getUserMedia },
  } as unknown as Navigator)
  const runtime = createRoomVoice({
    permissions,
    createAudio: () => audio.audio,
    newId: () => `id-${instance}-${++id}`,
  })
  runtime.updateRoom(context)
  return { ...port, ...audio, runtime, context, transport, getUserMedia, permissions }
}
afterEach(() => vi.useRealTimers())
it('joins as a listener after denial, keeps settings on voice rejoin, and reload starts off', async () => {
  const { runtime, transport } = setup()
  expect(runtime.getSnapshot().status).toBe('off')
  await runtime.connect()
  expect(runtime.getSnapshot()).toMatchObject({
    status: 'connected',
    micOff: true,
    issue: 'microphoneDenied',
  })
  expect(transport.broadcast).toHaveBeenCalledWith({
    type: 'VOICE_ROSTER',
    payload: expect.objectContaining({
      participants: [expect.objectContaining({ memberId: 'a', micOff: true })],
    }),
  })
  runtime.setVolume(200)
  runtime.setParticipantVolume('b', 150)
  runtime.setParticipantMuted('b', true)
  runtime.disconnect()
  await runtime.connect()
  expect(runtime.getSnapshot()).toMatchObject({
    volume: 200,
    settings: { b: { volume: 150, muted: true } },
  })
  runtime.dispose()
})
it('shares a pending connect, stops late permission after exit, and does not adopt it into a new room', async () => {
  let grant!: (stream: MediaStream) => void
  const getUserMedia = vi.fn(
    () =>
      new Promise<MediaStream>((resolve) => {
        grant = resolve
      }),
  )
  const { runtime, context, audio } = setup(getUserMedia)
  const first = runtime.connect()
  const second = runtime.connect()
  expect(getUserMedia).toHaveBeenCalledOnce()
  runtime.updateRoom(null)
  runtime.updateRoom({ ...context, roomCode: 'other', roomGeneration: 2 })
  const track = new FakeTrack()
  grant(fakeStream(track))
  await Promise.all([first, second])
  expect(track.stop).toHaveBeenCalledOnce()
  expect(audio.setMicrophone).not.toHaveBeenCalled()
  expect(runtime.getSnapshot().status).toBe('off')
  runtime.dispose()
})
it('reaches listener mode after capture timeout and cleans a late grant', async () => {
  vi.useFakeTimers()
  let grant!: (stream: MediaStream) => void
  const { runtime } = setup(
    vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve
        }),
    ),
  )
  const joining = runtime.connect()
  await vi.advanceTimersByTimeAsync(30000)
  await joining
  expect(runtime.getSnapshot()).toMatchObject({
    status: 'connected',
    micOff: true,
    issue: 'permissionTimeout',
  })
  const track = new FakeTrack()
  grant(fakeStream(track))
  await Promise.resolve()
  expect(track.stop).toHaveBeenCalledOnce()
  runtime.dispose()
})
it('reuses live capture, mutes immediately, handles track loss and releases capture on exit', async () => {
  const track = new FakeTrack()
  const { runtime, getUserMedia, audio, permissions } = setup(
    vi.fn().mockResolvedValue(fakeStream(track)),
  )
  const requests = vi.spyOn(permissions, 'request')
  await runtime.connect()
  expect(runtime.getSnapshot().micOff).toBe(false)
  await runtime.setMicOff(true)
  await runtime.setMicOff(false)
  expect(getUserMedia).toHaveBeenCalledOnce()
  expect(requests).toHaveBeenCalledTimes(3)
  track.stop()
  expect(runtime.getSnapshot().micOff).toBe(true)
  expect(audio.setMicrophone).toHaveBeenLastCalledWith(null)
  runtime.dispose()
})
it('suspends on lost admission and resumes only a new confirmed generation', async () => {
  const { runtime, context, audio } = setup()
  await runtime.connect()
  const old = runtime.getSnapshot().roster[0].voiceSessionId
  runtime.updateRoom({ ...context, admitted: false })
  expect(runtime.getSnapshot().status).toBe('interrupted')
  expect(audio.suspendTransmission).toHaveBeenCalledOnce()
  runtime.updateRoom({ ...context, transportGeneration: 2, admitted: true })
  expect(runtime.getSnapshot().status).toBe('connected')
  expect(runtime.getSnapshot().roster[0].voiceSessionId).not.toBe(old)
  runtime.updateRoom(null)
  expect(runtime.getSnapshot()).toMatchObject({ status: 'off', volume: 100, roster: [] })
})
it('reports blocked audio instead of silently claiming connected', async () => {
  const { runtime, observers } = setup()
  await runtime.connect()
  for (const observer of observers) observer(false)
  expect(runtime.getSnapshot()).toMatchObject({ status: 'interrupted', issue: 'audioBlocked' })
  runtime.dispose()
})
it('accepts only current host roster, ignores older revisions and waits for own session confirmation', async () => {
  const { runtime, context, transport } = setup()
  const host = {
    id: 'host',
    memberId: 'h',
    name: 'H',
    role: 'host' as const,
    ready: true,
    where: 'lobby' as const,
  }
  runtime.updateRoom({
    ...context,
    hostPeerId: 'host',
    peers: { ...context.peers, host },
    admitted: true,
  })
  await runtime.connect()
  expect(runtime.getSnapshot().status).toBe('connecting')
  const sent = vi
    .mocked(transport.send)
    .mock.calls.find(([, message]) => message.type === 'VOICE_JOIN')?.[1]
  if (sent?.type !== 'VOICE_JOIN') throw new Error('Missing JOIN')
  const frame = {
    type: 'VOICE_ROSTER' as const,
    from: 'host',
    seq: 1,
    payload: {
      authorityId: 'host-session',
      revision: 2,
      participants: [
        { memberId: 'a', peerId: 'pa', voiceSessionId: sent.payload.voiceSessionId, micOff: true },
      ],
    },
  }
  runtime.handleMessage({ ...frame, from: 'outsider' })
  expect(runtime.getSnapshot().status).toBe('connecting')
  runtime.handleMessage(frame)
  expect(runtime.getSnapshot().status).toBe('connected')
  runtime.handleMessage({ ...frame, payload: { ...frame.payload, revision: 1, participants: [] } })
  expect(runtime.getSnapshot().roster).toHaveLength(1)
  runtime.dispose()
})

it('keeps output observation after room transport recovery', async () => {
  const { runtime, context, observers } = setup()
  await runtime.connect()
  runtime.updateRoom({ ...context, admitted: false })
  runtime.updateRoom({ ...context, transportGeneration: 2, admitted: true })
  for (const observer of observers) observer(false)
  expect(runtime.getSnapshot()).toMatchObject({ status: 'interrupted', issue: 'audioBlocked' })
  runtime.dispose()
})
it('rejects retired authority even when the host reuses the same peer id', () => {
  const { runtime, context } = setup()
  const client = { ...context, hostPeerId: 'host' }
  runtime.updateRoom(client)
  const old = {
    type: 'VOICE_ROSTER' as const,
    from: 'host',
    seq: 1,
    payload: { authorityId: 'retired', revision: 5, participants: [] },
  }
  runtime.handleMessage(old)
  runtime.updateRoom({ ...client, transportGeneration: 2 })
  runtime.handleMessage(old)
  runtime.handleMessage({
    ...old,
    payload: {
      authorityId: 'new',
      revision: 0,
      participants: [{ memberId: 'x', peerId: 'px', voiceSessionId: 'vx', micOff: true }],
    },
  })
  expect(runtime.getSnapshot().roster).toHaveLength(1)
  runtime.dispose()
})
it('recovers the retained audio output when admission is lost during the microphone prompt', async () => {
  let grant!: (stream: MediaStream) => void
  const { runtime, context } = setup(
    vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve
        }),
    ),
  )
  const pending = runtime.connect()
  await Promise.resolve()
  await Promise.resolve()
  runtime.updateRoom({ ...context, admitted: false })
  runtime.updateRoom({ ...context, transportGeneration: 2, admitted: true })
  await pending
  expect(runtime.getSnapshot()).toMatchObject({ status: 'connected', micOff: true })
  const track = new FakeTrack()
  grant(fakeStream(track))
  await Promise.resolve()
  expect(track.stop).toHaveBeenCalledOnce()
  runtime.dispose()
})
it('bounds host confirmation wait and leaves no timer after exit', async () => {
  vi.useFakeTimers()
  const { runtime, context } = setup()
  runtime.updateRoom({ ...context, hostPeerId: 'host' })
  await runtime.connect()
  expect(runtime.getSnapshot().status).toBe('connecting')
  await vi.advanceTimersByTimeAsync(15000)
  expect(runtime.getSnapshot()).toMatchObject({ status: 'interrupted', issue: 'callFailed' })
  runtime.dispose()
  expect(vi.getTimerCount()).toBe(0)
})

it('negotiates one pair for two simultaneous listeners and enables a microphone later', async () => {
  const host = setup()
  const guest = setup()
  const peers = {
    ...host.context.peers,
    pb: {
      id: 'pb',
      memberId: 'b',
      name: 'B',
      role: 'guest' as const,
      ready: false,
      where: 'lobby' as const,
    },
  }
  let seq = 0
  const pairs: { caller: FakeCall; receiver: FakeCall }[] = []
  vi.mocked(host.transport.broadcast).mockImplementation((message) => {
    guest.runtime.handleMessage({ ...message, from: 'pa', seq: ++seq })
  })
  vi.mocked(guest.transport.send).mockImplementation((_to, message) => {
    host.runtime.handleMessage({ ...message, from: 'pb', seq: ++seq })
  })
  vi.mocked(host.port.call).mockImplementation((peerId, _stream, metadata) => {
    const caller = new FakeCall(peerId, metadata)
    const receiver = new FakeCall('pa', metadata)
    receiver.answer.mockImplementation(() =>
      queueMicrotask(() => {
        caller.ready()
        receiver.ready()
      }),
    )
    pairs.push({ caller, receiver })
    queueMicrotask(() => guest.deliver(receiver))
    return caller
  })
  guest.runtime.updateRoom({
    ...guest.context,
    peers,
    selfPeerId: 'pb',
    selfMemberId: 'b',
    hostPeerId: 'pa',
  })
  host.runtime.updateRoom({ ...host.context, peers })
  await Promise.all([host.runtime.connect(), guest.runtime.connect()])
  await vi.waitFor(() => {
    expect(host.runtime.getSnapshot().status).toBe('connected')
    expect(guest.runtime.getSnapshot().status).toBe('connected')
  })
  expect(pairs).toHaveLength(1)
  expect(guest.port.call).not.toHaveBeenCalled()
  expect(host.runtime.getSnapshot().roster).toHaveLength(2)
  expect(guest.runtime.getSnapshot().micOff).toBe(true)
  const track = new FakeTrack()
  guest.getUserMedia.mockResolvedValueOnce(fakeStream(track))
  await guest.runtime.setMicOff(false)
  expect(guest.runtime.getSnapshot().micOff).toBe(false)
  expect(pairs[0].receiver.replaceTrack).toHaveBeenCalledWith(track)
  expect(pairs).toHaveLength(1)
  host.runtime.dispose()
  guest.runtime.dispose()
  expect(track.stop).toHaveBeenCalledOnce()
})
it('reports a missing microphone as listener mode rather than permission denial', async () => {
  const { runtime } = setup(vi.fn().mockRejectedValue(new DOMException('missing', 'NotFoundError')))
  await runtime.connect()
  expect(runtime.getSnapshot()).toMatchObject({
    status: 'connected',
    micOff: true,
    issue: 'microphoneMissing',
  })
  runtime.dispose()
})
