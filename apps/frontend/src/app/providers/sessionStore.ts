import type { ComponentType } from 'react'
import type { UseLobby } from '~/network/useLobby'
import { createModuleResource } from '~/shared/lib/moduleResource'

export type SessionSnapshot =
  | { status: 'idle' | 'loading' }
  | { status: 'error'; error: unknown }
  | { status: 'ready'; value: UseLobby }
export type SessionRuntimeComponent = ComponentType<{ publish(value: UseLobby): void }>
export type SessionStore = ReturnType<typeof createSessionStore>

export function createSessionStore(
  loadRuntime: () => Promise<{ default: SessionRuntimeComponent }>,
) {
  const resource = createModuleResource(loadRuntime)
  const listeners = new Set<() => void>()
  let snapshot: SessionSnapshot = { status: 'idle' }
  let runtime: SessionRuntimeComponent | null = null
  let activation: Promise<void> | undefined
  let ready: (() => void) | undefined
  const notify = () => {
    for (const listener of listeners) listener()
  }
  const request = (): Promise<void> => {
    if (snapshot.status === 'ready') return Promise.resolve()
    if (activation !== undefined) return activation
    snapshot = { status: 'loading' }
    activation = new Promise<void>((resolve, reject) => {
      ready = resolve
      void resource.load().then(
        (module) => {
          runtime = module.default
          notify()
        },
        (error: unknown) => {
          snapshot = { status: 'error', error }
          activation = undefined
          notify()
          reject(error)
        },
      )
    })
    notify()
    return activation
  }
  return {
    subscribe(listener: () => void) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    getSnapshot: () => snapshot,
    getRuntime: () => runtime,
    request,
    retry: request,
    publish(value: UseLobby) {
      snapshot = { status: 'ready', value }
      ready?.()
      ready = undefined
      notify()
    },
  }
}
