import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import type { Transport } from '../transport/peer'
import type { Ticker } from './link'
import { createMemoryNetwork } from './memoryNetwork'
import { createSession, type SessionRef } from './referee'
import { attachKeeper } from './remoteLink'
import { createStartGate } from './startGate'

// A ticker the test advances by hand, so nothing here waits on a real clock.
function manualTicker(): Ticker & { fire(): void } {
  let fn: (() => void) | null = null
  return {
    start(f) {
      fn = f
    },
    stop() {
      fn = null
    },
    fire() {
      fn?.()
    },
  }
}

// The same minimal transport double remoteLink.test.ts builds — a single-peer
// network with nobody else on it, since a game entirely of bots and one human
// has no other peer to send to.
function fakeTransport(): Transport {
  return createMemoryNetwork(['peer-me']).transport('peer-me')
}

function botGame(botCount: number) {
  const engine = createFakeEngine()
  const { session } = createSession({
    gameId: 'g1',
    keeperId: 'p1',
    engine,
    // Choose this empirically rather than trusting the literal: a seed whose
    // opening draw is a trigger opens a pending, PUSH is then refused, and the
    // turn never reaches p2. Any seed reaching a clean draw serves. 7 is one
    // of the seeds where the opening draw IS a trigger, which is exactly what
    // this comment warns against — verified by running the suite, not by
    // eyeballing the deck. 17 reaches a clean draw and drives the bot's turn
    // across several ticks (five, at this deck/seat count) before handing
    // p1 the turn back, rather than resolving in one, so the test still
    // exercises "one action per tick" rather than degenerating into a single
    // step.
    seed: 17,
    players: [
      { playerId: 'p1', peerId: 'peer-me', name: 'Ann' },
      ...Array.from({ length: botCount }, (_, i) => ({
        playerId: `p${i + 2}`,
        peerId: null,
        name: `Бот ${i + 1}`,
        bot: true,
      })),
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const ref: SessionRef = { current: session }
  const gate = createStartGate({ expect: ['p1'] })
  const ticker = manualTicker()
  const keeper = attachKeeper({
    ref,
    transport: fakeTransport(),
    now: () => Date.now(),
    ticker,
    gate,
  })
  return { ref, gate, ticker, keeper }
}

// The gate's whole purpose, in the shape a bot-seated match gives it: the
// human is watching cards fly, and the bots must not be playing behind the
// animation.
it('holds every bot until the human reports its opening done', () => {
  const { ref, ticker, keeper } = botGame(1)
  const before = ref.current
  ticker.fire()
  expect(ref.current).toBe(before)

  keeper.introReady('peer-me')
  // The human is seat p1 and moves first, so the tick after the gate opens
  // stamps the turn clock rather than playing a bot — either way, the table is
  // no longer frozen.
  ticker.fire()
  expect(ref.current).not.toBe(before)
})

// The point of the whole feature: a seat with nobody behind it takes its turn.
it('plays a bot seat through to the human getting the turn back', () => {
  const { ref, ticker, keeper } = botGame(1)
  keeper.introReady('peer-me')

  // End the human's opening turn, so the bot is on.
  keeper.link.submit({ type: 'DRAW' })
  keeper.link.submit({ type: 'PUSH' })
  expect(ref.current.state.turn.player).toBe('p2')

  // One action per tick, exactly as an absent seat has always been driven.
  for (let i = 0; i < 20 && ref.current.state.turn.player === 'p2'; i += 1) ticker.fire()
  expect(ref.current.state.turn.player).toBe('p1')
})

// A bot holds no connection, so nothing may be addressed to it.
it('never projects a hand to a seat nobody is holding', () => {
  const { ref } = botGame(2)
  expect(ref.current.seats.filter((s) => s.bot)).toHaveLength(2)
  expect(ref.current.seats.filter((s) => s.peerId !== null)).toHaveLength(1)
})
