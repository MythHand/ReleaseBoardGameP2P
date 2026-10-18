import { backoffMs, GUEST_RECONNECT_ATTEMPTS, MAX_RECONNECT_ATTEMPTS } from './reconnect'

it('backs off further with each attempt', () => {
  expect(backoffMs(1)).toBeLessThan(backoffMs(2))
  expect(backoffMs(2)).toBeLessThan(backoffMs(3))
})

it('caps the wait so a long outage does not stall for minutes', () => {
  expect(backoffMs(MAX_RECONNECT_ATTEMPTS)).toBeLessThanOrEqual(8_000)
})

it('guest retry backoff sums to between 110 and 130 seconds', () => {
  let total = 0
  for (let attempt = 1; attempt < GUEST_RECONNECT_ATTEMPTS; attempt++) {
    total += backoffMs(attempt)
  }
  expect(total).toBeGreaterThanOrEqual(110_000)
  expect(total).toBeLessThanOrEqual(130_000)
})
