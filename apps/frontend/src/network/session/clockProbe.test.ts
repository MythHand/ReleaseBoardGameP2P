import { createRemoteClock } from './clock'
import { createClockProbe } from './clockProbe'

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(0)
})
afterEach(() => {
  vi.useRealTimers()
})

function setup() {
  const clock = createRemoteClock(() => Date.now())
  const send = vi.fn()
  const probe = createClockProbe({ clock, monotonicNow: () => Date.now(), send })
  return { clock, send, probe }
}

it('starts three probes, refreshes at ten seconds, and cancels all work on close', () => {
  const { probe, send } = setup()
  probe.activate('g1')
  expect(send).toHaveBeenCalledTimes(1)
  vi.advanceTimersByTime(500)
  expect(send).toHaveBeenCalledTimes(3)
  vi.advanceTimersByTime(9500)
  expect(send).toHaveBeenCalledTimes(4)
  probe.close()
  expect(vi.getTimerCount()).toBe(0)
  vi.advanceTimersByTime(30_000)
  expect(send).toHaveBeenCalledTimes(4)
})

it('bounds outstanding requests and rejects expired replies', () => {
  const { probe, send, clock } = setup()
  probe.activate('g1')
  for (let i = 0; i < 10; i++) probe.refresh()
  expect(vi.getTimerCount()).toBeLessThanOrEqual(3)
  vi.advanceTimersByTime(500)
  expect(send).toHaveBeenCalledTimes(3)
  vi.advanceTimersByTime(5001)
  probe.receive({ gameId: 'g1', requestId: send.mock.calls[0][1], receivedAt: 100, sentAt: 100 })
  expect(clock.now()).toBeNull()
  probe.close()
})

it('accepts a synchronous response and rejects wrong games, duplicate and malformed replies', () => {
  const { probe, clock, send } = setup()
  send.mockImplementation((gameId, requestId) =>
    probe.receive({ gameId, requestId, receivedAt: 1000, sentAt: 1000 }),
  )
  probe.activate('g1')
  expect(clock.now()).toBe(1000)
  const revision = clock.getSnapshot()
  for (const payload of [
    null,
    {},
    { gameId: 'wrong', requestId: 1, receivedAt: 9000, sentAt: 9000 },
    { gameId: 'g1', requestId: 1, receivedAt: 9000, sentAt: 9000 },
  ])
    probe.receive(payload)
  expect(clock.getSnapshot()).toBe(revision)
  probe.close()
})

it('does not reuse IDs or calibration across same-game reconnect and rematch', () => {
  const { probe, send, clock } = setup()
  probe.activate('g1')
  const oldId = send.mock.calls[0][1]
  probe.reset()
  probe.activate('g1')
  expect(send.mock.calls[1][1]).not.toBe(oldId)
  probe.receive({ gameId: 'g1', requestId: oldId, receivedAt: 1000, sentAt: 1000 })
  expect(clock.now()).toBeNull()
  const secondId = send.mock.calls[1][1]
  probe.activate('g2')
  probe.receive({ gameId: 'g1', requestId: secondId, receivedAt: 1000, sentAt: 1000 })
  expect(clock.now()).toBeNull()
  probe.close()
})
