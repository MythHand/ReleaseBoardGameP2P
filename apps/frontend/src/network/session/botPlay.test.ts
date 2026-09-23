import { createFakeEngine, FAKE_DECK, FAKE_EVENTS, WINDOW_FIRST_MS } from '@release/engine/fake'
import type { Transport } from '../transport/peer'
import type { Ticker } from './link'
import { createMemoryNetwork } from './memoryNetwork'
import { createSession, type SessionRef } from './referee'
import { attachKeeper } from './remoteLink'
import { createStartGate } from './startGate'

// The keeper's 250ms interval, which the real ticker would be firing on.
const TICK_MS = 250

// A ticker the test advances by hand, so nothing here waits on a real clock —
// and a clock that moves with it. The two must travel together: the keeper
// closes a contest window on elapsed time (`tick`, the only thing allowed to),
// so a ticker that fires instantly against a frozen clock would sit out a
// 15-second deadline that never arrives and the bot's turn would never end.
function manualTicker(clock: { at: number }): Ticker & { fire(): void } {
  let fn: (() => void) | null = null
  return {
    start(f) {
      fn = f
    },
    stop() {
      fn = null
    },
    fire() {
      clock.at += TICK_MS
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
  const clock = { at: 1_000_000 }
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
    // across several ticks before handing p1 the turn back, rather than
    // resolving in one, so the test still exercises "one action per tick"
    // rather than degenerating into a single step. How many ticks that takes
    // is the deck's business, not this test's: at this seed the bot releases,
    // and the window that opens costs it the window's whole deadline in
    // ticks. Which is why the clock below moves and the loop counts in time.
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
  const ticker = manualTicker(clock)
  const keeper = attachKeeper({
    ref,
    transport: fakeTransport(),
    now: () => clock.at,
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

  // One action per tick, exactly as an absent seat has always been driven. The
  // budget is stated in time rather than in ticks, because what the bot's turn
  // can cost is a contest window's deadline — a duration the engine owns.
  const budget = WINDOW_FIRST_MS + 5_000
  for (let i = 0; i < budget / 250 && ref.current.state.turn.player === 'p2'; i += 1) {
    ticker.fire()
  }
  expect(ref.current.state.turn.player).toBe('p1')
})

// A bot holds no connection, so nothing may be addressed to it.
it('never projects a hand to a seat nobody is holding', () => {
  const { ref } = botGame(2)
  expect(ref.current.seats.filter((s) => s.bot)).toHaveLength(2)
  expect(ref.current.seats.filter((s) => s.peerId !== null)).toHaveLength(1)
})

it('lets two bots finish after the connected human keeper is eliminated', () => {
  const { ref, ticker, keeper } = botGame(2)
  const state = ref.current.state
  ref.current = {
    ...ref.current,
    state: {
      ...state,
      players: Object.fromEntries(
        Object.entries(state.players).map(([id, player]) => [
          id,
          { ...player, hand: [], release: {} },
        ]),
      ),
      decks: {
        ...state.decks,
        main: [
          [
            { id: 'trigger-error-503', uid: 'human-503' },
            { id: 'defense-hotfix', uid: 'bot-draw' },
            { id: 'trigger-error-503', uid: 'bot-503' },
          ],
        ],
      },
    },
  }
  keeper.introReady('peer-me')
  keeper.link.submit({ type: 'DRAW' })
  expect(ref.current.state.eliminated).toEqual(['p1'])
  for (let i = 0; i < 20 && !ref.current.state.over; i += 1) ticker.fire()
  expect(ref.current.log).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ type: 'turnStarted', player: 'p2' }),
      expect.objectContaining({ type: 'turnStarted', player: 'p3' }),
    ]),
  )
  expect(ref.current.state.over).toEqual({ winner: 'p2', condition: 'lastStanding' })
  expect(ref.current.seats.find((s) => s.playerId === 'p1')?.peerId).toBe('peer-me')
})
