import type { Role } from '~/network'

export interface Player {
  id: string
  name: string
  role: Role
  ready: boolean
}
