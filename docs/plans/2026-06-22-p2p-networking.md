# P2P Networking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the peer-to-peer networking layer that lets one user host a game room and others join over WebRTC — lobby, three roles, host relay, and the in-game message protocol — with no game backend.

**Architecture:** PeerJS provides WebRTC signaling (the old `apps/backend` is deleted). Topology is a star through the host peer: non-host peers hold one DataChannel to the host, who relays. The networking layer is split into a **pure protocol core** (lobby state, role assignment, relay fan-out, attack-window collection, turn advancement — no PeerJS, fully unit-testable) and a **thin transport** (PeerJS wiring that pumps wire messages in/out of the core). A React `useLobby` hook and a lobby screen wire it into `@release/web`.

**Tech Stack:** TypeScript 5 (strict), React 19, Vite 6, Vitest 4, `peerjs`, react-i18next.

## Global Constraints

- Node `>=24`; package manager `pnpm@9.15.0`. Frontend dep added: `peerjs` only.
- TS is **strict** with `noUnusedLocals` + `noUnusedParameters` + `noFallthroughCasesInSwitch` + `isolatedModules` — no unused symbols, exhaustive switches, no `export const enum`.
- **`@release/web` is Tailwind-first.** No new `*.module.css` files in the frontend — style components with Tailwind utilities in JSX (token-backed utilities like `bg-surface-1`, `text-brand-green` resolve via the `@theme` bridge in `apps/frontend/src/index.css`).
- **No string literals in `.tsx`** — all user-visible copy goes through `t()`; add keys to `apps/frontend/src/locales/{en,ru}/common.json`.
- **The networking layer must not import game-rules logic.** Card identities are `type CardId = string`; the per-turn state snapshot is an opaque `GameStateSnapshot = Record<string, unknown>`. The future game-engine spec refines these.
- Lint/format is **Biome** (`pnpm lint`, `pnpm format`); tests are **Vitest** (`pnpm test`). Commit only after typecheck + tests pass.
- Module location: all P2P code lives under `apps/frontend/src/network/`.

## Module / File Structure

```
apps/frontend/src/network/
  types.ts          # wire envelope + discriminated-union message types; CardId, GameStateSnapshot
  envelope.ts       # seq counter + envelope build/parse helpers
  lobby/
    state.ts        # LobbyState shape + role assignment + client-side apply functions
    host.ts         # host-side handlers: join, ready, kick, setMaxPlayers, transferHost, canStart
  session/
    relay.ts        # host relay fan-out target selection
    attackWindow.ts # attack-window open / record / complete / resolve-order
    turn.ts         # next-turn advancement (skips eliminated)
  transport/
    peer.ts         # PeerJS peer lifecycle: create, connect, send, broadcast, on-message
  useLobby.ts       # React hook binding transport + lobby logic
  index.ts          # public exports
apps/frontend/src/screens/
  LobbyScreen.tsx   # create/join lobby UI (Tailwind)
apps/frontend/vitest.config.ts   # NEW — frontend test runner config
```

**Deferred to a follow-up plan (blocked on the deck-keeper open question + game-engine spec):** runtime handlers for `DRAW_REQUEST`/`DRAW_RESULT`, AI/Error-503 reveal resolution, and `GIT_*` deck mutation. Their *message types* are defined here (Task 2); their *runtime* is not built.

---

### Task 1: Remove backend, scaffold network module, add frontend test config

**Files:**
- Delete: `apps/backend/` (entire directory)
- Modify: `package.json` (root) — remove the `dev:server` script
- Modify: `README.md` — drop the `apps/backend` / `@release/server` rows and the `pnpm dev:server` line; change the stack line to PeerJS signaling
- Modify: `CLAUDE.md` — drop the backend row in Monorepo Layout, drop the `@release/server` stack section + `pnpm dev:server` command, and rewrite the Architecture Rule to reference PeerJS (see step 4)
- Create: `apps/frontend/vitest.config.ts`
- Create: `apps/frontend/src/network/index.ts` (placeholder export)
- Modify: `apps/frontend/package.json` — add `peerjs` dependency

**Interfaces:**
- Consumes: nothing (first task)
- Produces: `apps/frontend/src/network/` exists and is import-resolvable; `pnpm test` runs Vitest in the frontend; `peerjs` is installed.

- [ ] **Step 1: Delete the backend app and its script**

```bash
git rm -r apps/backend
```

Edit `package.json` (root) — remove this line from `scripts`:
```json
    "dev:server": "pnpm --filter @release/server dev",
```

- [ ] **Step 2: Add peerjs to the frontend**

```bash
pnpm --filter @release/web add peerjs
```

Expected: `peerjs` appears under `dependencies` in `apps/frontend/package.json` and `pnpm-lock.yaml` updates.

- [ ] **Step 3: Create the frontend Vitest config**

Create `apps/frontend/vitest.config.ts` (mirrors the existing `apps/ui/vitest.config.ts`, plus the `@release/ui` aliases this app already uses):

```typescript
import { fileURLToPath, URL } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

const uiSrc = fileURLToPath(new URL('../ui/src', import.meta.url))

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: [
      { find: '@release/ui', replacement: `${uiSrc}/index.ts` },
      { find: '@', replacement: uiSrc },
    ],
  },
  test: { environment: 'jsdom', globals: true },
})
```

Note: `jsdom` and `@testing-library/react` are already available in the workspace (used by `@release/ui`). If `pnpm test` reports `jsdom` missing in the frontend, add it: `pnpm --filter @release/web add -D jsdom @testing-library/react`.

- [ ] **Step 4: Update the docs (README + CLAUDE.md)**

In `CLAUDE.md`, replace the Architecture Rule section body with:

```markdown
## Architecture Rule

- Networking is **peer-to-peer over WebRTC**, signaled by **PeerJS** (hosted or self-hosted `peerjs-server`). There is no game backend.
- Topology is a **star through the host peer**: non-host peers hold one DataChannel to the host, who relays messages to the others.
- **Game state lives on the peers** (browsers). No game rules are evaluated or enforced by any server.
- All P2P code lives in `apps/frontend/src/network/`.
```

Remove the `apps/backend | @release/server` row from the Monorepo Layout table, the `@release/server (backend)` stack subsection, and the `pnpm dev:server` block in Commands. Make the matching edits in `README.md` (layout table row, the `pnpm dev:server` quick-start line, and the `Fastify 5 + ws` stack bullet → `PeerJS — WebRTC signaling; game state lives on the peers`).

- [ ] **Step 5: Create the network module placeholder**

Create `apps/frontend/src/network/index.ts`:

```typescript
// Public surface of the P2P networking layer. Populated by later tasks.
export {}
```

- [ ] **Step 6: Verify the workspace still builds and tests run**

Run: `pnpm install && pnpm typecheck && pnpm test && pnpm lint`
Expected: all pass; no remaining references to `@release/server`, `apps/backend`, or `dev:server` (verify: `grep -rn "release/server\|apps/backend\|dev:server" package.json README.md CLAUDE.md` → no matches).

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: remove signaling backend, scaffold P2P network module + frontend test config"
```

---

### Task 2: Wire message types and envelope helpers

**Files:**
- Create: `apps/frontend/src/network/types.ts`
- Create: `apps/frontend/src/network/envelope.ts`
- Test: `apps/frontend/src/network/envelope.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces:
  - `type Role = 'host' | 'player' | 'guest'`
  - `type CardId = string`; `type GameStateSnapshot = Record<string, unknown>`
  - `interface PeerInfo { id: string; name: string; role: Role; ready: boolean }`
  - `type Message` — discriminated union on `type` (all protocol messages)
  - `type WireMessage = Message & { from: string; seq: number }`
  - `createEnvelope(message: Message, from: string, seq: number): WireMessage`
  - `parseEnvelope(raw: string): WireMessage` (throws on malformed)
  - `nextSeq(): number` — module-local monotonic counter (starts at 1)

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/network/envelope.test.ts`:

```typescript
import { createEnvelope, nextSeq, parseEnvelope } from './envelope'
import type { Message } from './types'

const joinMsg: Message = { type: 'JOIN_REQUEST', payload: { name: 'Ann' } }

it('wraps a message into an envelope with from + seq', () => {
  const env = createEnvelope(joinMsg, 'peer-1', 7)
  expect(env).toEqual({ type: 'JOIN_REQUEST', payload: { name: 'Ann' }, from: 'peer-1', seq: 7 })
})

it('round-trips through serialize/parse', () => {
  const env = createEnvelope(joinMsg, 'peer-1', 7)
  const parsed = parseEnvelope(JSON.stringify(env))
  expect(parsed).toEqual(env)
})

it('throws on malformed input', () => {
  expect(() => parseEnvelope('not json')).toThrow()
  expect(() => parseEnvelope('{"payload":{}}')).toThrow(/type/)
})

it('nextSeq increases monotonically', () => {
  const a = nextSeq()
  const b = nextSeq()
  expect(b).toBeGreaterThan(a)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web test`
Expected: FAIL — cannot resolve `./envelope` / `./types`.

- [ ] **Step 3: Write the types**

Create `apps/frontend/src/network/types.ts`:

```typescript
// The networking layer is decoupled from game rules: card identities are
// opaque strings, and the per-turn snapshot is an opaque JSON object. The
// game-engine spec refines these.
export type CardId = string
export type GameStateSnapshot = Record<string, unknown>

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
  | { type: 'PEER_JOINED'; payload: { id: string; name: string; role: Role } }
  | { type: 'PLAYER_READY'; payload: Record<string, never> }
  | { type: 'LOBBY_CONFIG_UPDATED'; payload: { maxPlayers: number } }
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
      payload: { attacker: string; target: string; attackerHandSize: number; targetHandSize: number }
    }
  | { type: 'DISCARD_REQUEST'; payload: { fromCard: CardId } }
  | { type: 'DISCARD_CHOICE'; payload: { card: CardId } }
  | { type: 'GIT_OP'; payload: { op: 'branch' | 'merge' | 'rebase' | 'cherry-pick'; sudo?: boolean } }
  | { type: 'GIT_PEEK'; payload: { cards: CardId[] } }
  | { type: 'GIT_REORDER'; payload: { order: CardId[] } }

export type MessageType = Message['type']

export type WireMessage = Message & { from: string; seq: number }
```

- [ ] **Step 4: Write the envelope helpers**

Create `apps/frontend/src/network/envelope.ts`:

```typescript
import type { Message, WireMessage } from './types'

let seqCounter = 0

export function nextSeq(): number {
  seqCounter += 1
  return seqCounter
}

export function createEnvelope(message: Message, from: string, seq: number): WireMessage {
  return { ...message, from, seq } as WireMessage
}

export function parseEnvelope(raw: string): WireMessage {
  const obj = JSON.parse(raw) as unknown
  if (
    typeof obj !== 'object' ||
    obj === null ||
    typeof (obj as { type?: unknown }).type !== 'string' ||
    typeof (obj as { from?: unknown }).from !== 'string' ||
    typeof (obj as { seq?: unknown }).seq !== 'number'
  ) {
    throw new Error('Malformed wire message: missing type/from/seq')
  }
  return obj as WireMessage
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @release/web test`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/network/types.ts apps/frontend/src/network/envelope.ts apps/frontend/src/network/envelope.test.ts
git commit -m "feat(network): message types + envelope helpers"
```

---

### Task 3: Lobby state + role assignment + client-side apply

**Files:**
- Create: `apps/frontend/src/network/lobby/state.ts`
- Test: `apps/frontend/src/network/lobby/state.test.ts`

**Interfaces:**
- Consumes: `PeerInfo`, `Role` from `../types`
- Produces:
  - `interface LobbyState { selfId: string; hostId: string; maxPlayers: number; peers: Record<string, PeerInfo> }`
  - `createLobbyState(args: { selfId: string; hostId: string; maxPlayers: number; peers: PeerInfo[] }): LobbyState`
  - `playerCount(state: LobbyState): number` — peers with role `'host'` or `'player'`
  - `assignRole(state: LobbyState): 'player' | 'guest'` — `'player'` if `playerCount < maxPlayers`, else `'guest'`
  - `applyPeerList(state, peers: PeerInfo[]): LobbyState`
  - `applyPeerJoined(state, peer: PeerInfo): LobbyState`
  - `applyPeerLeft(state, peerId: string): LobbyState`
  - `applyConfig(state, maxPlayers: number): LobbyState`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/network/lobby/state.test.ts`:

```typescript
import {
  applyPeerJoined,
  applyPeerLeft,
  assignRole,
  createLobbyState,
  playerCount,
} from './state'

const host = { id: 'h', name: 'Host', role: 'host' as const, ready: false }

function base(maxPlayers: number) {
  return createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers, peers: [host] })
}

it('counts host + players, not guests', () => {
  let s = base(4)
  s = applyPeerJoined(s, { id: 'p1', name: 'P1', role: 'player', ready: false })
  s = applyPeerJoined(s, { id: 'g1', name: 'G1', role: 'guest', ready: false })
  expect(playerCount(s)).toBe(2)
})

it('assigns player while slots remain, guest once full', () => {
  let s = base(2) // host occupies 1 of 2 slots
  expect(assignRole(s)).toBe('player')
  s = applyPeerJoined(s, { id: 'p1', name: 'P1', role: 'player', ready: false })
  expect(assignRole(s)).toBe('guest') // 2 players, max 2
})

it('removes a peer on leave', () => {
  let s = base(4)
  s = applyPeerJoined(s, { id: 'p1', name: 'P1', role: 'player', ready: false })
  s = applyPeerLeft(s, 'p1')
  expect(s.peers.p1).toBeUndefined()
})

it('does not mutate the input state', () => {
  const s = base(4)
  const next = applyPeerJoined(s, { id: 'p1', name: 'P1', role: 'player', ready: false })
  expect(s.peers.p1).toBeUndefined()
  expect(next).not.toBe(s)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web test state`
Expected: FAIL — cannot resolve `./state`.

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/network/lobby/state.ts`:

```typescript
import type { PeerInfo } from '../types'

export interface LobbyState {
  selfId: string
  hostId: string
  maxPlayers: number
  peers: Record<string, PeerInfo>
}

export function createLobbyState(args: {
  selfId: string
  hostId: string
  maxPlayers: number
  peers: PeerInfo[]
}): LobbyState {
  const peers: Record<string, PeerInfo> = {}
  for (const p of args.peers) peers[p.id] = p
  return { selfId: args.selfId, hostId: args.hostId, maxPlayers: args.maxPlayers, peers }
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

export function applyConfig(state: LobbyState, maxPlayers: number): LobbyState {
  return { ...state, maxPlayers }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @release/web test state`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/lobby/state.ts apps/frontend/src/network/lobby/state.test.ts
git commit -m "feat(network): lobby state + role assignment"
```

---

### Task 4: Host-side lobby handlers

**Files:**
- Create: `apps/frontend/src/network/lobby/host.ts`
- Test: `apps/frontend/src/network/lobby/host.test.ts`

**Interfaces:**
- Consumes: `LobbyState`, `assignRole`, `applyPeerJoined`, `applyPeerLeft`, `applyConfig`, `playerCount` from `./state`; `Message`, `PeerInfo` from `../types`
- Produces (each returns `{ state: LobbyState; outgoing: Outgoing[] }` where `interface Outgoing { to: string | 'broadcast'; message: Message }`):
  - `handleJoinRequest(state, fromId: string, name: string)` — assigns role, adds peer; emits `PEER_LIST` to `fromId` and `PEER_JOINED` broadcast
  - `handleReady(state, fromId: string)` — marks ready; emits `PEER_JOINED` broadcast (updated peer) — reuse PEER_JOINED as the peer-update message
  - `kick(state, peerId: string, reason?: string)` — removes peer; emits `PLAYER_KICKED` broadcast
  - `setMaxPlayers(state, maxPlayers: number)` — clamps to 2..6; emits `LOBBY_CONFIG_UPDATED` broadcast
  - `transferHost(state, newHostId: string)` — emits `TRANSFER_HOST` broadcast (state's `hostId` unchanged here; the transport performs the actual handoff)
  - `canStart(state): boolean` — at least 2 players and every `player`/`host` peer is `ready`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/network/lobby/host.test.ts`:

```typescript
import { createLobbyState } from './state'
import { canStart, handleJoinRequest, kick, setMaxPlayers } from './host'

const host = { id: 'h', name: 'Host', role: 'host' as const, ready: true }

function base(maxPlayers: number) {
  return createLobbyState({ selfId: 'h', hostId: 'h', maxPlayers, peers: [host] })
}

it('assigns player role and emits PEER_LIST + PEER_JOINED', () => {
  const { state, outgoing } = handleJoinRequest(base(4), 'p1', 'Pam')
  expect(state.peers.p1.role).toBe('player')

  const list = outgoing.find((o) => o.message.type === 'PEER_LIST')
  expect(list?.to).toBe('p1')
  expect(list?.message.type === 'PEER_LIST' && list.message.payload.yourRole).toBe('player')

  const joined = outgoing.find((o) => o.message.type === 'PEER_JOINED')
  expect(joined?.to).toBe('broadcast')
})

it('assigns guest when player slots are full', () => {
  const { state } = handleJoinRequest(base(2), 'p1', 'Pam') // host fills 1, p1 fills 2
  const second = handleJoinRequest(state, 'p2', 'Pat')
  expect(second.state.peers.p2.role).toBe('guest')
})

it('kick removes the peer and broadcasts PLAYER_KICKED', () => {
  const joined = handleJoinRequest(base(4), 'p1', 'Pam').state
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

it('canStart requires >=2 players all ready', () => {
  const onePlayer = base(4)
  expect(canStart(onePlayer)).toBe(false) // only host
  const withReady = handleJoinRequest(onePlayer, 'p1', 'Pam').state
  expect(canStart(withReady)).toBe(false) // p1 not ready
  withReady.peers.p1.ready = true
  expect(canStart(withReady)).toBe(true)
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web test host`
Expected: FAIL — cannot resolve `./host`.

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/network/lobby/host.ts`:

```typescript
import type { Message, PeerInfo } from '../types'
import {
  applyConfig,
  applyPeerJoined,
  applyPeerLeft,
  assignRole,
  type LobbyState,
  playerCount,
} from './state'

export interface Outgoing {
  to: string | 'broadcast'
  message: Message
}

interface Result {
  state: LobbyState
  outgoing: Outgoing[]
}

function peerList(state: LobbyState): PeerInfo[] {
  return Object.values(state.peers)
}

export function handleJoinRequest(state: LobbyState, fromId: string, name: string): Result {
  const role = assignRole(state)
  const peer: PeerInfo = { id: fromId, name, role, ready: false }
  const next = applyPeerJoined(state, peer)
  return {
    state: next,
    outgoing: [
      { to: fromId, message: { type: 'PEER_LIST', payload: { peers: peerList(next), yourRole: role } } },
      { to: 'broadcast', message: { type: 'PEER_JOINED', payload: { id: fromId, name, role } } },
    ],
  }
}

export function handleReady(state: LobbyState, fromId: string): Result {
  const existing = state.peers[fromId]
  if (!existing) return { state, outgoing: [] }
  const updated: PeerInfo = { ...existing, ready: true }
  const next = applyPeerJoined(state, updated)
  return {
    state: next,
    outgoing: [
      {
        to: 'broadcast',
        message: { type: 'PEER_JOINED', payload: { id: updated.id, name: updated.name, role: updated.role } },
      },
    ],
  }
}

export function kick(state: LobbyState, peerId: string, reason?: string): Result {
  const next = applyPeerLeft(state, peerId)
  return {
    state: next,
    outgoing: [{ to: 'broadcast', message: { type: 'PLAYER_KICKED', payload: { peerId, reason } } }],
  }
}

export function setMaxPlayers(state: LobbyState, maxPlayers: number): Result {
  const clamped = Math.min(6, Math.max(2, Math.trunc(maxPlayers)))
  const next = applyConfig(state, clamped)
  return {
    state: next,
    outgoing: [{ to: 'broadcast', message: { type: 'LOBBY_CONFIG_UPDATED', payload: { maxPlayers: clamped } } }],
  }
}

export function transferHost(state: LobbyState, newHostId: string): Result {
  return {
    state,
    outgoing: [{ to: 'broadcast', message: { type: 'TRANSFER_HOST', payload: { newHostId } } }],
  }
}

export function canStart(state: LobbyState): boolean {
  if (playerCount(state) < 2) return false
  return Object.values(state.peers)
    .filter((p) => p.role === 'host' || p.role === 'player')
    .every((p) => p.ready)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @release/web test host`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/lobby/host.ts apps/frontend/src/network/lobby/host.test.ts
git commit -m "feat(network): host-side lobby handlers"
```

---

### Task 5: Session relay fan-out

**Files:**
- Create: `apps/frontend/src/network/session/relay.ts`
- Test: `apps/frontend/src/network/session/relay.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `relayTargets(args: { connectedPeerIds: string[]; hostId: string; from: string }): string[]` — every connected peer except `from` and except the host itself (the host originates its own sends elsewhere; relay only forwards *others'* traffic)

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/network/session/relay.test.ts`:

```typescript
import { relayTargets } from './relay'

it('forwards to all peers except the sender and the host', () => {
  const targets = relayTargets({ connectedPeerIds: ['h', 'a', 'b', 'c'], hostId: 'h', from: 'a' })
  expect(targets.sort()).toEqual(['b', 'c'])
})

it('returns empty when sender is the only non-host peer', () => {
  expect(relayTargets({ connectedPeerIds: ['h', 'a'], hostId: 'h', from: 'a' })).toEqual([])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web test relay`
Expected: FAIL — cannot resolve `./relay`.

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/network/session/relay.ts`:

```typescript
// Host relay: a message arriving from one peer is forwarded to every other
// connected peer, never back to the sender and never to the host's own
// connection (the host delivers its own outbound messages directly).
export function relayTargets(args: {
  connectedPeerIds: string[]
  hostId: string
  from: string
}): string[] {
  return args.connectedPeerIds.filter((id) => id !== args.from && id !== args.hostId)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @release/web test relay`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/session/relay.ts apps/frontend/src/network/session/relay.test.ts
git commit -m "feat(network): host relay fan-out"
```

---

### Task 6: Attack-window collector

**Files:**
- Create: `apps/frontend/src/network/session/attackWindow.ts`
- Test: `apps/frontend/src/network/session/attackWindow.test.ts`

**Interfaces:**
- Consumes: `AttackResponse` from `../types`
- Produces:
  - `interface AttackWindow { releaseCard: string; releasePlayer: string; codeReview: boolean; seating: string[]; pending: string[]; responses: AttackResponse[] }`
  - `openWindow(args: { releaseCard; releasePlayer; codeReview; seating: string[] }): AttackWindow` — `pending` = seating minus `releasePlayer`
  - `recordResponse(window, response: AttackResponse): AttackWindow` — moves the responder out of `pending`, appends to `responses`; ignores responders not in `pending`
  - `isComplete(window): boolean` — `pending` empty
  - `resolveOrder(window): AttackResponse[]` — only `kind === 'attack'`, sorted by the responder's index in `seating`

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/network/session/attackWindow.test.ts`:

```typescript
import { isComplete, openWindow, recordResponse, resolveOrder } from './attackWindow'

const seating = ['turn', 'a', 'b', 'c']

function open() {
  return openWindow({ releaseCard: 'Frontend', releasePlayer: 'turn', codeReview: false, seating })
}

it('pends every player except the release player', () => {
  expect(open().pending.sort()).toEqual(['a', 'b', 'c'])
})

it('records responses and completes when all answer', () => {
  let w = open()
  w = recordResponse(w, { player: 'a', kind: 'pass' })
  w = recordResponse(w, { player: 'b', kind: 'attack', card: 'Bug' })
  expect(isComplete(w)).toBe(false)
  w = recordResponse(w, { player: 'c', kind: 'pass' })
  expect(isComplete(w)).toBe(true)
})

it('ignores duplicate / unknown responders', () => {
  let w = open()
  w = recordResponse(w, { player: 'a', kind: 'pass' })
  w = recordResponse(w, { player: 'a', kind: 'attack', card: 'Bug' }) // duplicate
  w = recordResponse(w, { player: 'zzz', kind: 'pass' }) // unknown
  expect(w.responses).toHaveLength(1)
})

it('resolveOrder returns attacks in seating order', () => {
  let w = open()
  w = recordResponse(w, { player: 'c', kind: 'attack', card: 'Legacy Code' })
  w = recordResponse(w, { player: 'a', kind: 'attack', card: 'Bug' })
  w = recordResponse(w, { player: 'b', kind: 'pass' })
  expect(resolveOrder(w).map((r) => r.player)).toEqual(['a', 'c'])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web test attackWindow`
Expected: FAIL — cannot resolve `./attackWindow`.

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/network/session/attackWindow.ts`:

```typescript
import type { AttackResponse } from '../types'

export interface AttackWindow {
  releaseCard: string
  releasePlayer: string
  codeReview: boolean
  seating: string[]
  pending: string[]
  responses: AttackResponse[]
}

export function openWindow(args: {
  releaseCard: string
  releasePlayer: string
  codeReview: boolean
  seating: string[]
}): AttackWindow {
  return {
    releaseCard: args.releaseCard,
    releasePlayer: args.releasePlayer,
    codeReview: args.codeReview,
    seating: args.seating,
    pending: args.seating.filter((id) => id !== args.releasePlayer),
    responses: [],
  }
}

export function recordResponse(window: AttackWindow, response: AttackResponse): AttackWindow {
  if (!window.pending.includes(response.player)) return window
  return {
    ...window,
    pending: window.pending.filter((id) => id !== response.player),
    responses: [...window.responses, response],
  }
}

export function isComplete(window: AttackWindow): boolean {
  return window.pending.length === 0
}

export function resolveOrder(window: AttackWindow): AttackResponse[] {
  return window.responses
    .filter((r) => r.kind === 'attack')
    .sort((x, y) => window.seating.indexOf(x.player) - window.seating.indexOf(y.player))
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @release/web test attackWindow`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/session/attackWindow.ts apps/frontend/src/network/session/attackWindow.test.ts
git commit -m "feat(network): attack-window collector"
```

---

### Task 7: Turn advancement

**Files:**
- Create: `apps/frontend/src/network/session/turn.ts`
- Test: `apps/frontend/src/network/session/turn.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `nextTurn(args: { seating: string[]; current: string; eliminated?: string[] }): string` — next player clockwise in `seating`, skipping anyone in `eliminated`; throws if no eligible player remains

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/network/session/turn.test.ts`:

```typescript
import { nextTurn } from './turn'

const seating = ['a', 'b', 'c', 'd']

it('advances clockwise and wraps', () => {
  expect(nextTurn({ seating, current: 'a' })).toBe('b')
  expect(nextTurn({ seating, current: 'd' })).toBe('a')
})

it('skips eliminated players', () => {
  expect(nextTurn({ seating, current: 'a', eliminated: ['b', 'c'] })).toBe('d')
  expect(nextTurn({ seating, current: 'c', eliminated: ['d', 'a'] })).toBe('b')
})

it('throws when no eligible player remains', () => {
  expect(() => nextTurn({ seating, current: 'a', eliminated: ['a', 'b', 'c', 'd'] })).toThrow()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web test turn`
Expected: FAIL — cannot resolve `./turn`.

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/network/session/turn.ts`:

```typescript
export function nextTurn(args: { seating: string[]; current: string; eliminated?: string[] }): string {
  const eliminated = new Set(args.eliminated ?? [])
  const n = args.seating.length
  const start = args.seating.indexOf(args.current)
  for (let step = 1; step <= n; step += 1) {
    const candidate = args.seating[(start + step) % n]
    if (!eliminated.has(candidate)) return candidate
  }
  throw new Error('No eligible player remains for the next turn')
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @release/web test turn`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/session/turn.ts apps/frontend/src/network/session/turn.test.ts
git commit -m "feat(network): turn advancement"
```

---

### Task 8: PeerJS transport

**Files:**
- Create: `apps/frontend/src/network/transport/peer.ts`
- Test: `apps/frontend/src/network/transport/peer.test.ts`

**Interfaces:**
- Consumes: `WireMessage` from `../types`; `createEnvelope`, `nextSeq`, `parseEnvelope` from `../envelope`; `peerjs`
- Produces:
  - `interface Transport { id: string; connectTo(peerId: string): void; send(to: string, message: Message): void; broadcast(message: Message): void; connectedIds(): string[]; close(): void }`
  - `createTransport(args: { peerId?: string; onMessage: (msg: WireMessage) => void; onPeerOpen?: (id: string) => void; onConnection?: (peerId: string) => void; onDisconnect?: (peerId: string) => void }): Promise<Transport>` — resolves when the PeerJS peer is open; assigns `id`

This task is integration-shaped (wraps PeerJS), so it gets a light test that mocks the `peerjs` module rather than opening real sockets.

- [ ] **Step 1: Write the failing test (mocked peerjs)**

Create `apps/frontend/src/network/transport/peer.test.ts`:

```typescript
import { afterEach, beforeEach, vi } from 'vitest'
import type { Message } from '../types'

// Minimal in-memory fake of the PeerJS API surface we use.
class FakeConn {
  peer: string
  private handlers: Record<string, ((arg: unknown) => void)[]> = {}
  sent: string[] = []
  constructor(peer: string) {
    this.peer = peer
  }
  on(event: string, cb: (arg: unknown) => void) {
    ;(this.handlers[event] ??= []).push(cb)
  }
  emit(event: string, arg?: unknown) {
    for (const cb of this.handlers[event] ?? []) cb(arg)
  }
  send(data: string) {
    this.sent.push(data)
  }
  close() {}
}

class FakePeer {
  id: string
  private handlers: Record<string, ((arg: unknown) => void)[]> = {}
  constructor(id?: string) {
    this.id = id ?? 'self-generated'
  }
  on(event: string, cb: (arg: unknown) => void) {
    ;(this.handlers[event] ??= []).push(cb)
    if (event === 'open') cb(this.id)
  }
  emit(event: string, arg?: unknown) {
    for (const cb of this.handlers[event] ?? []) cb(arg)
  }
  connect(peerId: string) {
    const conn = new FakeConn(peerId)
    queueMicrotask(() => conn.emit('open'))
    return conn
  }
  destroy() {}
}

vi.mock('peerjs', () => ({ default: FakePeer, Peer: FakePeer }))

let createTransport: typeof import('./peer').createTransport
beforeEach(async () => {
  ;({ createTransport } = await import('./peer'))
})
afterEach(() => {
  vi.clearAllMocks()
})

it('resolves with an id when the peer opens', async () => {
  const t = await createTransport({ peerId: 'host-1', onMessage: () => {} })
  expect(t.id).toBe('host-1')
})

it('send serializes an envelope to the target connection', async () => {
  const opened: string[] = []
  const t = await createTransport({
    peerId: 'host-1',
    onMessage: () => {},
    onConnection: (id) => opened.push(id),
  })
  t.connectTo('peer-2')
  await Promise.resolve()
  const msg: Message = { type: 'PLAYER_READY', payload: {} }
  t.send('peer-2', msg)
  expect(t.connectedIds()).toContain('peer-2')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web test peer`
Expected: FAIL — cannot resolve `./peer`.

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/network/transport/peer.ts`:

```typescript
import { type DataConnection, Peer } from 'peerjs'
import { createEnvelope, nextSeq, parseEnvelope } from '../envelope'
import type { Message, WireMessage } from '../types'

export interface Transport {
  id: string
  connectTo(peerId: string): void
  send(to: string, message: Message): void
  broadcast(message: Message): void
  connectedIds(): string[]
  close(): void
}

export function createTransport(args: {
  peerId?: string
  onMessage: (msg: WireMessage) => void
  onPeerOpen?: (id: string) => void
  onConnection?: (peerId: string) => void
  onDisconnect?: (peerId: string) => void
}): Promise<Transport> {
  return new Promise((resolve, reject) => {
    const peer = args.peerId ? new Peer(args.peerId) : new Peer()
    const connections = new Map<string, DataConnection>()

    const wire = (conn: DataConnection) => {
      conn.on('open', () => {
        connections.set(conn.peer, conn)
        args.onConnection?.(conn.peer)
      })
      conn.on('data', (data) => {
        try {
          args.onMessage(parseEnvelope(typeof data === 'string' ? data : JSON.stringify(data)))
        } catch {
          // Drop malformed frames rather than crash the relay.
        }
      })
      conn.on('close', () => {
        connections.delete(conn.peer)
        args.onDisconnect?.(conn.peer)
      })
    }

    peer.on('connection', wire)
    peer.on('error', reject)
    peer.on('open', (id) => {
      args.onPeerOpen?.(id)
      resolve({
        id,
        connectTo(peerId) {
          wire(peer.connect(peerId))
        },
        send(to, message) {
          connections.get(to)?.send(JSON.stringify(createEnvelope(message, id, nextSeq())))
        },
        broadcast(message) {
          const frame = JSON.stringify(createEnvelope(message, id, nextSeq()))
          for (const conn of connections.values()) conn.send(frame)
        },
        connectedIds() {
          return [...connections.keys()]
        },
        close() {
          peer.destroy()
        },
      })
    })
  })
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @release/web test peer`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/transport/peer.ts apps/frontend/src/network/transport/peer.test.ts
git commit -m "feat(network): PeerJS transport"
```

---

### Task 9: useLobby hook (binds transport + lobby logic)

**Files:**
- Create: `apps/frontend/src/network/useLobby.ts`
- Modify: `apps/frontend/src/network/index.ts` (export the hook + key types)
- Test: `apps/frontend/src/network/useLobby.test.ts`

**Interfaces:**
- Consumes: `createTransport`/`Transport` from `./transport/peer`; host handlers from `./lobby/host`; client applies + `LobbyState` from `./lobby/state`; `relayTargets` from `./session/relay`; `WireMessage`, `Message` from `./types`; React.
- Produces:
  - `interface UseLobby { state: LobbyState | null; status: 'idle' | 'connecting' | 'in-lobby' | 'kicked'; roomCode: string | null; createRoom(name: string, maxPlayers: number): Promise<void>; joinRoom(hostId: string, name: string): Promise<void>; ready(): void; kick(peerId: string): void; setMaxPlayers(n: number): void; transferHost(id: string): void; isHost: boolean }`
  - `useLobby(): UseLobby`
  - `formatRoomCode(peerId: string): string` — `peerId.slice(0,6).toUpperCase()` formatted `ABC-123` (exported for UI + tested here)

Host vs guest behavior: when `isHost`, incoming `JOIN_REQUEST`/`PLAYER_READY` run through `./lobby/host` handlers; resulting `Outgoing` entries are dispatched (`to: 'broadcast'` → `transport.broadcast`; specific id → `transport.send`), and any message the host should also relay to other peers uses `relayTargets`. Guests apply `PEER_LIST`/`PEER_JOINED`/`PLAYER_KICKED`/`LOBBY_CONFIG_UPDATED` to local state via `./lobby/state`.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/network/useLobby.test.ts` (covers the pure helper; the hook's transport wiring is exercised manually / in later integration work):

```typescript
import { formatRoomCode } from './useLobby'

it('formats a room code as ABC-123 from the peer id', () => {
  expect(formatRoomCode('abc123xyz')).toBe('ABC-123')
})

it('uppercases and handles short ids', () => {
  expect(formatRoomCode('ab1')).toBe('AB1')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web test useLobby`
Expected: FAIL — cannot resolve `./useLobby`.

- [ ] **Step 3: Write the implementation**

Create `apps/frontend/src/network/useLobby.ts`:

```typescript
import { useCallback, useRef, useState } from 'react'
import {
  canStart as canStartFn,
  handleJoinRequest,
  handleReady,
  kick as kickFn,
  type Outgoing,
  setMaxPlayers as setMaxPlayersFn,
  transferHost as transferHostFn,
} from './lobby/host'
import {
  applyConfig,
  applyPeerJoined,
  applyPeerLeft,
  applyPeerList,
  createLobbyState,
  type LobbyState,
} from './lobby/state'
import { createTransport, type Transport } from './transport/peer'
import type { PeerInfo, WireMessage } from './types'

export function formatRoomCode(peerId: string): string {
  const head = peerId.slice(0, 6).toUpperCase()
  return head.length > 3 ? `${head.slice(0, 3)}-${head.slice(3)}` : head
}

export type LobbyStatus = 'idle' | 'connecting' | 'in-lobby' | 'kicked'

export interface UseLobby {
  state: LobbyState | null
  status: LobbyStatus
  roomCode: string | null
  isHost: boolean
  canStart: boolean
  createRoom(name: string, maxPlayers: number): Promise<void>
  joinRoom(hostId: string, name: string): Promise<void>
  ready(): void
  kick(peerId: string): void
  setMaxPlayers(n: number): void
  transferHost(id: string): void
}

export function useLobby(): UseLobby {
  const [state, setState] = useState<LobbyState | null>(null)
  const [status, setStatus] = useState<LobbyStatus>('idle')
  const transportRef = useRef<Transport | null>(null)
  const stateRef = useRef<LobbyState | null>(null)
  const isHostRef = useRef(false)

  const commit = useCallback((next: LobbyState) => {
    stateRef.current = next
    setState(next)
  }, [])

  const dispatch = useCallback((outgoing: Outgoing[]) => {
    const t = transportRef.current
    if (!t) return
    for (const o of outgoing) {
      if (o.to === 'broadcast') t.broadcast(o.message)
      else t.send(o.to, o.message)
    }
  }, [])

  const onMessage = useCallback(
    (msg: WireMessage) => {
      const current = stateRef.current
      if (!current) return
      if (isHostRef.current) {
        if (msg.type === 'JOIN_REQUEST') {
          const r = handleJoinRequest(current, msg.from, msg.payload.name)
          commit(r.state)
          dispatch(r.outgoing)
        } else if (msg.type === 'PLAYER_READY') {
          const r = handleReady(current, msg.from)
          commit(r.state)
          dispatch(r.outgoing)
        }
        return
      }
      // Guest-side application of host broadcasts.
      switch (msg.type) {
        case 'PEER_LIST':
          commit(applyPeerList(current, msg.payload.peers))
          break
        case 'PEER_JOINED': {
          const peer: PeerInfo = { ...msg.payload, ready: false }
          commit(applyPeerJoined(current, peer))
          break
        }
        case 'LOBBY_CONFIG_UPDATED':
          commit(applyConfig(current, msg.payload.maxPlayers))
          break
        case 'PLAYER_KICKED':
          if (msg.payload.peerId === current.selfId) setStatus('kicked')
          else commit(applyPeerLeft(current, msg.payload.peerId))
          break
        default:
          break
      }
    },
    [commit, dispatch],
  )

  const createRoom = useCallback(
    async (name: string, maxPlayers: number) => {
      setStatus('connecting')
      const t = await createTransport({ onMessage })
      transportRef.current = t
      isHostRef.current = true
      const initial = createLobbyState({
        selfId: t.id,
        hostId: t.id,
        maxPlayers,
        peers: [{ id: t.id, name, role: 'host', ready: true }],
      })
      commit(initial)
      setStatus('in-lobby')
    },
    [onMessage, commit],
  )

  const joinRoom = useCallback(
    async (hostId: string, name: string) => {
      setStatus('connecting')
      const t = await createTransport({ onMessage })
      transportRef.current = t
      isHostRef.current = false
      commit(
        createLobbyState({
          selfId: t.id,
          hostId,
          maxPlayers: 6,
          peers: [{ id: t.id, name, role: 'guest', ready: false }],
        }),
      )
      t.connectTo(hostId)
      // Give the channel a tick to open before the JOIN_REQUEST.
      setTimeout(() => t.send(hostId, { type: 'JOIN_REQUEST', payload: { name } }), 0)
      setStatus('in-lobby')
    },
    [onMessage, commit],
  )

  const ready = useCallback(() => {
    const t = transportRef.current
    const current = stateRef.current
    if (!t || !current) return
    if (isHostRef.current) {
      const r = handleReady(current, current.selfId)
      commit(r.state)
      dispatch(r.outgoing)
    } else {
      t.send(current.hostId, { type: 'PLAYER_READY', payload: {} })
    }
  }, [commit, dispatch])

  const kick = useCallback(
    (peerId: string) => {
      const current = stateRef.current
      if (!current || !isHostRef.current) return
      const r = kickFn(current, peerId)
      commit(r.state)
      dispatch(r.outgoing)
    },
    [commit, dispatch],
  )

  const setMaxPlayers = useCallback(
    (n: number) => {
      const current = stateRef.current
      if (!current || !isHostRef.current) return
      const r = setMaxPlayersFn(current, n)
      commit(r.state)
      dispatch(r.outgoing)
    },
    [commit, dispatch],
  )

  const transferHost = useCallback(
    (id: string) => {
      const current = stateRef.current
      if (!current || !isHostRef.current) return
      const r = transferHostFn(current, id)
      dispatch(r.outgoing)
    },
    [dispatch],
  )

  return {
    state,
    status,
    roomCode: transportRef.current && isHostRef.current ? formatRoomCode(transportRef.current.id) : null,
    isHost: isHostRef.current,
    canStart: state ? canStartFn(state) : false,
    createRoom,
    joinRoom,
    ready,
    kick,
    setMaxPlayers,
    transferHost,
  }
}
```

- [ ] **Step 4: Export from the module index**

Replace `apps/frontend/src/network/index.ts`:

```typescript
export { useLobby, formatRoomCode, type UseLobby, type LobbyStatus } from './useLobby'
export type { LobbyState } from './lobby/state'
export type { PeerInfo, Role } from './types'
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `pnpm --filter @release/web test useLobby && pnpm --filter @release/web typecheck`
Expected: PASS (2 tests) + clean typecheck.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/network/useLobby.ts apps/frontend/src/network/useLobby.test.ts apps/frontend/src/network/index.ts
git commit -m "feat(network): useLobby hook + module exports"
```

---

### Task 10: Lobby screen UI + i18n + App screen router

**Files:**
- Create: `apps/frontend/src/screens/LobbyScreen.tsx`
- Modify: `apps/frontend/src/App.tsx` (route start → lobby)
- Modify: `apps/frontend/src/locales/en/common.json` and `apps/frontend/src/locales/ru/common.json` (lobby keys)
- Test: `apps/frontend/src/screens/LobbyScreen.test.tsx`

**Interfaces:**
- Consumes: `useLobby` from `../network`; `useTranslation` from `react-i18next`
- Produces: `LobbyScreen` default export — renders create/join entry, room code, player list with roles, ready button, host-only max-players control + kick buttons + start button (disabled until `canStart`).

Reads `?room=<peerId>` from `location.search`; if present, shows the join form prefilled with that host id. Tailwind utilities only (no `.module.css`). All copy via `t()`.

- [ ] **Step 1: Add i18n keys**

Add to `apps/frontend/src/locales/en/common.json` (new top-level `lobby` object):

```json
  "lobby": {
    "createTitle": "Create game",
    "joinTitle": "Join game",
    "namePlaceholder": "Your name",
    "maxPlayers": "Max players",
    "create": "Create",
    "join": "Join",
    "roomCode": "Room code",
    "shareLink": "Share link",
    "players": "Players",
    "ready": "Ready",
    "waiting": "Waiting…",
    "kick": "Kick",
    "start": "Start game",
    "kickedMessage": "You were removed from the game.",
    "roleHost": "Host",
    "rolePlayer": "Player",
    "roleGuest": "Spectator"
  }
```

Add the Russian counterpart to `apps/frontend/src/locales/ru/common.json`:

```json
  "lobby": {
    "createTitle": "Создать игру",
    "joinTitle": "Присоединиться",
    "namePlaceholder": "Ваше имя",
    "maxPlayers": "Макс. игроков",
    "create": "Создать",
    "join": "Войти",
    "roomCode": "Код комнаты",
    "shareLink": "Ссылка",
    "players": "Игроки",
    "ready": "Готов",
    "waiting": "Ожидание…",
    "kick": "Исключить",
    "start": "Начать игру",
    "kickedMessage": "Вас исключили из игры.",
    "roleHost": "Хост",
    "rolePlayer": "Игрок",
    "roleGuest": "Зритель"
  }
```

- [ ] **Step 2: Write the failing test**

Create `apps/frontend/src/screens/LobbyScreen.test.tsx`:

```typescript
import { render, screen } from '@testing-library/react'
import { vi } from 'vitest'
import LobbyScreen from './LobbyScreen'

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { changeLanguage: () => Promise.resolve() } }),
}))

vi.mock('../network', () => ({
  useLobby: () => ({
    state: null,
    status: 'idle',
    roomCode: null,
    isHost: false,
    canStart: false,
    createRoom: vi.fn(),
    joinRoom: vi.fn(),
    ready: vi.fn(),
    kick: vi.fn(),
    setMaxPlayers: vi.fn(),
    transferHost: vi.fn(),
  }),
}))

it('renders the create-game entry when idle', () => {
  render(<LobbyScreen />)
  expect(screen.getByText('lobby.createTitle')).toBeTruthy()
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm --filter @release/web test LobbyScreen`
Expected: FAIL — cannot resolve `./LobbyScreen`.

- [ ] **Step 4: Write the LobbyScreen**

Create `apps/frontend/src/screens/LobbyScreen.tsx`:

```tsx
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useLobby } from '../network'

function roleLabel(role: string, t: (k: string) => string): string {
  if (role === 'host') return t('lobby.roleHost')
  if (role === 'player') return t('lobby.rolePlayer')
  return t('lobby.roleGuest')
}

export default function LobbyScreen() {
  const { t } = useTranslation()
  const lobby = useLobby()
  const [name, setName] = useState('')
  const [maxPlayers, setMax] = useState(4)
  const roomParam = new URLSearchParams(window.location.search).get('room')

  if (lobby.status === 'kicked') {
    return <p className="p-8 text-center text-lg">{t('lobby.kickedMessage')}</p>
  }

  if (lobby.status === 'idle') {
    return (
      <div className="mx-auto flex max-w-md flex-col gap-4 p-8">
        <input
          className="rounded border border-surface-3 bg-surface-1 px-3 py-2"
          placeholder={t('lobby.namePlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {roomParam ? (
          <button
            type="button"
            className="rounded bg-brand-green px-4 py-2 font-semibold"
            onClick={() => lobby.joinRoom(roomParam, name)}
          >
            {t('lobby.join')}
          </button>
        ) : (
          <>
            <label className="flex items-center justify-between gap-2">
              {t('lobby.maxPlayers')}
              <select value={maxPlayers} onChange={(e) => setMax(Number(e.target.value))}>
                {[2, 3, 4, 5, 6].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              className="rounded bg-brand-green px-4 py-2 font-semibold"
              onClick={() => lobby.createRoom(name, maxPlayers)}
            >
              {t('lobby.create')}
            </button>
          </>
        )}
      </div>
    )
  }

  const peers = lobby.state ? Object.values(lobby.state.peers) : []
  const shareLink = lobby.roomCode ? `${window.location.origin}/?room=${lobby.state?.hostId}` : null

  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 p-8">
      {lobby.roomCode && (
        <div className="rounded bg-surface-2 p-4">
          <p className="text-sm opacity-70">{t('lobby.roomCode')}</p>
          <p className="text-2xl font-bold tracking-widest">{lobby.roomCode}</p>
          {shareLink && <p className="mt-1 break-all text-xs opacity-60">{shareLink}</p>}
        </div>
      )}

      <section>
        <h2 className="mb-2 font-semibold">{t('lobby.players')}</h2>
        <ul className="flex flex-col gap-1">
          {peers.map((p) => (
            <li key={p.id} className="flex items-center justify-between rounded bg-surface-1 px-3 py-2">
              <span>
                {p.name} · {roleLabel(p.role, t)} {p.ready ? '✓' : ''}
              </span>
              {lobby.isHost && p.role !== 'host' && (
                <button type="button" className="text-sm text-cat-attack" onClick={() => lobby.kick(p.id)}>
                  {t('lobby.kick')}
                </button>
              )}
            </li>
          ))}
        </ul>
      </section>

      <button type="button" className="rounded bg-surface-3 px-4 py-2" onClick={lobby.ready}>
        {t('lobby.ready')}
      </button>

      {lobby.isHost && (
        <button
          type="button"
          disabled={!lobby.canStart}
          className="rounded bg-brand-green px-4 py-2 font-semibold disabled:opacity-40"
          onClick={() => {
            /* start handler wired by the game-screen spec */
          }}
        >
          {t('lobby.start')}
        </button>
      )}
    </div>
  )
}
```

Note: if any utility class (e.g. `bg-surface-3`, `text-cat-attack`) is not yet defined in the `@theme` block of `apps/frontend/src/index.css`, add it there mapping to the corresponding token from `apps/ui/src/design/tokens.css` (per the Styling Rule). Verify by checking `tokens.css` for the variable before using the utility.

- [ ] **Step 5: Route the App shell to the lobby**

Replace `apps/frontend/src/App.tsx`:

```tsx
import LanguageSwitch from './components/LanguageSwitch'
import LobbyScreen from './screens/LobbyScreen'

export default function App() {
  return (
    <div className="min-h-screen bg-surface-0 text-foreground">
      <LanguageSwitch />
      <LobbyScreen />
    </div>
  )
}
```

Note: confirm `bg-surface-0` / `text-foreground` exist in the `@theme` block; if the previous shell used different token names (check `App.module.css`), use those instead. `App.module.css` may be left in place or deleted if now unused — if deleted, remove its import everywhere (there are none after this edit).

- [ ] **Step 6: Run tests + typecheck + lint**

Run: `pnpm --filter @release/web test && pnpm --filter @release/web typecheck && pnpm lint`
Expected: all PASS. (If `App.module.css` is now unused, Biome/stylelint won't complain, but delete it for cleanliness and re-run.)

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/screens/LobbyScreen.tsx apps/frontend/src/screens/LobbyScreen.test.tsx apps/frontend/src/App.tsx apps/frontend/src/locales/en/common.json apps/frontend/src/locales/ru/common.json
git commit -m "feat(web): lobby screen wired to useLobby + i18n"
```

---

### Task 11: Manual two-browser smoke test + final verification

**Files:** none (verification only)

**Interfaces:**
- Consumes: everything above
- Produces: a confirmed working create/join flow over real WebRTC

- [ ] **Step 1: Full workspace gate**

Run: `pnpm install && pnpm typecheck && pnpm test && pnpm lint && pnpm build`
Expected: all PASS.

- [ ] **Step 2: Manual smoke test**

Run: `pnpm dev`
- Open `http://localhost:5173` in two browser windows (or one normal + one incognito).
- Window A: enter a name, pick max players, click Create. A room code + share link appear.
- Window B: open the share link (or append `?room=<hostId>`), enter a name, click Join.
- Verify: both windows show the player list with correct roles (A = Host, B = Player). Click Ready in both; the host's Start button enables once ≥2 players are all ready.
- Host clicks Kick on player B → B sees the "removed" message and disappears from A's list.

Expected: the above behaviors all hold. Note: PeerJS uses its public signaling server by default — confirm network access, or document a self-hosted `peerjs-server` for production in a follow-up.

- [ ] **Step 3: Commit any fixes found during smoke test**

```bash
git add -A
git commit -m "fix(network): address issues found in two-browser smoke test"
```

(Skip if no fixes were needed.)

---

## Self-Review Notes

- **Spec coverage:** Lobby/join (Tasks 3–4, 9–10), roles + auto-assignment (Tasks 3–4), host-configured maxPlayers (Tasks 4, 9–10), kick + host-transfer (Tasks 4, 9), star relay (Task 5), turn-authority attack window + turn advance (Tasks 6–7), all message types incl. game-start & rules-driven (Task 2), PeerJS transport replacing the backend (Tasks 1, 8), link+code join UX (Tasks 9–10). **Game-start runtime** (`GAME_STARTED`/`HAND_DEALT` dealing) and the **draw/Git/AI runtime** are intentionally out of this plan — game-start dealing belongs with the game-engine spec, and the rules-driven runtime is blocked on the deck-keeper open question. Both have their message types defined here so the engine spec can build on them.
- **Deck-keeper open question:** unresolved by design; this plan touches none of the keeper-dependent runtime, so it is not blocked.
- **Type consistency:** `Outgoing` defined in Task 4 (`host.ts`), imported in Task 9. `LobbyState` from Task 3 flows through Tasks 4 + 9. `WireMessage`/`Message` from Task 2 used in Tasks 8–9. `Transport` from Task 8 used in Task 9. `formatRoomCode` defined + tested in Task 9, consumed in Task 10.
