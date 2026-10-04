import { clipboard } from './adapters/clipboard'
import { microphone, releaseMicrophone } from './adapters/microphone'
import type {
  AccessOptions,
  AccessResult,
  PermissionInputs,
  PermissionName,
  PermissionService,
  PermissionValues,
} from './types'

function failure(error: unknown): AccessResult<never> {
  const name = typeof error === 'object' && error !== null && 'name' in error ? error.name : ''
  const status =
    name === 'NotAllowedError' || name === 'PermissionDeniedError'
      ? 'denied'
      : name === 'NotFoundError' || name === 'DevicesNotFoundError'
        ? 'unavailable'
        : name === 'NotSupportedError'
          ? 'unsupported'
          : 'failed'
  return { status, error, stage: 'request' }
}
function operation<T>(
  start: () => Promise<T>,
  options: AccessOptions,
  release: (value: T) => void,
): Promise<AccessResult<T>> {
  return new Promise((resolve) => {
    let settled = false
    let timer: ReturnType<typeof setTimeout> | undefined
    const finish = (result: AccessResult<T>) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      options.signal?.removeEventListener('abort', abort)
      resolve(result)
    }
    const abort = () => finish({ status: 'cancelled', stage: 'request' })
    if (options.signal?.aborted) {
      abort()
      return
    }
    options.signal?.addEventListener('abort', abort, { once: true })
    timer = setTimeout(
      () => finish({ status: 'timeout', stage: 'request' }),
      options.timeoutMs ?? 30000,
    )
    try {
      // Start synchronously to preserve clipboard user activation.
      start().then(
        (value) => {
          if (settled) {
            release(value)
            return
          }
          finish({ status: 'success', value })
        },
        (error: unknown) => finish(failure(error)),
      )
    } catch (error) {
      finish(failure(error))
    }
  })
}
export function createPermissionService(
  browser: Pick<Navigator, 'mediaDevices' | 'clipboard' | 'permissions'>,
): PermissionService {
  const supported = (name: PermissionName) =>
    name === 'microphone' ? !!browser.mediaDevices?.getUserMedia : !!browser.clipboard?.writeText
  const getStatus = (name: PermissionName) =>
    browser.permissions?.query({ name } as PermissionDescriptor)
  return {
    request<K extends PermissionName>(
      name: K,
      input: PermissionInputs[K],
      options: AccessOptions,
    ): Promise<AccessResult<PermissionValues[K]>> {
      if (name === 'microphone') {
        const capture = input as PermissionInputs['microphone']
        return operation(
          () => microphone(browser, capture),
          options,
          (stream) => {
            if (stream !== capture.existing) releaseMicrophone(stream)
          },
        ) as Promise<AccessResult<PermissionValues[K]>>
      }
      return operation(
        () => clipboard(browser, input as string),
        options,
        () => {},
      ) as Promise<AccessResult<PermissionValues[K]>>
    },
    async query(name) {
      if (!supported(name)) return 'unsupported'
      try {
        return (await getStatus(name))?.state ?? 'unknown'
      } catch {
        return 'unknown'
      }
    },
    observe(name, listener) {
      let active = true
      let detach = () => {}
      if (supported(name)) {
        try {
          Promise.resolve(getStatus(name))
            .then((status) => {
              if (!active || !status) return
              const onChange = () => listener(status.state)
              status.addEventListener('change', onChange)
              detach = () => status.removeEventListener('change', onChange)
            })
            .catch(() => {})
        } catch {
          /* Unsupported permission descriptors have no observer. */
        }
      }
      return () => {
        active = false
        detach()
      }
    },
    release(name, value) {
      if (name === 'microphone') releaseMicrophone(value as MediaStream)
    },
  }
}
