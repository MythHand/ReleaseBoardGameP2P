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
    players: [
      { playerId: 'a', peerId: 'a', name: 'Ann' },
      { playerId: 'b', peerId: 'b', name: 'Bo' },
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
