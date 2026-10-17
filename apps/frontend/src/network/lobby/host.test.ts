import { maxBugRunnerScore } from '@release/ui'
import {
  canStart,
  disbandLobby,
  handleBugRunnerScore,
  handleBugRunnerStart,
  handleJoinRequest,
  handleReady,
  handleWhereabouts,
  kick,
  MAX_BOTS,
  setBots,
  setMaxPlayers,
  setMaxSpectators,
  setParticipantRole,
} from './host'
import { applyPeerLeft, createLobbyState, type LobbyState, playerCount } from './state'

const host = {
  id: 'h',
  memberId: 'member-h',
  name: 'Host',
  role: 'host' as const,
  ready: true,
  where: 'lobby' as const,
}

function base(maxPlayers: number) {
  return createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers, peers: [host] })
}

it('assigns player role and emits PEER_LIST + PEER_JOINED', () => {
  const { state, outgoing } = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', {
    matchRunning: false,
  })
  expect(state.peers.p1.role).toBe('player')
  expect(state.peers.p1.memberId).toBe('member-p1')

  const list = outgoing.find((o) => o.message.type === 'PEER_LIST')
  expect(list?.to).toBe('p1')
  expect(list?.message.type === 'PEER_LIST' && list.message.payload.yourRole).toBe('player')

  const joined = outgoing.find((o) => o.message.type === 'PEER_JOINED')
  expect(joined?.to).toBe('broadcast')
  expect(joined?.message.type === 'PEER_JOINED' && joined.message.payload.ready).toBe(false)
  expect(joined?.message.type === 'PEER_JOINED' && joined.message.payload.memberId).toBe(
    'member-p1',
  )
})

it('handleReady broadcasts PEER_JOINED with ready: true', () => {
  const joined = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', { matchRunning: false }).state
  const { outgoing } = handleReady(joined, 'p1')
  const broadcast = outgoing.find((o) => o.message.type === 'PEER_JOINED')
  expect(broadcast?.to).toBe('broadcast')
  expect(broadcast?.message.type === 'PEER_JOINED' && broadcast.message.payload.ready).toBe(true)
})

it('handleReady toggles readiness back off (reversible)', () => {
  const joined = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', { matchRunning: false }).state
  const readied = handleReady(joined, 'p1').state // false -> true
  expect(readied.peers.p1.ready).toBe(true)
  const { state, outgoing } = handleReady(readied, 'p1') // true -> false
  expect(state.peers.p1.ready).toBe(false)
  const broadcast = outgoing.find((o) => o.message.type === 'PEER_JOINED')
  expect(broadcast?.message.type === 'PEER_JOINED' && broadcast.message.payload.ready).toBe(false)
})

it('assigns guest when player slots are full', () => {
  const { state } = handleJoinRequest(base(2), 'p1', 'member-p1', 'Pam', { matchRunning: false }) // host fills 1, p1 fills 2
  const second = handleJoinRequest(state, 'p2', 'member-p2', 'Pat', { matchRunning: false })
  expect(second.state.peers.p2.role).toBe('guest')
})

it('kick removes the peer and broadcasts PLAYER_KICKED', () => {
  const joined = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', { matchRunning: false }).state
  const { state, outgoing } = kick(joined, 'p1', 'afk')
  expect(state.peers.p1).toBeUndefined()
  expect(outgoing[0].message).toEqual({
    type: 'PLAYER_KICKED',
    payload: { peerId: 'p1', reason: 'afk' },
  })
  expect(outgoing[0].to).toBe('broadcast')
})

it('setMaxPlayers clamps to 2..6', () => {
  expect(setMaxPlayers(base(4), 9).state.maxPlayers).toBe(6)
  expect(setMaxPlayers(base(4), 1).state.maxPlayers).toBe(2)
})

it('rejects a player cap below connected players without changing their roles', () => {
  let state = base(6)
  for (const id of ['p1', 'p2', 'p3'])
    state = handleJoinRequest(state, id, id, id, { matchRunning: false }).state
  expect(setMaxPlayers(state, 2)).toEqual({ state, outgoing: [], error: 'players-present' })
  const accepted = setMaxPlayers(state, 4)
  expect(accepted.state.maxPlayers).toBe(4)
  expect(playerCount(accepted.state)).toBe(4)
  expect(accepted.state.peers).toEqual(state.peers)
})

it('canStart requires >=2 players all ready', () => {
  const onePlayer = base(4)
  expect(canStart(onePlayer)).toBe(false) // only host
  const withReady = handleJoinRequest(onePlayer, 'p1', 'member-p1', 'Pam', {
    matchRunning: false,
  }).state
  expect(canStart(withReady)).toBe(false) // p1 not ready
  withReady.peers.p1.ready = true
  expect(canStart(withReady)).toBe(true)
})

it('does not start while a ready player is still viewing the previous match', () => {
  const state = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', { matchRunning: false }).state
  state.peers.p1 = { ...state.peers.p1, ready: true, where: 'stats' }
  expect(canStart(state)).toBe(false)
})

it('ignores readiness sent from outside the lobby', () => {
  const state = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', { matchRunning: false }).state
  state.peers.p1.where = 'stats'
  expect(handleReady(state, 'p1')).toEqual({ state, outgoing: [] })
})

it('resets a returning player only once and preserves their next confirmation', () => {
  const state = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', { matchRunning: false }).state
  state.peers.p1 = { ...state.peers.p1, ready: true, where: 'game' }
  const returned = handleWhereabouts(state, 'p1', 'lobby')
  expect(returned.state.peers.p1.ready).toBe(false)
  const confirmed = handleReady(returned.state, 'p1').state
  expect(confirmed.peers.p1.ready).toBe(true)
  const remounted = handleWhereabouts(confirmed, 'p1', 'lobby')
  expect(remounted.state).toBe(confirmed)
  expect(canStart(remounted.state)).toBe(true)
})

it.each([
  ['lobby', true],
  ['game', false],
  ['stats', false],
] as const)('preserves reconnect readiness only from the lobby, not %s', (where, ready) => {
  const previous = { role: 'player' as const, ready: true, where }
  const joined = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', {
    matchRunning: false,
    returningLobbyPeer: previous,
  }).state
  expect(joined.peers.p1).toMatchObject({ role: 'player', where: 'lobby', ready })
  const announced = handleWhereabouts(joined, 'p1', 'lobby').state
  expect(canStart(announced)).toBe(ready)
  if (!ready) expect(canStart(handleReady(announced, 'p1').state)).toBe(true)
})

it('disbandLobby broadcasts LOBBY_DISBANDED without mutating state', () => {
  const s = base(4)
  const { state, outgoing } = disbandLobby(s)
  expect(state).toBe(s)
  expect(outgoing).toHaveLength(1)
  expect(outgoing[0]).toEqual({
    to: 'broadcast',
    message: { type: 'LOBBY_DISBANDED', payload: {} },
  })
})

it('records where a peer went and tells the table', () => {
  const state = createLobbyState({
    selfId: 'host',
    hostId: 'host',
    maxPlayers: 4,
    peers: [
      {
        id: 'host',
        memberId: 'member-host',
        name: 'Ann',
        role: 'host',
        ready: true,
        where: 'lobby',
      },
      { id: 'g1', memberId: 'member-g1', name: 'Bo', role: 'player', ready: false, where: 'lobby' },
    ],
  })

  const r = handleWhereabouts(state, 'g1', 'stats')

  expect(r.state.peers.g1.where).toBe('stats')
  expect(r.outgoing).toEqual([
    {
      to: 'broadcast',
      message: {
        type: 'PEER_JOINED',
        payload: {
          id: 'g1',
          memberId: 'member-g1',
          name: 'Bo',
          role: 'player',
          ready: false,
          where: 'stats',
        },
      },
    },
  ])
})

it('says nothing when a peer re-announces where it already is', () => {
  // Every screen announces on mount, and React mounts more than once in
  // StrictMode. Without this guard a remount is a table-wide broadcast.
  const state = createLobbyState({
    selfId: 'host',
    hostId: 'host',
    maxPlayers: 4,
    peers: [
      { id: 'g1', memberId: 'member-g1', name: 'Bo', role: 'player', ready: false, where: 'stats' },
    ],
  })

  const r = handleWhereabouts(state, 'g1', 'stats')

  expect(r.state).toBe(state)
  expect(r.outgoing).toEqual([])
})

it('ignores a whereabouts from someone not in the room', () => {
  const state = createLobbyState({
    selfId: 'host',
    hostId: 'host',
    maxPlayers: 4,
    peers: [
      { id: 'g1', memberId: 'member-g1', name: 'Bo', role: 'player', ready: false, where: 'lobby' },
    ],
  })

  const r = handleWhereabouts(state, 'stranger', 'game')

  expect(r.state).toBe(state)
  expect(r.outgoing).toEqual([])
})

it('seats a joiner in the lobby, since that is the only place to join from', () => {
  const state = createLobbyState({
    selfId: 'host',
    hostId: 'host',
    maxPlayers: 4,
    peers: [
      {
        id: 'host',
        memberId: 'member-host',
        name: 'Ann',
        role: 'host',
        ready: true,
        where: 'lobby',
      },
    ],
  })

  const r = handleJoinRequest(state, 'g1', 'member-g1', 'Bo', { matchRunning: false })

  expect(r.state.peers.g1.where).toBe('lobby')
})

// Named `returningBase` (not `base`) to avoid colliding with the `base(maxPlayers)`
// helper above — this fixture is a mid-match lobby with a frozen seat to return to.
const returningBase = () =>
  createLobbyState({
    selfId: 'host',
    hostId: 'host',
    maxPlayers: 2,
    peers: [
      {
        id: 'host',
        memberId: 'member-host',
        name: 'Ann',
        role: 'host',
        ready: true,
        where: 'game',
      },
    ],
  })

it('rebinds only when the caller supplied an authenticated returning seat', () => {
  const returningSeat = { playerId: 'p2', peerId: 'dead-peer', name: 'Bo' }
  const result = handleJoinRequest(returningBase(), 'fresh-peer', 'member-bo', 'Bo', {
    matchRunning: true,
    returningSeat,
  })
  expect(result.outgoing).toContainEqual({
    to: 'broadcast',
    message: { type: 'SEAT_REBOUND', payload: { playerId: 'p2', peerId: 'fresh-peer' } },
  })
})

// The trap this test exists for: assignRole would look at a full room and hand
// back 'guest', silently demoting a player out of a match they are still
// seated in.
it('does not demote a returning player when the room has filled behind them', () => {
  const full = createLobbyState({
    selfId: 'host',
    hostId: 'host',
    maxPlayers: 2,
    peers: [
      {
        id: 'host',
        memberId: 'member-host',
        name: 'Ann',
        role: 'host',
        ready: true,
        where: 'game',
      },
      {
        id: 'squatter',
        memberId: 'member-squatter',
        name: 'Cy',
        role: 'player',
        ready: true,
        where: 'game',
      },
    ],
  })
  const returningSeat = { playerId: 'p2', peerId: 'dead-peer', name: 'Bo' }
  const r = handleJoinRequest(full, 'fresh-peer', 'member-bo', 'Bo', {
    matchRunning: true,
    returningSeat,
  })
  expect(r.state.peers['fresh-peer'].role).toBe('player')
})

it('treats a join with no authenticated seat as ordinary', () => {
  const result = handleJoinRequest(returningBase(), 'newcomer', 'member-cy', 'Cy', {
    matchRunning: true,
  })
  expect(result.state.peers.newcomer.role).toBe('guest')
  expect(result.outgoing.some((item) => item.message.type === 'SEAT_REBOUND')).toBe(false)
})

it('treats any join as ordinary when no match is running', () => {
  const r = handleJoinRequest(returningBase(), 'fresh-peer', 'member-bo', 'Bo', {
    matchRunning: false,
  })
  expect(r.outgoing.some((o) => o.message.type === 'SEAT_REBOUND')).toBe(false)
})

// Local to this suite: state.test.ts defines its own copy rather than sharing
// one, matching how this repository keeps small test fixtures per file.
const table = (maxPlayers: number, bots: number, humans: number): LobbyState =>
  createLobbyState({
    selfId: 'h',
    hostId: 'h',
    maxPlayers,
    bots,
    peers: Array.from({ length: humans }, (_, i) => ({
      id: i === 0 ? 'h' : `p${i}`,
      memberId: `member-${i}`,
      name: `P${i}`,
      role: i === 0 ? ('host' as const) : ('player' as const),
      ready: true,
      where: 'lobby' as const,
    })),
  })

it('clamps the bot count to the 0..5 the rules allow and tells everyone', () => {
  const r = setBots(table(6, 0, 1), 9)
  expect(r.state.bots).toBe(MAX_BOTS)
  expect(r.outgoing).toEqual([
    { to: 'broadcast', message: { type: 'LOBBY_CONFIG_UPDATED', payload: { bots: 5 } } },
  ])
  expect(setBots(table(6, 0, 1), -2).state.bots).toBe(0)
})

// One bot is a table; no bots alone is not.
it('lets a host start alone with a bot, and not without one', () => {
  expect(canStart(table(6, 1, 1))).toBe(true)
  expect(canStart(table(6, 0, 1))).toBe(false)
})

it('still refuses to start while a human is not ready', () => {
  const two = table(6, 0, 2)
  const notReady = {
    ...two,
    peers: { ...two.peers, p1: { ...two.peers.p1, ready: false } },
  }
  expect(canStart(notReady)).toBe(false)
})

it('seats an unauthenticated mid-match join as a spectator when bots are seated', () => {
  const joined = handleJoinRequest(table(6, 1, 1), 'new-peer', 'member-new', 'Newcomer', {
    matchRunning: true,
  })
  expect(joined.state.peers['new-peer']).toMatchObject({
    role: 'guest',
    ready: false,
    where: 'lobby',
  })
  expect(joined.outgoing.some((o) => o.message.type === 'SEAT_REBOUND')).toBe(false)
})

it('admits a voluntary spectator without consuming a player seat or readiness', () => {
  const result = handleJoinRequest(base(4), 's', 'member-s', 'Sam', {
    matchRunning: false,
    requestedRole: 'spectator',
  })
  expect(result.accepted).toBe(true)
  expect(result.state.peers.s).toMatchObject({ role: 'guest', ready: false })
  expect(playerCount(result.state)).toBe(1)
  expect(handleReady(result.state, 's').state).toBe(result.state)
})

it('rejects a spectator when spectating is disabled', () => {
  const state = setMaxSpectators(base(4), 0).state
  const result = handleJoinRequest(state, 's', 'member-s', 'Sam', {
    matchRunning: false,
    requestedRole: 'spectator',
  })
  expect(result.accepted).toBe(false)
  expect(result.state).toBe(state)
  expect(result.outgoing).toEqual([
    {
      to: 's',
      message: {
        type: 'JOIN_REJECTED',
        payload: { reason: 'room-full', availability: { player: true, spectator: false } },
      },
    },
  ])
})

it('admits only the first of two requests for the last spectator slot', () => {
  const state = setMaxSpectators(base(2), 1).state
  const first = handleJoinRequest(state, 's1', 'm1', 'One', { matchRunning: true })
  const second = handleJoinRequest(first.state, 's2', 'm2', 'Two', { matchRunning: true })
  expect(first.accepted).toBe(true)
  expect(second.accepted).toBe(false)
  expect(Object.keys(second.state.peers)).toEqual(['h', 's1'])
  const lowered = setMaxSpectators(first.state, 0)
  expect(lowered.error).toBeUndefined()
  expect(lowered.state.maxSpectators).toBe(0)
  expect(lowered.state.peers).toEqual(first.state.peers)
  expect(
    handleJoinRequest(lowered.state, 's3', 'm3', 'Three', { matchRunning: true }).accepted,
  ).toBe(false)
})

it('restores a seated player even when both quotas are full', () => {
  let state = setMaxSpectators(base(2), 0).state
  state = handleJoinRequest(state, 'p', 'mp', 'Player', { matchRunning: false }).state
  const returned = handleJoinRequest(state, 'return', 'mr', 'Return', {
    matchRunning: true,
    requestedRole: 'spectator',
    returningSeat: { playerId: 'p2', peerId: 'old', name: 'Return' },
  })
  expect(returned.accepted).toBe(true)
  expect(returned.state.peers.return).toMatchObject({ role: 'player', ready: true, where: 'game' })
})

it('changes both participant roles and resets readiness', () => {
  const joined = handleJoinRequest(base(4), 'p', 'mp', 'Player', { matchRunning: false }).state
  const ready = handleReady(joined, 'p').state
  const spectator = setParticipantRole(ready, 'p', 'spectator', false)
  expect(spectator.state.peers.p).toMatchObject({ role: 'guest', ready: false })
  expect(spectator.outgoing[0].message.type).toBe('PEER_JOINED')
  expect(setParticipantRole(spectator.state, 'p', 'player', false).state.peers.p).toMatchObject({
    role: 'player',
    ready: false,
  })
})

it('blocks moderation outside lobby and against host or bot seats', () => {
  const state = handleJoinRequest(base(4), 'p', 'mp', 'Player', { matchRunning: false }).state
  expect(setParticipantRole(state, 'h', 'spectator', false).error).toBe('invalid-target')
  expect(setParticipantRole(state, 'bot:1', 'spectator', false).error).toBe('invalid-target')
  expect(setParticipantRole(state, 'p', 'spectator', true).error).toBe('match-running')
  state.peers.p.where = 'stats'
  expect(setParticipantRole(state, 'p', 'spectator', false).error).toBe('invalid-target')
})

it('enforces quotas on role changes and preserves connected player seats', () => {
  let state = setMaxSpectators(base(4), 0).state
  for (const id of ['p1', 'p2', 'p3'])
    state = handleJoinRequest(state, id, id, id, { matchRunning: false }).state
  expect(setParticipantRole(state, 'p1', 'spectator', false).error).toBe('spectators-full')
  expect(setMaxPlayers(state, 2)).toEqual({ state, outgoing: [], error: 'players-present' })
  state = setMaxSpectators(state, 1).state
  const extra = handleJoinRequest(state, 's', 's', 'Sam', { matchRunning: false }).state
  expect(setParticipantRole(extra, 's', 'player', false).error).toBe('players-full')
})

it.each([NaN, Infinity, 1.5])('rejects malformed player limits %s', (value) => {
  expect(setMaxPlayers(base(4), value).error).toBe('invalid-limit')
})

it('gives a joining player their free wish and a spectator nothing', () => {
  const asPlayer = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', {
    matchRunning: false,
    avatar: 'attack-bug',
  })
  expect(asPlayer.state.peers.p1.avatar).toBe('attack-bug')
  const joined = asPlayer.outgoing.find((o) => o.message.type === 'PEER_JOINED')
  expect(joined?.message.type === 'PEER_JOINED' && joined.message.payload.avatar).toBe('attack-bug')

  const asSpectator = handleJoinRequest(base(4), 'g1', 'member-g1', 'Gus', {
    matchRunning: false,
    requestedRole: 'spectator',
    avatar: 'attack-bug',
  })
  expect(asSpectator.state.peers.g1.avatar).toBeUndefined()
})

it('keeps the avatar on ready and whereabouts broadcasts', () => {
  const joined = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', {
    matchRunning: false,
    avatar: 'attack-bug',
  }).state
  const ready = handleReady(joined, 'p1').outgoing[0]
  expect(ready.message.type === 'PEER_JOINED' && ready.message.payload.avatar).toBe('attack-bug')
  const where = handleWhereabouts(joined, 'p1', 'stats').outgoing[0]
  expect(where.message.type === 'PEER_JOINED' && where.message.payload.avatar).toBe('attack-bug')
})

it('frees the avatar of a player made spectator and deals one to a spectator made player', () => {
  const joined = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', {
    matchRunning: false,
    avatar: 'attack-bug',
  }).state
  const demoted = setParticipantRole(joined, 'p1', 'spectator', false).state
  expect(demoted.peers.p1.avatar).toBeUndefined()
  const promoted = setParticipantRole(demoted, 'p1', 'player', false).state
  expect(promoted.peers.p1.avatar).toEqual(expect.any(String))
})

// The results screen's Bug Runner plate reads the room's best runs off the
// roster, so the host is the one that keeps them there. A run reaches it as two
// messages — its start, then its score — and the host times it between them.
const T0 = 1_000_000
const bugRun = (state: LobbyState, peer: string, score: unknown, seconds = 60) =>
  handleBugRunnerScore(
    handleBugRunnerStart(state, peer, T0).state,
    peer,
    score,
    T0 + seconds * 1000,
  )

it('keeps a best Bug Runner run on the member’s row and tells the room — a spectator’s too', () => {
  // one seat, held by the host: the joiner is a spectator
  const joined = handleJoinRequest(base(1), 'p1', 'member-p1', 'Pam', { matchRunning: false }).state
  expect(joined.peers.p1.role).toBe('guest')
  const { state, outgoing } = bugRun(joined, 'p1', 1840)
  expect(state.peers.p1.bugRunner).toBe(1840)
  const broadcast = outgoing.find((o) => o.message.type === 'PEER_JOINED')
  expect(broadcast?.to).toBe('broadcast')
  expect(broadcast?.message.type === 'PEER_JOINED' && broadcast.message.payload.bugRunner).toBe(
    1840,
  )
})

it('does not let a later, lower run take the room’s best back', () => {
  const joined = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', { matchRunning: false }).state
  const best = bugRun(joined, 'p1', 1840).state
  for (const score of [964, 1840]) {
    const { state, outgoing } = bugRun(best, 'p1', score)
    expect(state.peers.p1.bugRunner).toBe(1840)
    expect(outgoing).toEqual([])
  }
  expect(bugRun(best, 'p1', 2315).state.peers.p1.bugRunner).toBe(2315)
})

it('ignores a Bug Runner score that is not a positive whole number, or from nobody in the room', () => {
  const joined = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', { matchRunning: false }).state
  for (const score of [0, -5, 12.5, Number.NaN, '900', undefined]) {
    const { state, outgoing } = bugRun(joined, 'p1', score)
    expect(state.peers.p1.bugRunner).toBeUndefined()
    expect(outgoing).toEqual([])
  }
  expect(bugRun(joined, 'stranger', 900).state).toBe(joined)
})

// #241 review: any guest could send any number from devtools and take the plate.
it('turns away a score with no run the host heard start, or above what the run’s time allows', () => {
  const joined = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', { matchRunning: false }).state
  // no start: nothing to time it against
  expect(handleBugRunnerScore(joined, 'p1', 900, T0).state.peers.p1.bugRunner).toBeUndefined()
  // the number the review typed in, after a minute's run
  expect(bugRun(joined, 'p1', Number.MAX_SAFE_INTEGER).state.peers.p1.bugRunner).toBeUndefined()
  // one point over the ceiling for a ten-second run, with the network's slack
  const over = maxBugRunnerScore(10 + 3) + 1
  expect(bugRun(joined, 'p1', over, 10).state.peers.p1.bugRunner).toBeUndefined()
  expect(bugRun(joined, 'p1', over - 1, 10).state.peers.p1.bugRunner).toBe(over - 1)
})

it('closes a run with its score, so one start does not time a second score', () => {
  const joined = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', { matchRunning: false }).state
  const once = bugRun(joined, 'p1', 900).state
  expect(handleBugRunnerScore(once, 'p1', 1200, T0 + 120_000).state.peers.p1.bugRunner).toBe(900)
})

// #241 review: a reload dropped the record with the old row, and the plate went
// to somebody else. The host keeps it by member, apart from the roster.
it('keeps a member’s Bug Runner record across a reload', () => {
  const joined = handleJoinRequest(base(4), 'p1', 'member-p1', 'Pam', { matchRunning: false }).state
  const scored = bugRun(joined, 'p1', 2315).state
  // the old channel drops first, then the member comes back on a new peer id
  const gone = applyPeerLeft(scored, 'p1')
  const back = handleJoinRequest(gone, 'p1-again', 'member-p1', 'Pam', { matchRunning: false })
  expect(back.state.peers['p1-again'].bugRunner).toBe(2315)
})
