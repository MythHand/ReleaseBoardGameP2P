// apps/frontend/src/network/lobby/profile.test.ts
import { botNames } from '@release/ui'
import { expect, it } from 'vitest'
import type { PeerInfo } from '../types'
import {
  AVATAR_IDS,
  firstAvatar,
  handleProfileUpdate,
  nameTaken,
  parseProfilePatch,
  pickAvatar,
} from './profile'
import { createLobbyState, MAX_BOTS } from './state'

const peer = (id: string, name: string, extra: Partial<PeerInfo> = {}): PeerInfo => ({
  id,
  memberId: `m-${id}`,
  name,
  role: 'player',
  ready: false,
  where: 'lobby',
  ...extra,
})

const lobby = (...peers: PeerInfo[]) =>
  createLobbyState({
    selfId: 'h',
    hostId: 'h',
    maxPlayers: 6,
    peers: [peer('h', 'Host', { role: 'host', avatar: 'release-frontend' }), ...peers],
  })

it('grants a free wish', () => {
  expect(pickAvatar(lobby(), 'attack-bug', 'p1')).toBe('attack-bug')
})

it('replaces a taken or unknown wish with a free one', () => {
  const taken = pickAvatar(lobby(), 'release-frontend', 'p1', () => 0)
  expect(taken).not.toBe('release-frontend')
  expect(AVATAR_IDS).toContain(taken)
  expect(pickAvatar(lobby(), 'not-an-avatar', 'p1', () => 0)).toBe(
    AVATAR_IDS.filter((id) => id !== 'release-frontend')[0],
  )
})

it('ignores the avatar of the peer being reassigned and of spectators', () => {
  const state = lobby(
    peer('p1', 'Pam', { avatar: 'attack-bug' }),
    peer('g1', 'Gus', { role: 'guest', avatar: 'defense-hotfix' }),
  )
  expect(pickAvatar(state, 'attack-bug', 'p1')).toBe('attack-bug')
  expect(pickAvatar(state, 'defense-hotfix', 'p2')).toBe('defense-hotfix')
})

it('has nothing to give once every avatar is held', () => {
  const peers = AVATAR_IDS.map((id, i) => peer(`p${i}`, `P${i}`, { avatar: id }))
  const state = createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers: 99, peers })
  expect(pickAvatar(state, undefined, 'new')).toBeUndefined()
})

it('firstAvatar honours a known wish and otherwise rolls', () => {
  expect(firstAvatar('attack-bug')).toBe('attack-bug')
  expect(firstAvatar('nope', () => 0)).toBe(AVATAR_IDS[0])
  expect(firstAvatar(null, () => 0.999)).toBe(AVATAR_IDS[AVATAR_IDS.length - 1])
})

it('nameTaken: case and spaces, every role, every possible bot, but not myself', () => {
  const state = lobby(peer('p1', 'Neo'), peer('g1', 'Trinity', { role: 'guest' }))
  expect(nameTaken(state, ' neo ')).toBe(true)
  expect(nameTaken(state, 'TRINITY')).toBe(true)
  expect(nameTaken(state, 'host')).toBe(true)
  expect(nameTaken(state, 'Neo', ['p1'])).toBe(false)
  expect(nameTaken(state, 'Morpheus')).toBe(false)
  // a bot the host has not added yet still owns its name
  const lastBot = botNames('h', MAX_BOTS)[MAX_BOTS - 1]
  expect(nameTaken(state, lastBot.toLowerCase())).toBe(true)
})

it('parseProfilePatch keeps string fields and refuses an empty patch', () => {
  expect(parseProfilePatch({ name: 'Neo' })).toEqual({ name: 'Neo' })
  expect(parseProfilePatch({ avatar: 'attack-bug', extra: 1 })).toEqual({ avatar: 'attack-bug' })
  expect(parseProfilePatch({ name: 3 })).toBeNull()
  expect(parseProfilePatch({})).toBeNull()
  expect(parseProfilePatch(null)).toBeNull()
})

it('renames and re-avatars a player, broadcasting the row', () => {
  const r = handleProfileUpdate(
    lobby(peer('p1', 'Pam')),
    'p1',
    { name: ' Neo ', avatar: 'attack-bug' },
    false,
  )
  expect(r.error).toBeUndefined()
  expect(r.state.peers.p1).toMatchObject({ name: 'Neo', avatar: 'attack-bug' })
  expect(r.renamed).toEqual({ from: 'Pam', to: 'Neo' })
  expect(r.outgoing).toEqual([
    { to: 'broadcast', message: { type: 'PEER_JOINED', payload: r.state.peers.p1 } },
  ])
})

it('allows a case-only rename of my own nickname', () => {
  const r = handleProfileUpdate(lobby(peer('p1', 'neo')), 'p1', { name: 'Neo' }, false)
  expect(r.state.peers.p1.name).toBe('Neo')
})

it('rejects a taken nickname, an empty one, a taken avatar, and anything outside the lobby', () => {
  const state = lobby(peer('p1', 'Pam'), peer('p2', 'Neo', { avatar: 'attack-bug' }))
  const reason = (r: ReturnType<typeof handleProfileUpdate>) => r.error
  expect(reason(handleProfileUpdate(state, 'p1', { name: 'neo' }, false))).toBe('name-taken')
  expect(reason(handleProfileUpdate(state, 'p1', { name: '   ' }, false))).toBe('name-invalid')
  expect(reason(handleProfileUpdate(state, 'p1', { avatar: 'attack-bug' }, false))).toBe(
    'avatar-taken',
  )
  expect(reason(handleProfileUpdate(state, 'p1', { avatar: 'bogus' }, false))).toBe('avatar-taken')
  expect(reason(handleProfileUpdate(state, 'p1', { name: 'Zed' }, true))).toBe('not-in-lobby')
  expect(reason(handleProfileUpdate(state, 'ghost', { name: 'Zed' }, false))).toBe('not-in-lobby')
  const away = lobby(peer('p1', 'Pam', { where: 'stats' }))
  expect(reason(handleProfileUpdate(away, 'p1', { name: 'Zed' }, false))).toBe('not-in-lobby')
})

it('answers a rejection to the sender alone and applies nothing of a half-bad patch', () => {
  const state = lobby(peer('p1', 'Pam'), peer('p2', 'Neo'))
  const r = handleProfileUpdate(state, 'p1', { name: 'neo', avatar: 'attack-bug' }, false)
  expect(r.state).toBe(state)
  expect(r.outgoing).toEqual([
    { to: 'p1', message: { type: 'PROFILE_REJECTED', payload: { reason: 'name-taken' } } },
  ])
})

it('ignores an avatar from a spectator but still renames them', () => {
  const state = lobby(peer('g1', 'Gus', { role: 'guest' }))
  const r = handleProfileUpdate(state, 'g1', { name: 'Gustav', avatar: 'attack-bug' }, false)
  expect(r.state.peers.g1.name).toBe('Gustav')
  expect(r.state.peers.g1.avatar).toBeUndefined()
})

it('sends nothing when nothing changed', () => {
  const state = lobby(peer('p1', 'Pam', { avatar: 'attack-bug' }))
  const r = handleProfileUpdate(state, 'p1', { name: 'Pam', avatar: 'attack-bug' }, false)
  expect(r).toEqual({ state, outgoing: [] })
})
