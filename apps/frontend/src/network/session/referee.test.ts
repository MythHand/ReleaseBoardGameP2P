import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { applyIntent, createSession, type Session, type SessionResult, tick } from './referee'

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
  if (!session.state.turn.hasDrawn) return applyIntent(session, peerId, { type: 'DRAW' }, at)
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
  // B learns a draw happened and the new deck size, never which card.
  expect(drawnB).toBeUndefined()
})

it('stamps the keeper`s clock, ignoring any time the peer supplies', () => {
  const { session } = twoPlayerSession()
  // Drive right up to the discardForRelease decision (the same play-through as
  // openWindowFixture), then submit that final RESOLVE ourselves so we can
  // forge a wildly wrong `at` on it. That RESOLVE is what actually calls
  // placeRelease -> openWindow (packages/engine/src/fake/release.ts,
  // packages/engine/src/fake/window.ts): a window's deadline is
  // `at + WINDOW_FIRST_MS` (15_000), so if it were ever taken from the peer's
  // forged value instead of the keeper's `now`, it would land near
  // 999_999_999 + 15_000 instead of near the `now` passed below.
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

  expect(next.state.window?.deadline).toBe(5_000 + 15_000)
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
