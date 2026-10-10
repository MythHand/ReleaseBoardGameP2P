import { afterEach, describe, expect, it, vi } from 'vitest'
import { createPermissionService } from './service'

function capture() {
  const track = { readyState: 'live', stop: vi.fn() }
  const stream = {
    getAudioTracks: () => [track],
    getTracks: () => [track],
  } as unknown as MediaStream
  return { track, stream }
}
function browser(getUserMedia = vi.fn(), writeText = vi.fn().mockResolvedValue(undefined)) {
  return { mediaDevices: { getUserMedia }, clipboard: { writeText } } as unknown as Navigator
}
afterEach(() => vi.useRealTimers())
describe('permission operations', () => {
  it('reuses live capture without opening another device', async () => {
    const { stream } = capture()
    const getUserMedia = vi.fn().mockResolvedValue(stream)
    const service = createPermissionService(browser(getUserMedia))
    expect(await service.request('microphone', {}, { owner: {} })).toEqual({
      status: 'success',
      value: stream,
    })
    expect(await service.request('microphone', { existing: stream }, { owner: {} })).toEqual({
      status: 'success',
      value: stream,
    })
    expect(getUserMedia).toHaveBeenCalledOnce()
    expect(getUserMedia).toHaveBeenCalledWith({ audio: true, video: false })
    expect(await service.query('microphone')).toBe('unknown')
  })
  it.each([
    ['NotAllowedError', 'denied'],
    ['NotFoundError', 'unavailable'],
    ['NotReadableError', 'failed'],
  ])('classifies %s independently', async (name, status) => {
    const error = new DOMException('capture failed', name)
    const service = createPermissionService(browser(vi.fn().mockRejectedValue(error)))
    expect(await service.request('microphone', {}, { owner: {} })).toEqual({
      status,
      error,
      stage: 'request',
    })
  })
  it('reports missing API without denying supported clipboard operation', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    const service = createPermissionService({ clipboard: { writeText } } as unknown as Navigator)
    expect((await service.request('microphone', {}, { owner: {} })).status).toBe('unsupported')
    const result = service.request('clipboard-write', 'ROOM', { owner: {} })
    expect(writeText).toHaveBeenCalledWith('ROOM')
    expect((await result).status).toBe('success')
  })
  it('stops a late grant after cancellation', async () => {
    let grant!: (s: MediaStream) => void
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          grant = resolve
        }),
    )
    const { stream, track } = capture()
    const controller = new AbortController()
    const result = createPermissionService(browser(getUserMedia)).request(
      'microphone',
      {},
      { owner: {}, signal: controller.signal },
    )
    controller.abort()
    expect((await result).status).toBe('cancelled')
    grant(stream)
    await Promise.resolve()
    expect(track.stop).toHaveBeenCalledOnce()
  })
  it('bounds unresolved capture at 30 seconds and cleans its late grant', async () => {
    vi.useFakeTimers()
    let grant!: (s: MediaStream) => void
    const { stream, track } = capture()
    const service = createPermissionService(
      browser(
        vi.fn(
          () =>
            new Promise<MediaStream>((resolve) => {
              grant = resolve
            }),
        ),
      ),
    )
    const result = service.request('microphone', {}, { owner: {} })
    await vi.advanceTimersByTimeAsync(30000)
    expect((await result).status).toBe('timeout')
    grant(stream)
    await Promise.resolve()
    expect(track.stop).toHaveBeenCalledOnce()
  })
  it('does not stop a borrowed stream on cancellation', async () => {
    const { stream, track } = capture()
    const controller = new AbortController()
    const result = createPermissionService(browser()).request(
      'microphone',
      { existing: stream },
      { owner: {}, signal: controller.signal },
    )
    controller.abort()
    expect((await result).status).toBe('cancelled')
    expect(track.stop).not.toHaveBeenCalled()
  })
  it('observes changes without capturing and detaches even after async query', async () => {
    const status = new EventTarget() as PermissionStatus
    Object.defineProperty(status, 'state', { value: 'granted', configurable: true })
    const b = browser()
    Object.defineProperty(b, 'permissions', { value: { query: vi.fn().mockResolvedValue(status) } })
    const listener = vi.fn()
    const service = createPermissionService(b)
    const unsubscribe = service.observe('microphone', listener)
    await Promise.resolve()
    await Promise.resolve()
    status.dispatchEvent(new Event('change'))
    expect(listener).toHaveBeenCalledWith('granted')
    unsubscribe()
    listener.mockClear()
    status.dispatchEvent(new Event('change'))
    expect(listener).not.toHaveBeenCalled()
    expect(b.mediaDevices.getUserMedia).not.toHaveBeenCalled()
  })
})
