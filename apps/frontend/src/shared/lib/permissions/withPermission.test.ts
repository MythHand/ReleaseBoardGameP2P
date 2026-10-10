import { expect, it, vi } from 'vitest'
import { createPermissionService } from './service'
import { withPermission } from './withPermission'

function setup() {
  const stop = vi.fn()
  const stream = {
    getTracks: () => [{ stop }],
    getAudioTracks: () => [{ readyState: 'live' }],
  } as unknown as MediaStream
  const getUserMedia = vi.fn().mockResolvedValue(stream)
  const service = createPermissionService({
    mediaDevices: { getUserMedia },
  } as unknown as Navigator)
  return { service, stream, stop, getUserMedia }
}
it('deduplicates both capture and action for an owner', async () => {
  const { service, getUserMedia } = setup()
  const action = vi.fn().mockResolvedValue('accepted')
  const guarded = withPermission(service, 'microphone', action)
  const owner = {}
  const [a, b] = await Promise.all([guarded({}, { owner }), guarded({}, { owner })])
  expect(a).toEqual({ status: 'success', value: 'accepted' })
  expect(b).toEqual(a)
  expect(getUserMedia).toHaveBeenCalledOnce()
  expect(action).toHaveBeenCalledOnce()
  await guarded({}, { owner: {} })
  expect(getUserMedia).toHaveBeenCalledTimes(2)
})
it('releases an unaccepted capture on action failure without misclassifying permission', async () => {
  const { service, stop } = setup()
  const error = new Error('consumer failed')
  const guarded = withPermission(service, 'microphone', () => {
    throw error
  })
  expect(await guarded({}, { owner: {} })).toEqual({ status: 'failed', stage: 'action', error })
  expect(stop).toHaveBeenCalledOnce()
})
it('does not deliver success if cancellation races the action', async () => {
  const { service, stop } = setup()
  const controller = new AbortController()
  const action = vi.fn()
  const result = withPermission(
    service,
    'microphone',
    action,
  )({}, { owner: {}, signal: controller.signal })
  controller.abort()
  expect((await result).status).toBe('cancelled')
  expect(action).not.toHaveBeenCalled()
  expect(stop).toHaveBeenCalledOnce()
})
