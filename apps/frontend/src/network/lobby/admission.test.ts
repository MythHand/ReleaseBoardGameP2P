import { parseJoinRequestPayload, resolveJoinAdmission } from './admission'
import { applyConfig, applyPeerList, createLobbyState } from './state'

const request = { name: 'Sam', resumeToken: 'private-token' }

it.each([
  null,
  [],
  {},
  { ...request, requestedRole: 'host' },
  { ...request, resumeToken: 4 },
  { ...request, resume: null },
  { ...request, resume: { where: 'unknown', lastGameId: null } },
  { ...request, resume: { where: 'lobby', lastGameId: 1 } },
])('rejects malformed join payload %j', (payload) => {
  expect(parseJoinRequestPayload(payload)).toBeNull()
})

it('accepts a legacy request and validated spectator resume preference', () => {
  expect(parseJoinRequestPayload(request)).toEqual(request)
  const resumed = {
    ...request,
    requestedRole: 'spectator',
    resume: { where: 'lobby', lastGameId: 'g1' },
  }
  expect(parseJoinRequestPayload(resumed)).toEqual(resumed)
})

it.each([
  NaN,
  Infinity,
  -1,
  29,
  1.5,
])('rejects invalid spectator configuration %s without rounding it', (limit) => {
  const state = createLobbyState({
    selfId: 'h',
    hostId: 'h',
    maxPlayers: 4,
    peers: [],
    maxSpectators: limit,
  })
  expect(state.maxSpectators).toBe(8)
  const configured = applyConfig(state, { maxSpectators: 2 })
  expect(applyConfig(configured, { maxSpectators: limit }).maxSpectators).toBe(2)
  expect(applyPeerList(configured, []).maxSpectators).toBe(2)
})

it('counts a live connection replacement once at a full spectator quota', () => {
  const previous = {
    id: 'old',
    memberId: 'same',
    name: 'Sam',
    role: 'guest' as const,
    ready: false,
    where: 'lobby' as const,
  }
  const state = createLobbyState({
    selfId: 'h',
    hostId: 'h',
    maxPlayers: 4,
    maxSpectators: 1,
    peers: [previous],
  })
  expect(
    resolveJoinAdmission(state, 'new', {
      matchRunning: false,
      returningLobbyPeer: previous,
      requestedRole: 'spectator',
    }),
  ).toEqual({ accepted: true, role: 'guest' })
  expect(
    resolveJoinAdmission(state, 'other', { matchRunning: false, requestedRole: 'spectator' }),
  ).toEqual({
    accepted: false,
    reason: 'room-full',
    availability: { player: true, spectator: false },
  })
})
