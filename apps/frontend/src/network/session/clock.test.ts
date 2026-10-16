import { createAuthorityClock, createRemoteClock } from './clock'

it('uses RTT minus keeper processing time and monotonic elapsed time', () => {
  let now = 1_220
  const clock = createRemoteClock(() => now)
  clock.anchor(123, now)
  expect(
    clock.sample({
      sentAtLocal: 1000,
      receivedAtLocal: 1220,
      receivedAtKeeper: 1800000000100,
      sentAtKeeper: 1800000000120,
    }),
  ).toBe(true)
  now = 1300
  expect(clock.now()).toBe(1800000000300)
  clock.anchor(0, now)
  expect(clock.now()).toBe(1800000000300)
})

it.each([0, 60_000, -60_000, -3_523_000])('ignores client wall clock skew %s', (skew) => {
  const wall = vi.spyOn(Date, 'now').mockReturnValue(1800000000000 + skew)
  const clock = createRemoteClock(() => 200)
  clock.sample({
    sentAtLocal: 0,
    receivedAtLocal: 200,
    receivedAtKeeper: 10100,
    sentAtKeeper: 10100,
  })
  expect(clock.now()).toBe(10200)
  wall.mockRestore()
})

it('keeps the lowest RTT anchor until it ages out or leaves the last eight samples', () => {
  let now = 100
  const clock = createRemoteClock(() => now)
  const sample = (rtt: number, keeper: number) =>
    clock.sample({
      sentAtLocal: now - rtt,
      receivedAtLocal: now,
      receivedAtKeeper: keeper,
      sentAtKeeper: keeper,
    })
  sample(10, 1000)
  now = 200
  sample(100, 0)
  expect(clock.now()).toBe(1105)
  for (let i = 0; i < 7; i++) {
    now += 100
    sample(100, 2000)
  }
  expect(clock.now()).toBe(2050)
  now = 32_000
  sample(200, 3000)
  expect(clock.now()).toBe(3100)
})

it('prefers the newest equal RTT and notifies on reset without keeping its old epoch', () => {
  let now = 100
  const clock = createRemoteClock(() => now)
  const changed = vi.fn()
  const unsubscribe = clock.subscribe(changed)
  clock.sample({ sentAtLocal: 0, receivedAtLocal: now, receivedAtKeeper: 1000, sentAtKeeper: 1000 })
  now = 200
  clock.sample({
    sentAtLocal: 100,
    receivedAtLocal: now,
    receivedAtKeeper: 2000,
    sentAtKeeper: 2000,
  })
  expect(clock.now()).toBe(2050)
  const revision = clock.getSnapshot()
  clock.reset()
  expect(clock.now()).toBeNull()
  expect(clock.getSnapshot()).toBeGreaterThan(revision)
  expect(changed).toHaveBeenCalledTimes(3)
  unsubscribe()
  clock.anchor(4000, now)
  expect(changed).toHaveBeenCalledTimes(3)
})

it.each([
  { sentAtLocal: 0, receivedAtLocal: 100, receivedAtKeeper: NaN, sentAtKeeper: 1 },
  { sentAtLocal: 0, receivedAtLocal: 100, receivedAtKeeper: 200, sentAtKeeper: 100 },
  { sentAtLocal: 0, receivedAtLocal: 100, receivedAtKeeper: 0, sentAtKeeper: 200 },
])('rejects malformed or impossible samples without changing calibration', (sample) => {
  const clock = createRemoteClock(() => 100)
  expect(clock.sample(sample)).toBe(false)
  expect(clock.now()).toBeNull()
  expect(clock.getSnapshot()).toBe(0)
})

it('advances authority from one epoch anchor even when system time jumps', () => {
  let epoch = 10_000
  let mono = 100
  const clock = createAuthorityClock({ epochNow: () => epoch, monotonicNow: () => mono })
  mono += 500
  epoch -= 3_523_000
  expect(clock.now()).toBe(10_500)
  const successor = createAuthorityClock({
    epochNow: () => epoch,
    monotonicNow: () => mono,
    initialKeeperNow: clock.now(),
  })
  mono += 500
  expect(successor.now()).toBe(11_000)
})
