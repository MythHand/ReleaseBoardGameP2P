import { expect, it, vi } from 'vitest'
import { permissions } from '~/shared/lib/permissions'
import { copyText } from './copyText'

const writeText = vi.fn().mockResolvedValue(undefined)
Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
it('starts clipboard write synchronously without query and confirms success', async () => {
  const query = vi.spyOn(permissions, 'query')
  const result = copyText('ROOM-CODE')
  expect(writeText).toHaveBeenCalledWith('ROOM-CODE')
  expect(query).not.toHaveBeenCalled()
  expect(await result).toBe(true)
})
it('rejects empty values and reports write failure', async () => {
  writeText.mockClear()
  expect(await copyText(' ')).toBe(false)
  expect(writeText).not.toHaveBeenCalled()
  writeText.mockRejectedValueOnce(new DOMException('denied', 'NotAllowedError'))
  expect(await copyText('room')).toBe(false)
})
