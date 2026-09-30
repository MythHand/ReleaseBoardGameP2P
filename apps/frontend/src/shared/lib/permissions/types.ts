export type PermissionName = 'microphone' | 'clipboard-write'
export interface PermissionInputs {
  microphone: { constraints?: MediaTrackConstraints; existing?: MediaStream }
  'clipboard-write': string
}
export interface PermissionValues {
  microphone: MediaStream
  'clipboard-write': undefined
}
export type PermissionState = 'granted' | 'denied' | 'prompt' | 'unknown' | 'unsupported'
export interface AccessOptions {
  owner: object
  signal?: AbortSignal
  timeoutMs?: number
}
export type AccessResult<T> =
  | { status: 'success'; value: T }
  | {
      status: 'denied' | 'unavailable' | 'unsupported' | 'cancelled' | 'timeout' | 'failed'
      error?: unknown
      stage: 'request' | 'action'
    }
export interface PermissionService {
  request<K extends PermissionName>(
    name: K,
    input: PermissionInputs[K],
    options: AccessOptions,
  ): Promise<AccessResult<PermissionValues[K]>>
  query(name: PermissionName): Promise<PermissionState>
  observe(name: PermissionName, listener: (state: PermissionState) => void): () => void
  release<K extends PermissionName>(name: K, value: PermissionValues[K]): void
}
