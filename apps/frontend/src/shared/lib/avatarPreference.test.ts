import { afterEach, expect, it, vi } from 'vitest'
import {
  clearAvatarPreference,
  readAvatarPreference,
  writeAvatarPreference,
} from './avatarPreference'

afterEach(() => {
  clearAvatarPreference()
  vi.restoreAllMocks()
})

it('round-trips the wished avatar through localStorage', () => {
  expect(readAvatarPreference()).toBeNull()
  writeAvatarPreference('attack-bug')
  expect(readAvatarPreference()).toBe('attack-bug')
  expect(localStorage.getItem('release:avatar')).toBe('attack-bug')
})

it('keeps working in memory when storage throws', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied')
  })
  writeAvatarPreference('defense-hotfix')
  expect(readAvatarPreference()).toBe('defense-hotfix')
})
