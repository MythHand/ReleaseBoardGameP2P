import { randomAt, shuffle } from './rng'

it('is a pure function of seed and cursor', () => {
  expect(randomAt(42, 7)).toBe(randomAt(42, 7))
  expect(randomAt(42, 7)).not.toBe(randomAt(42, 8))
  expect(randomAt(42, 7)).not.toBe(randomAt(43, 7))
})

it('returns values in [0, 1)', () => {
  for (let c = 0; c < 500; c += 1) {
    const v = randomAt(12345, c)
    expect(v).toBeGreaterThanOrEqual(0)
    expect(v).toBeLessThan(1)
  }
})

it('shuffles deterministically for a given seed and cursor', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8]
  const a = shuffle(input, 99, 0)
  const b = shuffle(input, 99, 0)
  expect(a.items).toEqual(b.items)
  expect(shuffle(input, 100, 0).items).not.toEqual(a.items)
})

it('preserves the multiset and leaves the input untouched', () => {
  const input = [1, 2, 3, 4, 5, 6, 7, 8]
  const { items } = shuffle(input, 7, 3)
  expect([...items].sort((x, y) => x - y)).toEqual(input)
  expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
})

it('advances the cursor by length - 1', () => {
  expect(shuffle([1, 2, 3, 4, 5], 7, 10).cursor).toBe(14)
  expect(shuffle([], 7, 10).cursor).toBe(10)
  expect(shuffle([1], 7, 10).cursor).toBe(10)
})
