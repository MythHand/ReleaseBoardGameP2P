import { assert } from 'vitest'
import {
  ackPresentation,
  beginPresentation,
  botReady,
  dropPresentationPeer,
  type PresentationRuntime,
  presentationReady,
} from './presentationGate'

const runtime = (): PresentationRuntime => ({
  incarnation: 'host-1',
  revision: 0,
  wait: null,
  botNotBefore: 0,
})
const start = () => beginPresentation(runtime(), 'g', ['host', 'guest'], 1000)
it('waits for the non-host and overlaps the two-second thinking interval', () => {
  const waiting = start()
  const host = ackPresentation(waiting, 'host', wait(waiting).id)
  expect(botReady(host, 3000)).toBe(false)
  const ready = ackPresentation(host, 'guest', wait(host).id)
  expect(botReady(ready, 2999)).toBe(false)
  expect(botReady(ready, 3000)).toBe(true)
  expect(botReady(ready, 4000)).toBe(true)
  expect(presentationReady(ready, 1001)).toBe(true)
})
it('caps absent or hidden clients at twelve seconds from publication', () => {
  const waiting = start()
  expect(botReady(waiting, 12999)).toBe(false)
  expect(botReady(waiting, 13000)).toBe(true)
  expect(botReady(beginPresentation(runtime(), 'g', [], 1000), 3000)).toBe(true)
})
it('does not accept unknown connections, duplicate, old, future, or wrong-incarnation acknowledgements', () => {
  const waiting = start()
  expect(ackPresentation(waiting, 'spectator', wait(waiting).id)).toBe(waiting)
  for (const id of [
    { ...wait(waiting).id, revision: 0 },
    { ...wait(waiting).id, revision: 2 },
    { ...wait(waiting).id, gameId: 'other' },
    { ...wait(waiting).id, incarnation: 'old' },
  ])
    expect(ackPresentation(waiting, 'guest', id)).toBe(waiting)
  const acked = ackPresentation(waiting, 'guest', wait(waiting).id)
  expect(ackPresentation(acked, 'guest', wait(waiting).id)).toBe(acked)
  expect(acked.wait?.deadline).toBe(13000)
  const next = beginPresentation(acked, 'g', ['host', 'new-guest'], 2000)
  expect(ackPresentation(next, 'guest', wait(next).id)).toBe(next)
  expect(ackPresentation(next, 'new-guest', wait(waiting).id)).toBe(next)
})
it('removes disconnected peers immediately without postponing the bound', () => {
  const waiting = start()
  const withoutGuest = dropPresentationPeer(waiting, 'guest')
  const ready = ackPresentation(withoutGuest, 'host', wait(waiting).id)
  expect(botReady(ready, 3000)).toBe(true)
  expect(ready.wait?.deadline).toBe(13000)
})

it('restores the original bound and thinking interval across repeated reloads', async () => {
  const { restorePresentationRuntime } = await import('./presentationGate')
  const first = start()
  const restored = restorePresentationRuntime(first, 'g', 'host-2', 7000)
  expect(restored.wait?.deadline).toBe(13000)
  expect(restored.wait?.id.incarnation).toBe('host-2')
  expect(restored.wait?.waitingPeers).toEqual([])
  const again = restorePresentationRuntime(restored, 'g', 'host-3', 12000)
  expect(again.wait?.deadline).toBe(13000)
  expect(again.botNotBefore).toBe(3000)
  expect(ackPresentation(again, 'guest', wait(first).id)).toBe(again)
})

it('releases missing or malformed legacy wait metadata without granting a fresh twelve seconds', async () => {
  const { restorePresentationRuntime } = await import('./presentationGate')
  for (const saved of [
    null,
    {},
    { ...start(), botNotBefore: NaN },
    { ...start(), wait: { ...start().wait, deadline: Infinity } },
  ]) {
    const restored = restorePresentationRuntime(saved, 'g', 'new', 7000)
    expect(presentationReady(restored, 7000)).toBe(true)
    expect(restored.wait).toBeNull()
  }
})

function wait(value: PresentationRuntime) {
  assert(value.wait)
  return value.wait
}
