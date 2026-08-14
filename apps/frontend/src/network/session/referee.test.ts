import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import {
  ABSENT_GRACE_MS,
  applyIntent,
  createSession,
  driveAbsent,
  type Session,
  type SessionResult,
  tick,
} from './referee'

// Not exported from @release/engine or @release/engine/fake, so this is a
// duplicated literal rather than an import — kept as a named constant (instead
// of an inline 15_000) so a future bump to the real constant in
// packages/engine/src/fake/window.ts shows up here as an intentional edit
// rather than this test silently drifting out of sync.
const WINDOW_FIRST_MS = 15_000

function twoPlayerSession() {
  return createSession({
    gameId: 'g1',
    keeperId: 'a',
    engine: createFakeEngine(),
    // Seed 42 puts a trigger card (publicly revealed on draw, per Task 4's
    // "hides the drawn card" test) at the top of pile 0. Seed 1 deals a normal
    // card there instead, so a draw stays private to the drawer as intended.
    seed: 1,
    players: [
      { playerId: 'a', peerId: 'peer-a', name: 'Ann' },
      { playerId: 'b', peerId: 'peer-b', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
}

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

  expect(viewA?.self.id).toBe('a')
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

it('does nothing while no deadline has passed', () => {
  const { session } = twoPlayerSession()
  const result = tick(session, 1_000)

  expect(result.session).toBe(session)
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
  const { session } = twoPlayerSession()
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

  const result = driveAbsent(absent, ABSENT_GRACE_MS + 1)

  expect(result.session.state.window).not.toBeNull()
  expect(result.session.state.window?.deadline).toBe(window.deadline)
})

it('leaves a stalled defence for a disconnected seat to resolve on reconnection', () => {
  const { session } = twoPlayerSession()
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
