import { type ActionTimeScale, isActionTimeScale, MAX_SPECTATORS } from '@release/ui'
import type { PeerInfo, Setup } from '../types'

export interface LobbyState {
  selfId: string
  hostId: string
  maxPlayers: number
  maxSpectators: number
  // How much time every action gets, as a multiple of the game's own — the
  // host's setting, kept by the room so the next match starts on it too.
  actionTime: ActionTimeScale
  // How many bots the host has ASKED for — a ceiling, not a reservation. What
  // the table can actually seat is `effectiveBots` below, which shrinks as
  // people take the seats and grows back when they leave. Storing the request
  // rather than the outcome is what keeps a bot from ever costing a person a
  // seat, and what saves this from needing a displacement rule.
  bots: number
  setup: Setup
  peers: Record<string, PeerInfo>
  // THE HOST'S OWN BOOKS of the lobby's mini-game, never sent anywhere. `best`
  // is each member's best run by `memberId`, kept apart from `peers`: the roster
  // drops a row the instant its channel does, and a reload would lose the record
  // before the member is back. `started` is when the host heard a run begin, by
  // peer id, so the score that ends it is timed on the host's own clock.
  bugRunner?: { best: Record<string, number>; started: Record<string, number> }
}

// The rules seat 2–6 (docs/rules/general.md:13), so one human and five bots is
// the largest table a lone host can ask for. Here rather than in host.ts
// because profile.ts reserves every name a bot could ever take.
export const MAX_BOTS = 5

export function createLobbyState(args: {
  selfId: string
  hostId: string
  maxPlayers: number
  maxSpectators?: number
  actionTime?: number
  bots?: number
  setup?: Setup
  peers: PeerInfo[]
}): LobbyState {
  const peers: Record<string, PeerInfo> = {}
  for (const p of args.peers) peers[p.id] = p
  return {
    selfId: args.selfId,
    hostId: args.hostId,
    maxPlayers: args.maxPlayers,
    maxSpectators: validSpectatorLimit(args.maxSpectators) ? args.maxSpectators : 8,
    actionTime: isActionTimeScale(args.actionTime) ? args.actionTime : 1,
    bots: args.bots ?? 0,
    setup: args.setup ?? {},
    peers,
  }
}

export function playerCount(state: LobbyState): number {
  return Object.values(state.peers).filter((p) => p.role === 'host' || p.role === 'player').length
}

// What the table can actually seat, given who is in it. Every reader derives
// bots from this rather than storing which seats are bots — storing that is
// what would force a displacement rule when somebody joins, a kick rule for a
// thing that cannot be kicked, and a ready rule for a thing that is always
// ready. `Math.max(0, …)` covers a capacity lowered below the people already
// present, where the subtraction goes negative.
export function effectiveBots(state: LobbyState): number {
  return Math.max(0, Math.min(state.bots, state.maxPlayers - playerCount(state)))
}

export function assignRole(state: LobbyState): 'player' | 'guest' {
  return playerCount(state) < state.maxPlayers ? 'player' : 'guest'
}

export function applyPeerList(state: LobbyState, peers: PeerInfo[]): LobbyState {
  const next = createLobbyState({
    selfId: state.selfId,
    hostId: state.hostId,
    maxPlayers: state.maxPlayers,
    maxSpectators: state.maxSpectators,
    actionTime: state.actionTime,
    // Forwarded like every other field here: rebuilding through
    // createLobbyState without it would silently reset a guest's bot count
    // to the `?? 0` default on every PEER_LIST, undoing whatever
    // LOBBY_CONFIG_UPDATED had already told it.
    bots: state.bots,
    setup: state.setup,
    peers,
  })
  // …and the same for the mini-game's books, which createLobbyState knows nothing of
  return state.bugRunner ? { ...next, bugRunner: state.bugRunner } : next
}

export function applyPeerJoined(state: LobbyState, peer: PeerInfo): LobbyState {
  return { ...state, peers: { ...state.peers, [peer.id]: peer } }
}

export function applyPeerLeft(state: LobbyState, peerId: string): LobbyState {
  const peers = { ...state.peers }
  delete peers[peerId]
  if (state.bugRunner?.started[peerId] === undefined) return { ...state, peers }
  // a run the peer left in the middle of has no end coming: its start goes with
  // the peer, while the member's record stays for their return
  const { [peerId]: _, ...started } = state.bugRunner.started
  return { ...state, peers, bugRunner: { ...state.bugRunner, started } }
}

export function applyConfig(
  state: LobbyState,
  patch: {
    maxSpectators?: number
    maxPlayers?: number
    setup?: Setup
    bots?: number
    actionTime?: number
  },
): LobbyState {
  return {
    ...state,
    ...(validSpectatorLimit(patch.maxSpectators) && { maxSpectators: patch.maxSpectators }),
    ...(patch.maxPlayers !== undefined && { maxPlayers: patch.maxPlayers }),
    ...(patch.setup !== undefined && { setup: patch.setup }),
    ...(patch.bots !== undefined && { bots: patch.bots }),
    ...(isActionTimeScale(patch.actionTime) && { actionTime: patch.actionTime }),
  }
}

export function validSpectatorLimit(value: unknown): value is number {
  return (
    typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= MAX_SPECTATORS
  )
}

export function spectatorCount(state: LobbyState): number {
  return Object.values(state.peers).filter((peer) => peer.role === 'guest').length
}
