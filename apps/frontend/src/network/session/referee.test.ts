import { CARD_RULES, type GameState, type Pending } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS, TURN_ACTION_MS } from '@release/engine/fake'
import { vi } from 'vitest'
import {
  ABSENT_GRACE_MS,
  applyIntent,
  createSession,
  disconnect,
  driveUnattended,
  rebind,
  type Session,
  type SessionResult,
  STALL_WARNING_TICKS,
  tick,
} from './referee'

// Not exported from @release/engine or @release/engine/fake, so this is a
// duplicated literal rather than an import — kept as a named constant (instead
// of an inline 15_000) so a future bump to the real constant in
// packages/engine/src/fake/window.ts shows up here as an intentional edit
// rather than this test silently drifting out of sync.
const WINDOW_FIRST_MS = 15_000

function twoPlayerSession(seed = 1) {
  return createSession({
    gameId: 'g1',
    keeperId: 'a',
    engine: createFakeEngine(),
    // Seed 42 puts a trigger card (publicly revealed on draw, per Task 4's
    // "hides the drawn card" test) at the top of pile 0. Seed 1 deals a normal
    // card there instead, so a draw stays private to the drawer as intended.
    seed,
    players: [
      { playerId: 'a', peerId: 'peer-a', name: 'Ann' },
      { playerId: 'b', peerId: 'peer-b', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
}

// A bot seat, and a human who is present. The bot is seated FIRST because the
// engine starts the match on `seating[0]` — so it owes a move immediately,
// which is the whole thing under test.
function botFirstSession(seed = 1) {
  return createSession({
    gameId: 'g1',
    keeperId: 'b',
    engine: createFakeEngine(),
    seed,
    players: [
      { playerId: 'a', peerId: null, name: 'Bot 1', bot: true },
      { playerId: 'b', peerId: 'peer-b', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
}

it('drives a bot seat at once: there is no absence to wait out', () => {
  const { session } = botFirstSession()
  const driven = driveUnattended(session, 1_000)
  expect(driven.session).not.toBe(session)
  expect(driven.outgoing.length).toBeGreaterThan(0)
})

// Not a recovery — a name. A stall that says nothing costs an hour to find; one
// that says which seat and which pending costs a minute. But it has to say its
// piece once, not on every one of the ticker's four-times-a-second ticks —
// design spec §6 asks for the warning only once the same pending has stood
// unchanged across N ticks, so this drives the exact same session object
// through `driveUnattended` repeatedly, the way the real ticker would.
it('complains once an unattended seat`s stall has stood for the threshold', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const { session } = botFirstSession()
  // A pending owed by the bot that its policy has no answer for: with the
  // discard empty, `botAction`'s `pickFromDiscard` branch (bots.ts) offers
  // `card: ''` — not null, but `onPickFromDiscard` (discard.ts) rejects it
  // outright as "not on offer", which is exactly the shape of the trigger-card
  // rejection this task exists to name. Either way `reduce` leaves state
  // untouched, so this fixture stands in for both without needing a real
  // trigger card in the discard pile.
  const stuck: Session = {
    ...session,
    state: {
      ...session.state,
      // The exact variant from packages/engine/src/state.ts:154 — `source` is
      // part of it, and `picks` is typed `1 | 2`.
      pending: {
        kind: 'pickFromDiscard',
        player: 'a',
        options: [],
        picks: 1,
        source: 'operation-git-cherry-pick',
        raisedAt: 1,
      },
    } as GameState,
  }

  // The same `stuck` object every time, exactly as the ticker would hand it
  // back when nothing about the stall has moved: `driveUnattended` returns the
  // untouched input session when nothing changes, so this reproduces "the same
  // pending across N ticks" rather than N unrelated calls.
  for (let i = 0; i < STALL_WARNING_TICKS - 1; i += 1) {
    driveUnattended(stuck, 1_000)
  }
  expect(warn).not.toHaveBeenCalled()

  driveUnattended(stuck, 1_000)
  expect(warn).toHaveBeenCalledTimes(1)
  expect(warn).toHaveBeenCalledWith(expect.stringContaining('pickFromDiscard'))

  // And it does not repeat on every tick thereafter — the flood this task exists
  // to stop.
  driveUnattended(stuck, 1_000)
  driveUnattended(stuck, 1_000)
  expect(warn).toHaveBeenCalledTimes(1)

  warn.mockRestore()
})

// The flip side of the test above: a bot with nothing to do (someone else's
// turn, nothing pending on it) returns no action too, and that is not a
// stall — it is every ordinary tick. `seatOwes` is what tells the two apart;
// without it this would warn constantly rather than only on a genuine one.
it('says nothing about a bot that simply has nothing to do right now', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  const { session } = botFirstSession()
  // The same table, turned to `b`'s turn with nothing pending and no window
  // open — the ordinary shape of a tick where the unattended bot (seat `a`)
  // legitimately has nothing to answer.
  const idle: Session = {
    ...session,
    state: { ...session.state, turn: { ...session.state.turn, player: 'b' } },
  }

  // Drive the SAME idle session object STALL_WARNING_TICKS times, exactly the
  // way the sibling test above drives `stuck`. A single call can never carry a
  // streak past an 8-tick threshold, so one call would pass here for the wrong
  // reason — too few ticks to have warned yet — even if `seatOwes` were
  // replaced outright by `return true`. Looping to the threshold is what turns
  // "the warning never fires" back into a statement about the predicate rather
  // than about how many times this test happened to call in.
  let result: SessionResult = { session: idle, outgoing: [] }
  for (let i = 0; i < STALL_WARNING_TICKS; i += 1) {
    result = driveUnattended(idle, 1_000)
  }

  expect(result.session).toBe(idle)
  expect(warn).not.toHaveBeenCalled()
  warn.mockRestore()
})

// A bot seat's `peerId` is null by construction — exactly the shape `rebind`'s
// existing "only an absent seat can be claimed" guard admits. Nothing calls
// `rebind` with a bot seat today, but the spec names bots in a networked lobby
// as the next design, so the refusal has to live in the code rather than in
// the accident of no caller reaching it yet.
it('refuses to hand a bot seat out through rebind', () => {
  const { session } = botFirstSession()
  const result = rebind(session, 'a', 'peer-new', 1_000)

  expect(result.session).toBe(session)
  expect(result.outgoing).toEqual([])
})

it('still makes a human seat wait out the absence grace', () => {
  const { session: start } = botFirstSession()
  // The same table, except seat `a` is a human who dropped rather than a bot.
  const dropped: Session = {
    ...start,
    seats: start.seats.map((s) =>
      s.playerId === 'a' ? { playerId: 'a', peerId: null, absentSince: 1_000 } : s,
    ),
  }
  expect(driveUnattended(dropped, 1_000 + ABSENT_GRACE_MS - 1).session).toBe(dropped)
  expect(driveUnattended(dropped, 1_000 + ABSENT_GRACE_MS).session).not.toBe(dropped)
})

// The referee used to reduce, fan out and forget. That is exactly why a peer
// which missed a batch could never afterwards be told what was in it.
it('accumulates every event it has reduced', () => {
  const { session: start } = twoPlayerSession()
  const { session } = applyIntent(start, 'peer-a', { type: 'DRAW' }, 1_000)
  expect(session.log.length).toBeGreaterThan(start.log.length)
})

it('keeps the log in id order', () => {
  const { session: start } = twoPlayerSession()
  const { session } = applyIntent(start, 'peer-a', { type: 'DRAW' }, 1_000)
  const ids = session.log.map((e) => e.id)
  expect(ids).toEqual([...ids].sort((a, b) => a - b))
})

// The deal itself is in the log from the start: it is the first thing the
// engine emitted, and a peer restoring the match needs it to draw its own hand.
it('has the opening deal in it before anyone has acted', () => {
  const { session } = twoPlayerSession()
  expect(session.log.length).toBeGreaterThan(0)
})

// One step of driving whichever seat holds the turn, using only applyIntent:
// pays a pending release cost, plays a release when one is playable, else
// draws or pushes. `twoPlayerSession()`'s seed-1 opening hand holds no release
// and its `setup: {}` means releaseCond isn't 'easy', so a release play first
// suspends on a `discardForRelease` pending rather than opening a window in
// one step — both this and openWindowFixture below need to pay that cost, so
// it lives in one place rather than two copies drifting apart.
function stepTurn(session: Session, at: number): SessionResult {
  const turnPlayer = session.state.turn.player
  const peerId = turnPlayer === 'a' ? 'peer-a' : 'peer-b'
  const pending = session.state.pending
  const view = session.engine.project(session.state, turnPlayer)

  if (pending?.kind === 'discardForRelease' && pending.player === turnPlayer) {
    const spare = view.self.hand.find((c) => c.uid !== pending.release)
    if (!spare) return { session, outgoing: [] }
    return applyIntent(
      session,
      peerId,
      { type: 'RESOLVE', choice: { kind: 'discardForRelease', card: spare.uid } },
      at,
    )
  }

  // `uid.startsWith('release-')` is a *test fixture* convenience over the
  // fake's uid format, not production code — nothing under `src/network/` may
  // infer a `CardId` from a `CardUid`.
  const release = view.self.playable.find((uid) => uid.startsWith('release-'))
  if (release) return applyIntent(session, peerId, { type: 'PLAY', card: release }, at)
  if (session.state.turn.drawnFrom.length === 0)
    return applyIntent(session, peerId, { type: 'DRAW' }, at)
  return applyIntent(session, peerId, { type: 'PUSH' }, at)
}

// Plays until a release is standing with its price unpaid. Same driver as
// openWindowFixture below, but it stops the step BEFORE `stepTurn` pays the
// cost rather than after — that pending is the state under test.
function costPendingFixture(start: Session): Session {
  let session = start
  for (let step = 0; step < 200; step += 1) {
    if (session.state.pending?.kind === 'discardForRelease') return session
    const next = stepTurn(session, 1_000)
    if (next.session === session) break
    session = next.session
  }
  throw new Error('fixture failed to stage an unpaid release')
}

// Plays through both seats' turns until a release opens a reaction window.
// Uses the view's `playable` list, so it stays correct if the fake's deck
// changes.
function openWindowFixture(start: Session): Session {
  let session = start
  for (let step = 0; step < 200 && !session.state.window; step += 1) {
    const next = stepTurn(session, 1_000)
    if (next.session === session) break
    session = next.session
  }
  if (!session.state.window) throw new Error('fixture failed to open a window')
  return session
}

it('opens the feed with the deal rather than a blank', () => {
  const { outgoing } = createSession({
    gameId: 'g1',
    keeperId: 'p1',
    engine: createFakeEngine(),
    seed: 7,
    players: [
      { playerId: 'p1', peerId: 'peer-1', name: 'One' },
      { playerId: 'p2', peerId: 'peer-2', name: 'Two' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })

  const syncs = outgoing.filter((o) => o.message.type === 'SYNC')
  expect(syncs).toHaveLength(2)
  for (const s of syncs) {
    if (s.message.type !== 'SYNC') continue
    const dealt = s.message.payload.events.filter((e) => e.type === 'dealt')
    // The deal is public, so every seat hears about every seat's hand size.
    expect(dealt).toHaveLength(2)
  }
})

it('reserves the deal`s event ids and starts play right after them', () => {
  const { session, outgoing } = createSession({
    gameId: 'g1',
    keeperId: 'p1',
    engine: createFakeEngine(),
    seed: 7,
    players: [
      { playerId: 'p1', peerId: 'peer-1', name: 'One' },
      { playerId: 'p2', peerId: 'peer-2', name: 'Two' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })

  const opening = outgoing.find((o) => o.message.type === 'SYNC')
  const dealtIds =
    opening?.message.type === 'SYNC'
      ? opening.message.payload.events.filter((e) => e.type === 'dealt').map((e) => e.id)
      : []
  // Literal, not re-derived from seating length: this is the exact range the
  // engine reserved (Task 5's `eventSeq: seating.length`), and the property
  // under test is that nothing else lands in it and nothing after it repeats.
  expect(dealtIds).toEqual([1, 2])

  const { outgoing: played } = applyIntent(session, 'peer-1', { type: 'DRAW' }, 1_000)
  const drawSync = played.find((o) => o.message.type === 'SYNC' && o.to === 'peer-1')
  const drawnIds =
    drawSync?.message.type === 'SYNC' ? drawSync.message.payload.events.map((e) => e.id) : []
  // The reduce feed picks up immediately after the reserved deal range, with no
  // gap and no overlap. Asserted on the FIRST id rather than the whole list: how
  // many events one draw emits is the engine's business and has already changed
  // once (a sequenced draw emits several), while the boundary is the property
  // this test exists to hold.
  expect(drawnIds[0]).toBe(3)
  // Still contiguous among themselves, so nothing re-uses a reserved id.
  expect(drawnIds).toEqual(drawnIds.map((_, i) => 3 + i))
})

it('announces the game and syncs every seat privately', () => {
  const { outgoing } = twoPlayerSession()

  expect(outgoing[0]).toEqual({
    to: 'broadcast',
    message: { type: 'GAME_STARTED', payload: { gameId: 'g1', keeperId: 'a' } },
  })
  expect(outgoing.slice(1).map((o) => o.to)).toEqual(['peer-a', 'peer-b'])
  expect(outgoing.slice(1).every((o) => o.message.type === 'SYNC')).toBe(true)
})

it('sends each seat its own hand and never another seat`s', () => {
  const { outgoing } = twoPlayerSession()
  const [, toA, toB] = outgoing
  const viewA = toA.message.type === 'SYNC' ? toA.message.payload.view : null
  const viewB = toB.message.type === 'SYNC' ? toB.message.payload.view : null

  if (!viewA?.self || !viewB?.self) throw new Error('expected seated views')
  expect(viewA.self.id).toBe('a')
  expect(viewB?.self.id).toBe('b')
  expect(viewA?.self.hand.length).toBeGreaterThan(0)
  // The opponent is a count, never an identity.
  expect(viewA?.opponents[0]).toMatchObject({ id: 'b' })
  expect(JSON.stringify(viewA)).not.toContain(viewB?.self.hand[0].uid)
})

it('never puts the seed or GameState on the wire', () => {
  const { outgoing } = twoPlayerSession()
  expect(JSON.stringify(outgoing)).not.toContain('"seed"')
  expect(JSON.stringify(outgoing)).not.toContain('rngCursor')
})

it('attributes an intent to the seat bound to the connection, not the payload', () => {
  const { session } = twoPlayerSession()
  // 'b' submits over peer-b while claiming to be 'a'. The claim is ignored, so
  // the action is 'b' drawing out of turn — and 'a' holds the turn.
  const { session: next, outgoing } = applyIntent(
    session,
    'peer-b',
    { type: 'DRAW', player: 'a' } as never,
    1_000,
  )

  expect(next).toBe(session)
  expect(outgoing.map((o) => o.to)).toEqual(['peer-b'])
})

it('refuses a keeper-only action arriving as a peer intent', () => {
  const { session } = twoPlayerSession()
  const opened = openWindowFixture(session)
  const window = opened.state.window
  if (!window) throw new Error('fixture failed to open a window')

  // `Intent` excludes WINDOW_EXPIRED in TypeScript only; the wire carries
  // parsed JSON, so the keeper has to refuse it at runtime. Submitted past the
  // deadline it would otherwise close the window out from under any pending
  // defence — the deadlock `tick` is written to avoid.
  const result = applyIntent(
    opened,
    'peer-b',
    { type: 'WINDOW_EXPIRED' } as never,
    window.deadline + 1,
  )

  expect(result.session).toBe(opened)
  expect(result.session.state.window).not.toBeNull()
  expect(result.outgoing).toEqual([])
})

it('refuses a payload that is not an intent at all', () => {
  const { session } = twoPlayerSession()

  // `parseEnvelope` checks type/from/seq and nothing else, so the payload is
  // whatever the connection carried. The guard that exists because of that
  // must not itself read through it: `null.type` is a TypeError, and over the
  // real transport it lands in the receive loop's catch — the keeper swallows
  // it in silence while the honest peers see nothing at all.
  for (const payload of [null, undefined, 'DRAW', 42, [], {}]) {
    const result = applyIntent(session, 'peer-a', payload, 1_000)
    expect(result.session).toBe(session)
    expect(result.outgoing).toEqual([])
  }
})

it('returns a rejection to the submitter alone', () => {
  const { session } = twoPlayerSession()
  const { outgoing } = applyIntent(session, 'peer-b', { type: 'PASS' }, 1_000)
  const only = outgoing[0]
  const events = only.message.type === 'SYNC' ? only.message.payload.events : []

  expect(outgoing).toHaveLength(1)
  expect(only.to).toBe('peer-b')
  expect(events.map((e) => e.type)).toEqual(['rejected'])
})

it('fans a committed action out to every connected seat', () => {
  const { session } = twoPlayerSession()
  const { session: next, outgoing } = applyIntent(session, 'peer-a', { type: 'DRAW' }, 1_000)

  expect(next).not.toBe(session)
  expect(outgoing.map((o) => o.to)).toEqual(['peer-a', 'peer-b'])
})

it('hides the drawn card from everyone but the drawer', () => {
  const { session } = twoPlayerSession()
  const { outgoing } = applyIntent(session, 'peer-a', { type: 'DRAW' }, 1_000)
  const [toA, toB] = outgoing
  const eventsA = toA.message.type === 'SYNC' ? toA.message.payload.events : []
  const eventsB = toB.message.type === 'SYNC' ? toB.message.payload.events : []
  const drawnA = eventsA.find((e) => e.type === 'drawn')
  const drawnB = eventsB.find((e) => e.type === 'drawn')

  expect(drawnA).toBeDefined()
  expect(drawnA?.type === 'drawn' ? drawnA.card : undefined).toBeDefined()
  // B learns a draw happened and the new deck size, never which card.
  expect(drawnB).toBeDefined()
  expect(drawnB?.type === 'drawn' ? drawnB.card : undefined).toBeUndefined()
})

it('stamps the keeper`s clock, ignoring any time the peer supplies', () => {
  const { session } = twoPlayerSession()
  // Drive right up to the discardForRelease decision (the same play-through as
  // openWindowFixture), then submit that final RESOLVE ourselves so we can
  // forge a wildly wrong `at` on it. That RESOLVE is what actually calls
  // placeRelease -> openWindow (packages/engine/src/fake/release.ts,
  // packages/engine/src/fake/window.ts): a window's deadline is
  // `at + WINDOW_FIRST_MS`, so if it were ever taken from the peer's forged
  // value instead of the keeper's `now`, it would land near
  // 999_999_999 + WINDOW_FIRST_MS instead of near the `now` passed below.
  let s = session
  for (let step = 0; step < 200; step += 1) {
    if (s.state.pending?.kind === 'discardForRelease') break
    const next = stepTurn(s, 1_000)
    if (next.session === s) throw new Error('fixture stalled before a release cost was pending')
    s = next.session
  }
  const pending = s.state.pending
  if (pending?.kind !== 'discardForRelease') {
    throw new Error('fixture failed to reach a release cost decision')
  }

  const peerId = pending.player === 'a' ? 'peer-a' : 'peer-b'
  const view = s.engine.project(s.state, pending.player)
  const spare = view.self.hand.find((c) => c.uid !== pending.release)
  if (!spare) throw new Error('no spare card to pay the release cost')

  const { session: next } = applyIntent(
    s,
    peerId,
    {
      type: 'RESOLVE',
      choice: { kind: 'discardForRelease', card: spare.uid },
      at: 999_999_999,
    } as never,
    5_000,
  )

  expect(next.state.window?.deadline).toBe(5_000 + WINDOW_FIRST_MS)
})

it('ignores an intent from a peer bound to no seat', () => {
  const { session } = twoPlayerSession()
  const result = applyIntent(session, 'peer-stranger', { type: 'DRAW' }, 1_000)

  expect(result.session).toBe(session)
  expect(result.outgoing).toEqual([])
})

it('starts the first turn`s inactivity clock on its first tick', () => {
  const { session } = twoPlayerSession()
  // createGame carries no timestamp, so the first turn has no clock until the
  // keeper's ticker goes live — which only happens once the start gate opens.
  expect(session.state.turn.deadline).toBeUndefined()

  const result = tick(session, 1_000)

  expect(result.session.state.turn.openedAt).toBe(1_000)
  expect(result.session.state.turn.deadline).toBe(1_000 + TURN_ACTION_MS)
  // The stamp travels like any other commit: one private SYNC per seat.
  expect(result.outgoing.map((o) => o.to)).toEqual(['peer-a', 'peer-b'])
})

// onClockStarted (packages/engine/src/fake/reduce.ts) always returns
// `events: []` — starting a clock changes GameState but announces nothing —
// so there is no event payload here for a content assertion to hook into,
// unlike every other site in this file. The one trace this append site (tick,
// ~457-464) leaves behind is that `log` comes out of `[...session.log,
// ...events]` as a FRESH array, not the array a dropped append would leave
// untouched: `{ ...session, state }` would carry `session.log` through
// unchanged BY REFERENCE, because `...session` already spreads it in first.
// Same elements either way — that part is asserted too, so this cannot be
// mistaken for "any new array will do."
it('appends the first tick`s clock-start into a fresh log, though it has no events to add', () => {
  const { session } = twoPlayerSession()

  const result = tick(session, 1_000)

  expect(result.session.log).not.toBe(session.log)
  expect(result.session.log).toEqual(session.log)
})

it('does nothing while no deadline has passed', () => {
  const { session } = twoPlayerSession()
  const started = tick(session, 1_000).session
  const result = tick(started, 2_000)

  expect(result.session).toBe(started)
  expect(result.outgoing).toEqual([])
})

it('auto-resolves a minimal turn once the inactivity clock expires', () => {
  const { session } = twoPlayerSession()
  const started = tick(session, 1_000).session
  const deadline = started.state.turn.deadline ?? 0
  const handBefore = started.state.players.a.hand.length

  const result = tick(started, deadline + 1)

  // The idle player's whole obligation resolves in one expiry — the mandatory
  // draw, then the push — rather than one action per fresh 30s window.
  expect(result.session.state.players.a.hand.length).toBe(handBefore + 1)
  expect(result.session.state.turn.player).toBe('b')
  // Both halves land in ONE sync per seat — the feed reads as one beat.
  const sync = result.outgoing.find((o) => o.to === 'peer-b')
  const types = sync?.message.type === 'SYNC' ? sync.message.payload.events.map((e) => e.type) : []
  expect(types).toContain('drawn')
  expect(types).toContain('turnEnded')
  expect(types).toContain('turnStarted')
  expect(result.session.state.turn.openedAt).toBe(deadline + 1)
})

it('only pushes on expiry when the draw obligation is already met', () => {
  const { session } = twoPlayerSession()
  const drawn = applyIntent(session, 'peer-a', { type: 'DRAW' }, 1_000).session
  const deadline = drawn.state.turn.deadline ?? 0
  const handBefore = drawn.state.players.a.hand.length

  const result = tick(drawn, deadline + 1)

  expect(result.session.state.players.a.hand.length).toBe(handBefore)
  expect(result.session.state.turn.player).toBe('b')
})

// A card let go of before the turn ran out, needing nothing more — no target,
// no partner — stands at the centre only for the table to read it, and is
// played when the turn runs out (owner, 22.10). A card still waiting on a
// target goes back, as the ⚙️ timeout note says.
it.each([
  ['plays a Monitoring put out with nothing left to choose', 'protection-monitoring', true],
  ['takes back a Bug still waiting for its target', 'attack-bug', false],
])('on the turn running out, %s', (_, id, played) => {
  const { session } = twoPlayerSession()
  const drawn = applyIntent(session, 'peer-a', { type: 'DRAW' }, 1_000).session
  const card = { uid: `${id}#out`, id }
  const holding: Session = {
    ...drawn,
    state: {
      ...drawn.state,
      players: {
        ...drawn.state.players,
        a: { ...drawn.state.players.a, hand: [...drawn.state.players.a.hand, card] },
      },
    },
  }
  const out = applyIntent(holding, 'peer-a', { type: 'SHOW', card: card.uid }, 1_500).session
  expect(out.state.players.a.shown).toEqual([card.uid])
  const deadline = out.state.turn.deadline ?? 0

  const after = tick(out, deadline + 1).session

  expect(after.state.players.a.shown).toEqual([])
  expect(after.state.players.a.release.monitoring?.uid === card.uid).toBe(played)
  expect(after.state.players.a.hand.some((c) => c.uid === card.uid)).toBe(!played)
  expect(after.log.some((e) => e.type === 'takenBack')).toBe(!played)
  expect(after.state.turn.player).toBe('b')
})

// #101 (review round 2). Paying a release's price is the turn's own owner
// acting inside their own turn, so the engine keeps stamping the deadline
// through it — which means the keeper has to keep firing it. Deferring here
// (as every other pending does) would leave the deadline set and nothing
// watching it: a player could stop their own clock by staging a release.
it('keeps firing the turn deadline while a release waits for its price', () => {
  const { session } = twoPlayerSession()
  const staged = costPendingFixture(tick(session, 1_000).session)
  const owner = staged.state.turn.player
  const deadline = staged.state.turn.deadline ?? 0
  expect(deadline).toBeGreaterThan(0)

  // nothing yet — the clock is running, not expired
  expect(tick(staged, deadline - 1).session).toBe(staged)

  const result = tick(staged, deadline + 1)

  // the unpaid release goes back first: while an unpaid release stands,
  // anything other than paying takes it back — and nothing paid it. It is also
  // what makes the draw/push reachable, since the engine refuses both while
  // any pending is open.
  expect(result.session.state.pending).toBeNull()
  expect(result.session.state.turn.player).not.toBe(owner)
})

// The release is TAKEN BACK, not paid for. Paying is the other thing an expiry
// could plausibly do — it is exactly what `botAction` does with this pending
// (packages/engine/src/fake/bots.ts), and what `driveUnattended` uses for a seat
// that has actually left. A timeout is not a decision to spend a card, so the
// zone stays empty and the release stays in the hand it never left.
it('takes the unpaid release back rather than paying for it', () => {
  const { session } = twoPlayerSession()
  const staged = costPendingFixture(tick(session, 1_000).session)
  const pending = staged.state.pending
  if (pending?.kind !== 'discardForRelease') throw new Error('fixture lost its pending')
  const owner = pending.player
  const release = pending.release
  const zoneBefore = Object.keys(staged.state.players[owner].release).length

  const result = tick(staged, (staged.state.turn.deadline ?? 0) + 1)

  const after = result.session.state.players[owner]
  // the release did not land — had the expiry paid, this slot would be filled
  expect(Object.keys(after.release).length).toBe(zoneBefore)
  expect(after.hand.some((c) => c.uid === release)).toBe(true)
  expect(result.session.state.decks.discard.some((c) => c.uid === release)).toBe(false)
})

// This is the most intricate of the file's log-append sites: cancelRelease,
// DRAW and PUSH each run their own `reduce` and fold into one local `events`
// array (referee.ts's `tick`, ~489-518) before a single append carries the
// whole batch into `session.log`. `costPendingFixture` reaches a turn that
// still owes BOTH a mandatory draw and its push, with an unpaid release
// standing in front of them, so all three sub-steps fire in this one expiry.
it('folds every sub-step of the multi-step draw path into one log append', () => {
  const { session } = twoPlayerSession()
  const staged = costPendingFixture(tick(session, 1_000).session)
  const before = staged.log.length
  const deadline = staged.state.turn.deadline ?? 0

  const result = tick(staged, deadline + 1)

  // onCancelRelease (packages/engine/src/fake/release.ts) emits nothing —
  // clearing the pending IS the whole undo — so it cannot itself show up
  // here. The other two sub-steps both emit, and BOTH must be present: were
  // either of `events = [...events, ...drawn.events]` (the draw) or
  // `events = [...events, ...pushed.events]` (the push) changed to an
  // assignment instead of an append, that sub-step's type would silently
  // drop out of the tail below while `log.length` still visibly grew — the
  // exact gap a bare "the log grew" assertion would miss.
  const grown = result.session.log.slice(before).map((e) => e.type)
  expect(grown).toContain('drawn') // the mandatory DRAW sub-step
  expect(grown).toContain('turnEnded') // the PUSH sub-step right after it
})

it('leaves an expired turn to driveUnattended when its seat is disconnected', () => {
  const { session } = twoPlayerSession()
  const started = tick(session, 1_000).session
  const gone: Session = {
    ...started,
    seats: started.seats.map((s) => (s.playerId === 'a' ? { ...s, peerId: null } : s)),
  }
  const deadline = gone.state.turn.deadline ?? 0

  const result = tick(gone, deadline + 1)

  // The same rule as a stalled defence: a deadline never fires against a seat
  // with nobody in it — the absence grace period owns that seat's forward
  // progress instead.
  expect(result.session).toBe(gone)
  expect(result.outgoing).toEqual([])
})

it('expires a reaction window once its deadline passes', () => {
  const { session } = twoPlayerSession()
  const opened = openWindowFixture(session)
  expect(opened.state.window).not.toBeNull()

  const result = tick(opened, (opened.state.window?.deadline ?? 0) + 1)

  expect(result.session.state.window).toBeNull()
  expect(result.outgoing.length).toBeGreaterThan(0)
})

// tick's own WINDOW_EXPIRED append (referee.ts, ~417-424) — closeWindow
// (packages/engine/src/fake/window.ts) emits `windowClosed`, so its presence
// in the tail is what proves this specific reduce's events reached the log
// rather than merely something in the batch above having grown it.
it('appends the closed window`s own event to the log', () => {
  const { session } = twoPlayerSession()
  const opened = openWindowFixture(session)
  const before = opened.log.length

  const result = tick(opened, (opened.state.window?.deadline ?? 0) + 1)

  expect(result.session.log.slice(before).map((e) => e.type)).toContain('windowClosed')
})

it('expires a window a deadline-free pending would otherwise hold open', () => {
  const { session } = twoPlayerSession()
  const opened = openWindowFixture(session)
  const window = opened.state.window
  if (!window) throw new Error('fixture failed to open a window')

  // `handLimit` carries no deadline of its own (packages/engine/src/state.ts),
  // so nothing else would ever close this window. Injected rather than played
  // into existence: the two coexisting is a shape the fake's card set does not
  // currently reach, and the guard has to be right the day it does.
  const blocked: Session = {
    ...opened,
    state: { ...opened.state, pending: { kind: 'handLimit', player: 'b', excess: 1 } },
  }

  const result = tick(blocked, window.deadline + 1)

  expect(result.session.state.window).toBeNull()
  expect(result.session.state.pending?.kind).toBe('handLimit')
})

it('lets a stalled defence resolve even after its window has expired', () => {
  // Seed 4, not the shared helper's default 1: task B1 (#108) added Git Rebase
  // to FAKE_DECK, which shifts the shuffle's RNG stream the same way earlier
  // deck-size changes did elsewhere in this suite (see properties.test.ts and
  // packages/engine/src/conformance.ts for the same class of drift) — under
  // seed 1 this fixture's window no longer closes on the release-scope defend
  // path within this test's own trace. Swept against the current deck; every
  // other call site keeps the shared default, which still fits their needs.
  //
  // Seed 2 now, not 4: #108 then added System Upgrade, the same class of shift
  // again, and under seed 4 the responder reaches the open window holding no
  // release attack at all — the fixture's premise, not the property. Swept
  // again; 34 of the first 60 seeds satisfy it, so this is an abundant
  // condition the shuffle happens to place, not a narrow one being hunted for.
  const { session } = twoPlayerSession(2)
  const opened = openWindowFixture(session)
  const window = opened.state.window
  if (!window) throw new Error('fixture failed to open a window')

  // Throw a release attack into the open window: onAttack (attacks.ts) sets a
  // `defend` pending with its own deadline but leaves `state.window` open, so
  // the two coexist. DEFEND_MS === WINDOW_FIRST_MS (both 15_000, core.ts /
  // window.ts), so an attack thrown the instant the window opens gives the
  // window and the defend pending the same deadline.
  const owner = window.target.player
  const responder = owner === 'a' ? 'b' : 'a'
  const responderPeer = responder === 'a' ? 'peer-a' : 'peer-b'
  const view = opened.engine.project(opened.state, responder)
  const attackCard = view.window?.canAttackWith[0]
  if (!attackCard) throw new Error('fixture responder has no release attack to throw')

  const attacked = applyIntent(opened, responderPeer, { type: 'ATTACK', card: attackCard }, 1_000)
  expect(attacked.session.state.pending?.kind).toBe('defend')
  expect(attacked.session.state.window).not.toBeNull()

  // Tick past both deadlines at once, as the keeper's normal cadence would.
  const deadline = attacked.session.state.window?.deadline ?? 0
  const result = tick(attacked.session, deadline + 1)

  // The stalled defence must still resolve to its passive default, not stay
  // stuck forever because the window closed out from under it. Taking the hit
  // closes the window itself (onDefend's release-scope path), so both clear.
  expect(result.session.state.pending).toBeNull()
  expect(result.session.state.window).toBeNull()
})

it('never closes a live reaction window on an absent seat`s behalf', () => {
  const { session } = twoPlayerSession()
  const opened = openWindowFixture(session)
  const window = opened.state.window
  if (!window) throw new Error('fixture failed to open a window')

  // The window's own owner is the seat botAction answers with WINDOW_EXPIRED
  // (packages/engine/src/fake/bots.ts) — stamped at the deadline rather than
  // now. Replaying that forged `at` would end the other seats' reaction time
  // the instant the grace period elapses, up to a whole window early.
  const owner = window.target.player
  const absent: Session = {
    ...opened,
    seats: opened.seats.map((s) =>
      s.playerId === owner ? { ...s, peerId: null, absentSince: 0 } : s,
    ),
  }

  const result = driveUnattended(absent, ABSENT_GRACE_MS + 1)

  expect(result.session.state.window).not.toBeNull()
  expect(result.session.state.window?.deadline).toBe(window.deadline)
})

it('leaves a stalled defence for a disconnected seat to resolve on reconnection', () => {
  // Seed 2, not the shared helper's default 1: this fixture needs the
  // responder to reach the open window holding a release attack to throw, and
  // #108's addition of System Upgrade to FAKE_DECK moved seed 1's shuffle off
  // that. Same sweep, same seed as the sibling test above.
  const { session } = twoPlayerSession(2)
  const opened = openWindowFixture(session)
  const window = opened.state.window
  if (!window) throw new Error('fixture failed to open a window')

  const owner = window.target.player
  const responder = owner === 'a' ? 'b' : 'a'
  const responderPeer = responder === 'a' ? 'peer-a' : 'peer-b'
  const view = opened.engine.project(opened.state, responder)
  const attackCard = view.window?.canAttackWith[0]
  if (!attackCard) throw new Error('fixture responder has no release attack to throw')

  const attacked = applyIntent(opened, responderPeer, { type: 'ATTACK', card: attackCard }, 1_000)
  expect(attacked.session.state.pending?.kind).toBe('defend')

  // The owing seat drops before the deadline passes.
  const disconnected = {
    ...attacked.session,
    seats: attacked.session.seats.map((s) => (s.playerId === owner ? { ...s, peerId: null } : s)),
  }
  const deadline = disconnected.state.window?.deadline ?? 0
  const result = tick(disconnected, deadline + 1)

  // Nobody is there to resolve on the owing player's behalf, so the pending
  // waits rather than being force-resolved: it is not the keeper's decision
  // to make for an absent player.
  expect(result.session).toBe(disconnected)
  expect(result.outgoing).toEqual([])
})

// The reviewer's scenario on #113, decided as: the absence shield hands the
// turn BACK on return, it does not spend it. The deadline expires while the
// seat is empty (tick refuses to fire it — driveUnattended's grace owns absence),
// and the player comes back inside the grace window. Without the re-stamp the
// very next tick would see a seated player and an expired clock, and auto-play
// their whole turn before they get a single frame to act in.
it('hands a returning player a fresh clock instead of playing them out', () => {
  const { session } = twoPlayerSession()
  const started = tick(session, 1_000).session
  const deadline = started.state.turn.deadline ?? 0
  const player = started.state.turn.player
  const seat = started.seats.find((s) => s.playerId === player)
  const handBefore = started.state.players[player].hand.length

  // They drop before the deadline; the expiry then fires into an empty seat
  // and is deferred, exactly as tick's own comment promises.
  const dropped = disconnect(started, seat?.peerId ?? '', deadline - 5_000).session
  const deferred = tick(dropped, deadline + 1)
  expect(deferred.session).toBe(dropped)

  // Back inside the absence grace. The rebind restores the seat AND the turn:
  // a fresh clock, stamped at the return.
  const returned = rebind(dropped, player, 'peer-back', deadline + 10_000)
  expect(returned.session.state.turn.deadline).toBe(deadline + 10_000 + TURN_ACTION_MS)
  // The re-stamp is a state change every seat renders (the dock's ring), so it
  // travels to everyone, not only the rejoiner.
  expect(returned.outgoing.map((o) => o.to).sort()).toEqual(
    returned.session.seats
      .map((s) => s.peerId)
      .filter((p): p is string => p !== null)
      .sort(),
  )

  // The moment that used to lose the turn: the next tick. Nothing fires.
  const after = tick(returned.session, deadline + 10_001)
  expect(after.session).toBe(returned.session)
  expect(returned.session.state.turn.player).toBe(player)
  expect(returned.session.state.players[player].hand.length).toBe(handBefore)
})

// rebind's own CLOCK_STARTED append (referee.ts, ~181-188). Same limitation
// as tick's first-clock append above: onClockStarted always emits `events:
// []`, so there is no event content to assert on — a fresh, same-content log
// array is the only observable sign this append ran rather than the restamp
// falling through to `{ ...next, state }`, which would carry the old `log`
// reference through unchanged.
it('restamps a returning player`s clock into a fresh log, though it has no events to add', () => {
  const { session } = twoPlayerSession()
  const started = tick(session, 1_000).session
  const deadline = started.state.turn.deadline ?? 0
  const player = started.state.turn.player
  const seat = started.seats.find((s) => s.playerId === player)

  const dropped = disconnect(started, seat?.peerId ?? '', deadline - 5_000).session
  const deferred = tick(dropped, deadline + 1).session
  const before = deferred.log

  const returned = rebind(deferred, player, 'peer-back', deadline + 10_000)

  expect(returned.session.log).not.toBe(before)
  expect(returned.session.log).toEqual(before)
})

it('leaves a live clock alone when its owner reconnects — no extension', () => {
  const { session } = twoPlayerSession()
  const started = tick(session, 1_000).session
  const deadline = started.state.turn.deadline ?? 0
  const player = started.state.turn.player
  const seat = started.seats.find((s) => s.playerId === player)

  const dropped = disconnect(started, seat?.peerId ?? '', 2_000).session
  // Back BEFORE the deadline: the remaining time stands — blinking the
  // connection buys nothing.
  const returned = rebind(dropped, player, 'peer-back', deadline - 1_000)
  expect(returned.session.state.turn.deadline).toBe(deadline)
  expect(returned.outgoing).toHaveLength(1)
  expect(returned.outgoing[0].to).toBe('peer-back')
})

it('does not drive absent seats when no seat is connected at all', () => {
  const { session } = twoPlayerSession()
  const empty: Session = {
    ...session,
    seats: session.seats.map((s) => ({ ...s, peerId: null, absentSince: 0 })),
  }
  const result = driveUnattended(empty, ABSENT_GRACE_MS + 1)
  // A keeper with no audience advances nothing: no state change, no fan-out.
  expect(result.session).toBe(empty)
  expect(result.outgoing).toEqual([])
})

it('still drives an absent seat while another seat is connected', () => {
  const { session } = twoPlayerSession()
  const oneGone: Session = {
    ...session,
    seats: session.seats.map((s) =>
      s.playerId === session.state.turn.player ? { ...s, peerId: null, absentSince: 0 } : s,
    ),
  }
  const result = driveUnattended(oneGone, ABSENT_GRACE_MS + 1)
  expect(result.session).not.toBe(oneGone)
})

// driveUnattended's commit for an absent human: the passive policy's own
// answer is accepted on the first try. Staged with a pending
// `discardForRelease` decision owed by the absent seat itself, which the
// passive policy abandons rather than paying — the release goes back to the
// hand it never left, and the table sees it taken back. A commit with a real
// event, unlike the bare turn-clock stamps elsewhere in this file.
it('logs what an absent seat`s own accepted passive answer commits', () => {
  const { session } = twoPlayerSession()
  const staged = costPendingFixture(tick(session, 1_000).session)
  const pending = staged.state.pending
  if (pending?.kind !== 'discardForRelease') throw new Error('fixture lost its pending')
  const owner = staged.seats.find((s) => s.playerId === pending.player)
  const dropped = disconnect(staged, owner?.peerId ?? '', 2_000).session
  const before = dropped.log.length

  const result = driveUnattended(dropped, 2_000 + ABSENT_GRACE_MS + 1)

  // Losing the log append (`accepted`'s `log: [...session.log, ...events]`) or
  // overwriting it would leave the log flat while the state still moved.
  const grown = result.session.log.slice(before).map((e) => e.type)
  expect(result.session.state.pending).toBeNull()
  expect(grown).toEqual(['takenBack'])
  expect(result.session.state.players[pending.player].hand.map((c) => c.uid)).toContain(
    pending.release,
  )
})

// A System Upgrade is the only pending owed to several seats at once, so it is
// the only one where a seat that walks away can hold everybody else's match
// hostage — `driveUnattended` has to answer for it seat by seat, not once.
it('drains a System Upgrade roster past a seat that walked away', () => {
  const { session } = createSession({
    gameId: 'g1',
    keeperId: 'a',
    engine: createFakeEngine(),
    seed: 1,
    players: [
      { playerId: 'a', peerId: 'peer-a', name: 'Ann' },
      { playerId: 'b', peerId: 'peer-b', name: 'Bo' },
      { playerId: 'c', peerId: 'peer-c', name: 'Cy' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })

  // Built here rather than played out: reaching a System Upgrade through the
  // deck would pin this test to a shuffle seed, and what is under test is the
  // keeper's answer to the roster, not how the roster came to exist.
  const state: GameState = {
    ...session.state,
    pending: {
      kind: 'systemUpgrade',
      actor: 'a',
      owed: ['b', 'c'],
      thrown: [],
      sudo: false,
      phase: 'discarding',
      source: 'operation-system-upgrade',
    },
  }
  const bWalkedAway: Session = {
    ...session,
    state,
    seats: session.seats.map((s) =>
      s.playerId === 'b' ? { ...s, peerId: null, absentSince: 0 } : s,
    ),
  }

  const result = driveUnattended(bWalkedAway, ABSENT_GRACE_MS + 1)
  const pending = result.session.state.pending
  expect(pending?.kind).toBe('systemUpgrade')
  if (pending?.kind !== 'systemUpgrade') throw new Error('the upgrade must still stand')
  // The empty seat answered for itself and left the roster.
  expect(pending.owed).not.toContain('b')
  // The seat that is still there is still owed: the keeper answers for absence,
  // never for a player who is present and simply thinking.
  expect(pending.owed).toContain('c')
})

it('waits 25 seconds before reproducibly selecting a blind position', () => {
  const { session: base } = twoPlayerSession()
  const state: GameState = {
    ...base.state,
    players: {
      ...base.state.players,
      a: { ...base.state.players.a, hand: [{ uid: 'bug#test', id: 'attack-bug' }] },
      b: { ...base.state.players.b, hand: [{ uid: 'sudo#test', id: 'support-sudo' }] },
    },
  }
  const played = applyIntent(
    { ...base, state },
    'peer-a',
    { type: 'PLAY', card: 'bug#test', target: { kind: 'player', player: 'b' } },
    1000,
  )
  const opened = applyIntent(
    played.session,
    'peer-b',
    { type: 'RESOLVE', choice: { kind: 'defend', card: null } },
    1001,
  )
  const pending = opened.session.state.pending
  expect(pending?.kind).toBe('stealCard')
  if (pending?.kind !== 'stealCard') throw new Error('missing choice')
  expect(pending.deadline - pending.openedAt).toBe(25_000)
  expect(tick(opened.session, pending.deadline - 1).session).toBe(opened.session)
  const done = tick(opened.session, pending.deadline)
  expect(done.session.state.pending).toBeNull()
  expect(done.session.state.players.a.hand).toEqual([{ uid: 'sudo#test', id: 'support-sudo' }])
  expect(done).toEqual(tick(opened.session, pending.deadline))
})

it.each([
  'attack-bug',
  'attack-security-bug',
])('resynchronizes %s choices and transfer visibility for three seats', (attack) => {
  const { session: base } = createSession({
    gameId: 'transfer',
    keeperId: 'a',
    engine: createFakeEngine(),
    seed: 42,
    players: ['a', 'b', 'c'].map((playerId) => ({
      playerId,
      peerId: `peer-${playerId}`,
      name: playerId,
    })),
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const state: GameState = {
    ...base.state,
    players: {
      ...base.state.players,
      a: { ...base.state.players.a, hand: [{ uid: 'attack#test', id: attack }] },
      b: {
        ...base.state.players.b,
        hand: [
          { uid: 'sudo#test', id: 'support-sudo' },
          { uid: 'spare#test', id: 'protection-debugger' },
        ],
      },
    },
  }
  const played = applyIntent(
    { ...base, state },
    'peer-a',
    { type: 'PLAY', card: 'attack#test', target: { kind: 'player', player: 'b' } },
    1000,
  )
  const offered = applyIntent(
    played.session,
    'peer-b',
    { type: 'RESOLVE', choice: { kind: 'defend', card: null } },
    1001,
  )
  const absent = disconnect(offered.session, 'peer-a', 1002).session
  const restored = { ...absent, state: JSON.parse(JSON.stringify(absent.state)) as GameState }
  const rebound = rebind(restored, 'a', 'peer-new-a', 1003)
  const sync = rebound.outgoing.find(
    (o) => o.to === 'peer-new-a' && o.message.type === 'SYNC',
  )?.message
  if (sync?.type !== 'SYNC') throw new Error('no resync')
  expect(sync.payload.view.pending?.kind).toBe(
    attack === 'attack-bug' ? 'stealCard' : 'requestCard',
  )
  expect(JSON.stringify(sync.payload.view.pending)).not.toContain('sudo#test')
  expect(JSON.stringify(sync.payload.view.pending)).not.toContain('spare#test')
  let done: SessionResult
  if (attack === 'attack-bug') {
    done = applyIntent(
      rebound.session,
      'peer-new-a',
      { type: 'RESOLVE', choice: { kind: 'stealCard', index: 0 } },
      1004,
    )
  } else {
    done = applyIntent(
      rebound.session,
      'peer-new-a',
      { type: 'RESOLVE', choice: { kind: 'requestCard', card: 'support-sudo' } },
      1004,
    )
  }
  expect(done.session.state.pending).toBeNull()
  for (const peer of ['peer-new-a', 'peer-b', 'peer-c']) {
    const message = done.outgoing.find((o) => o.to === peer && o.message.type === 'SYNC')?.message
    if (message?.type !== 'SYNC') throw new Error('no transfer sync')
    const transfer = message.payload.events.find((e) => e.type === 'handTransfer')
    expect(transfer).toBeDefined()
    if (transfer?.type !== 'handTransfer') throw new Error('no transfer')
    if (peer === 'peer-c' && attack === 'attack-bug') expect(transfer.card).toBeUndefined()
    else expect(transfer.card).toBeDefined()
  }
  const observerAbsent = disconnect(done.session, 'peer-c', 20000).session
  const observerBack = rebind(observerAbsent, 'c', 'peer-new-c', 20001)
  const replay = observerBack.outgoing.find(
    (o) => o.to === 'peer-new-c' && o.message.type === 'SYNC',
  )?.message
  if (replay?.type !== 'SYNC') throw new Error('no observer resync')
  const transfer = replay.payload.events.find((e) => e.type === 'handTransfer')
  expect(transfer).toBeDefined()
  if (transfer?.type === 'handTransfer')
    expect(transfer.card !== undefined).toBe(attack === 'attack-security-bug')
})

it('times out a Security Bug request with a holdable catalogue type even when discard is empty', () => {
  const { session: base } = twoPlayerSession()
  const state: GameState = {
    ...base.state,
    decks: { ...base.state.decks, discard: [] },
    players: {
      ...base.state.players,
      a: { ...base.state.players.a, hand: [{ uid: 'security#test', id: 'attack-security-bug' }] },
      b: { ...base.state.players.b, hand: [{ uid: 'sudo#test', id: 'support-sudo' }] },
    },
  }
  const played = applyIntent(
    { ...base, state },
    'peer-a',
    { type: 'PLAY', card: 'security#test', target: { kind: 'player', player: 'b' } },
    1000,
  )
  const offered = applyIntent(
    played.session,
    'peer-b',
    { type: 'RESOLVE', choice: { kind: 'defend', card: null } },
    1001,
  )
  const pending = offered.session.state.pending
  if (pending?.kind !== 'requestCard' || pending.deadline === undefined)
    throw new Error('no request deadline')
  const done = tick(offered.session, pending.deadline)
  const request = done.session.log.find((e) => e.type === 'requested')
  if (request?.type !== 'requested') throw new Error('missing request')
  expect(CARD_RULES[request.card]).toBeDefined()
  expect(['ai', 'trigger']).not.toContain(CARD_RULES[request.card]?.kind)
  expect(pending.deadline - (pending.openedAt ?? 0)).toBe(25_000)
  expect(done.session.state.pending).toBeNull()
  expect(done.session.state.decks.discard).toEqual([
    { uid: 'security#test', id: 'attack-security-bug' },
  ])
})

// The card marked in the catalogue and not yet confirmed is the one named when
// the time runs out — the same rule as a marked pick out of the discard (owner,
// 22.10).
it('names the card marked in the Security Bug catalogue when its time runs out', () => {
  const { session: base } = twoPlayerSession()
  const state: GameState = {
    ...base.state,
    players: {
      ...base.state.players,
      a: { ...base.state.players.a, hand: [{ uid: 'security#test', id: 'attack-security-bug' }] },
      b: { ...base.state.players.b, hand: [{ uid: 'sudo#test', id: 'support-sudo' }] },
    },
  }
  const played = applyIntent(
    { ...base, state },
    'peer-a',
    { type: 'PLAY', card: 'security#test', target: { kind: 'player', player: 'b' } },
    1000,
  )
  const offered = applyIntent(
    played.session,
    'peer-b',
    { type: 'RESOLVE', choice: { kind: 'defend', card: null } },
    1001,
  )
  const marked = applyIntent(
    offered.session,
    'peer-a',
    { type: 'DRAFT', draft: { kind: 'requestCard', card: 'defense-not-a-bug' } },
    1002,
  )
  expect(marked.outgoing).toEqual([])
  const pending = marked.session.state.pending
  if (pending?.kind !== 'requestCard' || pending.deadline === undefined)
    throw new Error('no request deadline')
  const done = tick(marked.session, pending.deadline)
  const request = done.session.log.find((e) => e.type === 'requested')
  // named as marked — a miss, which a random pick over the catalogue would only
  // rarely land on
  expect(request).toMatchObject({ type: 'requested', card: 'defense-not-a-bug', hit: false })
})

it('starts a 25-second deadline for a legacy request without re-banking its spent attack', () => {
  const { session: base } = twoPlayerSession()
  const state: GameState = {
    ...base.state,
    turn: { ...base.state.turn, openedAt: undefined, deadline: undefined },
    decks: {
      ...base.state.decks,
      discard: [{ uid: 'security#legacy', id: 'attack-security-bug' }],
    },
    players: {
      ...base.state.players,
      b: { ...base.state.players.b, hand: [{ uid: 'sudo#legacy', id: 'support-sudo' }] },
    },
    pending: { kind: 'requestCard', player: 'a', target: 'b' },
  }
  const started = tick({ ...base, state }, 1000)
  const pending = started.session.state.pending
  expect(pending).toMatchObject({ kind: 'requestCard', openedAt: 1000, deadline: 26000 })
  expect(started.session.log).toEqual(base.log)
  expect(tick(started.session, 25999).session).toBe(started.session)
  const done = tick(started.session, 26000)
  expect(done.session.state.pending).toBeNull()
  expect(done.session.state.decks.discard.filter((c) => c.uid === 'security#legacy')).toHaveLength(
    1,
  )
})

it.each([
  'attack-bug',
  'attack-security-bug',
])('lets the absence driver abandon a disconnected %s chooser after grace', (attack) => {
  const { session: base } = twoPlayerSession()
  const state: GameState = {
    ...base.state,
    players: {
      ...base.state.players,
      a: { ...base.state.players.a, hand: [{ uid: 'attack#absent', id: attack }] },
      b: { ...base.state.players.b, hand: [{ uid: 'sudo#absent', id: 'support-sudo' }] },
    },
  }
  const played = applyIntent(
    { ...base, state },
    'peer-a',
    { type: 'PLAY', card: 'attack#absent', target: { kind: 'player', player: 'b' } },
    1000,
  )
  const offered = applyIntent(
    played.session,
    'peer-b',
    { type: 'RESOLVE', choice: { kind: 'defend', card: null } },
    1001,
  )
  const absent = disconnect(offered.session, 'peer-a', 1002).session
  expect(tick(absent, 16001).session).toBe(absent)
  expect(driveUnattended(absent, 1002 + ABSENT_GRACE_MS - 1).session).toBe(absent)
  const done = driveUnattended(absent, 1002 + ABSENT_GRACE_MS)
  expect(done.session.state.pending).toBeNull()
  // The passive policy does not choose for the absent attacker: it abandons
  // the decision, and the attack card goes back to its owner's hand.
  expect(done.session.state.decks.discard).toEqual([])
  expect(done.session.state.players.a.hand).toEqual([{ uid: 'attack#absent', id: attack }])
})

it('automatically completes a legacy handover even while the donor is disconnected', () => {
  const { session: base } = twoPlayerSession()
  const first = { uid: 'sudo#first', id: 'support-sudo' }
  const second = { uid: 'sudo#second', id: 'support-sudo' }
  const state: GameState = {
    ...base.state,
    players: {
      ...base.state.players,
      a: { ...base.state.players.a, hand: [] },
      b: { ...base.state.players.b, hand: [first, second] },
    },
    pending: { kind: 'giveCard', player: 'b', attacker: 'a', requested: first.id },
  }
  const disconnected = disconnect({ ...base, state }, 'peer-b', 1000).session
  const done = tick(disconnected, 1001)
  expect(done.session.state.pending).toBeNull()
  expect(done.session.state.players.a.hand).toEqual([first])
  expect(done.session.state.players.b.hand).toEqual([second])
  expect(done.session.log.at(-1)).toMatchObject({ type: 'handTransfer', publicCard: true })
})

// A Sudo put out to attack a fresh release holds the time with its own deadline
// (owner, 02.10). The keeper fires on it the way it fires on any window: the
// Sudo goes home, in everyone's view, and the time to attack starts anew.
it('sends a Sudo home on its own deadline and opens the time to attack anew', () => {
  const { session } = twoPlayerSession()
  const opened = openWindowFixture(session)
  const w = opened.state.window
  if (!w) throw new Error('no window')
  const responder = opened.state.seating.find((id) => id !== w.target.player) ?? ''
  const sudo = { uid: 'support-sudo#99', id: 'support-sudo' }
  // a Sudo is put out only with an attack to go with it
  const bug = { uid: 'attack-bug#99', id: 'attack-bug' }
  const holding: GameState = {
    ...opened.state,
    players: {
      ...opened.state.players,
      [responder]: {
        ...opened.state.players[responder],
        hand: [...opened.state.players[responder].hand, sudo, bug],
      },
    },
  }
  const shown = createFakeEngine().reduce(holding, {
    type: 'SHOW',
    player: responder,
    card: sudo.uid,
    at: w.openedAt + 1,
  }).state
  expect(shown.window?.held).toBe(responder)
  const before = opened.log.length

  const result = tick({ ...opened, state: shown }, (shown.window?.deadline ?? 0) + 1)

  expect(result.session.state.players[responder].shown).toEqual([])
  expect(result.session.state.window).toMatchObject({ round: w.round + 1 })
  expect(result.session.state.window?.held).toBeUndefined()
  const grown = result.session.log.slice(before).map((e) => e.type)
  expect(grown).toEqual(expect.arrayContaining(['takenBack', 'windowOpened']))
})

// A decision a card raised, open with its time already run out. The answer
// the keeper gives is the one the player could have given themselves; where a
// choice is left, a random one — so across seeds it is not always the same card.
describe('a decision a card raised, when its time runs out', () => {
  const ran = { openedAt: 0, deadline: 20_000 }
  const afterDeadline = 20_001
  const card = (id: string, tag = 'x') => ({ uid: `${id}#${tag}`, id })
  const debuggerCard = card('protection-debugger')
  const alarm = card('trigger-error-503')
  type Card = ReturnType<typeof card>

  function expired(pending: Pending, edit: (s: GameState) => GameState = (s) => s, seed = 1) {
    const { session } = twoPlayerSession()
    return { ...session, state: edit({ ...session.state, seed, pending }) }
  }
  const hold =
    (player: 'a' | 'b', hand: Card[]) =>
    (s: GameState): GameState => ({
      ...s,
      players: { ...s.players, [player]: { ...s.players[player], hand } },
    })
  const zone =
    (slots: ('frontend' | 'backend' | 'database')[]) =>
    (s: GameState): GameState => ({
      ...s,
      players: {
        ...s.players,
        a: {
          ...s.players.a,
          release: Object.fromEntries(
            slots.map((slot) => [slot, { card: card(`release-${slot}`) }]),
          ),
        },
      },
    })
  const answers = (build: (seed: number) => Session, read: (after: Session) => string) =>
    new Set(Array.from({ length: 24 }, (_, i) => read(tick(build(i + 1), afterDeadline).session)))
  const methodOf = (s: Session) => {
    const e = [...s.log].reverse().find((event) => event.type === 'neutralized')
    return e?.type === 'neutralized' ? e.method : null
  }
  const handOf = (player: 'a' | 'b') => (after: Session) =>
    after.state.players[player].hand.map((c) => c.uid).join()

  it('answers an Error 503 with a Debugger first', () => {
    const s = expired(
      {
        kind: 'neutralize503',
        player: 'a',
        card: alarm,
        methods: ['debugger', 'sacrifice'],
        ...ran,
      },
      (st) => zone(['frontend'])(hold('a', [debuggerCard])(st)),
    )
    const after = tick(s, afterDeadline).session
    expect(after.state.pending).toBeNull()
    expect(methodOf(after)).toBe('debugger')
  })

  it('answers an Error 503 with a random release when there is no Debugger', () => {
    const build = (seed: number) =>
      expired(
        { kind: 'neutralize503', player: 'a', card: alarm, methods: ['sacrifice'], ...ran },
        zone(['frontend', 'backend', 'database']),
        seed,
      )
    expect(methodOf(tick(build(1), afterDeadline).session)).toBe('sacrifice')
    const lost = answers(build, (after) =>
      (['frontend', 'backend', 'database'] as const)
        .filter((slot) => !after.state.players.a.release[slot])
        .join(),
    )
    expect(lost.size).toBeGreaterThan(1)
  })

  it('declines an Error 503 with nothing to answer it, and the player is out', () => {
    const s = expired({ kind: 'neutralize503', player: 'a', card: alarm, methods: [], ...ran })
    expect(tick(s, afterDeadline).session.state.eliminated).toContain('a')
  })

  it('answers an AI Crush with a Debugger, or lets the release be destroyed', () => {
    const crush = (withDebugger: boolean) =>
      expired(
        {
          kind: 'crush',
          player: 'a',
          slot: 'frontend',
          methods: withDebugger ? ['debugger'] : [],
          ...ran,
        },
        (st) => zone(['frontend'])(hold('a', withDebugger ? [debuggerCard] : [])(st)),
      )
    expect(methodOf(tick(crush(true), afterDeadline).session)).toBe('debugger')
    expect(
      tick(crush(false), afterDeadline).session.state.players.a.release.frontend,
    ).toBeUndefined()
  })

  // The answer HELD when the time ran out is the answer (owner, 22.10): a release
  // taken up off the zone is the one sacrificed — even with a Debugger in hand —
  // and a Debugger held answers a Crush. Held no longer, the usual order rules.
  it('answers an Error 503 with the release the player is holding', () => {
    const build = (seed: number) =>
      expired(
        {
          kind: 'neutralize503',
          player: 'a',
          card: alarm,
          methods: ['debugger', 'sacrifice'],
          draft: { method: 'sacrifice', card: 'release-backend#x' },
          ...ran,
        },
        (st) => zone(['frontend', 'backend'])(hold('a', [debuggerCard])(st)),
        seed,
      )
    const lost = answers(build, (after) =>
      (['frontend', 'backend'] as const)
        .filter((slot) => !after.state.players.a.release[slot])
        .join(),
    )
    expect(lost).toEqual(new Set(['backend']))
    expect(methodOf(tick(build(1), afterDeadline).session)).toBe('sacrifice')
  })

  it('answers with a Debugger first again once a held release is no longer there', () => {
    const s = expired(
      {
        kind: 'neutralize503',
        player: 'a',
        card: alarm,
        methods: ['debugger', 'sacrifice'],
        draft: { method: 'sacrifice', card: 'release-database#x' },
        ...ran,
      },
      (st) => zone(['frontend'])(hold('a', [debuggerCard])(st)),
    )
    expect(methodOf(tick(s, afterDeadline).session)).toBe('debugger')
  })

  it('answers an AI Crush with the Debugger the player is holding', () => {
    const s = expired(
      {
        kind: 'crush',
        player: 'a',
        slot: 'frontend',
        methods: ['debugger'],
        draft: { method: 'debugger' },
        ...ran,
      },
      (st) => zone(['frontend'])(hold('a', [debuggerCard])(st)),
    )
    expect(methodOf(tick(s, afterDeadline).session)).toBe('debugger')
  })

  it('keeps the cards laid out against the hand limit and fills the rest at random', () => {
    const hand = ['a', 'b', 'c', 'd'].map((t) => card('attack-bug', t))
    const build = (seed: number) =>
      expired(
        { kind: 'handLimit', player: 'a', excess: 2, draft: ['attack-bug#c'], ...ran },
        hold('a', hand),
        seed,
      )
    const once = tick(build(1), afterDeadline).session
    expect(once.state.pending).toBeNull()
    expect(once.state.players.a.hand).toHaveLength(2)
    expect(handOf('a')(once)).not.toContain('attack-bug#c')
    expect(answers(build, handOf('a')).size).toBeGreaterThan(1)
  })

  it('discards a random card for AI Bad Vibe-Coding', () => {
    const build = (seed: number) =>
      expired(
        {
          kind: 'handLimit',
          player: 'a',
          excess: 1,
          endsTurn: false,
          source: 'ai-bad-vibe-coding',
          ...ran,
        },
        hold(
          'a',
          ['a', 'b', 'c'].map((t) => card('attack-bug', t)),
        ),
        seed,
      )
    expect(tick(build(1), afterDeadline).session.state.players.a.hand).toHaveLength(2)
    expect(answers(build, handOf('a')).size).toBeGreaterThan(1)
  })

  it('takes a random card out of the discard for Cherry-pick, never a trigger into the hand', () => {
    const options = [alarm, ...['a', 'b', 'c'].map((t) => card('attack-bug', t))]
    const build = (seed: number) =>
      expired(
        {
          kind: 'pickFromDiscard',
          player: 'a',
          options,
          picks: 1,
          source: 'operation-git-cherry-pick',
          raisedAt: 1,
          ...ran,
        },
        (st) => hold('a', [])({ ...st, decks: { ...st.decks, discard: options } }),
        seed,
      )
    expect(tick(build(1), afterDeadline).session.state.pending).toBeNull()
    const picks = answers(build, handOf('a'))
    expect(picks.size).toBeGreaterThan(1)
    expect(picks.has(alarm.uid)).toBe(false)
  })

  it('takes a random release out of the discard for AI Inside', () => {
    const options = (['frontend', 'backend', 'database'] as const).map((s) => card(`release-${s}`))
    const build = (seed: number) =>
      expired(
        {
          kind: 'pickFromDiscard',
          player: 'a',
          options,
          picks: 1,
          source: 'ai-inside',
          raisedAt: 1,
          ...ran,
        },
        (st) => hold('a', [])({ ...st, decks: { ...st.decks, discard: options } }),
        seed,
      )
    expect(answers(build, handOf('a')).size).toBeGreaterThan(1)
  })

  it('keeps what was marked out of the discard, each role on its own, and draws only the rest', () => {
    const options = [alarm, ...['a', 'b', 'c'].map((t) => card('attack-bug', t))]
    const build = (draft: { card?: string; toDeck?: string }) => (seed: number) =>
      expired(
        {
          kind: 'pickFromDiscard',
          player: 'a',
          options,
          picks: 2,
          source: 'operation-git-cherry-pick',
          raisedAt: 1,
          draft,
          ...ran,
        },
        (st) => hold('a', [])({ ...st, decks: { ...st.decks, discard: options } }),
        seed,
      )
    const onDeck = (after: Session) => after.state.decks.main[0][0].uid
    // both marked: both stay, whatever the seed
    const both = build({ card: 'attack-bug#b', toDeck: alarm.uid })
    expect(answers(both, handOf('a'))).toEqual(new Set(['attack-bug#b']))
    expect(answers(both, onDeck)).toEqual(new Set([alarm.uid]))
    // the deck marked alone: it stays, the hand is drawn
    const deckOnly = build({ toDeck: alarm.uid })
    expect(answers(deckOnly, onDeck)).toEqual(new Set([alarm.uid]))
    expect(answers(deckOnly, handOf('a')).size).toBeGreaterThan(1)
    // the hand marked alone: it stays, the deck is drawn
    const handOnly = build({ card: 'attack-bug#a' })
    expect(answers(handOnly, handOf('a'))).toEqual(new Set(['attack-bug#a']))
    expect(answers(handOnly, onDeck).size).toBeGreaterThan(1)
  })

  it('leaves a Rebase in the order on the screen, or as offered when nothing was moved', () => {
    const top = ['a', 'b', 'c'].map((t) => card('attack-bug', t))
    const build = (draft?: string[]) =>
      expired(
        {
          kind: 'reorderTop',
          player: 'a',
          piles: [{ pile: 0, cards: top }],
          source: 'operation-git-rebase',
          raisedAt: 1,
          ...(draft ? { draft: [{ pile: 0, cards: draft }] } : {}),
          ...ran,
        },
        (st) => ({ ...st, decks: { ...st.decks, main: [[...top, ...st.decks.main[0]]] } }),
      )
    const order = (s: Session) =>
      tick(s, afterDeadline)
        .session.state.decks.main[0].slice(0, 3)
        .map((c) => c.uid)
    const moved = ['attack-bug#c', 'attack-bug#a', 'attack-bug#b']
    expect(order(build(moved))).toEqual(moved)
    expect(order(build())).toEqual(['attack-bug#a', 'attack-bug#b', 'attack-bug#c'])
  })

  it('throws a random card for a System Upgrade seat that has not thrown', () => {
    const build = (seed: number) =>
      expired(
        {
          kind: 'systemUpgrade',
          actor: 'a',
          owed: ['b'],
          thrown: [],
          sudo: true,
          phase: 'discarding',
          source: 'operation-system-upgrade',
          ...ran,
        },
        hold(
          'b',
          ['a', 'b', 'c'].map((t) => card('attack-bug', t)),
        ),
        seed,
      )
    expect(tick(build(1), afterDeadline).session.state.pending).toMatchObject({ phase: 'picking' })
    expect(answers(build, handOf('b')).size).toBeGreaterThan(1)
  })

  it('takes a random one of the thrown cards for the System Upgrade pick under sudo', () => {
    const thrown = ['a', 'b', 'c'].map((t) => ({ player: 'b', card: card('attack-bug', t) }))
    const build = (seed: number) =>
      expired(
        {
          kind: 'systemUpgrade',
          actor: 'a',
          owed: [],
          thrown,
          sudo: true,
          phase: 'picking',
          source: 'operation-system-upgrade',
          ...ran,
        },
        hold('a', []),
        seed,
      )
    expect(tick(build(1), afterDeadline).session.state.pending).toBeNull()
    expect(answers(build, handOf('a')).size).toBeGreaterThan(1)
  })

  it('takes the card the actor marked for the System Upgrade pick under sudo', () => {
    const thrown = ['a', 'b', 'c'].map((t) => ({ player: 'b', card: card('attack-bug', t) }))
    const mark = thrown[2].card.uid
    for (const seed of [1, 2, 3]) {
      const s = expired(
        {
          kind: 'systemUpgrade',
          actor: 'a',
          owed: [],
          thrown,
          sudo: true,
          phase: 'picking',
          source: 'operation-system-upgrade',
          draft: mark,
          ...ran,
        },
        hold('a', []),
        seed,
      )
      expect(tick(s, afterDeadline).session.state.players.a.hand.map((c) => c.uid)).toEqual([mark])
    }
  })

  it('answers nothing for a seat that has dropped', () => {
    const s = expired(
      { kind: 'handLimit', player: 'a', excess: 1, ...ran },
      hold('a', [card('attack-bug')]),
    )
    const dropped = {
      ...s,
      seats: s.seats.map((seat) => (seat.playerId === 'a' ? { ...seat, peerId: null } : seat)),
    }
    const result = tick(dropped, afterDeadline)
    expect(result.session).toBe(dropped)
    expect(result.outgoing).toEqual([])
  })

  it('keeps a draft on the keeper alone and sends nothing', () => {
    const s = expired(
      { kind: 'handLimit', player: 'a', excess: 2, openedAt: 0, deadline: 40_000 },
      hold('a', [card('attack-bug', 'a'), card('attack-bug', 'b')]),
    )
    const drafted = applyIntent(
      s,
      'peer-a',
      { type: 'DRAFT', draft: { kind: 'handLimit', cards: ['attack-bug#a'] } },
      1_000,
    )
    expect(drafted.outgoing).toEqual([])
    expect(drafted.session.state.pending).toMatchObject({ draft: ['attack-bug#a'] })
    const ignored = applyIntent(
      s,
      'peer-a',
      { type: 'DRAFT', draft: { kind: 'handLimit', cards: ['nowhere#0'] } },
      1_000,
    )
    expect(ignored.session).toBe(s)
    expect(ignored.outgoing).toEqual([])
  })
})
