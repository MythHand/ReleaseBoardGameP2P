import type {
  AccessOptions,
  AccessResult,
  PermissionInputs,
  PermissionName,
  PermissionService,
  PermissionValues,
} from './types'

export function withPermission<K extends PermissionName, R>(
  service: PermissionService,
  name: K,
  action: (value: PermissionValues[K]) => R | Promise<R>,
): (input: PermissionInputs[K], options: AccessOptions) => Promise<AccessResult<R>> {
  const pending = new WeakMap<object, Promise<AccessResult<R>>>()
  return (input, options) => {
    const previous = pending.get(options.owner)
    if (previous) return previous
    const borrowed = (value: PermissionValues[K]) =>
      name === 'microphone' && value === (input as PermissionInputs['microphone']).existing
    const run = service
      .request(name, input, options)
      .then(async (result): Promise<AccessResult<R>> => {
        if (result.status !== 'success') return result
        if (options.signal?.aborted) {
          if (!borrowed(result.value)) service.release(name, result.value)
          return { status: 'cancelled', stage: 'action' }
        }
        try {
          return { status: 'success', value: await action(result.value) }
        } catch (error) {
          if (!borrowed(result.value)) service.release(name, result.value)
          return { status: 'failed', error, stage: 'action' }
        }
      })
      .finally(() => pending.delete(options.owner))
    pending.set(options.owner, run)
    return run
  }
}
