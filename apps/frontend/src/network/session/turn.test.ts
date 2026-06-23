import { nextTurn } from './turn'

const seating = ['a', 'b', 'c', 'd']

it('advances clockwise and wraps', () => {
  expect(nextTurn({ seating, current: 'a' })).toBe('b')
  expect(nextTurn({ seating, current: 'd' })).toBe('a')
})

it('skips eliminated players', () => {
  expect(nextTurn({ seating, current: 'a', eliminated: ['b', 'c'] })).toBe('d')
  expect(nextTurn({ seating, current: 'c', eliminated: ['d', 'a'] })).toBe('b')
})

it('throws when no eligible player remains', () => {
  expect(() => nextTurn({ seating, current: 'a', eliminated: ['a', 'b', 'c', 'd'] })).toThrow()
})
