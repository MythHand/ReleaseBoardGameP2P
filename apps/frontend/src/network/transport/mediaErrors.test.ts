import { expect, it, vi } from 'vitest'
import { routeMediaError } from './mediaErrors'

it('attributes a media-only expiry and never swallows an outstanding data dial', () => {
  const fail = vi.fn()
  const error = { type: 'peer-unavailable', message: 'Could not connect to peer remote' }
  const targets = new Map([['remote', fail]])
  expect(routeMediaError(error, new Set(), targets)).toBe(true)
  expect(fail).toHaveBeenCalledWith(error)
  fail.mockClear()
  expect(routeMediaError(error, new Set(['remote']), targets)).toBe(false)
  expect(fail).not.toHaveBeenCalled()
  expect(routeMediaError({ type: 'network', message: 'lost socket' }, new Set(), targets)).toBe(
    false,
  )
  expect(
    routeMediaError({ ...error, message: 'Could not connect to peer other' }, new Set(), targets),
  ).toBe(false)
})
