# Lobby Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the full lobby page — two-column layout with game settings sync, spectators, and disband — and extend the start screen with a "continue session" entry.

**Architecture:** Three milestones on one branch: (M1) extend the network layer (wire types, state, host pure functions, useLobby hook); (M2) create `_LobbyView.tsx` and update `_LobbyFlow.tsx`; (M3) add "continue session" to the start screen. Each milestone is independently testable via `pnpm typecheck && pnpm -r test`.

**Tech Stack:** React 19, TypeScript, Tailwind v4, PeerJS P2P transport, `@release/ui` primitives, `@release/translation` (react-i18next).

## Global Constraints

- No new `*.module.css` files — all styling via Tailwind v4 utilities.
- All user-visible strings via `t()` with keys in both `en` and `ru` catalogs (`packages/translation/src/locales/`).
- Use primitives from `@release/ui`: `Avatar`, `Badge`, `Button`, `Input`, `Modal`, `ModeSelect`, `Slider`.
- `pnpm lint`, `pnpm typecheck`, and `pnpm -r test` must pass after every task.
- `GAME_MODES.map(ModeSelect)` pattern for settings — no `GameSettings` block component.
- Spec: `docs/specs/2026-06-25-lobby-page-design.md`

---

## File Map

| File | Change |
|------|--------|
| `apps/frontend/src/network/types.ts` | Add `Setup` type alias; extend `LOBBY_CONFIG_UPDATED` payload; add `LOBBY_DISBANDED` |
| `apps/frontend/src/network/lobby/state.ts` | Add `setup: Setup` to `LobbyState`; update `createLobbyState`, `applyPeerList`, `applyConfig` |
| `apps/frontend/src/network/lobby/host.ts` | Fix `setMaxPlayers` call to new `applyConfig`; add `disbandLobby` |
| `apps/frontend/src/network/useLobby.ts` | Add `'disbanded'` to `LobbyStatus`; add `setSetup`/`disband` to interface + impl; pass `DEFAULT_SETUP` in `createRoom`/`joinRoom`; fix guest `LOBBY_CONFIG_UPDATED` handler; handle `LOBBY_DISBANDED` |
| `apps/frontend/src/network/lobby/state.test.ts` | Add tests for `setup` field and new `applyConfig` signature |
| `apps/frontend/src/network/lobby/host.test.ts` | Add test for `disbandLobby` |
| `packages/translation/src/locales/en/common.json` | Add 5 new keys |
| `packages/translation/src/locales/ru/common.json` | Add 5 new keys |
| `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx` | Update `base()`/`inSession()` mocks; swap `SessionView`→`LobbyView`; add tests for modes, spectators, disband, disbanded, resumed |
| `apps/frontend/src/pages/lobby/_LobbyView.tsx` | **New** — full two-column lobby UI |
| `apps/frontend/src/pages/lobby/_LobbyFlow.tsx` | Import `LobbyView`; handle `'disbanded'`; update `continued` seed |
| `apps/frontend/src/pages/lobby/_SessionView.tsx` | **Delete** |
| `apps/frontend/src/pages/start.tsx` | Add `useSession()` check + `MenuButton` |
| `apps/frontend/src/pages/__tests__/start.test.tsx` | Add test for "continue session" button |

---

## Task 1: Network types, state, host pure functions

**Files:**
- Modify: `apps/frontend/src/network/types.ts`
- Modify: `apps/frontend/src/network/lobby/state.ts`
- Modify: `apps/frontend/src/network/lobby/host.ts`
- Test: `apps/frontend/src/network/lobby/state.test.ts`
- Test: `apps/frontend/src/network/lobby/host.test.ts`

**Interfaces:**
- Produces: `Setup = Record<string, string>` exported from `types.ts`; `LobbyState.setup: Setup`; `applyConfig(state, { maxPlayers?, setup? }): LobbyState`; `disbandLobby(state): Result`

- [ ] **Step 1: Add failing tests to `state.test.ts`**

Append after the existing tests:

```ts
import {
  applyConfig,
  applyPeerJoined,
  applyPeerLeft,
  applyPeerList,
  assignRole,
  createLobbyState,
  playerCount,
} from './state'
```

The existing import only covers `applyPeerJoined, applyPeerLeft, assignRole, createLobbyState, playerCount`. Add `applyConfig` and `applyPeerList` to the existing import line, then append:

```ts
it('createLobbyState defaults setup to empty record', () => {
  const s = createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers: 4, peers: [] })
  expect(s.setup).toEqual({})
})

it('createLobbyState uses provided setup', () => {
  const setup = { handLimit: 'base', releases: 'fast' }
  const s = createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers: 4, setup, peers: [] })
  expect(s.setup).toEqual(setup)
})

it('applyConfig updates maxPlayers, preserves setup', () => {
  const s = createLobbyState({
    selfId: 'h', hostId: 'h', maxPlayers: 4,
    setup: { handLimit: 'base' }, peers: [],
  })
  const next = applyConfig(s, { maxPlayers: 6 })
  expect(next.maxPlayers).toBe(6)
  expect(next.setup).toEqual({ handLimit: 'base' })
})

it('applyConfig updates setup, preserves maxPlayers', () => {
  const s = createLobbyState({
    selfId: 'h', hostId: 'h', maxPlayers: 4,
    setup: { handLimit: 'base' }, peers: [],
  })
  const next = applyConfig(s, { setup: { handLimit: 'memory' } })
  expect(next.maxPlayers).toBe(4)
  expect(next.setup).toEqual({ handLimit: 'memory' })
})

it('applyPeerList preserves setup', () => {
  const setup = { handLimit: 'fast' }
  const host = { id: 'h', name: 'Host', role: 'host' as const, ready: false }
  const s = createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers: 4, setup, peers: [host] })
  const next = applyPeerList(s, [host])
  expect(next.setup).toEqual(setup)
})
```

- [ ] **Step 2: Add failing test to `host.test.ts`**

Add at the top of the imports:

```ts
import { canStart, disbandLobby, handleJoinRequest, handleReady, kick, setMaxPlayers } from './host'
```

(add `disbandLobby` to the existing import), then append:

```ts
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
```

- [ ] **Step 3: Run tests to confirm they fail**

```bash
cd /Users/andreykonnov/dev/MythHand/ReleaseBoardGameP2P
pnpm --filter @release/web test apps/frontend/src/network/lobby/state.test.ts
pnpm --filter @release/web test apps/frontend/src/network/lobby/host.test.ts
```

Expected: FAIL — `applyConfig` type error, `disbandLobby` not found.

- [ ] **Step 4: Update `types.ts`**

Replace the existing file content at `apps/frontend/src/network/types.ts`. Add `Setup` type and update `LOBBY_CONFIG_UPDATED` and add `LOBBY_DISBANDED` to the `Message` union:

```ts
// The networking layer is decoupled from game rules: card identities are
// opaque strings, and the per-turn snapshot is an opaque JSON object. The
// game-engine spec refines these.
export type CardId = string
export type GameStateSnapshot = Record<string, unknown>

// Opaque key→value map for game mode settings (handLimit, releases, etc.).
// Defined here so network/ doesn't import from @release/ui.
export type Setup = Record<string, string>

export type Role = 'host' | 'player' | 'guest'

export interface PeerInfo {
  id: string
  name: string
  role: Role
  ready: boolean
}

export interface AttackResponse {
  player: string
  kind: 'attack' | 'pass'
  card?: CardId
  sudo?: boolean
}

// Discriminated union of every protocol message ({ type, payload }).
export type Message =
  // --- Lobby ---
  | { type: 'JOIN_REQUEST'; payload: { name: string } }
  | { type: 'PEER_LIST'; payload: { peers: PeerInfo[]; yourRole: 'player' | 'guest' } }
  | { type: 'PEER_JOINED'; payload: { id: string; name: string; role: Role; ready: boolean } }
  | { type: 'PLAYER_READY'; payload: Record<string, never> }
  | { type: 'LOBBY_CONFIG_UPDATED'; payload: { maxPlayers?: number; setup?: Setup } }
  | { type: 'LOBBY_DISBANDED'; payload: Record<string, never> }
  | { type: 'PLAYER_KICKED'; payload: { peerId: string; reason?: string } }
  | { type: 'TRANSFER_HOST'; payload: { newHostId: string } }
  | { type: 'HOST_TRANSFERRED'; payload: { from: string; to: string } }
  // --- Game start ---
  | { type: 'HAND_DEALT'; payload: { cards: CardId[] } }
  | {
      type: 'GAME_STARTED'
      payload: {
        players: { id: string; name: string }[]
        guests: { id: string; name: string }[]
        deckSize: number
        eventDeckSize: number
        releaseZones: Record<string, never>
        currentTurn: string
        maxPlayers: number
        modes: Record<string, unknown>
      }
    }
  // --- Turn ---
  | { type: 'TURN_START'; payload: { player: string; turnIndex: number } }
  | {
      type: 'CARD_PLAYED'
      payload: { card: CardId; target?: string; sudo?: boolean; codeReview?: boolean }
    }
  | { type: 'CARD_DRAWN'; payload: { deckSize: number } }
  | { type: 'TURN_END'; payload: Record<string, never> }
  | {
      type: 'ATTACK_WINDOW_OPEN'
      payload: { releaseCard: CardId; releasePlayer: string; codeReview: boolean }
    }
  | { type: 'ATTACK'; payload: { card: CardId; sudo?: boolean } }
  | { type: 'PASS'; payload: Record<string, never> }
  | { type: 'DEFENSE_REQUEST'; payload: { attack: CardId; fromPlayer: string } }
  | { type: 'DEFEND'; payload: { card: CardId } }
  | { type: 'DECLINE'; payload: Record<string, never> }
  | { type: 'TURN_RESOLVED'; payload: { state: GameStateSnapshot } }
  // --- Rules-driven (TYPES ONLY; runtime deferred — see plan scope note) ---
  | { type: 'DRAW_REQUEST'; payload: Record<string, never> }
  | { type: 'DRAW_RESULT'; payload: { card: CardId } }
  | { type: 'AI_REVEALED'; payload: { aiCard: CardId; eventCard: CardId } }
  | { type: 'ERROR503_DRAWN'; payload: { player: string } }
  | {
      type: 'NEUTRALIZE'
      payload: { method: 'debugger' | 'monitoring' | 'sacrifice'; releaseCard?: CardId }
    }
  | { type: 'PLAYER_ELIMINATED'; payload: { player: string } }
  | {
      type: 'HAND_ATTACK'
      payload: { card: CardId; target: string; sudo?: boolean; requestedCard?: CardId }
    }
  | { type: 'HAND_GIVE'; payload: { card: CardId } }
  | {
      type: 'HAND_ATTACK_RESULT'
      payload: {
        attacker: string
        target: string
        attackerHandSize: number
        targetHandSize: number
      }
    }
  | { type: 'DISCARD_REQUEST'; payload: { fromCard: CardId } }
  | { type: 'DISCARD_CHOICE'; payload: { card: CardId } }
  | {
      type: 'GIT_OP'
      payload: { op: 'branch' | 'merge' | 'rebase' | 'cherry-pick'; sudo?: boolean }
    }
  | { type: 'GIT_PEEK'; payload: { cards: CardId[] } }
  | { type: 'GIT_REORDER'; payload: { order: CardId[] } }

export type MessageType = Message['type']

export type WireMessage = Message & { from: string; seq: number }
```

- [ ] **Step 5: Update `state.ts`**

Replace `apps/frontend/src/network/lobby/state.ts` with:

```ts
import type { PeerInfo, Setup } from '../types'

export interface LobbyState {
  selfId: string
  hostId: string
  maxPlayers: number
  setup: Setup
  peers: Record<string, PeerInfo>
}

export function createLobbyState(args: {
  selfId: string
  hostId: string
  maxPlayers: number
  setup?: Setup
  peers: PeerInfo[]
}): LobbyState {
  const peers: Record<string, PeerInfo> = {}
  for (const p of args.peers) peers[p.id] = p
  return {
    selfId: args.selfId,
    hostId: args.hostId,
    maxPlayers: args.maxPlayers,
    setup: args.setup ?? {},
    peers,
  }
}

export function playerCount(state: LobbyState): number {
  return Object.values(state.peers).filter((p) => p.role === 'host' || p.role === 'player').length
}

export function assignRole(state: LobbyState): 'player' | 'guest' {
  return playerCount(state) < state.maxPlayers ? 'player' : 'guest'
}

export function applyPeerList(state: LobbyState, peers: PeerInfo[]): LobbyState {
  return createLobbyState({
    selfId: state.selfId,
    hostId: state.hostId,
    maxPlayers: state.maxPlayers,
    setup: state.setup,
    peers,
  })
}

export function applyPeerJoined(state: LobbyState, peer: PeerInfo): LobbyState {
  return { ...state, peers: { ...state.peers, [peer.id]: peer } }
}

export function applyPeerLeft(state: LobbyState, peerId: string): LobbyState {
  const peers = { ...state.peers }
  delete peers[peerId]
  return { ...state, peers }
}

export function applyConfig(
  state: LobbyState,
  patch: { maxPlayers?: number; setup?: Setup },
): LobbyState {
  return {
    ...state,
    ...(patch.maxPlayers !== undefined && { maxPlayers: patch.maxPlayers }),
    ...(patch.setup !== undefined && { setup: patch.setup }),
  }
}
```

- [ ] **Step 6: Update `host.ts` — fix `applyConfig` call and add `disbandLobby`**

In `apps/frontend/src/network/lobby/host.ts`:

1. Find the line `const next = applyConfig({ ...state, peers }, clamped)` in `setMaxPlayers` and change it to:
   ```ts
   const next = applyConfig({ ...state, peers }, { maxPlayers: clamped })
   ```
   And update the broadcast:
   ```ts
   { to: 'broadcast', message: { type: 'LOBBY_CONFIG_UPDATED', payload: { maxPlayers: clamped } } },
   ```
   (payload stays unchanged — `{ maxPlayers: clamped }` is still valid under the new union type)

2. Add `disbandLobby` at the end of the file:
   ```ts
   export function disbandLobby(state: LobbyState): Result {
     return {
       state,
       outgoing: [
         { to: 'broadcast', message: { type: 'LOBBY_DISBANDED', payload: {} } },
       ],
     }
   }
   ```

- [ ] **Step 7: Fix `useLobby.ts` — update `applyConfig` call**

In `apps/frontend/src/network/useLobby.ts`, find the guest-side `LOBBY_CONFIG_UPDATED` handler:

```ts
case 'LOBBY_CONFIG_UPDATED':
  if (fromHost) commit(applyConfig(current, msg.payload.maxPlayers))
  break
```

Change it to:
```ts
case 'LOBBY_CONFIG_UPDATED':
  if (fromHost) commit(applyConfig(current, msg.payload))
  break
```

- [ ] **Step 8: Run tests to confirm they pass**

```bash
cd /Users/andreykonnov/dev/MythHand/ReleaseBoardGameP2P
pnpm --filter @release/web test apps/frontend/src/network/lobby/state.test.ts
pnpm --filter @release/web test apps/frontend/src/network/lobby/host.test.ts
pnpm typecheck
```

Expected: all tests PASS, typecheck PASS.

- [ ] **Step 9: Commit**

```bash
git add apps/frontend/src/network/types.ts \
        apps/frontend/src/network/lobby/state.ts \
        apps/frontend/src/network/lobby/host.ts \
        apps/frontend/src/network/useLobby.ts \
        apps/frontend/src/network/lobby/state.test.ts \
        apps/frontend/src/network/lobby/host.test.ts
git commit -m "feat(network): setup sync + disband — extend types, state, host"
```

---

## Task 2: Extend `useLobby` hook (`setSetup`, `disband`, `'disbanded'`)

**Files:**
- Modify: `apps/frontend/src/network/useLobby.ts`
- Modify: `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx`

**Interfaces:**
- Consumes: `disbandLobby` from `./lobby/host` (Task 1); `applyConfig` from `./lobby/state` (Task 1)
- Produces: `LobbyStatus` extended with `'disbanded'`; `UseLobby` extended with `setSetup(setup: Setup): void` and `disband(): void`

- [ ] **Step 1: Extend `LobbyStatus` and `UseLobby` in `useLobby.ts`**

Change:
```ts
export type LobbyStatus = 'idle' | 'connecting' | 'in-lobby' | 'kicked' | 'error'
```
To:
```ts
export type LobbyStatus = 'idle' | 'connecting' | 'in-lobby' | 'kicked' | 'disbanded' | 'error'
```

Add to the `UseLobby` interface after `transferHost`:
```ts
setSetup(setup: Setup): void
disband(): void
```

Add `Setup` to the import from `./lobby/state` (or from `./types` since we added it there):
```ts
// At the top of useLobby.ts, existing imports from './lobby/host' and './lobby/state':
import { disbandLobby, ... } from './lobby/host'  // add disbandLobby
import type { Setup } from './types'  // add Setup
```

- [ ] **Step 2: Implement `setSetup` and `disband` in `useLobby.ts`**

Add `DEFAULT_SETUP` import from `@release/ui`:
```ts
import { DEFAULT_SETUP } from '@release/ui'
```

Update `createRoom` — add `setup: DEFAULT_SETUP` to `createLobbyState` call:
```ts
const initial = createLobbyState({
  selfId: t.id,
  hostId: t.id,
  maxPlayers,
  setup: DEFAULT_SETUP,
  peers: [{ id: t.id, name, role: 'host', ready: true }],
})
```

Update `joinRoom` — add `setup: DEFAULT_SETUP` to `createLobbyState` call:
```ts
commit(
  createLobbyState({
    selfId: t.id,
    hostId,
    maxPlayers: 6,
    setup: DEFAULT_SETUP,
    peers: [{ id: t.id, name, role: 'guest', ready: false }],
  }),
)
```

Add to guest-side `onMessage` switch, after `PLAYER_KICKED` case:
```ts
case 'LOBBY_DISBANDED':
  if (fromHost) {
    leaveSession()
    setStatus('disbanded')
  }
  break
```

Add after `leaveSession` useCallback:

```ts
const setSetup = useCallback(
  (setup: Setup) => {
    const current = stateRef.current
    if (!current || !isHostRef.current) return
    commit(applyConfig(current, { setup }))
    dispatch([
      { to: 'broadcast', message: { type: 'LOBBY_CONFIG_UPDATED', payload: { setup } } },
    ])
  },
  [commit, dispatch],
)

const disband = useCallback(() => {
  const current = stateRef.current
  if (!current || !isHostRef.current) return
  const r = disbandLobbyFn(current)
  dispatch(r.outgoing)
  leaveSession()
}, [dispatch, leaveSession])
```

(Note: `disbandLobbyFn` is the alias for `disbandLobby` from host.ts — add it to the existing import: `import { ..., disbandLobby as disbandLobbyFn } from './lobby/host'`)

Update the `useMemo` return to include the two new methods:
```ts
return useMemo<UseLobby>(
  () => ({
    state,
    status,
    roomCode,
    isHost,
    canStart: state ? canStartFn(state) : false,
    error,
    createRoom,
    joinRoom,
    ready,
    kick,
    setMaxPlayers,
    transferHost,
    setSetup,
    disband,
    leaveSession,
    clearError,
  }),
  [
    state, status, roomCode, isHost, error,
    createRoom, joinRoom, ready, kick, setMaxPlayers,
    transferHost, setSetup, disband, leaveSession, clearError,
  ],
)
```

- [ ] **Step 3: Update mock factories in `lobby.test.tsx`**

In `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx`:

1. Update the `base()` return to add the new methods:
```ts
function base(): UseLobby {
  return {
    state: null,
    status: 'idle',
    roomCode: null,
    isHost: false,
    canStart: false,
    error: null,
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    ready: vi.fn(),
    kick: vi.fn(),
    setMaxPlayers: vi.fn(),
    transferHost: vi.fn(),
    setSetup: vi.fn(),
    disband: vi.fn(),
    leaveSession: vi.fn(),
    clearError: vi.fn(),
  }
}
```

2. Update `inSession()` to add `setup` to `state`:
```ts
function inSession(): UseLobby {
  return {
    ...base(),
    status: 'in-lobby',
    roomCode: 'ABC-23D',
    isHost: true,
    state: {
      selfId: 'h',
      hostId: 'h',
      maxPlayers: 4,
      setup: { handLimit: 'base', releases: 'base', releaseCond: 'base', ai: 'base', gitBranch: 'base' },
      peers: {
        h: { id: 'h', name: 'Host', role: 'host', ready: true },
        p1: { id: 'p1', name: 'Pat', role: 'player', ready: false },
      },
    },
  }
}
```

- [ ] **Step 4: Run typecheck and tests**

```bash
cd /Users/andreykonnov/dev/MythHand/ReleaseBoardGameP2P
pnpm typecheck
pnpm --filter @release/web test
```

Expected: PASS. (The `lobby.test.tsx` tests still pass because `_SessionView` still exists and the test still imports it.)

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/useLobby.ts \
        apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx
git commit -m "feat(network): add setSetup + disband to useLobby, disbanded status"
```

---

## Task 3: Translation keys

**Files:**
- Modify: `packages/translation/src/locales/en/common.json`
- Modify: `packages/translation/src/locales/ru/common.json`

**Interfaces:**
- Produces: `t('start.continueSession')`, `t('lobby.modesLockedHint')`, `t('lobby.disbandTitle')`, `t('lobby.disbandConfirm')`, `t('lobby.disband')`, `t('lobby.disbandedMessage')` — available in both catalogs.

- [ ] **Step 1: Add keys to `en/common.json`**

In `packages/translation/src/locales/en/common.json`, add to `"start"` object (after `"required"`):
```json
"continueSession": "continue session"
```

Add to `"lobby"` object (after `"drop"`):
```json
"modesLockedHint": "managed by host",
"disbandTitle": "Disband lobby?",
"disbandConfirm": "The lobby will be closed and all connected players will be disconnected. This cannot be undone.",
"disband": "disband",
"disbandedMessage": "The lobby has been disbanded."
```

- [ ] **Step 2: Add keys to `ru/common.json`**

In `packages/translation/src/locales/ru/common.json`, add to `"start"` object (after `"required"`):
```json
"continueSession": "продолжить сессию"
```

Add to `"lobby"` object (after `"drop"`):
```json
"modesLockedHint": "настраивает хост",
"disbandTitle": "Расформировать лобби?",
"disbandConfirm": "Лобби будет закрыто, все подключённые игроки — отключены. Действие нельзя отменить.",
"disband": "расформировать",
"disbandedMessage": "Лобби было расформировано."
```

- [ ] **Step 3: Run typecheck**

```bash
cd /Users/andreykonnov/dev/MythHand/ReleaseBoardGameP2P
pnpm --filter @release/translation typecheck
```

Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/translation/src/locales/en/common.json \
        packages/translation/src/locales/ru/common.json
git commit -m "feat(i18n): add lobby disband + continue session translation keys"
```

---

## Task 4: `_LobbyView.tsx` + `_LobbyFlow.tsx` update

**Files:**
- Create: `apps/frontend/src/pages/lobby/_LobbyView.tsx`
- Modify: `apps/frontend/src/pages/lobby/_LobbyFlow.tsx`
- Delete: `apps/frontend/src/pages/lobby/_SessionView.tsx`
- Modify: `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx`

**Interfaces:**
- Consumes: `UseLobby` with `setSetup`/`disband` (Task 2); translation keys (Task 3); `GAME_MODES, MODES_COPY_EN, MODES_COPY_RU` from `@release/ui`

- [ ] **Step 1: Update `lobby.test.tsx` — failing tests first**

At the top of the test file, replace:
```ts
import SessionView from '../_SessionView'
```
with:
```ts
import LobbyView from '../_LobbyView'
```

Rename the existing `SessionView` test and update it for the new component (the `_LobbyView` uses `t('lobby.leave')` instead of `t('lobby.drop')` for the destructive action):

```ts
it('LobbyView Back keeps the session; Leave tears it down', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyView />)
  fireEvent.click(screen.getByText('lobby.back'))
  expect(sessionValue.leaveSession).not.toHaveBeenCalled()
  fireEvent.click(screen.getByText('lobby.leave'))
  expect(sessionValue.leaveSession).toHaveBeenCalledOnce()
})
```

Add new tests after the existing ones:

```ts
it('LobbyView renders game modes section', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyView />)
  expect(screen.getByText('lobby.modes')).toBeTruthy()
})

it('LobbyView renders spectator section when guests present', () => {
  sessionValue = {
    ...inSession(),
    state: {
      selfId: 'h',
      hostId: 'h',
      maxPlayers: 4,
      setup: { handLimit: 'base', releases: 'base', releaseCond: 'base', ai: 'base', gitBranch: 'base' },
      peers: {
        h: { id: 'h', name: 'Host', role: 'host', ready: true },
        g1: { id: 'g1', name: 'Gus', role: 'guest', ready: false },
      },
    },
  }
  renderInRouter(<LobbyView />)
  expect(screen.getByText('Gus')).toBeTruthy()
  expect(screen.getByText('lobby.roleGuest')).toBeTruthy()
})

it('LobbyView host sees disband button', () => {
  sessionValue = inSession()
  renderInRouter(<LobbyView />)
  expect(screen.getByText('lobby.disband')).toBeTruthy()
})

it('LobbyView guest does not see disband button', () => {
  sessionValue = { ...inSession(), isHost: false }
  renderInRouter(<LobbyView />)
  expect(screen.queryByText('lobby.disband')).toBeNull()
})

it('LobbyFlow shows disbanded message instead of the form', () => {
  sessionValue = { ...base(), status: 'disbanded' }
  renderInRouter(
    <LobbyFlow>
      <div>FORM-SLOT</div>
    </LobbyFlow>,
  )
  expect(screen.getByText('lobby.disbandedMessage')).toBeTruthy()
  expect(screen.queryByText('FORM-SLOT')).toBeNull()
})

it('LobbyFlow skips the interstitial when resumed=true', () => {
  sessionValue = inSession()
  render(
    <MemoryRouter initialEntries={[{ pathname: '/lobby', state: { resumed: true } }]}>
      <LobbyFlow>
        <div>FORM-SLOT</div>
      </LobbyFlow>
    </MemoryRouter>,
  )
  expect(screen.queryByText('lobby.activeSession')).toBeNull()
  expect(screen.getByText('ABC-23D')).toBeTruthy()
})
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
cd /Users/andreykonnov/dev/MythHand/ReleaseBoardGameP2P
pnpm --filter @release/web test apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx
```

Expected: FAIL — `_LobbyView` module not found; `SessionView` import already removed.

- [ ] **Step 3: Create `_LobbyView.tsx`**

Create `apps/frontend/src/pages/lobby/_LobbyView.tsx`:

```tsx
import { useTranslation } from '@release/translation'
import {
  Avatar,
  Badge,
  type BadgeTone,
  Button,
  GAME_MODES,
  Input,
  Modal,
  MODES_COPY_EN,
  MODES_COPY_RU,
  ModeSelect,
  Slider,
} from '@release/ui'
import { useState } from 'react'
import { useNavigate } from 'react-router'
import { useSession } from '~/app/providers/SessionProvider'
import type { Role } from '~/entities/lobby'
import { useStartGame } from '~/features/start-game/useStartGame'

const ROLE_TONE: Record<Role, BadgeTone> = { host: 'success', player: 'info', guest: 'muted' }

export default function LobbyView() {
  const { t, i18n } = useTranslation()
  const session = useSession()
  const startGame = useStartGame()
  const navigate = useNavigate()
  const [copied, setCopied] = useState(false)
  const [disbandOpen, setDisbandOpen] = useState(false)

  const state = session.state
  if (!state) return null

  const modesCopy = i18n.language.startsWith('en') ? MODES_COPY_EN : MODES_COPY_RU

  const players = Object.values(state.peers).filter(
    (p) => p.role === 'host' || p.role === 'player',
  )
  const spectators = Object.values(state.peers).filter((p) => p.role === 'guest')
  const self = state.peers[state.selfId]
  const playerSlots = players.length

  const shareUrl = session.roomCode
    ? `${window.location.origin}${import.meta.env.BASE_URL}lobby/${session.roomCode}`
    : ''

  const copyShareLink = () => {
    navigator.clipboard?.writeText(shareUrl)
    setCopied(true)
  }

  const roleLabel = (role: Role) =>
    role === 'host'
      ? t('lobby.roleHost')
      : role === 'player'
        ? t('lobby.rolePlayer')
        : t('lobby.roleGuest')

  const back = () => navigate('/start')
  const drop = () => {
    session.leaveSession()
    navigate('/start')
  }

  const onDisbandConfirm = () => {
    setDisbandOpen(false)
    session.disband()
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 px-6 py-16 lg:flex-row">
      {/* Left column — game modes */}
      <section className="flex flex-col gap-4 lg:w-96">
        <div className="flex items-center gap-2">
          <h2 className="text-fg text-sm font-semibold tracking-base">{t('lobby.modes')}</h2>
          {!session.isHost && (
            <span className="text-fg/40 text-xs">{t('lobby.modesLockedHint')}</span>
          )}
        </div>
        {GAME_MODES.map((m) => {
          const mc = modesCopy[m.key]
          return (
            <ModeSelect
              key={m.key}
              title={mc?.title ?? ''}
              options={m.options.map((o) => ({
                value: o.value,
                label: o.label,
                desc: mc?.options[o.value] ?? '',
              }))}
              value={state.setup[m.key] ?? ''}
              readOnly={!session.isHost}
              onChange={(v) => session.setSetup({ ...state.setup, [m.key]: v })}
            />
          )
        })}
      </section>

      {/* Right column — roster */}
      <section className="flex flex-1 flex-col gap-5 rounded-2xl border border-fg/10 bg-surface-1 p-6">
        <div className="flex items-baseline justify-between gap-4">
          <div>
            <p className="text-fg/70 text-xs font-semibold tracking-base">{t('lobby.roomCode')}</p>
            <p className="text-2xl font-bold text-brand-green tracking-widest">
              {session.roomCode}
            </p>
          </div>
          <Badge tone={ROLE_TONE[self?.role ?? 'guest']} outlined>
            {roleLabel(self?.role ?? 'guest')}
          </Badge>
        </div>

        <Input
          label={t('lobby.shareLink')}
          value={shareUrl}
          readOnly
          onFocus={(e) => e.target.select()}
          trailing={
            <Button variant="tech" onClick={copyShareLink}>
              {copied ? t('lobby.copied') : t('lobby.copy')}
            </Button>
          }
        />

        {session.isHost && (
          <Slider
            label={t('lobby.maxPlayers')}
            value={state.maxPlayers}
            min={Math.max(2, playerSlots)}
            max={6}
            onChange={session.setMaxPlayers}
          />
        )}

        <div className="flex flex-col gap-2">
          <p className="text-fg/70 text-xs font-semibold tracking-base">
            {t('lobby.players')} ({players.length})
          </p>
          <ul className="flex flex-col gap-1.5">
            {players.map((peer) => (
              <li
                key={peer.id}
                className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2"
              >
                <span className="flex items-center gap-2">
                  <Avatar name={peer.name} size={28} />
                  <span className="text-fg font-medium">{peer.name}</span>
                  {peer.id === state.selfId && (
                    <span className="text-fg/40 text-xs">({t('lobby.you')})</span>
                  )}
                  <Badge tone={ROLE_TONE[peer.role]}>{roleLabel(peer.role)}</Badge>
                </span>
                <span className="flex items-center gap-3">
                  <Badge tone={peer.ready ? 'success' : 'muted'}>
                    {peer.ready ? t('lobby.ready') : t('lobby.waiting')}
                  </Badge>
                  {session.isHost && peer.role !== 'host' && (
                    <Button variant="tech" onClick={() => session.kick(peer.id)}>
                      {t('lobby.kick')}
                    </Button>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>

        {spectators.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-fg/70 text-xs font-semibold tracking-base">
              {t('lobby.roleGuest')} ({spectators.length})
            </p>
            <ul className="flex flex-col gap-1.5">
              {spectators.map((peer) => (
                <li
                  key={peer.id}
                  className="flex items-center justify-between gap-3 rounded-lg bg-surface-2 px-3 py-2"
                >
                  <span className="flex items-center gap-2">
                    <Avatar name={peer.name} size={28} />
                    <span className="text-fg font-medium">{peer.name}</span>
                    {peer.id === state.selfId && (
                      <span className="text-fg/40 text-xs">({t('lobby.you')})</span>
                    )}
                    <Badge tone="muted">{t('lobby.roleGuest')}</Badge>
                  </span>
                  {session.isHost && (
                    <Button variant="tech" onClick={() => session.kick(peer.id)}>
                      {t('lobby.kick')}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {!session.isHost && (
            <Button variant="tech" onClick={() => session.ready()} disabled={self?.ready}>
              {t('lobby.ready')}
            </Button>
          )}
          {session.isHost && (
            <Button
              onClick={startGame}
              disabled={!session.canStart}
              title={session.canStart ? undefined : t('lobby.startHint')}
            >
              {t('lobby.start')}
            </Button>
          )}
          <Button variant="tech" className="ml-auto" onClick={back}>
            {t('lobby.back')}
          </Button>
          <Button variant="danger" onClick={drop}>
            {t('lobby.leave')}
          </Button>
          {session.isHost && (
            <Button variant="danger" onClick={() => setDisbandOpen(true)}>
              {t('lobby.disband')}
            </Button>
          )}
        </div>
      </section>

      <Modal
        open={disbandOpen}
        onClose={() => setDisbandOpen(false)}
        title={t('lobby.disbandTitle')}
      >
        <p className="text-fg/80 text-sm">{t('lobby.disbandConfirm')}</p>
        <div className="mt-6 flex justify-end gap-3">
          <Button variant="tech" onClick={() => setDisbandOpen(false)}>
            {t('start.close')}
          </Button>
          <Button variant="danger" onClick={onDisbandConfirm}>
            {t('lobby.disband')}
          </Button>
        </div>
      </Modal>
    </main>
  )
}
```

- [ ] **Step 4: Update `_LobbyFlow.tsx`**

In `apps/frontend/src/pages/lobby/_LobbyFlow.tsx`:

1. Replace import:
   ```ts
   import SessionView from './_SessionView'
   ```
   with:
   ```ts
   import LobbyView from './_LobbyView'
   ```

2. Add `useLocation` to imports:
   ```ts
   import { Link, useLocation } from 'react-router'
   ```

3. Update the `continued` state seed — replace:
   ```ts
   const [continued, setContinued] = useState(session.status !== 'in-lobby')
   ```
   with:
   ```ts
   const location = useLocation()
   const [continued, setContinued] = useState(
     session.status !== 'in-lobby' ||
       !!(location.state as { resumed?: boolean } | null)?.resumed,
   )
   ```

4. Handle `disbanded` — replace the kicked block:
   ```tsx
   if (session.status === 'kicked') {
     return (
       <Shell>
         <div className={card}>
           <p className="text-fg/80">{t('lobby.kickedMessage')}</p>
           <Link
             to="/start"
             className={`${ghostBtn} mt-4 inline-block`}
             onClick={() => session.leaveSession()}
           >
             {t('lobby.back')}
           </Link>
         </div>
       </Shell>
     )
   }
   ```
   with:
   ```tsx
   if (session.status === 'kicked' || session.status === 'disbanded') {
     return (
       <Shell>
         <div className={card}>
           <p className="text-fg/80">
             {session.status === 'kicked'
               ? t('lobby.kickedMessage')
               : t('lobby.disbandedMessage')}
           </p>
           <Link
             to="/start"
             className={`${ghostBtn} mt-4 inline-block`}
             onClick={() => session.leaveSession()}
           >
             {t('lobby.back')}
           </Link>
         </div>
       </Shell>
     )
   }
   ```

5. Replace the `<SessionView />` render:
   ```tsx
   return <SessionView />
   ```
   with:
   ```tsx
   return <LobbyView />
   ```

- [ ] **Step 5: Delete `_SessionView.tsx`**

```bash
rm apps/frontend/src/pages/lobby/_SessionView.tsx
```

- [ ] **Step 6: Run tests and typecheck**

```bash
cd /Users/andreykonnov/dev/MythHand/ReleaseBoardGameP2P
pnpm typecheck
pnpm --filter @release/web test apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx
```

Expected: all PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/lobby/_LobbyView.tsx \
        apps/frontend/src/pages/lobby/_LobbyFlow.tsx \
        apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx
git rm apps/frontend/src/pages/lobby/_SessionView.tsx
git commit -m "feat(lobby): implement _LobbyView (two-column, modes, spectators, disband)"
```

---

## Task 5: Start screen "continue session"

**Files:**
- Modify: `apps/frontend/src/pages/start.tsx`
- Modify: `apps/frontend/src/pages/__tests__/start.test.tsx`

**Interfaces:**
- Consumes: `useSession()` from `~/app/providers/SessionProvider`; `t('start.continueSession')` (Task 3)

- [ ] **Step 1: Add failing test to `start.test.tsx`**

In `apps/frontend/src/pages/__tests__/start.test.tsx`, add the `useSession` mock and two tests.

Add near the top with other mocks:
```ts
import type { UseLobby } from '~/entities/lobby'

vi.mock('~/app/providers/SessionProvider', () => ({
  useSession: () => sessionValue,
}))

let sessionValue: Pick<UseLobby, 'status' | 'state'>
```

Add before the existing `beforeEach` or before the test:
```ts
// default: no active session
```

Update the existing test to set `sessionValue` first, and add two new tests:

```ts
it('renders the start screen with create and join actions', () => {
  sessionValue = { status: 'idle', state: null }
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('start.createGame')).toBeTruthy()
  expect(screen.getByText('start.joinGame')).toBeTruthy()
})

it('shows continue session button when session is active', () => {
  sessionValue = {
    status: 'in-lobby',
    state: {
      selfId: 'h', hostId: 'h', maxPlayers: 4,
      setup: {},
      peers: { h: { id: 'h', name: 'Host', role: 'host', ready: true } },
    },
  }
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  expect(screen.getByText('start.continueSession')).toBeTruthy()
})

it('hides continue session button when no session', () => {
  sessionValue = { status: 'idle', state: null }
  render(
    <MemoryRouter>
      <StartPage />
    </MemoryRouter>,
  )
  expect(screen.queryByText('start.continueSession')).toBeNull()
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd /Users/andreykonnov/dev/MythHand/ReleaseBoardGameP2P
pnpm --filter @release/web test apps/frontend/src/pages/__tests__/start.test.tsx
```

Expected: FAIL — `useSession` mock not found (start.tsx doesn't call it yet); `start.continueSession` text absent.

- [ ] **Step 3: Update `start.tsx`**

In `apps/frontend/src/pages/start.tsx`:

1. Add imports at the top:
   ```ts
   import { useNavigate } from 'react-router'
   import { useSession } from '~/app/providers/SessionProvider'
   ```

2. Inside `StartPage`, add after `const handleMenuClick = useModalRoute()`:
   ```ts
   const session = useSession()
   const navigate = useNavigate()
   const hasSession = session.status === 'in-lobby' && !!session.state
   ```

3. In the `<Menu>` block, add between the create/join group and the rules/github group:
   ```tsx
   {hasSession && (
     <MenuButton onClick={() => navigate('/lobby', { state: { resumed: true } })}>
       {t('start.continueSession')}
     </MenuButton>
   )}
   ```

   Full updated `<Menu>` block:
   ```tsx
   <Menu className="-ml-2.75 items-center">
     <MenuButton autoFocus value="create" onClick={handleMenuClick}>
       {t('start.createGame')}
     </MenuButton>
     <MenuButton value="join" onClick={handleMenuClick}>
       {t('start.joinGame')}
     </MenuButton>
     {hasSession && (
       <MenuButton onClick={() => navigate('/lobby', { state: { resumed: true } })}>
         {t('start.continueSession')}
       </MenuButton>
     )}
     <div className="flex flex-col pt-6">
       <MenuButton value="rules" onClick={handleMenuClick}>
         {t('start.rules')}
       </MenuButton>
       <MenuButton onClick={() => window.open(REPO_URL, '_blank', 'noopener')}>
         {t('start.github')}
       </MenuButton>
     </div>
   </Menu>
   ```

- [ ] **Step 4: Run tests and typecheck**

```bash
cd /Users/andreykonnov/dev/MythHand/ReleaseBoardGameP2P
pnpm typecheck
pnpm --filter @release/web test apps/frontend/src/pages/__tests__/start.test.tsx
pnpm -r test
```

Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/start.tsx \
        apps/frontend/src/pages/__tests__/start.test.tsx
git commit -m "feat(start): add continue session menu entry"
```

---

## Self-Review

**Spec coverage:**
- ✅ M1 — `LOBBY_CONFIG_UPDATED` extended with `setup?`; `LOBBY_DISBANDED` added; `'disbanded'` status; `setSetup`/`disband` on `UseLobby`; guest-side handlers → Tasks 1 & 2
- ✅ M2 — `_LobbyView.tsx` two-column layout, game modes (`GAME_MODES.map(ModeSelect)`), host readOnly, players, spectators, capacity `Slider`, disband `Modal`, `_LobbyFlow` disbanded handling, `continued` seed → Task 4
- ✅ M3 — `start.tsx` continue session button, `location.state.resumed` seed skip → Task 5
- ✅ All translation keys from spec table → Task 3 (+ `lobby.disbandedMessage` added for disbanded status message)

**Placeholder scan:** No TBD/TODO in any step. All code blocks are complete.

**Type consistency:**
- `Setup = Record<string, string>` defined in `types.ts`, imported in `state.ts` — consistent.
- `applyConfig(state, patch: { maxPlayers?, setup? })` signature used consistently in Task 1 (`host.ts`) and Task 2 (`useLobby.ts`).
- `disbandLobby` (Task 1, `host.ts`) imported as `disbandLobbyFn` in `useLobby.ts` (Task 2).
- `UseLobby.setSetup`/`disband` defined in Task 2, mocked in test factories in Task 2, consumed in `_LobbyView.tsx` in Task 4.
- `LobbyStatus = '... | disbanded'` defined in Task 2, matched in `_LobbyFlow.tsx` in Task 4.
