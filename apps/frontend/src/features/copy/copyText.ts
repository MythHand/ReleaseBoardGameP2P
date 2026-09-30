import { permissions, withPermission } from '~/shared/lib/permissions'

const copy = withPermission(permissions, 'clipboard-write', () => true)
export function copyText(text: string): Promise<boolean> {
  if (!text.trim()) return Promise.resolve(false)
  return copy(text, { owner: {} }).then((result) => result.status === 'success' && result.value)
}
