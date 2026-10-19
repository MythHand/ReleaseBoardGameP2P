export interface ModuleResource<T> {
  load(): Promise<T>
  retry(): Promise<T>
  peek(): T | undefined
}

// Cache successful imports and concurrent attempts, but never a rejected promise.
export function createModuleResource<T>(importer: () => Promise<T>): ModuleResource<T> {
  let pending: Promise<T> | undefined
  let value: T | undefined
  const load = () => {
    pending ??= Promise.resolve()
      .then(importer)
      .then(
        (module) => {
          value = module
          return module
        },
        (error: unknown) => {
          pending = undefined
          throw error
        },
      )
    return pending
  }
  return { load, retry: load, peek: () => value }
}
