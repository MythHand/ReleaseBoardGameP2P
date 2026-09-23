import { act } from '@testing-library/react'
import { renderHook } from './testing/lobbyHarness'
import { formatRoomCode, makeRoomCode, parseRoomCode, useLobby } from './useLobby'

it('keeps the public lobby facade shape compatible', () => {
  const { result } = renderHook(() => useLobby())

  expect(Object.keys(result.current).sort()).toEqual([
    'canStart',
    'chat',
    'clearError',
    'createRoom',
    'disband',
    'error',
    'errorKind',
    'gameId',
    'gameLink',
    'gameSync',
    'introReady',
    'isHost',
    'joinRoom',
    'kick',
    'leaveGame',
    'leaveSession',
    'pickPreview',
    'previewPick',
    'ready',
    'reconnect',
    'restoring',
    'roomCode',
    'seats',
    'setBots',
    'setMaxPlayers',
    'setSetup',
    'setWhere',
    'startGame',
    'state',
    'status',
    'transferHost',
  ])
})

it('keeps callbacks stable while replacing the facade after a view update', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 4))
  const facade = result.current
  const callbacks = [
    facade.chat.send,
    facade.reconnect.retry,
    facade.clearError,
    facade.createRoom,
    facade.disband,
    facade.introReady,
    facade.joinRoom,
    facade.kick,
    facade.leaveGame,
    facade.leaveSession,
    facade.previewPick,
    facade.ready,
    facade.setBots,
    facade.setMaxPlayers,
    facade.setSetup,
    facade.setWhere,
    facade.startGame,
    facade.transferHost,
  ]

  act(() => result.current.ready())

  expect(result.current).not.toBe(facade)
  expect([
    result.current.chat.send,
    result.current.reconnect.retry,
    result.current.clearError,
    result.current.createRoom,
    result.current.disband,
    result.current.introReady,
    result.current.joinRoom,
    result.current.kick,
    result.current.leaveGame,
    result.current.leaveSession,
    result.current.previewPick,
    result.current.ready,
    result.current.setBots,
    result.current.setMaxPlayers,
    result.current.setSetup,
    result.current.setWhere,
    result.current.startGame,
    result.current.transferHost,
  ]).toEqual(callbacks)
})

it('formats a room code as ABC-123 from the peer id', () => {
  expect(formatRoomCode('abc123xyz')).toBe('ABC-123')
})

it('uppercases and handles short ids', () => {
  expect(formatRoomCode('ab1')).toBe('AB1')
})

it('parseRoomCode inverts formatRoomCode for a host-id-sized code', () => {
  const id = makeRoomCode()
  expect(id).toHaveLength(6)
  expect(parseRoomCode(formatRoomCode(id))).toBe(id)
})

it('parseRoomCode tolerates user-entered separators and casing', () => {
  expect(parseRoomCode('ABC-23D')).toBe('abc23d')
  expect(parseRoomCode(' abc 23d ')).toBe('abc23d')
})
