# Player avatars and the speaking ring — Implementation Plan (#233)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the avatars, the player-settings modal, the "nickname taken" refusal and the speaking ring that `@release/ui` already ships (#224) into the real game.

**Architecture:** The host stays the only authority for the roster: a guest asks (`PROFILE_UPDATE`), pure functions in `network/lobby/profile.ts` decide, the host broadcasts the updated `PeerInfo` in the existing `PEER_JOINED`. The avatar rides `PeerInfo` and is frozen into `Seat` at the deal. Speaking is detected locally by an `AnalyserNode` per stream inside the existing Web Audio graph, surfaced as `VoiceSnapshot.speakingMemberIds`, and filtered for display by one hook, `useSpeaking`.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library, PeerJS DataChannels, Web Audio API, pnpm workspaces.

**Spec:** [`docs/specs/2026-10-15-player-avatars-speaking-design.md`](./2026-10-15-player-avatars-speaking-design.md)

## Global Constraints

- Branch `feat/233-player-avatars-speaking`; commit messages in Conventional Commits (`feat:`, `test:`, `docs:`), English.
- Code comments in English only.
- No string literals in `.tsx` — all copy through `t()`; a new key goes into **both** `packages/translation/src/locales/en/common.json` and `…/ru/common.json`.
- All text in the frontend through `<Typography>`; colours only via tokens; CSS Modules only.
- `@release/ui` is i18n-agnostic and is not changed except `Avatar.module.css` (Task 12).
- Frontend layering: `pages` → `features` → `entities` → `shared`; `network` is consumed only by `entities`/`features` (types may be imported from `~/network/types`).
- Avatar ids are exactly `PRESET_AVATARS[*].id` from `@release/ui`.
- Nickname comparison: `trim()` + `toLowerCase()`.
- Reserved bot names: `botNames(state.hostId, MAX_BOTS)` with `MAX_BOTS = 5`.
- Avatar preference: `localStorage` key `release:avatar`, no TTL.
- Speaking detector: poll every `100` ms, on above RMS `0.02`, off after `300` ms below.
- Run commands from the worktree root. Per-package tests: `pnpm --filter @release/web exec vitest run <path>`.

## Review Focus

1. **A player returning to the lobby after a reload with a nickname somebody else took meanwhile** — must get `name-taken` on the invite screen, not a silent loop of reconnects. Pinned in Task 5 (`treats name-taken as terminal`).
2. **A guest who renamed and then reloads** — must be readmitted (the host's reconnect name check compares against the stored name). Pinned in Task 5 (`writes the confirmed nickname to the stored session`).
3. **A seat returning mid-match while its stale peer is still in the roster under the same name** — must not be refused as `name-taken`. Pinned in Task 5 (`does not name-check a returning seat`).
4. **Two players clicking the same free avatar at once** — the second gets `PROFILE_REJECTED 'avatar-taken'` and the modal rolls back to the roster's avatar. Pinned in Task 3 (`avatar-taken`) and Task 9 (rollback).
5. **A participant I muted, or one with the mic off, while they are loud** — no ring. Pinned in Task 8 (`speakingMembers`).

---

## File map

| File | Status | Responsibility |
|---|---|---|
| `apps/frontend/src/shared/lib/avatarPreference.ts` | create | `localStorage` read/write of the wished avatar |
| `apps/frontend/src/network/lobby/profile.ts` | create | avatar ids, `pickAvatar`, `firstAvatar`, `nameTaken`, `parseProfilePatch`, `handleProfileUpdate` |
| `apps/frontend/src/network/lobby/state.ts` | modify | host `MAX_BOTS` here (moved from `host.ts`, re-exported) |
| `apps/frontend/src/network/lobby/host.ts` | modify | `PEER_JOINED` carries the whole `PeerInfo`; avatar on join and role change |
| `apps/frontend/src/network/lobby/admission.ts` | modify | `JoinOptions.avatar/random`, `avatar` in the join payload, `name-taken` in `JoinAdmission` |
| `apps/frontend/src/network/types.ts` | modify | `PeerInfo.avatar`, `Seat.avatar`, new messages, `ProfileRejectReason`, `ProfilePatch` |
| `apps/frontend/src/shared/chat/types.ts`, `network/chat/journal.ts` | modify | `memberRenamed` event and its validation |
| `apps/frontend/src/features/chat/RoomChat.tsx`, `features/chat/model.ts` | modify | render `memberRenamed`; author avatar |
| `apps/frontend/src/network/useLobby.ts` | modify | wiring: host avatar, join wish, name check, `PROFILE_*`, `updateProfile`, `profileRejection`, storage writes |
| `apps/frontend/src/entities/game/seats.ts` | modify | `Seat.avatar` at the deal |
| `apps/frontend/src/network/voice/levels.ts` | create | pure speaking detector |
| `apps/frontend/src/network/voice/audio.ts` | modify | analysers + `subscribeSpeaking` |
| `apps/frontend/src/network/voice/runtime.ts` | modify | `speakingMemberIds` in the snapshot |
| `apps/frontend/src/features/voice-chat/useSpeaking.ts` | create | display rules over the signal |
| `apps/frontend/src/features/voice-chat/model.ts` | modify | avatar + speaking on voice participants |
| `apps/frontend/src/pages/lobby/_LobbyView.tsx` | modify | avatars, ring, `onEdit`, settings modal |
| `apps/frontend/src/pages/lobby/_InviteScreen.tsx` | modify | `name-taken` on the nickname field |
| `apps/frontend/src/entities/game/stats/toStatPlayers.ts`, `pages/board/[gameId]/index.tsx`, `stats.tsx` | modify | avatar + speaking on Participants and Stats |
| `apps/ui/src/primitives/Avatar/Avatar.module.css` | modify | no ring transition under reduced motion |

---

### Task 1: Avatar preference storage

**Files:**
- Create: `apps/frontend/src/shared/lib/avatarPreference.ts`
- Test: `apps/frontend/src/shared/lib/avatarPreference.test.ts`

**Interfaces:**
- Produces: `readAvatarPreference(): string | null`, `writeAvatarPreference(id: string): void`, `clearAvatarPreference(): void` (tests only).

- [ ] **Step 1: Write the failing test**

```ts
// apps/frontend/src/shared/lib/avatarPreference.test.ts
import { afterEach, expect, it, vi } from 'vitest'
import {
  clearAvatarPreference,
  readAvatarPreference,
  writeAvatarPreference,
} from './avatarPreference'

afterEach(() => {
  clearAvatarPreference()
  vi.restoreAllMocks()
})

it('round-trips the wished avatar through localStorage', () => {
  expect(readAvatarPreference()).toBeNull()
  writeAvatarPreference('attack-bug')
  expect(readAvatarPreference()).toBe('attack-bug')
  expect(localStorage.getItem('release:avatar')).toBe('attack-bug')
})

it('keeps working in memory when storage throws', () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota')
  })
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
    throw new Error('denied')
  })
  writeAvatarPreference('defense-hotfix')
  expect(readAvatarPreference()).toBe('defense-hotfix')
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web exec vitest run src/shared/lib/avatarPreference.test.ts`
Expected: FAIL — cannot resolve `./avatarPreference`.

- [ ] **Step 3: Write minimal implementation**

```ts
// apps/frontend/src/shared/lib/avatarPreference.ts

// The avatar this person last picked, offered to the host as a wish on every
// join. `localStorage`, unlike every record in persistence.ts: those describe
// one PEER and must not leak between tabs, while this is a preference of the
// PERSON and has to outlive the tab. Two tabs sharing it is harmless — the host
// grants a wish only while it is free, so the second tab gets another avatar.
const KEY = 'release:avatar'

// Storage can throw (Safari private mode); the preference then lives for the
// page's lifetime only.
let memory: string | null = null

export function readAvatarPreference(): string | null {
  try {
    const stored = localStorage.getItem(KEY)
    if (stored !== null) return stored
  } catch {
    // fall through to memory
  }
  return memory
}

export function writeAvatarPreference(id: string): void {
  memory = id
  try {
    localStorage.setItem(KEY, id)
  } catch {
    // memory already holds it
  }
}

export function clearAvatarPreference(): void {
  memory = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    // memory is already clear
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @release/web exec vitest run src/shared/lib/avatarPreference.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/shared/lib/avatarPreference.ts apps/frontend/src/shared/lib/avatarPreference.test.ts
git commit -m "feat: remember the wished avatar in localStorage (#233)"
```

---

### Task 2: Protocol types

**Files:**
- Modify: `apps/frontend/src/network/types.ts`
- Modify: `apps/frontend/src/network/lobby/admission.ts` (payload parsing + admission union)
- Test: `apps/frontend/src/network/lobby/admission.test.ts`

**Interfaces:**
- Produces (in `network/types.ts`):
  - `PeerInfo.avatar?: string`, `Seat.avatar?: string`, `JoinRequestPayload.avatar?: string`
  - `export type JoinRejectReason = 'room-full' | 'name-taken'`
  - `export type ProfileRejectReason = 'name-taken' | 'name-invalid' | 'avatar-taken' | 'not-in-lobby'`
  - `export interface ProfilePatch { name?: string; avatar?: string }`
  - messages `PROFILE_UPDATE { payload: ProfilePatch }`, `PROFILE_REJECTED { payload: { reason: ProfileRejectReason } }`
  - `PEER_JOINED { payload: PeerInfo }`, `JOIN_REJECTED { payload: { reason: JoinRejectReason; availability } }`
- Produces (in `admission.ts`): `JoinOptions.avatar?: string`, `JoinOptions.random?: () => number`; `JoinAdmission` rejected branch `reason: JoinRejectReason`.

- [ ] **Step 1: Write the failing test** — append to `admission.test.ts`:

```ts
it('carries a string avatar wish and drops anything else', () => {
  expect(
    parseJoinRequestPayload({ name: 'Bo', resumeToken: 't', avatar: 'attack-bug' }),
  ).toEqual({ name: 'Bo', resumeToken: 't', avatar: 'attack-bug' })
  expect(parseJoinRequestPayload({ name: 'Bo', resumeToken: 't', avatar: 7 })).toEqual({
    name: 'Bo',
    resumeToken: 't',
  })
})
```

(`parseJoinRequestPayload` is already imported in that file; if not, add it to the import from `./admission`.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web exec vitest run src/network/lobby/admission.test.ts`
Expected: FAIL — the parsed payload has no `avatar`.

- [ ] **Step 3: Implement**

In `network/types.ts`:

```ts
export interface JoinRequestPayload {
  name: string
  resumeToken: string
  requestedRole?: JoinRole
  resume?: { where: Where; lastGameId: string | null }
  // The avatar this person picked last time (shared/lib/avatarPreference). A
  // wish, not a claim: the host grants it only while no other player holds it.
  avatar?: string
}

export type JoinRejectReason = 'room-full' | 'name-taken'
export type ProfileRejectReason = 'name-taken' | 'name-invalid' | 'avatar-taken' | 'not-in-lobby'
// A lobby member's own edit of how the room sees them. Either field may come
// alone: the avatar is sent on click, the nickname when the settings close.
export interface ProfilePatch {
  name?: string
  avatar?: string
}
```

Add to `PeerInfo` (after `where`):

```ts
  // Preset avatar id (PRESET_AVATARS). Only a host or player has one; a
  // spectator and a bot never do.
  avatar?: string
```

Add to `Seat` (after `bot?`):

```ts
  // The avatar the seat was dealt with — frozen with the rest of the seating,
  // so the results still show it after the player has left the roster.
  avatar?: string
```

In `Message`, replace the `JOIN_REJECTED` and `PEER_JOINED` members and add the two profile messages next to `PLAYER_READY`:

```ts
  | {
      type: 'JOIN_REJECTED'
      payload: { reason: JoinRejectReason; availability: JoinAvailability }
    }
  | { type: 'PEER_LIST'; payload: { peers: PeerInfo[]; yourRole: Role } }
  // The whole row, as the host now holds it: the same shape as PeerInfo, so a
  // new field (the avatar) cannot be dropped by a sender that lists fields.
  | { type: 'PEER_JOINED'; payload: PeerInfo }
  | { type: 'PLAYER_READY'; payload: Record<string, never> }
  // A member editing its own nickname and/or avatar. Addressed to the host,
  // which checks it (lobby/profile.ts) and answers with a PEER_JOINED for
  // everyone or a PROFILE_REJECTED for the sender alone.
  | { type: 'PROFILE_UPDATE'; payload: ProfilePatch }
  | { type: 'PROFILE_REJECTED'; payload: { reason: ProfileRejectReason } }
```

In `admission.ts`:

```ts
import type {
  JoinAvailability,
  JoinRejectReason,
  JoinRequestPayload,
  JoinRole,
  PeerInfo,
  Role,
  Seat,
} from '../types'

export interface JoinOptions {
  matchRunning: boolean
  returningSeat?: Seat
  returningLobbyPeer?: Pick<PeerInfo, 'role' | 'ready' | 'where'> & { id?: string }
  requestedRole?: JoinRole
  // the joiner's avatar wish, and the dice for a free one (injected by tests)
  avatar?: string
  random?: () => number
}

export type JoinAdmission =
  | { accepted: true; role: Role }
  | { accepted: false; reason: JoinRejectReason; availability: JoinAvailability }
```

In `parseJoinRequestPayload`, change the return to:

```ts
  return {
    name: payload.name,
    resumeToken: payload.resumeToken,
    ...(payload.requestedRole === undefined ? {} : { requestedRole: payload.requestedRole }),
    ...(resume ? { resume } : {}),
    ...(typeof payload.avatar === 'string' ? { avatar: payload.avatar } : {}),
  }
```

- [ ] **Step 4: Run tests and typecheck**

Run: `pnpm --filter @release/web exec vitest run src/network/lobby/admission.test.ts && pnpm --filter @release/web typecheck`
Expected: PASS. Typecheck may flag the explicit-field `PEER_JOINED` payloads in `host.ts`/`useLobby.ts` only if they now mismatch — they are structurally `PeerInfo`, so it should pass; if it fails, the fix lands in Task 3.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/types.ts apps/frontend/src/network/lobby/admission.ts apps/frontend/src/network/lobby/admission.test.ts
git commit -m "feat: avatar and profile messages in the lobby protocol (#233)"
```

---

### Task 3: Host rules — `profile.ts` and avatar assignment in `host.ts`

**Files:**
- Create: `apps/frontend/src/network/lobby/profile.ts`
- Test: `apps/frontend/src/network/lobby/profile.test.ts`
- Modify: `apps/frontend/src/network/lobby/state.ts` (move `MAX_BOTS` here)
- Modify: `apps/frontend/src/network/lobby/host.ts`
- Test: `apps/frontend/src/network/lobby/host.test.ts`

**Interfaces:**
- Consumes: Task 2 types.
- Produces (`profile.ts`):
  - `AVATAR_IDS: readonly string[]`, `isAvatarId(value: unknown): value is string`
  - `takenAvatars(state: LobbyState, exceptPeerId?: string): Set<string>`
  - `pickAvatar(state: LobbyState, wish: string | null | undefined, exceptPeerId: string, random?: () => number): string | undefined`
  - `firstAvatar(wish: string | null | undefined, random?: () => number): string`
  - `nameTaken(state: LobbyState, name: string, exceptPeerIds?: readonly string[]): boolean`
  - `parseProfilePatch(value: unknown): ProfilePatch | null`
  - `handleProfileUpdate(state, fromId, patch, matchRunning): ProfileResult` where
    `ProfileResult = { state: LobbyState; outgoing: Outgoing[]; error?: ProfileRejectReason; renamed?: { from: string; to: string } }`
- Produces (`state.ts`): `export const MAX_BOTS = 5` (still re-exported from `host.ts`).
- Changes (`host.ts`): every `PEER_JOINED` payload is the full `PeerInfo`; `handleJoinRequest` assigns an avatar to non-spectators; `setParticipantRole` assigns on promotion, removes on demotion.

- [ ] **Step 1: Write the failing tests**

```ts
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
  const r = handleProfileUpdate(lobby(peer('p1', 'Pam')), 'p1', { name: ' Neo ', avatar: 'attack-bug' }, false)
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
  expect(reason(handleProfileUpdate(state, 'p1', { avatar: 'attack-bug' }, false))).toBe('avatar-taken')
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
```

Append to `host.test.ts`:

```ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @release/web exec vitest run src/network/lobby/profile.test.ts src/network/lobby/host.test.ts`
Expected: FAIL — `./profile` missing, `MAX_BOTS` not exported from `./state`, avatars absent.

- [ ] **Step 3: Implement**

`state.ts` — add near the top (after the `LobbyState` interface):

```ts
// The rules seat 2–6 (docs/rules/general.md:13), so one human and five bots is
// the largest table a lone host can ask for. Here rather than in host.ts
// because profile.ts reserves every name a bot could ever take.
export const MAX_BOTS = 5
```

`host.ts` — delete its own `MAX_BOTS` declaration and its comment, and re-export instead:

```ts
export { MAX_BOTS } from './state'
```

(also add `MAX_BOTS` to the existing `import { … } from './state'` since `setBots` uses it, and `import { pickAvatar } from './profile'`).

`profile.ts`:

```ts
import { botNames, PRESET_AVATARS } from '@release/ui'
import type { PeerInfo, ProfilePatch, ProfileRejectReason } from '../types'
import type { Outgoing } from './host'
import { applyPeerJoined, type LobbyState, MAX_BOTS } from './state'

// Every rule about how a member is shown — the avatar they hold and the
// nickname they go by. Pure, like the rest of lobby/: the host runs it to
// decide, and a guest runs `nameTaken` too, only to warn before asking.

export const AVATAR_IDS: readonly string[] = PRESET_AVATARS.map((a) => a.id)

export function isAvatarId(value: unknown): value is string {
  return typeof value === 'string' && AVATAR_IDS.includes(value)
}

// Avatars belong to seats: a spectator's leftover id (which should not exist)
// holds nothing, and the peer being reassigned never blocks itself.
export function takenAvatars(state: LobbyState, exceptPeerId?: string): Set<string> {
  const taken = new Set<string>()
  for (const p of Object.values(state.peers)) {
    if (p.id === exceptPeerId || p.role === 'guest' || !p.avatar) continue
    taken.add(p.avatar)
  }
  return taken
}

export function pickAvatar(
  state: LobbyState,
  wish: string | null | undefined,
  exceptPeerId: string,
  random: () => number = Math.random,
): string | undefined {
  const taken = takenAvatars(state, exceptPeerId)
  if (isAvatarId(wish) && !taken.has(wish)) return wish
  const free = AVATAR_IDS.filter((id) => !taken.has(id))
  if (free.length === 0) return undefined
  return free[Math.min(free.length - 1, Math.floor(random() * free.length))]
}

// The host's own, when it opens or restores a room: nobody else holds anything.
export function firstAvatar(
  wish: string | null | undefined,
  random: () => number = Math.random,
): string {
  if (isAvatarId(wish)) return wish
  return AVATAR_IDS[Math.min(AVATAR_IDS.length - 1, Math.floor(random() * AVATAR_IDS.length))]
}

const normal = (name: string) => name.trim().toLowerCase()

// Taken by a member, or by any bot the table could seat — all MAX_BOTS of them,
// not just the ones asked for: a bot added later would otherwise take a living
// player's name. `botNames` shuffles independently of `count`, so this prefix
// is exactly the names those bots will get.
export function nameTaken(
  state: LobbyState,
  name: string,
  exceptPeerIds: readonly string[] = [],
): boolean {
  const wanted = normal(name)
  if (botNames(state.hostId, MAX_BOTS).some((bot) => normal(bot) === wanted)) return true
  return Object.values(state.peers).some(
    (p) => !exceptPeerIds.includes(p.id) && normal(p.name) === wanted,
  )
}

export function parseProfilePatch(value: unknown): ProfilePatch | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const raw = value as Record<string, unknown>
  if (raw.name !== undefined && typeof raw.name !== 'string') return null
  if (raw.avatar !== undefined && typeof raw.avatar !== 'string') return null
  if (raw.name === undefined && raw.avatar === undefined) return null
  return {
    ...(raw.name !== undefined ? { name: raw.name as string } : {}),
    ...(raw.avatar !== undefined ? { avatar: raw.avatar as string } : {}),
  }
}

export interface ProfileResult {
  state: LobbyState
  outgoing: Outgoing[]
  error?: ProfileRejectReason
  renamed?: { from: string; to: string }
}

// Lobby only: the seating freezes names at the deal, so a rename mid-match
// would show two names for one seat. A patch is applied whole or not at all.
export function handleProfileUpdate(
  state: LobbyState,
  fromId: string,
  patch: ProfilePatch,
  matchRunning: boolean,
): ProfileResult {
  const reject = (reason: ProfileRejectReason): ProfileResult => ({
    state,
    error: reason,
    outgoing: [{ to: fromId, message: { type: 'PROFILE_REJECTED', payload: { reason } } }],
  })
  const peer = state.peers[fromId]
  if (!peer || peer.where !== 'lobby' || matchRunning) return reject('not-in-lobby')

  let next: PeerInfo = peer
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) return reject('name-invalid')
    if (name !== peer.name) {
      if (nameTaken(state, name, [fromId])) return reject('name-taken')
      next = { ...next, name }
    }
  }
  // A spectator holds no avatar; its field is ignored rather than refused, so
  // a rename sent together with it still goes through.
  if (patch.avatar !== undefined && peer.role !== 'guest' && patch.avatar !== peer.avatar) {
    if (!isAvatarId(patch.avatar) || takenAvatars(state, fromId).has(patch.avatar))
      return reject('avatar-taken')
    next = { ...next, avatar: patch.avatar }
  }
  if (next === peer) return { state, outgoing: [] }
  return {
    state: applyPeerJoined(state, next),
    outgoing: [{ to: 'broadcast', message: { type: 'PEER_JOINED', payload: next } }],
    ...(next.name !== peer.name ? { renamed: { from: peer.name, to: next.name } } : {}),
  }
}
```

`host.ts` — in `handleJoinRequest`, replace the `peer` construction and the broadcast:

```ts
  const avatar =
    role === 'guest' ? undefined : pickAvatar(state, options.avatar, fromId, options.random)
  const peer: PeerInfo = {
    id: fromId,
    memberId,
    name,
    role,
    // A lobby reconnect preserves its confirmation. Returning from a match
    // or its results requires a new one, just like handleWhereabouts.
    ready: options.returningSeat
      ? true
      : role !== 'guest' &&
        options.returningLobbyPeer?.where === 'lobby' &&
        options.returningLobbyPeer.ready,
    where: options.returningSeat ? 'game' : 'lobby',
    ...(avatar ? { avatar } : {}),
  }
```

and the third outgoing item becomes:

```ts
      {
        to: 'broadcast',
        message: { type: 'PEER_JOINED', payload: peer },
      },
```

In `handleReady` and `handleWhereabouts`, replace each explicit `payload: { id: updated.id, … }` block with `payload: updated`.

In `setParticipantRole`, replace `const updated: PeerInfo = { ...peer, role: assigned, ready: false }` with:

```ts
  const updated: PeerInfo = { ...peer, role: assigned, ready: false }
  // A seat comes with an avatar and a spectator gives theirs back. The wish is
  // not known here (it arrives only with a join), so a promotion rolls a free
  // one; the player can change it in the settings.
  if (assigned === 'player') {
    const avatar = pickAvatar(state, undefined, peerId)
    if (avatar) updated.avatar = avatar
  } else delete updated.avatar
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @release/web exec vitest run src/network/lobby`
Expected: PASS (all lobby tests, old and new).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/lobby
git commit -m "feat: host rules for avatars and nicknames (#233)"
```

---

### Task 4: `memberRenamed` chat event

**Files:**
- Modify: `apps/frontend/src/shared/chat/types.ts`
- Modify: `apps/frontend/src/network/chat/journal.ts`
- Modify: `apps/frontend/src/features/chat/RoomChat.tsx`
- Test: `apps/frontend/src/network/chat/journal.test.ts`

**Interfaces:**
- Produces: `ChatSystemEvent` member `{ kind: 'memberRenamed'; memberId: MemberId; from: string; to: string }`.

- [ ] **Step 1: Write the failing test** — in `journal.test.ts`, add `{ kind: 'memberRenamed', memberId: 'member-a', from: 'Ann', to: 'Anna' }` to the `events` array of the test that round-trips every system event (the block around line 160 containing `roleChanged`), and add a new test:

```ts
it('refuses a memberRenamed event without both names', () => {
  const entry = (event: unknown) => ({ kind: 'system', id: 'chat-1', sequence: 1, createdAt: 0, event })
  expect(parseChatEntries([entry({ kind: 'memberRenamed', memberId: 'm', from: 'A' })])).toEqual([])
})
```

(If `parseChatEntries` returns `null` rather than `[]` for an invalid list, assert what the existing invalid-entry tests in that file assert — match their expectation.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web exec vitest run src/network/chat/journal.test.ts`
Expected: FAIL — `memberRenamed` is rejected by `isSystemEvent`.

- [ ] **Step 3: Implement**

`shared/chat/types.ts` — add to the union:

```ts
  | { kind: 'memberRenamed'; memberId: MemberId; from: string; to: string }
```

`journal.ts` — in `isSystemEvent`, before the final `return false`:

```ts
  if (value.kind === 'memberRenamed') {
    return (
      isNonEmptyString(value.memberId) && isNonEmptyString(value.from) && isNonEmptyString(value.to)
    )
  }
```

`RoomChat.tsx` — in `translateSystemEvent`, after `roleChanged`:

```ts
      case 'memberRenamed':
        return t('chat.system.memberRenamed', { from: event.from, to: event.to })
```

- [ ] **Step 4: Run tests + typecheck**

Run: `pnpm --filter @release/web exec vitest run src/network/chat src/features/chat && pnpm --filter @release/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/shared/chat/types.ts apps/frontend/src/network/chat apps/frontend/src/features/chat/RoomChat.tsx
git commit -m "feat: memberRenamed chat line (#233)"
```

---

### Task 5: Wire profiles into `useLobby`

**Files:**
- Modify: `apps/frontend/src/network/useLobby.ts`
- Modify: `apps/frontend/src/entities/game/seats.ts`
- Modify: `apps/frontend/src/network/index.ts` (export new types)
- Test: `apps/frontend/src/network/useLobby.test.ts`, `apps/frontend/src/entities/game/seats.test.ts`
- Modify (mocks only): `apps/frontend/src/app/providers/SessionProvider.test.tsx`, `apps/frontend/src/pages/board/[gameId]/__tests__/toLobby.test.tsx`, `apps/frontend/src/pages/lobby/__tests__/inviteScreen.test.tsx`, `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx`

**Interfaces:**
- Consumes: Tasks 1–4.
- Produces on `UseLobby`:
  - `updateProfile(patch: ProfilePatch): void`
  - `profileRejection: ProfileRejection | null` where `export interface ProfileRejection { reason: ProfileRejectReason; seq: number }` (exported from `useLobby.ts` and `network/index.ts`; `seq` grows on every rejection so an effect fires again on a repeat)
  - `ErrorKind` gains `'name-taken'`
- Produces on `seatsFor`: each human seat carries `avatar` when its peer has one.

- [ ] **Step 1: Write the failing tests**

`seats.test.ts` — add:

```ts
it('freezes a player avatar into the seat', () => {
  const seats = seatsFor({
    a: { id: 'a', memberId: 'ma', name: 'Ann', role: 'host', ready: true, where: 'lobby', avatar: 'attack-bug' },
    b: { id: 'b', memberId: 'mb', name: 'Bo', role: 'player', ready: true, where: 'lobby' },
  })
  expect(seats[0].avatar).toBe('attack-bug')
  expect(seats[1]).not.toHaveProperty('avatar')
})
```

`useLobby.test.ts` — add imports `clearAvatarPreference, readAvatarPreference, writeAvatarPreference` from `~/shared/lib/avatarPreference`, call `clearAvatarPreference()` in the existing `beforeEach`, then append:

```ts
it('opens the room under the remembered avatar', async () => {
  writeAvatarPreference('attack-bug')
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 4))
  const self = result.current.state?.selfId ?? ''
  expect(result.current.state?.peers[self].avatar).toBe('attack-bug')
})

it('remembers the avatar a new host was dealt', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 4))
  const self = result.current.state?.selfId ?? ''
  expect(readAvatarPreference()).toBe(result.current.state?.peers[self].avatar)
})

it('a guest asks for its remembered avatar on join', async () => {
  writeAvatarPreference('defense-hotfix')
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.joinRoom('ABC-23D', 'Bo'))
  act(() => transports[0].onConnection?.('abc23d'))
  expect(transports[0].send).toHaveBeenCalledWith(
    'abc23d',
    expect.objectContaining({
      type: 'JOIN_REQUEST',
      payload: expect.objectContaining({ avatar: 'defense-hotfix' }),
    }),
  )
})

it('refuses a join under a nickname already in the room', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 4))
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: ' ANN ', resumeToken: 'client-b' },
      from: 'peer-b',
      seq: 1,
    }),
  )
  expect(result.current.state?.peers['peer-b']).toBeUndefined()
  expect(transports[0].disconnectPeer).toHaveBeenCalledWith('peer-b', {
    type: 'JOIN_REJECTED',
    payload: { reason: 'name-taken', availability: { player: true, spectator: true } },
  })
})

it('does not name-check a returning seat', async () => {
  const { result } = await hostWithGuest()
  act(() => result.current.startGame([]))
  act(() =>
    transports[0].onMessage?.({
      type: 'JOIN_REQUEST',
      payload: { name: 'Bo', resumeToken: GUEST_RESUME_TOKEN },
      from: 'peer-b-reloaded',
      seq: 2,
    }),
  )
  expect(result.current.state?.peers['peer-b-reloaded']?.name).toBe('Bo')
})

it('applies a guest rename, broadcasts the row and logs memberRenamed', async () => {
  const { result } = await hostWithGuest()
  transports[0].broadcast.mockClear()
  act(() =>
    transports[0].onMessage?.({
      type: 'PROFILE_UPDATE',
      payload: { name: 'Neo' },
      from: GUEST,
      seq: 5,
    }),
  )
  expect(result.current.state?.peers[GUEST].name).toBe('Neo')
  expect(transports[0].broadcast).toHaveBeenCalledWith({
    type: 'PEER_JOINED',
    payload: result.current.state?.peers[GUEST],
  })
  expect(systemEvents(result.current).at(-1)).toMatchObject({
    kind: 'memberRenamed',
    from: 'Bo',
    to: 'Neo',
  })
})

it('answers a taken nickname to the sender alone', async () => {
  const { result } = await hostWithGuest()
  act(() =>
    transports[0].onMessage?.({
      type: 'PROFILE_UPDATE',
      payload: { name: 'dimbo' },
      from: GUEST,
      seq: 5,
    }),
  )
  expect(result.current.state?.peers[GUEST].name).toBe('Bo')
  expect(transports[0].send).toHaveBeenCalledWith(GUEST, {
    type: 'PROFILE_REJECTED',
    payload: { reason: 'name-taken' },
  })
})

it('the host edits its own profile without the network', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 4))
  act(() => result.current.updateProfile({ name: 'Anna', avatar: 'ai-inside' }))
  const self = result.current.state?.selfId ?? ''
  expect(result.current.state?.peers[self]).toMatchObject({ name: 'Anna', avatar: 'ai-inside' })
  expect(readSession()?.name).toBe('Anna')
  expect(readAvatarPreference()).toBe('ai-inside')
})

it('a host rejection of its own edit surfaces as profileRejection', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 4))
  act(() => result.current.updateProfile({ name: '   ' }))
  expect(result.current.profileRejection).toEqual({ reason: 'name-invalid', seq: 1 })
  act(() => result.current.updateProfile({ name: '   ' }))
  expect(result.current.profileRejection).toEqual({ reason: 'name-invalid', seq: 2 })
})

it('a guest sends its edit to the host and applies the confirmed row', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.joinRoom('ABC-23D', 'Bo'))
  act(() => acceptGuest(transports[0], 'abc23d'))
  act(() => result.current.updateProfile({ avatar: 'attack-bug' }))
  expect(transports[0].send).toHaveBeenCalledWith('abc23d', {
    type: 'PROFILE_UPDATE',
    payload: { avatar: 'attack-bug' },
  })
  act(() =>
    transports[0].onMessage?.({
      type: 'PEER_JOINED',
      from: 'abc23d',
      seq: 2,
      payload: {
        id: transports[0].id,
        memberId: transports[0].id,
        name: 'Neo',
        role: 'player',
        ready: false,
        where: 'lobby',
        avatar: 'attack-bug',
      },
    }),
  )
  // writes the confirmed nickname to the stored session
  expect(readSession()?.name).toBe('Neo')
  expect(readAvatarPreference()).toBe('attack-bug')
})

it('a guest records a host rejection', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.joinRoom('ABC-23D', 'Bo'))
  act(() => acceptGuest(transports[0], 'abc23d'))
  act(() =>
    transports[0].onMessage?.({
      type: 'PROFILE_REJECTED',
      from: 'abc23d',
      seq: 3,
      payload: { reason: 'avatar-taken' },
    }),
  )
  expect(result.current.profileRejection).toEqual({ reason: 'avatar-taken', seq: 1 })
})

it('treats name-taken as terminal', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.joinRoom('ABC-23D', 'Bo'))
  const dial = transports[0]
  act(() => {
    dial.onConnection?.('abc23d')
    dial.onMessage?.({
      type: 'JOIN_REJECTED',
      from: 'abc23d',
      seq: 1,
      payload: { reason: 'name-taken', availability: { player: true, spectator: true } },
    })
    dial.onDisconnect?.('abc23d')
    dial.onConnection?.('abc23d')
  })
  expect(result.current.status).toBe('error')
  expect(result.current.errorKind).toBe('name-taken')
  expect(transports).toHaveLength(1)
})
```

In the four mock files listed above, add to the `UseLobby` mock object: `updateProfile: vi.fn(),` and `profileRejection: null,`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @release/web exec vitest run src/network/useLobby.test.ts src/entities/game/seats.test.ts`
Expected: FAIL — `updateProfile` missing, no avatars, no name check.

- [ ] **Step 3: Implement** (all in `useLobby.ts` unless noted)

3a. `seats.ts` — `seatsFor` map:

```ts
    .map((p, i) => ({
      playerId: seatId(i),
      peerId: p.id,
      name: p.name,
      ...(p.avatar ? { avatar: p.avatar } : {}),
    }))
```

3b. Imports:

```ts
import { readAvatarPreference, writeAvatarPreference } from '~/shared/lib/avatarPreference'
import { firstAvatar, handleProfileUpdate, nameTaken, parseProfilePatch } from './lobby/profile'
```

and add `ProfilePatch`, `ProfileRejectReason` to the import from `./types`.

3c. Types — change `ErrorKind` and add the rejection type next to it:

```ts
export type ErrorKind = 'not-found' | 'connection' | 'room-full' | 'name-taken' | null

// The host refused this peer's own profile edit. `seq` grows with every
// refusal, so a consumer's effect fires again on a repeat of the same reason.
export interface ProfileRejection {
  reason: ProfileRejectReason
  seq: number
}
```

Add to `UseLobby` (after `transferHost`):

```ts
  // Edit my own nickname and/or avatar. The host applies its own directly; a
  // guest asks and learns the outcome from the PEER_JOINED or PROFILE_REJECTED
  // that comes back.
  updateProfile(patch: ProfilePatch): void
  profileRejection: ProfileRejection | null
```

3d. State + helpers (next to the other `useState`s and refs near `lobbyActionError`):

```ts
  const [profileRejection, setProfileRejection] = useState<ProfileRejection | null>(null)
  const rejectProfile = useCallback((reason: ProfileRejectReason) => {
    setProfileRejection((prev) => ({ reason, seq: (prev?.seq ?? 0) + 1 }))
  }, [])

  // What this browser keeps of its own row once the host has confirmed it: the
  // avatar as next join's wish, and the nickname in the session — the host
  // refuses a reconnect whose name differs from the one it remembers.
  const rememberOwnProfile = useCallback((peer: PeerInfo) => {
    if (peer.avatar) writeAvatarPreference(peer.avatar)
    const stored = readSession()
    if (stored && stored.name !== peer.name) writeSession({ ...stored, name: peer.name })
  }, [])
```

3e. Host's own row — in `createRoom` before `createLobbyState`:

```ts
        const hostAvatar = firstAvatar(readAvatarPreference())
        writeAvatarPreference(hostAvatar)
```

and add `avatar: hostAvatar,` to the host `PeerInfo` there. In the two host restore paths (`restoredLobby` ~line 1741 and the in-match restore ~line 1821) add `avatar: firstAvatar(readAvatarPreference()),` to the host `PeerInfo`.

3f. Guest join wish — in the `JOIN_REQUEST` sent from `onConnection`:

```ts
              const wish = readAvatarPreference()
              owner?.send(hostId, {
                type: 'JOIN_REQUEST',
                payload: {
                  name,
                  resumeToken: getResumeToken(nextRoomCode),
                  requestedRole,
                  ...(resume ? { resume } : {}),
                  ...(wish ? { avatar: wish } : {}),
                },
              })
```

3g. Host admission — in the host `JOIN_REQUEST` branch, add `avatar: payload.avatar` to `options`, and right after the existing `if (!decision.accepted) { … return }` block insert:

```ts
          // A returning seat keeps the name its match was dealt under, and its
          // stale peer may still be in the roster under that very name.
          if (
            !privateSeat &&
            nameTaken(joinState, payload.name, [msg.from, ...(priorId ? [priorId] : [])])
          ) {
            void transportRef.current?.disconnectPeer(msg.from, {
              type: 'JOIN_REJECTED',
              payload: {
                reason: 'name-taken',
                availability: getJoinAvailability(joinState, msg.from, options),
              },
            })
            return
          }
```

3h. Host profile application — a callback defined after `broadcastChatEntries`:

```ts
  const applyProfile = useCallback(
    (fromId: string, patch: ProfilePatch) => {
      const current = stateRef.current
      if (!current) return
      const r = handleProfileUpdate(current, fromId, patch, Boolean(gameIdRef.current))
      if (r.error) {
        if (fromId === current.selfId) rejectProfile(r.error)
        else dispatch(r.outgoing)
        return
      }
      if (r.state === current) return
      commit(r.state)
      dispatch(r.outgoing)
      const peer = r.state.peers[fromId]
      if (fromId === current.selfId) rememberOwnProfile(peer)
      if (r.renamed)
        broadcastChatEntries([
          chatSession.appendSystem({
            kind: 'memberRenamed',
            memberId: peer.memberId,
            from: r.renamed.from,
            to: r.renamed.to,
          }),
        ])
    },
    [broadcastChatEntries, chatSession, commit, dispatch, rejectProfile, rememberOwnProfile],
  )
```

In `onMessage`'s host chain, after the `PLAYER_READY` branch:

```ts
        } else if (msg.type === 'PROFILE_UPDATE') {
          const patch = parseProfilePatch((msg as { payload?: unknown }).payload)
          if (patch) applyProfile(msg.from, patch)
```

Add `applyProfile` to `onMessage`'s dependency list.

3i. Guest side — in the `PEER_JOINED` case, inside `if (peer.id === current.selfId) { … }` add `rememberOwnProfile(peer)` after the existing `writeSession` (the existing write must stay: it records role and whereabouts). Add a new case:

```ts
        case 'PROFILE_REJECTED':
          if (fromHost) rejectProfile(msg.payload.reason)
          break
```

Add `rejectProfile`, `rememberOwnProfile` to the dependency list.

3j. Join refusal on the guest — replace the `msg.payload?.reason === 'room-full'` condition with:

```ts
              msg.type === 'JOIN_REJECTED' &&
              (msg.payload?.reason === 'room-full' || msg.payload?.reason === 'name-taken')
```

inside that block replace the three hardcoded `'room-full'` values with `msg.payload.reason` (`setError`, `setErrorKind`, and `onDialOutcome?.({ ok: false, error: { type: msg.payload.reason } })`). In `settleAttempt` change the terminal test to:

```ts
          const type = (outcome.error as { type?: string })?.type
          terminal = type === 'room-full' || type === 'name-taken'
```

3k. Public action — next to `transferHost`:

```ts
  const updateProfile = useCallback(
    (patch: ProfilePatch) => {
      const current = stateRef.current
      const t = transportRef.current
      if (!current || !t) return
      if (isHostRef.current) applyProfile(current.selfId, patch)
      else t.send(current.hostId, { type: 'PROFILE_UPDATE', payload: patch })
    },
    [applyProfile],
  )
```

Add `updateProfile` and `profileRejection` to both returned objects / `useMemo` deps where `transferHost` appears (lines ~2591 and ~2634).

3l. `network/index.ts` — export `type ProfileRejection` from `./useLobby` and `type ProfilePatch, type ProfileRejectReason` from `./types` alongside the existing exports. If `entities/lobby` re-exports `UseLobby` types, re-export `ProfileRejection` there too.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @release/web exec vitest run src/network src/entities src/pages src/app && pnpm --filter @release/web typecheck`
Expected: PASS, including every pre-existing `useLobby` test.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src
git commit -m "feat: profile edits, avatar wishes and name checks in the lobby session (#233)"
```

---

### Task 6: Speaking detector (pure)

**Files:**
- Create: `apps/frontend/src/network/voice/levels.ts`
- Test: `apps/frontend/src/network/voice/levels.test.ts`

**Interfaces:**
- Produces:
  - `SPEAKING_POLL_MS = 100`, `SPEAKING_ON_RMS = 0.02`, `SPEAKING_HOLD_MS = 300`
  - `rms(samples: Float32Array): number`
  - `createSpeakingDetector(): SpeakingDetector` where
    `interface SpeakingDetector { update(levels: ReadonlyMap<string, number>, now: number): ReadonlySet<string> | null }` — returns the new set only when it changed, else `null`.

- [ ] **Step 1: Write the failing test**

```ts
// apps/frontend/src/network/voice/levels.test.ts
import { expect, it } from 'vitest'
import { createSpeakingDetector, rms, SPEAKING_HOLD_MS, SPEAKING_ON_RMS } from './levels'

const loud = SPEAKING_ON_RMS * 2
const quiet = SPEAKING_ON_RMS / 4

it('computes the RMS of a frame', () => {
  expect(rms(new Float32Array([0, 0, 0, 0]))).toBe(0)
  expect(rms(new Float32Array([0.5, -0.5, 0.5, -0.5]))).toBeCloseTo(0.5)
})

it('turns on above the threshold and reports only changes', () => {
  const d = createSpeakingDetector()
  expect(d.update(new Map([['a', quiet]]), 0)).toBeNull()
  expect(d.update(new Map([['a', loud]]), 100)).toEqual(new Set(['a']))
  expect(d.update(new Map([['a', loud]]), 200)).toBeNull()
})

it('holds through a short pause and drops after the hold', () => {
  const d = createSpeakingDetector()
  d.update(new Map([['a', loud]]), 0)
  expect(d.update(new Map([['a', quiet]]), SPEAKING_HOLD_MS - 1)).toBeNull()
  expect(d.update(new Map([['a', quiet]]), SPEAKING_HOLD_MS)).toEqual(new Set())
})

it('a member missing from the levels stops speaking at once', () => {
  const d = createSpeakingDetector()
  d.update(new Map([['a', loud], ['b', loud]]), 0)
  expect(d.update(new Map([['b', loud]]), 100)).toEqual(new Set(['b']))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @release/web exec vitest run src/network/voice/levels.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Implement**

```ts
// apps/frontend/src/network/voice/levels.ts

// Who is speaking, from sound levels alone. Pure: audio.ts samples the
// analysers and feeds the numbers in, so the thresholds are testable without a
// browser. Tuned by ear on a live call — adjust together, not one at a time.

// How often the graph is sampled. A timer, not rAF: rAF stops in a background
// tab, and voice does not.
export const SPEAKING_POLL_MS = 100
// RMS of a time-domain frame (−1…1) above which a voice counts as speaking.
export const SPEAKING_ON_RMS = 0.02
// How long a voice keeps its ring after falling quiet, so a phrase reads as one
// ring rather than one blink per syllable.
export const SPEAKING_HOLD_MS = 300

export function rms(samples: Float32Array): number {
  if (samples.length === 0) return 0
  let sum = 0
  for (const s of samples) sum += s * s
  return Math.sqrt(sum / samples.length)
}

export interface SpeakingDetector {
  // The current set when it differs from the last one reported, else null.
  update(levels: ReadonlyMap<string, number>, now: number): ReadonlySet<string> | null
}

export function createSpeakingDetector(): SpeakingDetector {
  const lastLoud = new Map<string, number>()
  let reported = new Set<string>()
  return {
    update(levels, now) {
      for (const id of [...lastLoud.keys()]) if (!levels.has(id)) lastLoud.delete(id)
      for (const [id, level] of levels) if (level >= SPEAKING_ON_RMS) lastLoud.set(id, now)
      const speaking = new Set<string>()
      for (const [id, at] of lastLoud) {
        if (now - at < SPEAKING_HOLD_MS) speaking.add(id)
        else lastLoud.delete(id)
      }
      const same = speaking.size === reported.size && [...speaking].every((id) => reported.has(id))
      if (same) return null
      reported = speaking
      return speaking
    },
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @release/web exec vitest run src/network/voice/levels.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/voice/levels.ts apps/frontend/src/network/voice/levels.test.ts
git commit -m "feat: speaking detector over sound levels (#233)"
```

---

### Task 7: Analysers in the audio graph and `speakingMemberIds`

**Files:**
- Modify: `apps/frontend/src/network/voice/audio.ts`
- Modify: `apps/frontend/src/network/voice/runtime.ts`
- Modify: `apps/frontend/src/network/voice/testing/fakes.ts`, `apps/frontend/src/network/voice/testing/fakeVoiceFacade.ts`
- Test: `apps/frontend/src/network/voice/audio.test.ts`, `apps/frontend/src/network/voice/runtime.test.ts`

**Interfaces:**
- Consumes: Task 6.
- Produces:
  - `VoiceAudio.subscribeSpeaking(listener: (ids: ReadonlySet<string>) => void): () => void`
  - `VoiceAudio.setSelfId(memberId: string | null): void` — the id the microphone's level is reported under
  - `VoiceSnapshot.speakingMemberIds: string[]`

- [ ] **Step 1: Write the failing tests**

In `audio.test.ts`, extend the fake context in `setup()` with an analyser factory and expose it:

```ts
  const analysers: (Node & { level: number; getFloatTimeDomainData: (a: Float32Array) => void; fftSize: number })[] = []
```

and in the context object:

```ts
    createAnalyser: () => {
      const node = Object.assign(new Node(), {
        fftSize: 2048,
        level: 0,
        getFloatTimeDomainData(target: Float32Array) {
          target.fill(this.level)
        },
      })
      analysers.push(node)
      return node
    },
```

return `analysers` from `setup()`. Update the existing test `keeps a silent outgoing audio track and never plays the local microphone`: replace `expect(sources).toHaveLength(0)` with

```ts
  // The microphone is analysed, never played: its source feeds the analyser alone.
  expect(sources).toHaveLength(1)
  expect(sources[0].connect).toHaveBeenCalledTimes(1)
  expect(sources[0].connect).toHaveBeenCalledWith(analysers[0])
```

and end that test with `await audio.dispose()` (make it `async`): the microphone's meter now starts the polling timer, and a test that leaves it running leaks it into the next one.

Add:

```ts
it('reports who is speaking from the analysers, mic included, and only on change', () => {
  vi.useFakeTimers()
  const { audio, analysers } = setup()
  const listener = vi.fn()
  audio.subscribeSpeaking(listener)
  audio.setSelfId('me')
  audio.setMicrophone(new Stream([new Track()]) as unknown as MediaStream)
  audio.setMicOff(false)
  audio.attach('bo', new Stream([new Track()]) as unknown as MediaStream)
  const [mic, bo] = analysers
  bo.level = 0.5
  vi.advanceTimersByTime(100)
  expect(listener).toHaveBeenLastCalledWith(new Set(['bo']))
  mic.level = 0.5
  vi.advanceTimersByTime(100)
  expect(listener).toHaveBeenLastCalledWith(new Set(['bo', 'me']))
  const calls = listener.mock.calls.length
  vi.advanceTimersByTime(100)
  expect(listener.mock.calls.length).toBe(calls)
  vi.useRealTimers()
})

it('never reports me with the microphone off', () => {
  vi.useFakeTimers()
  const { audio, analysers } = setup()
  const listener = vi.fn()
  audio.subscribeSpeaking(listener)
  audio.setSelfId('me')
  audio.setMicrophone(new Stream([new Track()]) as unknown as MediaStream)
  analysers[0].level = 0.5
  vi.advanceTimersByTime(300)
  expect(listener).not.toHaveBeenCalled()
  vi.useRealTimers()
})

it('disconnects a participant analyser on release and stops polling on dispose', async () => {
  vi.useFakeTimers()
  const { audio, analysers } = setup()
  const release = audio.attach('bo', new Stream([new Track()]) as unknown as MediaStream)
  release()
  expect(analysers[0].disconnect).toHaveBeenCalled()
  await audio.dispose()
  expect(vi.getTimerCount()).toBe(0)
  vi.useRealTimers()
})
```

In `runtime.test.ts` (its `setup()` spreads `fakeAudio()`'s result, so `emitSpeaking` comes back from it once Step 3 adds it):

```ts
it('publishes the speaking set from the audio graph and clears it on exit', async () => {
  const { runtime, emitSpeaking, audio } = setup()
  await runtime.connect()
  expect(audio.setSelfId).toHaveBeenCalledWith('a')
  emitSpeaking(new Set(['b', 'a']))
  expect(runtime.getSnapshot().speakingMemberIds).toEqual(['a', 'b'])
  runtime.disconnect()
  expect(runtime.getSnapshot().speakingMemberIds).toEqual([])
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @release/web exec vitest run src/network/voice`
Expected: FAIL — `createAnalyser` never called, `subscribeSpeaking`/`setSelfId`/`emitSpeaking` missing.

- [ ] **Step 3: Implement**

`audio.ts` — import and extend the interface:

```ts
import { createSpeakingDetector, rms, SPEAKING_POLL_MS } from './levels'
```

```ts
  // Who is audible right now — every attached participant and, while the
  // microphone is live and on, me under `setSelfId`. Called only on change.
  subscribeSpeaking(listener: (ids: ReadonlySet<string>) => void): () => void
  setSelfId(memberId: string | null): void
```

Inside `createVoiceAudio`, after the existing `let microphone…` declarations:

```ts
  // Level meters, one per audible stream. Each taps its source BEFORE the
  // participant's gain, so volume and a local mute never hide who is talking —
  // whether that is shown is the display's call (features/voice-chat/useSpeaking).
  const meters = new Map<string, AnalyserNode>()
  let micMeter: { source: MediaStreamAudioSourceNode; analyser: AnalyserNode } | undefined
  let selfId: string | null = null
  const speakingListeners = new Set<(ids: ReadonlySet<string>) => void>()
  const detector = createSpeakingDetector()
  let poll: ReturnType<typeof setInterval> | undefined
  let frame = new Float32Array(512)
  const meter = (source: AudioNode) => {
    const analyser = context.createAnalyser()
    analyser.fftSize = 512
    source.connect(analyser)
    return analyser
  }
  const sample = () => {
    const levels = new Map<string, number>()
    const read = (id: string, analyser: AnalyserNode) => {
      if (frame.length !== analyser.fftSize) frame = new Float32Array(analyser.fftSize)
      analyser.getFloatTimeDomainData(frame)
      levels.set(id, rms(frame))
    }
    for (const [id, analyser] of meters) read(id, analyser)
    if (micMeter && selfId && !micOff && microphone?.readyState === 'live')
      read(selfId, micMeter.analyser)
    const changed = detector.update(levels, Date.now())
    if (changed) for (const listener of [...speakingListeners]) listener(changed)
  }
  // Polling runs only while there is something to measure.
  const syncPoll = () => {
    const needed = meters.size > 0 || micMeter !== undefined
    if (needed && poll === undefined) poll = setInterval(sample, SPEAKING_POLL_MS)
    if (!needed && poll !== undefined) {
      clearInterval(poll)
      poll = undefined
      sample()
    }
  }
```

In `setMicrophone`, after `microphone = …`:

```ts
      micMeter?.source.disconnect()
      micMeter?.analyser.disconnect()
      micMeter = undefined
      if (microphone) {
        // Measured, never played: the source feeds the analyser and nothing else.
        const source = context.createMediaStreamSource(new MediaStream([microphone]))
        micMeter = { source, analyser: meter(source) }
      }
      syncPoll()
```

In `attach`, after `source.connect(gain)`:

```ts
      const analyser = meter(source)
      meters.set(memberId, analyser)
      syncPoll()
```

and inside `release`, before `gain.disconnect()`:

```ts
          analyser.disconnect()
          if (meters.get(memberId) === analyser) meters.delete(memberId)
          syncPoll()
```

New methods on the returned object:

```ts
    subscribeSpeaking(listener) {
      speakingListeners.add(listener)
      return () => {
        speakingListeners.delete(listener)
      }
    },
    setSelfId(memberId) {
      selfId = memberId
    },
```

In `dispose`, before `settings.clear()`:

```ts
      micMeter?.source.disconnect()
      micMeter?.analyser.disconnect()
      micMeter = undefined
      meters.clear()
      clearInterval(poll)
      poll = undefined
      speakingListeners.clear()
```

`runtime.ts` — add `speakingMemberIds: string[]` to `VoiceSnapshot` and `speakingMemberIds: []` to the initial snapshot. Declare `let releaseSpeaking: (() => void) | undefined` beside `releaseOutput`. In `connect()`, right after `audio = options.createAudio()`:

```ts
        audio.setSelfId(context?.selfMemberId ?? null)
        releaseSpeaking = audio.subscribeSpeaking((ids) => {
          if (audio !== ownedAudio || !wanted) return
          publish({ speakingMemberIds: [...ids].sort() })
        })
```

(move the existing `const ownedAudio = audio` above this block). Wherever the runtime tears audio down (the block that calls `audio.dispose()` around line 330), add `releaseSpeaking?.(); releaseSpeaking = undefined` and include `speakingMemberIds: []` in the `publish({ status: 'off', … })` calls at lines ~149 and ~339. In `updateRoom`, when the context changes and `audio` exists, call `audio.setSelfId(context?.selfMemberId ?? null)`.

`testing/fakes.ts` — in `fakeAudio()`:

```ts
  const speakingListeners = new Set<(ids: ReadonlySet<string>) => void>()
```

add to `audio`:

```ts
    subscribeSpeaking(listener) {
      speakingListeners.add(listener)
      return () => {
        speakingListeners.delete(listener)
      }
    },
    setSelfId: vi.fn(),
```

and return `emitSpeaking: (ids: ReadonlySet<string>) => { for (const l of [...speakingListeners]) l(ids) }` alongside `audio`.

`testing/fakeVoiceFacade.ts` — add `speakingMemberIds: [],`.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm --filter @release/web exec vitest run src/network/voice src/features/voice-chat && pnpm --filter @release/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/voice
git commit -m "feat: measure voice levels in the audio graph and publish who speaks (#233)"
```

---

### Task 8: `useSpeaking` display rules and the voice list

**Files:**
- Create: `apps/frontend/src/features/voice-chat/useSpeaking.ts`
- Test: `apps/frontend/src/features/voice-chat/useSpeaking.test.ts`
- Modify: `apps/frontend/src/features/voice-chat/model.ts`, `model.test.ts`

**Interfaces:**
- Consumes: `RoomVoiceFacade` with `speakingMemberIds`, `roster` (`VoicePresence` has `memberId`, `micOff`), `settings`, `status`, `selfMemberId`, `micOff`.
- Produces:
  - `speakingMembers(voice: RoomVoiceFacade): ReadonlySet<string>` (pure)
  - `useSpeaking(): ReadonlySet<string>` (reads `useSession().voice`, memoised on the snapshot)
  - `toVoiceParticipants` sets `avatar` from `PeerInfo` and `speaking` from a passed set: new signature `toVoiceParticipants(snapshot, peers, speaking: ReadonlySet<string> = new Set())`.

- [ ] **Step 1: Write the failing tests**

```ts
// apps/frontend/src/features/voice-chat/useSpeaking.test.ts
import { expect, it } from 'vitest'
import { createFakeVoiceFacade } from '~/network/voice/testing/fakeVoiceFacade'
import { speakingMembers } from './useSpeaking'

const presence = (memberId: string, micOff = false) => ({
  memberId,
  peerId: `peer-${memberId}`,
  voiceSessionId: `vs-${memberId}`,
  micOff,
})

const voice = (overrides = {}) =>
  createFakeVoiceFacade({
    status: 'connected',
    selfMemberId: 'me',
    micOff: false,
    roster: [presence('me'), presence('bo'), presence('cy', true), presence('di')],
    settings: { di: { volume: 100, muted: true } },
    speakingMemberIds: ['me', 'bo', 'cy', 'di'],
    ...overrides,
  })

it('shows speakers I can hear, myself included', () => {
  expect(speakingMembers(voice())).toEqual(new Set(['me', 'bo']))
})

it('hides someone I muted and someone whose mic is off', () => {
  const set = speakingMembers(voice())
  expect(set.has('di')).toBe(false)
  expect(set.has('cy')).toBe(false)
})

it('hides my own ring with my mic off', () => {
  expect(speakingMembers(voice({ micOff: true })).has('me')).toBe(false)
})

it('shows nothing unless I am in the voice chat', () => {
  expect(speakingMembers(voice({ status: 'off' })).size).toBe(0)
  expect(speakingMembers(voice({ status: 'connecting' })).size).toBe(0)
  expect(speakingMembers(voice({ status: 'interrupted' })).size).toBe(2)
})
```

(If `VoicePresence` has further required fields, copy them from `network/voice/types.ts` into `presence()`.)

In `model.test.ts`, add:

```ts
it('carries the avatar and the speaking ring', () => {
  const snapshot = { ...createFakeVoiceFacade(), roster: [{ memberId: 'm', peerId: 'p', voiceSessionId: 'v', micOff: false }] }
  const peer = { id: 'p', memberId: 'm', name: 'Bo', role: 'player' as const, ready: true, where: 'lobby' as const, avatar: 'attack-bug' }
  expect(toVoiceParticipants(snapshot, { p: peer }, new Set(['m']))[0]).toMatchObject({
    avatar: 'attack-bug',
    speaking: true,
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @release/web exec vitest run src/features/voice-chat`
Expected: FAIL.

- [ ] **Step 3: Implement**

```ts
// apps/frontend/src/features/voice-chat/useSpeaking.ts
import { useMemo } from 'react'
import { useSession } from '~/app/providers/SessionProvider'
import type { RoomVoiceFacade } from '~/network'

// Whose ring to light. The voice layer reports everyone audible; what I am
// allowed to see of it is decided here, once, for every screen:
// - only while I am in the voice chat;
// - never for someone I muted, nor for someone whose own mic is off;
// - my own ring while I talk with my mic on.
export function speakingMembers(voice: RoomVoiceFacade): ReadonlySet<string> {
  if (voice.status !== 'connected' && voice.status !== 'interrupted') return new Set()
  const micOffById = new Map(voice.roster.map((p) => [p.memberId, p.micOff]))
  const visible = new Set<string>()
  for (const id of voice.speakingMemberIds) {
    if (id === voice.selfMemberId) {
      if (!voice.micOff) visible.add(id)
      continue
    }
    if (voice.settings[id]?.muted) continue
    if (micOffById.get(id) !== false) continue
    visible.add(id)
  }
  return visible
}

export function useSpeaking(): ReadonlySet<string> {
  const { voice } = useSession()
  return useMemo(() => speakingMembers(voice), [voice])
}
```

`model.ts`:

```ts
export function toVoiceParticipants(
  snapshot: VoiceSnapshot,
  peers: Record<string, PeerInfo>,
  speaking: ReadonlySet<string> = new Set(),
): VoiceParticipant[] {
  return snapshot.roster.flatMap((presence) => {
    const peer = peers[presence.peerId]
    if (!peer || peer.memberId !== presence.memberId || peer.id.startsWith('bot:')) return []
    return [
      {
        id: presence.memberId,
        name: peer.name,
        role: peer.role === 'guest' ? 'spectator' : peer.role,
        micOff: presence.micOff,
        ...(peer.avatar ? { avatar: peer.avatar } : {}),
        speaking: speaking.has(presence.memberId),
        ...(snapshot.settings[presence.memberId] ?? { volume: 100, muted: false }),
      },
    ]
  })
}
```

`RoomVoice.tsx` — in `useRoomVoiceView`, call `const speaking = useSpeaking()` and pass it: `toVoiceParticipants(voice, session.state?.peers ?? {}, speaking)`.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @release/web exec vitest run src/features/voice-chat`
Expected: PASS (update the existing `model.test.ts` expectation with `speaking: false` if it uses `toEqual`).

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/voice-chat
git commit -m "feat: who-is-speaking display rules and avatars in the voice list (#233)"
```

---

### Task 9: Lobby — avatars, ring and the settings modal

**Files:**
- Modify: `apps/frontend/src/pages/lobby/_LobbyView.tsx`
- Test: `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx`

**Interfaces:**
- Consumes: `session.updateProfile`, `session.profileRejection`, `nameTaken` (via `~/network` — export it from `network/index.ts` if not yet), `useSpeaking`, `PRESET_AVATARS`, `PlayerSettings`, `Modal` from `@release/ui`.
- Copy keys used (already in both catalogs): `lobbyScreen.playerSettingsTitle`, `playerSettings.avatars`, `playerSettings.nicknameLabel`, `playerSettings.nicknamePlaceholder`, `playerSettings.randomNick`, `playerSettings.nicknameTaken`. Avatar labels come from `PRESET_AVATARS[*].label[lang]` (proper names, not UI copy).

- [ ] **Step 1: Write the failing tests** — in `lobby.test.tsx` (the mock `t` echoes keys; reuse the file's existing helper that renders `LobbyView` with a host state — search for a test that renders `<LobbyView />` with `state.peers` and copy its setup):

```ts
it('shows avatars and opens my settings from my own row', () => {
  sessionValue = {
    ...base(),
    status: 'in-lobby',
    isHost: true,
    roomCode: 'ABC-123',
    state: {
      selfId: 'h', hostId: 'h', maxPlayers: 4, maxSpectators: 8, bots: 0, setup: {},
      peers: {
        h: { id: 'h', memberId: 'mh', name: 'Ann', role: 'host', ready: true, where: 'lobby', avatar: 'attack-bug' },
        b: { id: 'b', memberId: 'mb', name: 'Bo', role: 'player', ready: false, where: 'lobby', avatar: 'defense-hotfix' },
      },
    },
  }
  renderLobby() // the file's existing render helper
  fireEvent.click(screen.getByRole('button', { name: /Ann/ }))
  expect(screen.getByText('lobbyScreen.playerSettingsTitle')).toBeTruthy()
})

it('sends a picked avatar at once and a new nickname on close', () => {
  // same sessionValue as above
  renderLobby()
  fireEvent.click(screen.getByRole('button', { name: /Ann/ }))
  fireEvent.click(screen.getByRole('button', { name: 'Hallucination' }))
  expect(sessionValue.updateProfile).toHaveBeenCalledWith({ avatar: 'ai-hallucination' })
  fireEvent.change(screen.getByLabelText('playerSettings.nicknameLabel'), { target: { value: 'Anna' } })
  expect(sessionValue.updateProfile).toHaveBeenCalledTimes(1)
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(sessionValue.updateProfile).toHaveBeenLastCalledWith({ name: 'Anna' })
})

it('does not send a taken nickname and marks the field', () => {
  renderLobby()
  fireEvent.click(screen.getByRole('button', { name: /Ann/ }))
  fireEvent.change(screen.getByLabelText('playerSettings.nicknameLabel'), { target: { value: 'bo' } })
  expect(screen.getByText('playerSettings.nicknameTaken')).toBeTruthy()
  fireEvent.keyDown(document, { key: 'Escape' })
  expect(sessionValue.updateProfile).not.toHaveBeenCalled()
})

it('reopens the settings with the draft when the host refuses the nickname', () => {
  const { rerender } = renderLobby()
  fireEvent.click(screen.getByRole('button', { name: /Ann/ }))
  fireEvent.change(screen.getByLabelText('playerSettings.nicknameLabel'), { target: { value: 'Zed' } })
  fireEvent.keyDown(document, { key: 'Escape' })
  sessionValue = { ...sessionValue, profileRejection: { reason: 'name-taken', seq: 1 } }
  rerender()
  expect((screen.getByLabelText('playerSettings.nicknameLabel') as HTMLInputElement).value).toBe('Zed')
  expect(screen.getByText('playerSettings.nicknameTaken')).toBeTruthy()
})
```

Adjust selectors to the real DOM once: the `PlayerSlot` edit button's accessible name and how `Modal` closes (Escape or its close button) — read `apps/ui/src/blocks/PlayerSlot/PlayerSlot.tsx` and `apps/ui/src/primitives/Modal` before running. `renderLobby` must return the Testing Library result so `rerender` exists; if the file has no helper, write `const renderLobby = () => render(<MemoryRouter><LobbyView /></MemoryRouter>)`.

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm --filter @release/web exec vitest run src/pages/lobby/__tests__/lobby.test.tsx`
Expected: FAIL — no edit button, no modal.

- [ ] **Step 3: Implement** in `_LobbyView.tsx`

Add imports: `PlayerSettings, PRESET_AVATARS` from `@release/ui`; `useSpeaking` from `~/features/voice-chat/useSpeaking`; `nameTaken` from `~/network`; `useRef` from `react`.

After `const [leaveOpen, setLeaveOpen] = useState(false)`:

```tsx
  const speaking = useSpeaking()
  // The settings modal edits my own row. The nickname is a local draft until
  // the modal closes; the avatar is sent on click and shown optimistically
  // until the roster confirms it or the host refuses it.
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [nicknameDraft, setNicknameDraft] = useState('')
  const [pendingAvatar, setPendingAvatar] = useState<string | null>(null)
  const [refusedName, setRefusedName] = useState(false)
  const lastRejection = useRef(session.profileRejection?.seq ?? 0)
```

These hooks must sit above the `if (!state) return null` early return. Add the rejection effect there too:

```tsx
  const rejection = session.profileRejection
  useEffect(() => {
    if (!rejection || rejection.seq === lastRejection.current) return
    lastRejection.current = rejection.seq
    if (rejection.reason === 'avatar-taken') setPendingAvatar(null)
    if (rejection.reason === 'name-taken' || rejection.reason === 'name-invalid') {
      // The draft is still in state: reopen on it, with the reason under the field.
      setRefusedName(true)
      setSettingsOpen(true)
    }
  }, [rejection])

  // Leaving for the board closes the modal without sending anything.
  useEffect(() => {
    if (session.gameId) setSettingsOpen(false)
  }, [session.gameId])
```

After `state` is known (below `const me = …`):

```tsx
  const myPeer = state.peers[state.selfId]
  const lang = i18n.resolvedLanguage === 'ru' ? 'ru' : 'en'
  // the roster caught up with my click — drop the optimistic pick
  if (pendingAvatar && myPeer?.avatar === pendingAvatar) setPendingAvatar(null)
  const takenAvatars = players.flatMap((p) => (p.id !== state.selfId && p.avatar ? [p.avatar] : []))
  const draftTaken =
    refusedName || (nicknameDraft.trim() !== '' && nameTaken(state, nicknameDraft, [state.selfId]))
  const openSettings = () => {
    setNicknameDraft(myPeer?.name ?? '')
    setRefusedName(false)
    setSettingsOpen(true)
  }
  const closeSettings = () => {
    setSettingsOpen(false)
    const name = nicknameDraft.trim()
    if (!name || name === myPeer?.name || nameTaken(state, name, [state.selfId])) return
    session.updateProfile({ name })
  }
  const pickAvatar = (avatar: string) => {
    setPendingAvatar(avatar)
    session.updateProfile({ avatar })
  }
```

(If `lang` is already computed in the file, reuse it instead of redeclaring.)

On the human `PlayerSlot` in the players list add:

```tsx
                    avatar={p.avatar}
                    speaking={speaking.has(p.memberId)}
                    onEdit={p.id === state.selfId ? openSettings : undefined}
```

On the spectator `PlayerSlot` add `speaking={speaking.has(s.memberId)}` and `onEdit={s.id === state.selfId ? openSettings : undefined}`.

Next to the other two `Modal`s:

```tsx
      <Modal
        open={settingsOpen}
        onClose={closeSettings}
        title={t('lobbyScreen.playerSettingsTitle')}
      >
        <PlayerSettings
          avatars={
            me
              ? {
                  items: PRESET_AVATARS.map((a) => ({ id: a.id, label: a.label[lang] })),
                  selected: pendingAvatar ?? me.avatar ?? null,
                  taken: takenAvatars,
                  onChange: pickAvatar,
                }
              : undefined
          }
          nickname={nicknameDraft}
          onNicknameChange={(name) => {
            setRefusedName(false)
            setNicknameDraft(name)
          }}
          nicknameTaken={draftTaken}
          copy={{
            avatars: t('playerSettings.avatars'),
            nicknameLabel: t('playerSettings.nicknameLabel'),
            nicknamePlaceholder: t('playerSettings.nicknamePlaceholder'),
            randomNick: t('playerSettings.randomNick'),
            nicknameTaken: t('playerSettings.nicknameTaken'),
          }}
        />
      </Modal>
```

Check `@release/ui`'s `Lobby.tsx` (lines ~556–579) for any extra `Modal` prop it passes for this modal (e.g. width) and mirror it.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @release/web exec vitest run src/pages/lobby && pnpm --filter @release/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/lobby apps/frontend/src/network/index.ts
git commit -m "feat: player settings, avatars and the speaking ring in the lobby (#233)"
```

---

### Task 10: Invite screen — nickname taken

**Files:**
- Modify: `apps/frontend/src/pages/lobby/_InviteScreen.tsx`
- Test: `apps/frontend/src/pages/lobby/__tests__/inviteScreen.test.tsx`

**Interfaces:**
- Consumes: `session.errorKind === 'name-taken'` (Task 5).

- [ ] **Step 1: Write the failing test** (reuse the file's existing render setup for an errored session):

```ts
it('marks the nickname field when the host says it is taken', () => {
  sessionValue = { ...base(), status: 'error', errorKind: 'name-taken', error: 'name-taken' }
  renderInvite() // the file's existing render helper
  expect(screen.getByText('playerSettings.nicknameTaken')).toBeTruthy()
  expect(screen.queryByText('invite.connectError')).toBeNull()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @release/web exec vitest run src/pages/lobby/__tests__/inviteScreen.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implement**

```tsx
  const nameTaken = session.status === 'error' && session.errorKind === 'name-taken'
  const status =
    session.status === 'error' && !nameTaken
      ? session.errorKind === 'room-full'
        ? t('invite.fullStatus')
        : session.errorKind === 'not-found'
          ? t('invite.notFoundStatus')
          : t('invite.connectError')
      : null
```

and on the nickname `FormField` replace `error=""` with:

```tsx
            error={nameTaken ? t('playerSettings.nicknameTaken') : ''}
```

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @release/web exec vitest run src/pages/lobby`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/lobby
git commit -m "feat: nickname-taken refusal on the invite screen (#233)"
```

---

### Task 11: Avatars and the ring on chat, Participants and Stats

**Files:**
- Modify: `apps/frontend/src/features/chat/model.ts` (+ `model.test.ts` beside it, create if absent)
- Modify: `apps/frontend/src/entities/game/stats/toStatPlayers.ts`, `toStatPlayers.test.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/index.tsx`, `apps/frontend/src/pages/board/[gameId]/stats.tsx`

**Interfaces:**
- `toChatMessages` sets `avatar` on a user message from the author's live `PeerInfo` (by `memberId`), none once they are gone.
- `toStatPlayers({ tally, seats, peers, speaking? })` — `speaking?: ReadonlySet<string>` keyed by memberId; sets `avatar: seat.avatar` and `speaking`.

- [ ] **Step 1: Write the failing tests**

Chat (`features/chat/model.test.ts`):

```ts
import { expect, it } from 'vitest'
import { toChatMessages } from './model'

it('shows the author avatar while they are in the room', () => {
  const entry = {
    kind: 'message' as const, id: 'c1', sequence: 1, createdAt: 0, text: 'hi',
    author: { memberId: 'mb', name: 'Bo', role: 'player' as const },
  }
  const peer = { id: 'b', memberId: 'mb', name: 'Bo', role: 'player' as const, ready: true, where: 'lobby' as const, avatar: 'attack-bug' }
  const args = { entries: [entry], formatTime: () => '', systemText: () => '' }
  expect(toChatMessages({ ...args, peers: [peer] })[0]).toMatchObject({ avatar: 'attack-bug' })
  expect(toChatMessages({ ...args, peers: [] })[0]).not.toHaveProperty('avatar')
})
```

Stats (`toStatPlayers.test.ts`):

```ts
it('carries the seat avatar and the speaking ring', () => {
  const seats = [{ playerId: 'p1', peerId: 'a', name: 'Ann', avatar: 'attack-bug' }]
  const peers = { a: { id: 'a', memberId: 'ma', name: 'Ann', role: 'host' as const, ready: true, where: 'stats' as const } }
  const [row] = toStatPlayers({ tally: {}, seats, peers, speaking: new Set(['ma']) })
  expect(row).toMatchObject({ avatar: 'attack-bug', speaking: true })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --filter @release/web exec vitest run src/features/chat src/entities/game/stats`
Expected: FAIL.

- [ ] **Step 3: Implement**

`features/chat/model.ts` — in the user-message return add `...(peer?.avatar ? { avatar: peer.avatar } : {}),`.

`toStatPlayers.ts`:

```ts
export function toStatPlayers(args: {
  tally: Record<PlayerId, PlayerTally>
  seats: Seat[]
  peers: Record<string, PeerInfo>
  // memberIds whose ring is lit (features/voice-chat/useSpeaking)
  speaking?: ReadonlySet<string>
}): StatPlayer[] {
  return args.seats.map((seat) => {
    const peer = args.peers[seat.peerId]
    const counts = args.tally[seat.playerId] ?? emptyTally()
    return {
      id: seat.peerId,
      name: peer?.name ?? seat.name,
      location: seat.bot ? 'game' : (peer?.where ?? 'offline'),
      ...(seat.avatar ? { avatar: seat.avatar } : {}),
      speaking: Boolean(peer && args.speaking?.has(peer.memberId)),
      ...counts,
    }
  })
}
```

(keep the existing comments in place).

`stats.tsx` — `const speaking = useSpeaking()` and pass `speaking` into `toStatPlayers`.

`board/[gameId]/index.tsx` — `const speaking = useSpeaking()`; in the `participants` map add:

```ts
      ...(seat.avatar ? { avatar: seat.avatar } : {}),
      speaking: Boolean(live && speaking.has(live.memberId)),
```

and replace the spectators line with:

```ts
  const spectators = Object.values(peerMap)
    .filter((p) => p.role === 'guest')
    .map((p) => ({ id: p.id, name: p.name, speaking: speaking.has(p.memberId) }))
```

(verify `BoardState.spectators` is `Spectator[]` — it is, `entities/game/board/types.ts:162`).

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @release/web exec vitest run src/features src/entities src/pages/board && pnpm --filter @release/web typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src
git commit -m "feat: avatars and the speaking ring on chat, participants and stats (#233)"
```

---

### Task 12: Reduced motion for the ring

**Files:**
- Modify: `apps/ui/src/primitives/Avatar/Avatar.module.css`

- [ ] **Step 1: Implement** — append:

```css
/* the ring still comes and goes, it just does not fade */
@media (prefers-reduced-motion: reduce) {
  .avatar::after {
    transition: none;
  }
}
```

- [ ] **Step 2: Lint**

Run: `pnpm lint`
Expected: PASS (Stylelint accepts the block).

- [ ] **Step 3: Commit**

```bash
git add apps/ui/src/primitives/Avatar/Avatar.module.css
git commit -m "feat: speaking ring without a fade under reduced motion (#233)"
```

---

### Task 13: Full verification

- [ ] **Step 1: Whole-repo checks**

Run: `pnpm lint && pnpm typecheck && pnpm test`
Expected: all green. Record the test counts per package in the PR body.

- [ ] **Step 2: Live check in two tabs** — `pnpm dev:p2p` via the preview tools, host in tab A, guest in tab B:
  1. A's avatar on its lobby row; B joins with a remembered avatar (set via the modal in a previous run) and gets it.
  2. B opens settings, picks an avatar → A sees it at once; B picks A's avatar → it is greyed (taken).
  3. B renames to A's nickname → field shows "taken", closing sends nothing; B renames to a free name → chat line "X changed their nickname to Y" on both.
  4. B reloads → readmitted under the new name with the same avatar.
  5. Third tab joins with A's nickname → invite screen shows "taken" under the nickname field.
  6. Start a match with a bot → Participants tab and the results screen show avatars; the bot shows its initial.
  7. Both tabs join voice; speaking in A lights A's ring in both tabs; B mutes A locally → ring gone in B only; A turns the mic off → no ring.

- [ ] **Step 3: Commit any fixes, push, open the PR** referencing #233 and #224, with the spec and plan linked.
