import { createPermissionService } from './service'
import type { PermissionService } from './types'

export { createPermissionService } from './service'
export type * from './types'
export { withPermission } from './withPermission'

let instance: PermissionService | undefined
function getService(): PermissionService {
  instance ??= createPermissionService(
    typeof navigator === 'undefined' ? ({} as Navigator) : navigator,
  )
  return instance
}
export const permissions: PermissionService = {
  request: (name, input, options) => getService().request(name, input, options),
  query: (name) => getService().query(name),
  observe: (name, listener) => getService().observe(name, listener),
  release: (name, value) => getService().release(name, value),
}
