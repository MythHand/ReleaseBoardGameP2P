import { classifyLoadFailure } from './loadFailure'

it('distinguishes offline loading from an application exception', () => {
  expect(classifyLoadFailure(new TypeError('Failed to fetch dynamically imported module'), false)).toBe('offline')
  expect(classifyLoadFailure(new TypeError('Failed to fetch dynamically imported module'), true)).toBe('load')
  expect(classifyLoadFailure(new Error('invalid game state'), true)).toBe('application')
})
