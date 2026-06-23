import { createEnvelope, nextSeq, parseEnvelope } from './envelope'
import type { Message } from './types'

const joinMsg: Message = { type: 'JOIN_REQUEST', payload: { name: 'Ann' } }

it('wraps a message into an envelope with from + seq', () => {
  const env = createEnvelope(joinMsg, 'peer-1', 7)
  expect(env).toEqual({ type: 'JOIN_REQUEST', payload: { name: 'Ann' }, from: 'peer-1', seq: 7 })
})

it('round-trips through serialize/parse', () => {
  const env = createEnvelope(joinMsg, 'peer-1', 7)
  const parsed = parseEnvelope(JSON.stringify(env))
  expect(parsed).toEqual(env)
})

it('throws on malformed input', () => {
  expect(() => parseEnvelope('not json')).toThrow()
  expect(() => parseEnvelope('{"payload":{}}')).toThrow(/type/)
})

it('nextSeq increases monotonically', () => {
  const a = nextSeq()
  const b = nextSeq()
  expect(b).toBeGreaterThan(a)
})
