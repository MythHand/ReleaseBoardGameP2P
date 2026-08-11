import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { createLocalLink, type Sync, type Ticker } from './link'
import { createSession, type SessionRef } from './referee'

function manualTicker(): Ticker & { fire(): void; stopped: boolean } {
  let fn: (() => void) | null = null
  let stopped = false
  return {
    start: (f) => {
      fn = f
    },
    stop: () => {
      fn = null
      stopped = true
    },
    fire: () => fn?.(),
    get stopped() {
      return stopped
    },
  }
}

function localSetup() {
  const { session } = createSession({
    gameId: 'g1',
    keeperId: 'a',
    engine: createFakeEngine(),
    seed: 11,
    // Distinct peer ids: a `PlayerId` is a persisted client uuid and a peer id
    // is a PeerJS connection id, and the two are never equal in a real session.
    // Both being `string` is exactly what would hide the confusion.
    players: [
      { playerId: 'a', peerId: 'peer-a', name: 'Ann' },
      { playerId: 'b', peerId: 'peer-b', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const ref: SessionRef = { current: session }
  const ticker = manualTicker()
  let clock = 1_000
  const link = createLocalLink({ ref, me: 'a', now: () => (clock += 100), ticker })
  return { ref, link, ticker }
}

it('delivers the subscriber its own view on every committed action', () => {
  const { link } = localSetup()
  const seen: Sync[] = []
  link.subscribe((sync) => seen.push(sync))

  link.submit({ type: 'DRAW' })

  expect(seen).toHaveLength(1)
  expect(seen[0].view.self.id).toBe('a')
  expect(seen[0].view.turn.hasDrawn).toBe(true)
})

it('delivers a rejection to the actor who caused it', () => {
  const { link } = localSetup()
  const seen: Sync[] = []
  link.subscribe((sync) => seen.push(sync))

  link.submit({ type: 'DRAW' })
  link.submit({ type: 'DRAW' })

  expect(seen[1].events.map((e) => e.type)).toEqual(['rejected'])
})

it('stops delivering after unsubscribe', () => {
  const { link } = localSetup()
  const seen: Sync[] = []
  const off = link.subscribe((sync) => seen.push(sync))

  off()
  link.submit({ type: 'DRAW' })
  expect(seen).toEqual([])
})

it('stops its ticker on close', () => {
  const { link, ticker } = localSetup()

  link.close()

  expect(ticker.stopped).toBe(true)
})

it('delivers each seat its own view when several links share one session', () => {
  // Hotseat and the playground put one link per seat over one SessionRef. The
  // referee fans out to every seat, but only the submitting link's `deliver`
  // runs — without a shared dispatch every seat but the actor would freeze on
  // the deal and never see anyone else's move.
  const { ref, link: linkA } = localSetup()
  const linkB = createLocalLink({ ref, me: 'b', now: () => 1_500, ticker: manualTicker() })
  const atA: Sync[] = []
  const atB: Sync[] = []
  linkA.subscribe((sync) => atA.push(sync))
  linkB.subscribe((sync) => atB.push(sync))

  linkA.submit({ type: 'DRAW' })

  expect(ref.current.state.turn.drawnFrom).not.toEqual([])
  expect(atA).toHaveLength(1)
  expect(atB).toHaveLength(1)
  expect(atA[0].view.self.id).toBe('a')
  expect(atB[0].view.self.id).toBe('b')
})

it('stops delivering to a closed link while its siblings keep playing', () => {
  const { ref, link: linkA } = localSetup()
  const linkB = createLocalLink({ ref, me: 'b', now: () => 1_500, ticker: manualTicker() })
  const atB: Sync[] = []
  linkB.subscribe((sync) => atB.push(sync))

  linkB.close()
  linkA.submit({ type: 'DRAW' })

  expect(atB).toEqual([])
})

it('plays a seat that holds no connection at all', () => {
  // Solo play and the playground build sessions whose seats were never bound to
  // a PeerJS connection. The referee addresses seats by peer id, so a seat left
  // at `peerId: null` can neither submit nor receive: every click would be
  // discarded with no rejection, no error and no log.
  const { session } = createSession({
    gameId: 'g1',
    keeperId: 'a',
    engine: createFakeEngine(),
    seed: 11,
    players: [
      { playerId: 'a', peerId: null, name: 'Ann' },
      { playerId: 'b', peerId: null, name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const ref: SessionRef = { current: session }
  const link = createLocalLink({ ref, me: 'a', now: () => 1_000, ticker: manualTicker() })
  const seen: Sync[] = []
  link.subscribe((sync) => seen.push(sync))

  link.submit({ type: 'DRAW' })

  expect(ref.current.state.turn.drawnFrom).not.toEqual([])
  expect(seen).toHaveLength(1)
  expect(seen[0].view.self.id).toBe('a')
})
