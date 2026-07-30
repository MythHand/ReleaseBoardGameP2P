import { botAction, createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import type { Intent } from '../types'
import { createLocalLink, type Ticker } from './link'
import { createMemoryNetwork } from './memoryNetwork'
import type { Outgoing, SessionRef } from './referee'
import {
  ABSENT_GRACE_MS,
  applyIntent,
  createSession,
  disconnect,
  driveAbsent,
  rebind,
  type Session,
  tick,
} from './referee'
import { attachKeeper, createRemoteLink } from './remoteLink'

const PLAYERS = [
  { playerId: 'a', peerId: 'peer-a', name: 'Ann' },
  { playerId: 'b', peerId: 'peer-b', name: 'Bo' },
  { playerId: 'c', peerId: 'peer-c', name: 'Cy' },
]

function start(seed: number): Session {
  return createSession({
    gameId: 'g1',
    keeperId: 'a',
    engine: createFakeEngine(),
    seed,
    players: PLAYERS,
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  }).session
}

// Drives every seat with the engine's own policy, pairing each outgoing
// message with the session state as it stood at the moment that message was
// produced. Intents are stripped of `player`/`at` exactly as a real peer's
// would be, so the keeper re-derives both.
//
// The per-message state matters for the leak property: a card a viewer
// legitimately held is fine to see in their own SYNC even if the engine's
// `handTransfer` mechanic later moves that same uid to another seat, so that
// property must judge each message against its own moment, not against
// wherever the game ends up. The other three properties only need the final
// session, hence `playOut` below as a thin wrapper — one driver, so the two
// callers cannot drift out of sync with each other.
// One simulated second per step: the grace period and the window deadlines are
// tens of seconds, so a finer step would need thousands of iterations to reach
// either, and a coarser one would step straight over them.
const STEP_MS = 1_000

// A run that changes nothing for this long has nothing left to wait for — the
// longest timer in the session is the absent-seat grace period, so twice it is
// past every deadline that could still wake a seat up.
const IDLE_LIMIT_MS = ABSENT_GRACE_MS * 2

interface PlayOut {
  session: Session
  sent: { outgoing: Outgoing; state: Session['state'] }[]
  // True when the step budget ran out with the game still going: a caller
  // asserting "the game finished" has to know it finished rather than that the
  // harness simply stopped looking.
  exhausted: boolean
}

function playOutWithHistory(
  session: Session,
  steps = 400,
  stopWhen?: (s: Session) => boolean,
): PlayOut {
  const sent: { outgoing: Outgoing; state: Session['state'] }[] = []
  // The keeper reads one clock, so the harness advances one clock: `tick`,
  // `driveAbsent` and every stamped intent all see the same `now` within a
  // step. Handing driveAbsent a forged future time instead would make every
  // seat's grace period elapse instantly, which is the one thing this timing
  // is here to exercise.
  let now = 1_000
  let lastChange = now
  let step = 0

  const record = (current: Session, outgoing: Outgoing[]) => {
    for (const o of outgoing) sent.push({ outgoing: o, state: current.state })
    lastChange = now
  }

  for (; step < steps && !session.state.over; step += 1) {
    if (stopWhen?.(session)) break
    now += STEP_MS
    // Nothing has moved for longer than any timer in the session runs: the run
    // is genuinely stuck, not merely waiting.
    if (now - lastChange > IDLE_LIMIT_MS) break

    const expired = tick(session, now)
    if (expired.session !== session) {
      session = expired.session
      record(session, expired.outgoing)
      continue
    }

    // Mirrors attachKeeper's ticker: the keeper owns the clock, so it both
    // expires deadlines and plays seats that have gone silent. Without this a
    // seat that leaves on its own turn stalls every other player forever.
    const driven = driveAbsent(session, now)
    if (driven.session !== session) {
      session = driven.session
      record(session, driven.outgoing)
      continue
    }

    for (const seat of PLAYERS) {
      const action = botAction(session.engine, session.state, seat.playerId, now)
      // WINDOW_EXPIRED is the keeper's own action and no peer may submit it —
      // `tick` above is what closes a window here.
      if (!action || action.type === 'WINDOW_EXPIRED') continue
      const { player: _p, at: _a, ...intent } = action as { player?: string; at?: number }
      const result = applyIntent(session, seat.peerId, intent as never, now)
      if (result.session === session) continue
      session = result.session
      record(session, result.outgoing)
      break
    }
    // No `break` on a step where nobody moved: a seat inside its grace period
    // has nothing to do yet and the keeper will play it once time passes.
  }

  return { session, sent, exhausted: step >= steps && !session.state.over }
}

function playOut(
  session: Session,
  steps = 400,
  stopWhen?: (s: Session) => boolean,
): { session: Session; sent: Outgoing[]; exhausted: boolean } {
  const { session: final, sent, exhausted } = playOutWithHistory(session, steps, stopWhen)
  return { session: final, sent: sent.map((s) => s.outgoing), exhausted }
}

it('never sends a peer a card identity it is not entitled to', () => {
  for (const seed of [1, 2, 3, 5, 8, 13]) {
    const { session, sent } = playOutWithHistory(start(seed))

    for (const { outgoing, state } of sent) {
      if (outgoing.message.type !== 'SYNC') continue
      const viewer = PLAYERS.find((p) => p.peerId === outgoing.to)
      if (!viewer) throw new Error(`SYNC addressed to a non-seat: ${outgoing.to}`)

      // 1. Right recipient's projection: the fan-out must not cross-deliver
      // one seat's view to another. The engine instance is stable across the
      // whole game, so the final session's is as good as any at that moment.
      expect(outgoing.message.payload.view).toEqual(session.engine.project(state, viewer.playerId))

      // 2. Audience honoured: every event obeys its own `visibleTo`. A
      // `rejected` event reaching this loop at all is already a stronger
      // guarantee than this harness can currently exercise: `forViewer`
      // (audience.ts) strips every `rejected` event unconditionally, for
      // every viewer, before any fan-out — see audience.test.ts's "never
      // includes a rejection, not even for the actor named in it" — and the
      // one path that does put a rejection on the wire, `applyIntent`'s
      // rejection branch (referee.ts), unicasts it to the submitter alone —
      // see referee.test.ts's "returns a rejection to the submitter alone".
      // Those two tests carry the real coverage for "a rejection only ever
      // reaches its submitter"; this clause is a belt-and-braces guard
      // against a future change to that routing, kept honest about being
      // structurally unreachable today rather than presented as evidence
      // this full-game harness independently exercises it.
      for (const event of outgoing.message.payload.events) {
        if (event.type === 'rejected') {
          expect('player' in event.action && event.action.player === viewer.playerId).toBe(true)
        } else {
          expect(!event.visibleTo || event.visibleTo.includes(viewer.playerId)).toBe(true)
        }
      }

      // 3. No deck leakage: the ordered piles as they stood at the moment of
      // this message never appear on the wire, for anyone. Both piles count —
      // the event deck is hidden ordered information exactly as the draw pile
      // is, and knowing which event comes next is worth as much as knowing
      // which card does.
      const wire = JSON.stringify(outgoing.message.payload)
      const hidden = [...state.decks.main.flat(), ...state.decks.events]
      for (const uid of hidden.map((c) => c.uid)) {
        expect(wire).not.toContain(uid)
      }
    }
  }
})

// One recorded step of a game: either the keeper's ticker firing, or one seat
// submitting one intent through its own GameLink. Replaying the same script on
// both sides is what makes the comparison a seam test rather than a restatement
// of the engine's determinism — the intents, the order, and the number of clock
// reads are identical, so only the path they travelled differs.
type Op = { kind: 'tick' } | { kind: 'submit'; seat: string; intent: Intent }

function manualTicker(): Ticker & { fire(): void } {
  let fn: (() => void) | null = null
  return { start: (f) => (fn = f), stop: () => (fn = null), fire: () => fn?.() }
}

const NO_TICKER: Ticker = { start: () => {}, stop: () => {} }

// A clock shared by every link on one side. Each `submit` and each ticker fire
// reads it exactly once, on both sides, so the `at` stamps line up step for
// step and any divergence in the final state is the seam's, not the clock's.
function clock() {
  let t = 1_000
  return () => (t += 100)
}

// Drives a full game through LocalLink, recording what it did.
function throughLocalLink(seed: number): { ref: SessionRef; script: Op[] } {
  const ref: SessionRef = { current: start(seed) }
  const now = clock()
  const ticker = manualTicker()
  const links = new Map(
    PLAYERS.map((p, i) => [
      p.playerId,
      createLocalLink({ ref, me: p.playerId, now, ticker: i === 0 ? ticker : NO_TICKER }),
    ]),
  )
  const script: Op[] = []

  for (let step = 0; step < 400 && !ref.current.state.over; step += 1) {
    ticker.fire()
    script.push({ kind: 'tick' })
    if (ref.current.state.over) break

    let moved = false
    for (const p of PLAYERS) {
      const action = botAction(ref.current.engine, ref.current.state, p.playerId, 0)
      // `at` is unused below (the keeper stamps it), except in botAction's
      // WINDOW_EXPIRED branch — which no peer may submit at all, so the ticker
      // above is what closes windows here.
      if (!action || action.type === 'WINDOW_EXPIRED') continue
      const { player: _p, at: _a, ...intent } = action as { player?: string; at?: number }
      const before = ref.current
      links.get(p.playerId)?.submit(intent as Intent)
      script.push({ kind: 'submit', seat: p.playerId, intent: intent as Intent })
      if (ref.current === before) continue
      moved = true
      break
    }
    if (!moved) break
  }

  for (const link of links.values()) link.close()
  return { ref, script }
}

// Replays that script through RemoteLink -> memory transport -> attachKeeper.
// Every seat goes over the wire, the keeper's own included: its frame is
// delivered to its own inbox, which is where a keeper that is also a player
// really does receive it from.
function throughTheWire(seed: number, script: Op[]): SessionRef {
  const net = createMemoryNetwork(PLAYERS.map((p) => p.peerId))
  const ref: SessionRef = { current: start(seed) }
  const now = clock()
  const ticker = manualTicker()
  const links = new Map(
    PLAYERS.map((p) => {
      const remote = createRemoteLink({ transport: net.transport(p.peerId), keeperId: 'peer-a' })
      net.onDeliver(p.peerId, (frame) => remote.handleMessage(frame))
      return [p.playerId, remote.link]
    }),
  )
  const keeper = attachKeeper({ ref, transport: net.transport('peer-a'), now, ticker })
  // Registered last: 'peer-a' is the keeper's own inbox, and its seat's syncs
  // reach it through onLocalSync rather than through a connection to itself.
  net.onDeliver('peer-a', (frame) => keeper.handleMessage(frame))

  for (const op of script) {
    if (op.kind === 'tick') ticker.fire()
    else links.get(op.seat)?.submit(op.intent)
  }

  keeper.close()
  return ref
}

it('reaches the same state whether or not the intents crossed a wire', () => {
  const { ref: local, script } = throughLocalLink(21)
  const remote = throughTheWire(21, script)

  // The script has to be a real game, or "identical" would be vacuous.
  expect(script.filter((op) => op.kind === 'submit').length).toBeGreaterThan(20)
  expect(remote.current.state).toEqual(local.current.state)
  expect(remote.current.state.eventSeq).toBe(local.current.state.eventSeq)
})

it('restores a reconnecting peer to exactly its projection', () => {
  // Mid-reaction-window is the case worth covering: a seat that drops with a
  // decision open is the one whose view is hardest to rebuild, so the run
  // stops the moment a window is live rather than at an arbitrary step.
  const { session } = playOut(start(34), 400, (s) => s.state.window !== null)
  expect(session.state.window).not.toBeNull()

  const dropped = disconnect(session, 'peer-b', 9_000).session
  const { outgoing } = rebind(dropped, 'b', 'peer-b-2')
  const sync = outgoing[0]

  expect(sync.message.type).toBe('SYNC')
  if (sync.message.type === 'SYNC') {
    expect(sync.message.payload.view).toEqual(dropped.engine.project(dropped.state, 'b'))
  }
})

it('never lets one seat stall the whole game', () => {
  // 'a' holds the turn at the deal and never speaks again.
  const abandoned = disconnect(start(55), 'peer-a', 1_000).session
  const { session, exhausted } = playOut(abandoned)

  // The criterion is that the game *finishes*, not that the turn moved once:
  // a single handover of the turn is satisfied two turns before the same seat
  // stalls everything again.
  expect(session.state.over).not.toBeNull()
  // And it finished on its own rather than the harness running out of steps.
  expect(exhausted).toBe(false)
})
