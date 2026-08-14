import { expect, it, vi } from 'vitest'
import { createStartGate, INTRO_CAP_MS } from './startGate'

// A hand-driven timer, so the cap is asserted rather than waited for.
function timers() {
  const pending: { fn: () => void; ms: number }[] = []
  return {
    schedule: (fn: () => void, ms: number) => {
      const entry = { fn, ms }
      pending.push(entry)
      return () => {
        const i = pending.indexOf(entry)
        if (i >= 0) pending.splice(i, 1)
      }
    },
    fire: () => {
      for (const p of [...pending]) p.fn()
    },
    count: () => pending.length,
  }
}

it('stays shut until every seat has reported', () => {
  const t = timers()
  const gate = createStartGate({ expect: ['p1', 'p2', 'p3'], schedule: t.schedule })
  expect(gate.open).toBe(false)
  gate.ready('p1')
  gate.ready('p2')
  expect(gate.open).toBe(false)
  gate.ready('p3')
  expect(gate.open).toBe(true)
})

it('opens once, and tells whoever is listening', () => {
  const t = timers()
  const gate = createStartGate({ expect: ['p1'], schedule: t.schedule })
  const onOpen = vi.fn()
  gate.onOpen(onOpen)
  gate.ready('p1')
  gate.ready('p1')
  expect(onOpen).toHaveBeenCalledTimes(1)
})

it('tells a listener that arrives after it already opened', () => {
  const t = timers()
  const gate = createStartGate({ expect: ['p1'], schedule: t.schedule })
  gate.ready('p1')
  const onOpen = vi.fn()
  gate.onOpen(onOpen)
  expect(onOpen).toHaveBeenCalledTimes(1)
})

it('ignores a report from a seat it is not waiting on', () => {
  const t = timers()
  const gate = createStartGate({ expect: ['p1', 'p2'], schedule: t.schedule })
  gate.ready('p9')
  expect(gate.open).toBe(false)
})

it('opens on the cap, so one silent peer cannot freeze the table', () => {
  const t = timers()
  const onOpen = vi.fn()
  const gate = createStartGate({ expect: ['p1', 'p2'], schedule: t.schedule })
  gate.onOpen(onOpen)
  gate.ready('p1')
  t.fire()
  expect(gate.open).toBe(true)
  expect(onOpen).toHaveBeenCalledTimes(1)
})

it('drops its timer once it is open', () => {
  const t = timers()
  const gate = createStartGate({ expect: ['p1'], schedule: t.schedule })
  expect(t.count()).toBe(1)
  gate.ready('p1')
  expect(t.count()).toBe(0)
})

it('opens immediately when nobody is expected', () => {
  const t = timers()
  const gate = createStartGate({ expect: [], schedule: t.schedule })
  expect(gate.open).toBe(true)
})

it('a cancelled gate never opens and never fires', () => {
  const t = timers()
  const onOpen = vi.fn()
  const gate = createStartGate({ expect: ['p1'], schedule: t.schedule })
  gate.onOpen(onOpen)
  gate.cancel()
  gate.ready('p1')
  t.fire()
  expect(gate.open).toBe(false)
  expect(onOpen).not.toHaveBeenCalled()
})

it('caps at twelve seconds by default', () => {
  const seen: number[] = []
  createStartGate({
    expect: ['p1'],
    schedule: (_fn, ms) => {
      seen.push(ms)
      return () => {}
    },
  })
  expect(seen).toEqual([INTRO_CAP_MS])
})
