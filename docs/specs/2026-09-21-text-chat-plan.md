# Room Text Chat Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship one host-authoritative plain-text conversation that follows a room through lobby, table, and results, retains its complete 12-hour room history, and restores safely across supported reconnects and reloads.

**Architecture:** A pure append-only journal owns validation, stable membership, canonical ordering, and idempotent merging. `useLobby` remains the network authority and exposes a small `chat` surface through `SessionProvider`; presentation is handled by one frontend adapter reused on all three routes. Existing `@release/ui` chat, table drawer, stats slot, and toast designs are wired rather than recreated.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library, PeerJS/WebRTC transport, `sessionStorage`, CSS Modules, `@release/ui`, `@release/translation`.

**Spec:** `docs/specs/2026-09-21-text-chat-design.md`

## Global Constraints

- The host is the only authority for author, role, member identity, entry ID, sequence, and timestamp.
- A guest sends only `CHAT_SEND { text }`; `CHAT_SEND`, `CHAT_HISTORY`, and `CHAT_ENTRY` are never relayable.
- User content is trimmed plain text, preserves internal newlines, and is limited to 2,000 Unicode code points.
- Retain every accepted entry for the room lifecycle; there is no message-count or byte-count truncation policy.
- The persisted host journal uses per-tab `sessionStorage` and the existing `RESTORE_TTL_MS` value of 12 hours.
- `memberId` is a public room identity and must not be treated as a reconnect credential or an authorization claim.
- System entries carry semantic keys/data and are translated only at render time.
- `@release/ui` stays i18n-agnostic; all visible copy comes from `@release/translation` via props.
- Styling uses CSS Modules, existing design tokens, logical CSS properties, and `Typography`; no hard-coded colours or Tailwind.
- Voice/video, direct messages, attachments, rich text, editing, deletion, moderation, muting, reporting, and cross-room archival are excluded.

## Review Focus

- History snapshot and live-entry overlap must merge without duplicates or reordering; Task 1 and Task 4 pin repeated and out-of-order delivery.
- A reconnect that reaches the host before the old connection's disconnect callback must reuse one `memberId` and must not create two join events; Task 5 reproduces that race.
- Corrupt, expired, wrong-room, or browser-refused storage must not crash the session or leak another room's history; Task 2 and Task 5 cover each condition.
- Astral Unicode, whitespace-only input, embedded newlines, duplicate display names, and HTML-looking text must preserve the intended length/identity/plain-text rules; Task 1 and Task 6 cover these inputs.
- Opening/closing the table drawer or notification preference around a history sync must never replay old messages as toasts; Task 8 covers initial history, drawer-open arrivals, disabled arrivals, eviction, expiry, and hover pause.

---

## File Structure

### New files

- `apps/frontend/src/shared/chat/types.ts` — transport-independent chat entry, author, role, system-event, and member-ID types.
- `apps/frontend/src/network/chat/journal.ts` — pure admission, text validation, append, runtime restore validation, and idempotent merge functions.
- `apps/frontend/src/network/chat/journal.test.ts` — journal invariants and hostile-input coverage.
- `apps/frontend/src/network/chat/useChatSession.ts` — React state/ref bridge between the pure journal, persistence, and `useLobby`.
- `apps/frontend/src/features/chat/model.ts` — map canonical entries plus live roster facts to `@release/ui` messages.
- `apps/frontend/src/features/chat/model.test.ts` — active-role override, departed-author fallback, duplicate-name identity, time, and system-entry mapping.
- `apps/frontend/src/features/chat/RoomChat.tsx` — shared translated hook and `Chat` renderer used by lobby, board, and stats.
- `apps/ui/src/blocks/Toast/ToastStack.test.tsx` — notification capacity, initial-history suppression, lifetime, and hover behavior.

### Existing files changed

- `apps/frontend/src/shared/lib/persistence.ts` and `.test.ts` — `release:chat` record and 12-hour room validation.
- `apps/frontend/src/network/types.ts` — public `memberId` on roster members and three chat protocol frames.
- `apps/frontend/src/network/session/relay.ts` and `.test.ts` — prohibit relaying all chat frames.
- `apps/frontend/src/network/lobby/host.ts`, `host.test.ts`, `state.test.ts` — carry host-minted `memberId` through authoritative roster frames.
- `apps/frontend/src/network/envelope.test.ts` — serialize canonical multiline chat payloads.
- `apps/frontend/src/network/useLobby.ts` and `.test.ts` — host/guest chat flow, full history sync, semantic lifecycle entries, restore, and public `chat` API.
- Peer fixtures listed in Task 4 — add the required `memberId` without changing seat identity.
- `apps/ui/src/blocks/Chat/Chat.tsx` and `.test.tsx` — stable-ID self/grouping and rejected-send draft retention.
- `apps/ui/src/index.ts` — publicly export `ToastStack` and its item/copy types.
- `packages/translation/src/locales/en/common.json` and `ru/common.json` — chat system, role, and notification-setting copy.
- `apps/frontend/src/pages/lobby/_LobbyView.tsx`, `_LobbyView.module.css`, and `__tests__/lobby.test.tsx` — approved third-column lobby chat.
- `apps/frontend/src/entities/game/board/types.ts` — mirror the shared table chat contracts in the maintained board fork.
- `apps/frontend/src/pages/board/[gameId]/_Board.tsx`, `index.tsx`, and focused board tests — chat tab/drawer, local preference, and live toasts.
- `apps/frontend/src/pages/board/[gameId]/stats.tsx` and `__tests__/stats.test.tsx` — approved persistent results chat column.

---

### Task 1: Build the canonical chat types and pure journal

**Files:**
- Create: `apps/frontend/src/shared/chat/types.ts`
- Create: `apps/frontend/src/network/chat/journal.ts`
- Create: `apps/frontend/src/network/chat/journal.test.ts`

**Interfaces:**
- Consumes: no application state; only injected client IDs, authors, timestamps, and untrusted restored values.
- Produces:
  - `MemberId`, `ChatRole`, `ChatAuthor`, `ChatSystemEvent`, `ChatEntry`
  - `ChatJournal { entries, nextSequence, memberIdsByClientId }`
  - `emptyChatJournal()`, `admitMember()`, `normalizeChatText()`, `appendUserMessage()`, `appendSystemEvent()`, `mergeChatEntries()`, `parseChatEntries()`, `parseChatJournal()`

- [ ] **Step 1: Define the shared canonical types**

Create `apps/frontend/src/shared/chat/types.ts` with these exact discriminants:

```ts
export type MemberId = string
export type ChatRole = 'host' | 'player' | 'spectator'

export interface ChatAuthor {
  memberId: MemberId
  name: string
  role: ChatRole
}

export type ChatSystemEvent =
  | { kind: 'memberJoined'; memberId: MemberId; name: string; role: ChatRole }
  | { kind: 'memberLeft'; memberId: MemberId; name: string }
  | { kind: 'memberReconnected'; memberId: MemberId; name: string }
  | { kind: 'memberKicked'; memberId: MemberId; name: string }
  | { kind: 'roleChanged'; memberId: MemberId; name: string; role: ChatRole }
  | { kind: 'modeChanged'; setting: string; value: string }

interface ChatEntryBase {
  id: string
  sequence: number
  createdAt: number
}

export interface UserChatEntry extends ChatEntryBase {
  kind: 'message'
  author: ChatAuthor
  text: string
}

export interface SystemChatEntry extends ChatEntryBase {
  kind: 'system'
  event: ChatSystemEvent
}

export type ChatEntry = UserChatEntry | SystemChatEntry
```

- [ ] **Step 2: Write failing journal tests**

Pin all journal invariants in `journal.test.ts`. Use deterministic member IDs and timestamps so order failures are readable:

```ts
it('counts Unicode code points rather than UTF-16 code units', () => {
  expect(normalizeChatText('😀'.repeat(2_000))).toBe('😀'.repeat(2_000))
  expect(normalizeChatText('😀'.repeat(2_001))).toBeNull()
})

it('trims the edges, preserves internal newlines, and rejects whitespace', () => {
  expect(normalizeChatText('  first\nsecond  ')).toBe('first\nsecond')
  expect(normalizeChatText(' \n\t ')).toBeNull()
})

it('reuses a member id for the same private client id', () => {
  const first = admitMember(emptyChatJournal(), 'client-a', () => 'member-a')
  const second = admitMember(first.journal, 'client-a', () => 'must-not-run')
  expect(first).toMatchObject({ memberId: 'member-a', isNew: true })
  expect(second).toMatchObject({ memberId: 'member-a', isNew: false })
})

it('assigns one canonical sequence and id per accepted entry', () => {
  const author = { memberId: 'member-a', name: 'same', role: 'player' } as const
  const first = appendUserMessage(emptyChatJournal(), author, 'hello', 100)
  const second = appendSystemEvent(first?.journal ?? emptyChatJournal(), {
    kind: 'memberLeft', memberId: 'member-a', name: 'same',
  }, 200)
  expect(first?.entry).toMatchObject({ id: 'chat-1', sequence: 1, createdAt: 100 })
  expect(second.entry).toMatchObject({ id: 'chat-2', sequence: 2, createdAt: 200 })
})

it('merges overlapping and out-of-order deliveries idempotently', () => {
  const author = { memberId: 'member-a', name: 'Ann', role: 'player' } as const
  const a: UserChatEntry = {
    kind: 'message', id: 'chat-1', sequence: 1, createdAt: 1, author, text: 'one',
  }
  const b: UserChatEntry = {
    kind: 'message', id: 'chat-2', sequence: 2, createdAt: 2, author, text: 'two',
  }
  expect(mergeChatEntries([b], [a, b, a])).toEqual([a, b])
})

it('never truncates the journal by entry count', () => {
  let journal = emptyChatJournal()
  const author = { memberId: 'member-a', name: 'Ann', role: 'host' } as const
  for (let i = 0; i < 2_500; i += 1) {
    journal = appendUserMessage(journal, author, `m${i}`, i)?.journal ?? journal
  }
  expect(journal.entries).toHaveLength(2_500)
  expect(journal.nextSequence).toBe(2_501)
})
```

Also assert `parseChatEntries` rejects a non-array or any malformed entry, and reject a restored journal when an entry has a duplicate ID, duplicate/non-positive sequence, non-finite timestamp, invalid role/discriminant, overlong text, empty member ID, or `nextSequence <= max(sequence)`.

- [ ] **Step 3: Run the new suite and verify the red state**

Run:

```bash
pnpm --filter @release/web test -- src/network/chat/journal.test.ts
```

Expected: FAIL because the modules/functions do not exist.

- [ ] **Step 4: Implement the immutable journal**

Use `Array.from(trimmed).length` for the 2,000-code-point bound. `appendUserMessage` returns `null` for invalid text; accepted entries use `id: \`chat-${sequence}\`` and increment `nextSequence` exactly once. `mergeChatEntries` keeps the first canonical value for an ID and returns ascending sequence order.

```ts
export const MAX_CHAT_CODE_POINTS = 2_000

export interface ChatJournal {
  entries: ChatEntry[]
  nextSequence: number
  memberIdsByClientId: Record<string, MemberId>
}

export function emptyChatJournal(): ChatJournal {
  return { entries: [], nextSequence: 1, memberIdsByClientId: {} }
}

export function normalizeChatText(raw: string): string | null {
  const text = raw.trim()
  if (text.length === 0 || Array.from(text).length > MAX_CHAT_CODE_POINTS) return null
  return text
}

export function admitMember(
  journal: ChatJournal,
  clientId: string,
  mint: () => MemberId = () => crypto.randomUUID(),
): { journal: ChatJournal; memberId: MemberId; isNew: boolean } {
  const existing = journal.memberIdsByClientId[clientId]
  if (existing) return { journal, memberId: existing, isNew: false }
  const memberId = mint()
  return {
    memberId,
    isNew: true,
    journal: {
      ...journal,
      memberIdsByClientId: { ...journal.memberIdsByClientId, [clientId]: memberId },
    },
  }
}
```

Implement strict runtime guards in `parseChatEntries(value: unknown)` and reuse them from `parseChatJournal(value: unknown)` rather than casting storage/wire data. A valid empty array/journal is accepted; a partially valid value is rejected as a whole.

- [ ] **Step 5: Run the journal tests and typecheck the frontend**

Run:

```bash
pnpm --filter @release/web test -- src/network/chat/journal.test.ts
pnpm --filter @release/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the journal boundary**

```bash
git add apps/frontend/src/shared/chat/types.ts apps/frontend/src/network/chat/journal.ts apps/frontend/src/network/chat/journal.test.ts
git commit -m "feat(chat): add canonical room journal"
```

---

### Task 2: Persist and expire the host journal

**Files:**
- Modify: `apps/frontend/src/shared/lib/persistence.ts`
- Modify: `apps/frontend/src/shared/lib/persistence.test.ts`

**Interfaces:**
- Consumes: serializable journal fields produced by Task 1.
- Produces: `StoredChat`, `readChat(roomCode, now?)`, `writeChat(record)`, `clearChat()`.

- [ ] **Step 1: Write failing persistence tests**

Add cases beside the existing session/keeper/log tests:

```ts
it('round-trips chat only for its room', () => {
  writeChat({
    roomCode: 'ABC-123', entries: [], nextSequence: 1,
    members: [{ clientId: 'client-a', memberId: 'member-a' }], savedAt: 1_000,
  })
  expect(readChat('ABC-123', 1_001)?.members).toEqual([
    { clientId: 'client-a', memberId: 'member-a' },
  ])
  expect(readChat('OTHER', 1_001)).toBeNull()
  expect(sessionStorage.getItem('release:chat')).toBeNull()
})

it('drops chat after the shared 12-hour restore ttl', () => {
  writeChat({ roomCode: 'ABC-123', entries: [], nextSequence: 1, members: [], savedAt: 10 })
  expect(readChat('ABC-123', 10 + RESTORE_TTL_MS + 1)).toBeNull()
  expect(sessionStorage.getItem('release:chat')).toBeNull()
})

it('drops malformed chat json and clearChat removes the memory fallback too', () => {
  sessionStorage.setItem('release:chat', '{broken')
  expect(readChat('ABC-123')).toBeNull()
  writeChat({ roomCode: 'ABC-123', entries: [], nextSequence: 1, members: [], savedAt: 10 })
  clearChat()
  expect(readChat('ABC-123', 11)).toBeNull()
})
```

Extend the test that makes `sessionStorage.setItem` throw: `writeChat` must remain readable from the module's existing in-memory fallback and must not throw.

- [ ] **Step 2: Run the focused suite and verify failure**

```bash
pnpm --filter @release/web test -- src/shared/lib/persistence.test.ts
```

Expected: FAIL because the chat persistence API is missing.

- [ ] **Step 3: Implement the fifth persistence record**

Add `const CHAT_KEY = 'release:chat'` and this runtime-boundary type:

```ts
export interface StoredChat {
  roomCode: string
  entries: unknown[]
  nextSequence: number
  members: Array<{ clientId: string; memberId: string }>
  savedAt: number
}

export function readChat(roomCode: string, now: number = Date.now()): StoredChat | null {
  const stored = readJson<StoredChat>(CHAT_KEY)
  if (!stored) return null
  if (stored.roomCode !== roomCode || now - stored.savedAt > RESTORE_TTL_MS) {
    remove(CHAT_KEY)
    return null
  }
  return stored
}

export function writeChat(chat: StoredChat): void {
  write(CHAT_KEY, JSON.stringify(chat))
}

export function clearChat(): void {
  remove(CHAT_KEY)
}
```

Keep `entries` untrusted until Task 1's `parseChatJournal` validates it; JSON parsing alone is not domain validation.

- [ ] **Step 4: Run focused tests**

```bash
pnpm --filter @release/web test -- src/shared/lib/persistence.test.ts
```

Expected: PASS, including wrong-room removal and storage refusal fallback.

- [ ] **Step 5: Commit persistence**

```bash
git add apps/frontend/src/shared/lib/persistence.ts apps/frontend/src/shared/lib/persistence.test.ts
git commit -m "feat(chat): persist the host journal"
```

---

### Task 3: Add safe chat protocol frames

**Files:**
- Modify: `apps/frontend/src/network/types.ts`
- Modify: `apps/frontend/src/network/session/relay.ts`
- Modify: `apps/frontend/src/network/session/relay.test.ts`
- Modify: `apps/frontend/src/network/envelope.test.ts`

**Interfaces:**
- Consumes: `MemberId` and `ChatEntry` from Task 1.
- Produces: `CHAT_SEND`/`CHAT_HISTORY`/`CHAT_ENTRY` members of `Message` and a relay deny-list that treats all three as direct authority-sensitive frames.

- [ ] **Step 1: Write protocol tests first**

In `relay.test.ts`, assert all three frames return `false` from `isRelayable`:

```ts
expect(isRelayable('CHAT_SEND')).toBe(false)
expect(isRelayable('CHAT_HISTORY')).toBe(false)
expect(isRelayable('CHAT_ENTRY')).toBe(false)
```

In `envelope.test.ts`, construct a complete `CHAT_ENTRY` with author `member-a`, text `first\nsecond`, sequence `7`, and timestamp `1000`; round-trip it through `createEnvelope`/`parseEnvelope` and assert the payload is structurally equal.

- [ ] **Step 2: Run the focused suites and verify failure**

```bash
pnpm --filter @release/web test -- src/network/session/relay.test.ts src/network/envelope.test.ts
```

Expected: FAIL because the three message types do not exist.

- [ ] **Step 3: Extend the network types**

Import the shared types with `import type` and add:

```ts
| { type: 'CHAT_SEND'; payload: { text: string } }
| {
    type: 'CHAT_HISTORY'
    payload: { entries: ChatEntry[]; selfMemberId: MemberId }
  }
| { type: 'CHAT_ENTRY'; payload: { entry: ChatEntry } }
```

Do not add author fields to `CHAT_SEND`.

- [ ] **Step 4: Block chat frames at the relay boundary**

Add all three types to `NEVER_RELAYED`:

```ts
'CHAT_SEND',
'CHAT_HISTORY',
'CHAT_ENTRY',
```

The host handles `CHAT_SEND` directly; canonical history/entries are authored by the host and must never be forwarded on a peer's behalf.

- [ ] **Step 5: Run protocol and type tests**

```bash
pnpm --filter @release/web test -- src/network/session/relay.test.ts src/network/envelope.test.ts
pnpm --filter @release/web typecheck
```

Expected: PASS.

- [ ] **Step 6: Commit the protocol seam**

```bash
git add apps/frontend/src/network/types.ts apps/frontend/src/network/session/relay.ts apps/frontend/src/network/session/relay.test.ts apps/frontend/src/network/envelope.test.ts
git commit -m "feat(chat): define authoritative chat frames"
```

---

### Task 4: Wire live sends and full history into `useLobby`

**Files:**
- Create: `apps/frontend/src/network/chat/useChatSession.ts`
- Modify: `apps/frontend/src/network/types.ts`
- Modify: `apps/frontend/src/network/lobby/host.ts`
- Modify: `apps/frontend/src/network/lobby/host.test.ts`
- Modify: `apps/frontend/src/network/lobby/state.test.ts`
- Modify: `apps/frontend/src/network/useLobby.ts`
- Modify: `apps/frontend/src/network/useLobby.test.ts`
- Modify: typed `PeerInfo` fixtures listed in Step 7

**Interfaces:**
- Consumes: journal/persistence APIs from Tasks 1–2 and protocol frames from Task 3.
- Produces:
  - required public `PeerInfo.memberId` carried by every authoritative roster frame
  - `RoomChatState { entries, selfMemberId, send(text): boolean }`
  - stable chat-session methods for host start/restore/admission/append and guest history/live application
  - `UseLobby.chat: RoomChatState`

- [ ] **Step 1: Write failing live-flow tests**

Add focused cases to the existing fake-transport suite:

```ts
it('a guest sends text intent only', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.joinRoom('F96-NMT', 'Bo'))
  const hostId = parseRoomCode('F96-NMT')
  act(() => transports[0].onConnection?.(hostId))
  act(() => expect(result.current.chat.send('  hello\nroom  ')).toBe(true))
  expect(transports[0].send).toHaveBeenCalledWith(hostId, {
    type: 'CHAT_SEND', payload: { text: 'hello\nroom' },
  })
})

it('the host canonicalizes a guest send from the admitted connection', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.createRoom('Ann', 4))
  act(() => transports[0].onMessage?.({
    type: 'JOIN_REQUEST', payload: { name: 'Bo', clientId: 'client-b' },
    from: 'peer-b', seq: 1,
  }))
  const admitted = result.current.state?.peers['peer-b']
  expect(admitted?.memberId).toBeTruthy()
  transports[0].broadcast.mockClear()
  act(() => transports[0].onMessage?.({
    type: 'CHAT_SEND', payload: { text: 'hello' }, from: 'peer-b', seq: 2,
  }))
  expect(result.current.chat.entries.at(-1)).toMatchObject({
    kind: 'message', author: {
      memberId: admitted?.memberId, name: 'Bo', role: 'player',
    }, text: 'hello', sequence: expect.any(Number),
  })
  expect(transports[0].broadcast).toHaveBeenCalledWith({
    type: 'CHAT_ENTRY', payload: { entry: result.current.chat.entries.at(-1) },
  })
})

it('history plus an overlapping live entry stays ordered and unique', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.joinRoom('F96-NMT', 'Bo'))
  const hostId = parseRoomCode('F96-NMT')
  const one = userChatEntry({ id: 'chat-1', sequence: 1, text: 'one' })
  const two = userChatEntry({ id: 'chat-2', sequence: 2, text: 'two' })
  const three = userChatEntry({ id: 'chat-3', sequence: 3, text: 'three' })
  act(() => transports[0].onMessage?.({
    type: 'CHAT_HISTORY', payload: { entries: [one, two], selfMemberId: 'member-b' },
    from: hostId, seq: 1,
  }))
  act(() => transports[0].onMessage?.({ type: 'CHAT_ENTRY', payload: { entry: two }, from: hostId, seq: 2 }))
  act(() => transports[0].onMessage?.({ type: 'CHAT_ENTRY', payload: { entry: three }, from: hostId, seq: 3 }))
  expect(result.current.chat.entries.map((entry) => entry.id)).toEqual(['chat-1', 'chat-2', 'chat-3'])
})

it('ignores history and canonical entries not authored by the host', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.joinRoom('F96-NMT', 'Bo'))
  const forged = userChatEntry({ id: 'chat-1', sequence: 1, text: 'forged' })
  act(() => transports[0].onMessage?.({
    type: 'CHAT_HISTORY', payload: { entries: [forged], selfMemberId: 'attacker' },
    from: 'peer-attacker', seq: 1,
  }))
  act(() => transports[0].onMessage?.({
    type: 'CHAT_ENTRY', payload: { entry: forged }, from: 'peer-attacker', seq: 2,
  }))
  expect(result.current.chat.entries).toEqual([])
  expect(result.current.chat.selfMemberId).toBeNull()
})

it('ignores a malformed canonical entry even when it names the host', async () => {
  const { result } = renderHook(() => useLobby())
  await act(async () => result.current.joinRoom('F96-NMT', 'Bo'))
  const hostId = parseRoomCode('F96-NMT')
  act(() => transports[0].onMessage?.({
    type: 'CHAT_ENTRY', payload: { entry: { id: 'bad', text: 42 } },
    from: hostId, seq: 1,
  } as WireMessage))
  expect(result.current.chat.entries).toEqual([])
})
```

Add a typed `userChatEntry` test helper that supplies `kind`, `createdAt`, and an author, while requiring the caller's `id`, `sequence`, and `text`; reserve a cast for the deliberately malformed frame only.

- [ ] **Step 2: Run the focused hook suite and verify failure**

```bash
pnpm --filter @release/web test -- src/network/useLobby.test.ts
```

Expected: FAIL because `UseLobby.chat` and handlers do not exist.

- [ ] **Step 3: Implement the chat state/ref bridge**

`useChatSession.ts` owns React state for consumers and a synchronous journal ref for message handlers. Expose stable callbacks with these signatures:

```ts
export interface ChatAdmission {
  memberId: MemberId
  isNew: boolean
}

export interface ChatSessionModel {
  entries: ChatEntry[]
  selfMemberId: MemberId | null
  startHost(roomCode: string, clientId: string): MemberId
  restoreHost(roomCode: string, clientId: string): MemberId
  admit(clientId: string): ChatAdmission
  appendUser(author: ChatAuthor, text: string): ChatEntry | null
  appendSystem(event: ChatSystemEvent): ChatEntry
  history(): ChatEntry[]
  receiveHistory(entries: ChatEntry[], selfMemberId: MemberId): void
  receiveEntry(entry: ChatEntry): void
  clearRoom(): void
}

export interface RoomChatState {
  entries: ChatEntry[]
  selfMemberId: MemberId | null
  send(text: string): boolean
}
```

`startHost` creates and persists a fresh journal. Persistence serialization converts `memberIdsByClientId` to the spec's `members` array; restore uses `Object.fromEntries(members.map(({ clientId, memberId }) => [clientId, memberId]))` to rebuild the map before `parseChatJournal` validates it. `restoreHost` uses `readChat` + `parseChatJournal`, falls back to an empty journal, admits the host client ID, and sets `selfMemberId`. Host mutations persist immediately with `savedAt: Date.now()`.

Guest `receiveHistory` first calls `parseChatEntries(entries)` and ignores the whole frame on failure; `receiveEntry` validates a one-element array the same way. Valid guest data merges in memory but never overwrites the host journal record in `sessionStorage`.

- [ ] **Step 4: Add `UseLobby.chat` and `sendChat`**

Map network roles with one helper:

```ts
const toChatRole = (role: Role): ChatRole => role === 'guest' ? 'spectator' : role
```

Before wiring sends, add required `memberId: MemberId` to `PeerInfo` and `PEER_JOINED.payload`. Change `handleJoinRequest` to accept the host-minted `memberId` immediately after `clientId`, assign it to the peer, and propagate it through join, ready, whereabouts, and capacity-demotion `PEER_JOINED` frames. Keep `Seat.clientId` unchanged.

`sendChat(text)` then normalizes locally. It returns `false` and sends nothing when text is invalid, there is no transport/state, or a guest has no host connection. For a host, resolve `current.peers[current.selfId]`, append canonically, and broadcast `CHAT_ENTRY`; for a guest, send only `CHAT_SEND { text }` and wait for the canonical response.

- [ ] **Step 5: Handle the three wire frames explicitly**

In the host branch, handle `CHAT_SEND` before the relay fallback:

```ts
const peer = current.peers[msg.from]
if (!peer) return
const entry = chat.appendUser(
  { memberId: peer.memberId, name: peer.name, role: toChatRole(peer.role) },
  msg.payload.text,
)
if (entry) dispatch([{ to: 'broadcast', message: { type: 'CHAT_ENTRY', payload: { entry } } }])
```

In the `JOIN_REQUEST` host path, call `chat.admit(clientId)`, pass its `memberId` to `handleJoinRequest`, dispatch the normal lobby frames, then send the current `CHAT_HISTORY` directly to the admitted peer. Task 5 inserts the canonical join/reconnect system entry before this snapshot.

In the guest switch, accept `CHAT_HISTORY` and `CHAT_ENTRY` only when `fromHost`; pass them to `receiveHistory`/`receiveEntry`. On the host, ignore peer-originated `CHAT_HISTORY`/`CHAT_ENTRY`.

- [ ] **Step 6: Seed host and provisional guest identity**

During `createRoom`, call `chat.startHost(formatRoomCode(t.id), getClientId())` and use the returned ID in the host `PeerInfo`. During `joinRoom`, use `memberId: t.id` only as a provisional local roster value; the first host `PEER_LIST` replaces it, while `CHAT_HISTORY.selfMemberId` sets the canonical self identity used by chat.

Update every typed `PeerInfo` fixture in these files with deterministic IDs: `network/lobby/host.test.ts`, `network/lobby/state.test.ts`, `network/useLobby.test.ts`, `entities/game/seats.test.ts`, `entities/game/stats/toStatPlayers.test.ts`, `pages/__tests__/start.test.tsx`, `pages/lobby/__tests__/lobby.test.tsx`, and the board tests `boardPresence.test.tsx`, `stats.test.tsx`, `statsRealMatch.test.tsx`, and `toLobby.test.tsx`.

- [ ] **Step 7: Run focused tests and typecheck**

```bash
pnpm --filter @release/web test -- src/network/chat/journal.test.ts src/network/lobby/host.test.ts src/network/lobby/state.test.ts src/network/useLobby.test.ts src/entities/game/seats.test.ts src/entities/game/stats/toStatPlayers.test.ts
pnpm --filter @release/web typecheck
```

Expected: PASS. Confirm the guest test sees no optimistic local entry before `CHAT_ENTRY` returns.

- [ ] **Step 8: Commit live chat**

```bash
git add apps/frontend/src/network/chat/useChatSession.ts apps/frontend/src/network/types.ts apps/frontend/src/network/lobby/host.ts apps/frontend/src/network/lobby/host.test.ts apps/frontend/src/network/lobby/state.test.ts apps/frontend/src/network/useLobby.ts apps/frontend/src/network/useLobby.test.ts apps/frontend/src/entities/game/seats.test.ts apps/frontend/src/entities/game/stats/toStatPlayers.test.ts apps/frontend/src/pages/__tests__/start.test.tsx apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx 'apps/frontend/src/pages/board/[gameId]/__tests__/boardPresence.test.tsx' 'apps/frontend/src/pages/board/[gameId]/__tests__/stats.test.tsx' 'apps/frontend/src/pages/board/[gameId]/__tests__/statsRealMatch.test.tsx' 'apps/frontend/src/pages/board/[gameId]/__tests__/toLobby.test.tsx'
git commit -m "feat(chat): synchronize live room messages"
```

---

### Task 5: Add membership events, reconnect identity, host restore, and cleanup

**Files:**
- Modify: `apps/frontend/src/network/useLobby.ts`
- Modify: `apps/frontend/src/network/useLobby.test.ts`
- Modify: `apps/frontend/src/network/chat/useChatSession.ts`

**Interfaces:**
- Consumes: Task 4's chat-session model.
- Produces: complete join/reconnect history handoff, semantic host lifecycle entries, restored sequence/member mapping, and exact room cleanup rules.

- [ ] **Step 1: Write failing lifecycle and restore tests**

Cover these distinct facts with named tests and the exact arrange/action/assert sequences below:

- `sends a late joiner the complete history including its one join event`: create a host, admit `peer-b`, accept a user message, admit `peer-c`, then inspect the direct `CHAT_HISTORY` sent to `peer-c`. Its IDs must equal the host's entire `chat.entries`, and its last event must be `memberJoined` for `peer-c`.
- `reuses memberId and emits reconnected when join beats the stale disconnect`: admit `peer-old` with `client-b`, record its assigned member ID, deliver a second `JOIN_REQUEST` from `peer-new` with the same client ID before `onDisconnect('peer-old')`, then fire that disconnect. Both roster admissions must carry the same member ID; chat system kinds for that member must be exactly `memberJoined`, `memberReconnected`, with no trailing `memberLeft` for the stale peer.
- `emits kicked without a later duplicate left event`: admit `peer-b`, call `kick('peer-b')`, then fire `onDisconnect('peer-b')`. Filter system events for its member ID and expect only `memberJoined`, `memberKicked`.
- `emits left for an ordinary disconnect and retains earlier authored messages`: admit `peer-b`, accept its `CHAT_SEND`, fire `onDisconnect('peer-b')`, and expect the user entry followed by `memberLeft`; the user entry remains in the array.
- `emits one roleChanged entry for each capacity demotion`: admit enough players to exceed a new capacity of two, call `setMaxPlayers(2)`, and compare the demoted roster IDs with `roleChanged` events whose role is `spectator`.
- `emits modeChanged only for setup keys whose value changed`: call `setSetup` once with only `gitBranch` changed to `'strategic'`, then again with the same object. Expect one event `{ kind: 'modeChanged', setting: 'gitBranch', value: 'strategic' }`.
- `restores full host history, member mapping, and the next sequence`: write matching session/keeper/chat records, mount `useLobby`, allow host restore to finish, send one host message, and assert the prior IDs remain, the stored host `memberId` is reused, and the new sequence equals the stored `nextSequence`.
- `leaveGame retains chat while leaveSession clears it`: create a host and message, call `leaveGame`, assert `readChat(roomCode)` is non-null, then call `leaveSession` and assert it is null.

- [ ] **Step 2: Run the hook suite and verify failure**

```bash
pnpm --filter @release/web test -- src/network/useLobby.test.ts
```

Expected: FAIL on missing history handoff/system entries/restore behavior.

- [ ] **Step 3: Append the admission event before the history snapshot**

For `JOIN_REQUEST`:

1. retain Task 4's `ChatAdmission` result;
2. derive the admitted peer from `r.state.peers[msg.from]`;
3. append `memberJoined` with the assigned role when `isNew`, otherwise `memberReconnected`;
4. dispatch the normal lobby frames;
5. send `CHAT_HISTORY { entries: chat.history(), selfMemberId }` directly to the joiner;
6. broadcast that same canonical system entry as `CHAT_ENTRY`.

The joiner may receive the system entry in both snapshot and live form; Task 1's merge makes this intentionally harmless. Already-connected peers receive it only live.

- [ ] **Step 4: Emit exact lifecycle entries from authoritative host paths**

- `onDisconnect`: capture the existing peer before `applyPeerLeft`. Append `memberLeft` only when no other live roster entry has the same `memberId`; this suppresses the stale old-connection callback after a fast reconnect. Then broadcast the roster removal and, when created, the chat entry.
- `kick`: capture the peer, apply/broadcast kick, append `memberKicked`; the later disconnect finds no roster member and emits nothing.
- `setMaxPlayers`: compare `current.peers` with `r.state.peers` by `memberId`; append one `roleChanged` entry for every actual role difference.
- `setSetup`: compare old/new key values and append `modeChanged { setting, value }` for each changed key; a same-value call emits nothing.

Use a small `broadcastChatEntries(entries)` helper so multi-key changes persist/broadcast each canonical entry in sequence without duplicating transport code.

- [ ] **Step 5: Restore the host journal before rebuilding its roster**

In `restoreHost`, call `chat.restoreHost(stored.roomCode, getClientId())` after the transport ID is reclaimed and before `createLobbyState`. Use the returned `memberId` for the host peer. A missing/invalid `release:chat` record yields an empty journal at sequence 1; a valid one continues from its stored `nextSequence`.

Do not restore a guest from local chat storage. Its authoritative `CHAT_HISTORY` comes from the host after re-dial.

- [ ] **Step 6: Apply cleanup at the room boundary only**

`leaveSession` calls `chat.clearRoom()` along with `clearSession`/`clearKeeper`. `leaveGame` deliberately does not. A host disband reaches the same room cleanup path. A kicked guest clears its own local state; the host's journal remains because the host does not execute the guest teardown.

- [ ] **Step 7: Run chat, persistence, lobby, and full hook suites**

```bash
pnpm --filter @release/web test -- src/network/chat/journal.test.ts src/shared/lib/persistence.test.ts src/network/lobby/host.test.ts src/network/useLobby.test.ts
pnpm --filter @release/web typecheck
```

Expected: PASS, including the reconnect-before-disconnect race and host next-sequence assertion.

- [ ] **Step 8: Commit lifecycle continuity**

```bash
git add apps/frontend/src/network/useLobby.ts apps/frontend/src/network/useLobby.test.ts apps/frontend/src/network/chat/useChatSession.ts
git commit -m "feat(chat): preserve room history across reconnects"
```

---

### Task 6: Adapt canonical entries to the shared chat UI and translations

**Files:**
- Modify: `apps/ui/src/blocks/Chat/Chat.tsx`
- Modify: `apps/ui/src/blocks/Chat/Chat.test.tsx`
- Create: `apps/frontend/src/features/chat/model.ts`
- Create: `apps/frontend/src/features/chat/model.test.ts`
- Create: `apps/frontend/src/features/chat/RoomChat.tsx`
- Modify: `packages/translation/src/locales/en/common.json`
- Modify: `packages/translation/src/locales/ru/common.json`

**Interfaces:**
- Consumes: `UseLobby.chat`, current `LobbyState.peers`, and semantic `ChatSystemEvent`.
- Produces: stable-ID `ChatMessage`, `RoomChatView`, `useRoomChatView()`, and the `<RoomChat>` renderer.

- [ ] **Step 1: Write failing UI identity and draft tests**

Extend `Chat.test.tsx`:

```tsx
it('uses member identity rather than a duplicate display name for self and grouping', () => {
  render(<Chat
    messages={[
      { id: '1', memberId: 'a', who: 'same', text: 'mine' },
      { id: '2', memberId: 'b', who: 'same', text: 'theirs' },
    ]}
    selfMemberId="a"
    copy={copy}
  />)
  const mine = screen.getByText('mine').parentElement?.parentElement
  const theirs = screen.getByText('theirs').parentElement?.parentElement
  expect(mine?.className).toMatch(/self/)
  expect(theirs?.className).not.toMatch(/self/)
  expect(screen.getAllByText('same')).toHaveLength(2)
})

it('keeps the draft when the session rejects a disconnected send', () => {
  render(<Chat messages={[]} copy={copy} onSend={() => false} />)
  fireEvent.change(screen.getByPlaceholderText(copy.placeholder), { target: { value: 'keep me' } })
  fireEvent.keyDown(screen.getByPlaceholderText(copy.placeholder), { key: 'Enter' })
  expect(screen.getByPlaceholderText(copy.placeholder)).toHaveValue('keep me')
})

it('renders HTML-looking input as text', () => {
  const { container } = render(<Chat messages={[{ id: '1', text: '<img src=x>' }]} copy={copy} />)
  expect(screen.getByText('<img src=x>')).toBeTruthy()
  expect(container.querySelector('img')).toBeNull()
})
```

- [ ] **Step 2: Write failing adapter tests**

In `model.test.ts`, assert:

- an active peer's current role/name replaces the entry snapshot;
- an absent peer uses the snapshot and sets `gone: true`;
- two equal names remain distinct through `memberId`;
- system entries call an injected `systemText(event)` function;
- timestamps use the injected formatter rather than the environment locale.

```ts
const entry: UserChatEntry = {
  kind: 'message', id: 'chat-1', sequence: 1, createdAt: 1,
  author: { memberId: 'member-a', name: 'old', role: 'player' },
  text: 'hello',
}
const active: PeerInfo = {
  id: 'peer-a', clientId: 'client-a', memberId: 'member-a', name: 'new',
  role: 'host', ready: true, where: 'lobby',
}
const shown = toChatMessages({
  entries: [entry],
  peers: [active],
  formatTime: () => '20:17',
  systemText: () => 'system',
})
expect(shown[0]).toMatchObject({ memberId: 'member-a', who: 'new', role: 'host', gone: false })
```

- [ ] **Step 3: Run both suites and verify failure**

```bash
pnpm --filter @release/ui test -- src/blocks/Chat/Chat.test.tsx
pnpm --filter @release/web test -- src/features/chat/model.test.ts
```

Expected: FAIL on missing ID props/model modules.

- [ ] **Step 4: Update the i18n-agnostic `Chat` contract**

Add `memberId?: string` to `ChatMessage`, `selfMemberId?: string` to props, and allow `onSend?: (text: string) => boolean | void`. Determine identity as `memberId` first with the existing name fallback only for playground/backward-compatible mock data. Group consecutive entries by member ID when both have one; otherwise fall back to name. Clear the draft only when `onSend` does not return `false`.

- [ ] **Step 5: Implement the pure presentation adapter**

Use this exact boundary:

```ts
export function toChatMessages(args: {
  entries: ChatEntry[]
  peers: PeerInfo[]
  formatTime: (timestamp: number) => string
  systemText: (event: ChatSystemEvent) => string
}): ChatMessage[]
```

Build a `Map<MemberId, PeerInfo>` once. User entries map current roster role `'guest'` to `'spectator'`; absent authors retain the snapshot and set `gone: true`. System entries map to `{ id, system: true, text }`.

- [ ] **Step 6: Add complete English and Russian system copy**

Under `chat`, retain `placeholder/send/empty` and add:

```json
"system": {
  "memberJoined": "{{name}} joined",
  "memberLeft": "{{name}} left the room",
  "memberReconnected": "{{name}} reconnected",
  "memberKicked": "{{name}} was removed",
  "roleChanged": "{{name}} is now {{role}}",
  "modeChanged": "host changed {{setting}}: {{value}}",
  "modeChangedUnknown": "host changed the game settings"
},
"roles": { "host": "host", "player": "player", "spectator": "spectator" }
```

Add equivalent natural Russian copy. Add the table notification labels to both catalogs: `chatToasts`, `chatToastsOn`, `chatToastsOff`, `chatToastsHint`.

- [ ] **Step 7: Implement `useRoomChatView` and `RoomChat`**

Define the view explicitly and keep it independent of session internals:

```ts
export interface RoomChatView {
  messages: ChatMessage[]
  selfMemberId: MemberId | null
  copy: ChatCopy
  send(text: string): boolean
}
```

The hook reads `useSession()`, the current language, and translation keys; formats time with `Intl.DateTimeFormat(language, { hour: '2-digit', minute: '2-digit' })`; and translates semantic events.

For `modeChanged`, use an explicit catalog map for the five supported axes (`handLimit`, `releases`, `releaseCond`, `ai`, `gitBranch`) and their existing option keys. Unknown axis/value pairs render `chat.system.modeChangedUnknown`; never display the raw wire token as user copy.

```tsx
export function RoomChat({ view, className }: { view: RoomChatView; className?: string }) {
  return <Chat
    messages={view.messages}
    selfMemberId={view.selfMemberId ?? undefined}
    copy={view.copy}
    onSend={view.send}
    className={className}
  />
}
```

- [ ] **Step 8: Run UI, adapter, translation, and type tests**

```bash
pnpm --filter @release/ui test -- src/blocks/Chat/Chat.test.tsx
pnpm --filter @release/web test -- src/features/chat/model.test.ts
pnpm --filter @release/translation test
pnpm --filter @release/ui typecheck
pnpm --filter @release/web typecheck
```

Expected: PASS in both languages with no raw visible string added to frontend TSX.

- [ ] **Step 9: Commit presentation mapping**

```bash
git add apps/ui/src/blocks/Chat packages/translation/src/locales apps/frontend/src/features/chat
git commit -m "feat(chat): present localized room history"
```

---

### Task 7: Put the approved chat column into the real lobby

**Files:**
- Modify: `apps/frontend/src/pages/lobby/_LobbyView.tsx`
- Modify: `apps/frontend/src/pages/lobby/_LobbyView.module.css`
- Modify: `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx`

**Interfaces:**
- Consumes: `useRoomChatView()` and `<RoomChat>` from Task 6.
- Produces: the real three-column `Lobby + chat` layout and send wiring.

- [ ] **Step 1: Add failing lobby integration tests**

Define `const sendChat = vi.fn(() => true)` and extend the session mock with `chat: { entries: [], selfMemberId: 'member-h', send: sendChat }`, then assert:

```tsx
it('renders the room chat as the third lobby column', () => {
  renderInRouter(<LobbyView />)
  expect(screen.getByText('lobbyScreen.chat')).toBeTruthy()
  expect(screen.getByPlaceholderText('chat.placeholder')).toBeTruthy()
})

it('submits a lobby message through the session chat model', () => {
  renderInRouter(<LobbyView />)
  fireEvent.change(screen.getByPlaceholderText('chat.placeholder'), { target: { value: 'hello' } })
  fireEvent.keyDown(screen.getByPlaceholderText('chat.placeholder'), { key: 'Enter' })
  expect(sendChat).toHaveBeenCalledWith('hello')
})
```

Make the translation mock return `{ placeholder, send, empty }` for `t('chat', { returnObjects: true })` rather than returning an empty object.

- [ ] **Step 2: Run the lobby suite and verify failure**

```bash
pnpm --filter @release/web test -- src/pages/lobby/__tests__/lobby.test.tsx
```

Expected: FAIL because the column does not render.

- [ ] **Step 3: Render the shared room chat**

Call `const chat = useRoomChatView()` once. Add `styles.gridChat` to the grid and append:

```tsx
<section className={styles.chatCol}>
  <Typography variant="sectionTitle" className={styles.h}>
    {t('lobbyScreen.chat')}
  </Typography>
  <RoomChat view={chat} />
</section>
```

Keep the existing custom lobby implementation; do not import the mock `@release/ui` Lobby screen.

- [ ] **Step 4: Port the approved layout values**

From `apps/ui/src/screens/Lobby/Lobby.module.css`, port only the already-approved chat layout:

```css
.gridChat {
  grid-template-columns: minmax(0, 1.2fr) minmax(0, 0.8fr) 320px;
}

.chatCol {
  display: flex;
  flex-direction: column;
  min-block-size: 0;
}

.gridChat .modes { margin-block-end: -80px; }
.gridChat .modeList { padding-block-end: 64px; }
```

The frontend already scrolls `.modeList` directly, so keep that exact selector; do not copy typography `composes` declarations.

- [ ] **Step 5: Run lobby tests and visual package checks**

```bash
pnpm --filter @release/web test -- src/pages/lobby/__tests__/lobby.test.tsx
pnpm --filter @release/web typecheck
pnpm --filter @release/web stylelint
```

Expected: PASS.

- [ ] **Step 6: Commit lobby integration**

```bash
git add apps/frontend/src/pages/lobby/_LobbyView.tsx apps/frontend/src/pages/lobby/_LobbyView.module.css apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx
git commit -m "feat(chat): add chat to the live lobby"
```

---

### Task 8: Mirror the approved table drawer, preference, and notifications on the real board

**Files:**
- Modify: `apps/ui/src/index.ts`
- Create: `apps/ui/src/blocks/Toast/ToastStack.test.tsx`
- Modify: `apps/frontend/src/entities/game/board/types.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx`
- Modify: `apps/frontend/src/pages/board/[gameId]/index.tsx`
- Modify: `apps/frontend/src/pages/board/[gameId]/__tests__/fixture.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/__tests__/boardComponent.test.tsx`
- Modify: `apps/frontend/src/pages/board/[gameId]/__tests__/board.test.tsx`

**Interfaces:**
- Consumes: `RoomChatView`, `RoomChat`, `Message`, and `ToastStack`.
- Produces: board `Panel` with `'chat'`, `BoardRoom.chatToasts/onChatToastsChange`, `BoardSlots.chat/toasts`, and a controlled drawer opened by notifications.

- [ ] **Step 1: Pin `ToastStack` behavior before relying on it**

Mock `@/animations/play` to return `null`, so a leaving toast completes synchronously, and use fake timers. Define `item(id)` as `{ id, node: <span>{id}</span> }`, then add these concrete tests:

```tsx
vi.mock('@/animations/play', () => ({ play: () => null }))
const copy = { hide: 'hide' }
const item = (id: string) => ({ id, node: <span>{id}</span> })

it('treats initial items as history and only shows later items', () => {
  const { rerender } = render(<ToastStack items={[item('a')]} copy={copy} />)
  expect(screen.queryByText('a')).toBeNull()
  rerender(<ToastStack items={[item('a'), item('b')]} copy={copy} />)
  expect(screen.getByText('b')).toBeTruthy()
})

it('keeps at most four live notifications and evicts the oldest', () => {
  const { rerender } = render(<ToastStack items={[]} copy={copy} />)
  rerender(<ToastStack items={['a', 'b', 'c', 'd', 'e'].map(item)} copy={copy} />)
  expect(screen.queryByText('a')).toBeNull()
  for (const id of ['b', 'c', 'd', 'e']) expect(screen.getByText(id)).toBeTruthy()
})

it('expires after six seconds', () => {
  vi.useFakeTimers()
  const { rerender } = render(<ToastStack items={[]} copy={copy} />)
  rerender(<ToastStack items={[item('b')]} copy={copy} />)
  act(() => vi.advanceTimersByTime(5_999))
  expect(screen.getByText('b')).toBeTruthy()
  act(() => vi.advanceTimersByTime(1))
  expect(screen.queryByText('b')).toBeNull()
  vi.useRealTimers()
})

it('pauses on hover and restarts the full hold after hover', () => {
  vi.useFakeTimers()
  const { rerender } = render(<ToastStack items={[]} copy={copy} />)
  rerender(<ToastStack items={[item('b')]} copy={copy} />)
  fireEvent.mouseEnter(screen.getByRole('log'))
  act(() => vi.advanceTimersByTime(12_000))
  expect(screen.getByText('b')).toBeTruthy()
  fireEvent.mouseLeave(screen.getByRole('log'))
  act(() => vi.advanceTimersByTime(6_000))
  expect(screen.queryByText('b')).toBeNull()
  vi.useRealTimers()
})

it('opens the chat from a notification click', () => {
  const onOpen = vi.fn()
  const { rerender } = render(<ToastStack items={[]} copy={copy} onOpen={onOpen} />)
  rerender(<ToastStack items={[item('b')]} copy={copy} onOpen={onOpen} />)
  fireEvent.click(screen.getByRole('button', { name: 'b' }))
  expect(onOpen).toHaveBeenCalledOnce()
})
```

Use visible message text for assertions, not animation class names.

- [ ] **Step 2: Add failing board-fork tests**

In `boardComponent.test.tsx`, assert the chat tab exists only with `slots.chat`, opens a 420px drawer, renders the chat slot, hides `slots.toasts` while chat is open, and exposes the local notification toggle only when its handler/copy are present.

In the route test, mock `useRoomChatView` with one initial remote message, render the board, then rerender with a second remote message. Assert only the second appears as a notification and clicking it opens the chat. Also assert a self-authored and a system message never enter `ToastStack.items`.

- [ ] **Step 3: Run UI and board suites and verify failure**

```bash
pnpm --filter @release/ui test -- src/blocks/Toast/ToastStack.test.tsx
pnpm --filter @release/web test -- 'src/pages/board/[gameId]/__tests__/boardComponent.test.tsx' 'src/pages/board/[gameId]/__tests__/board.test.tsx'
```

Expected: `ToastStack` tests PASS against the existing component; board tests FAIL because the maintained fork lacks chat support.

- [ ] **Step 4: Export `ToastStack` from the public UI barrel**

Add:

```ts
export { default as ToastStack, type ToastItem, type ToastStackCopy } from './blocks/Toast'
```

Do not deep-import `@/blocks/Toast` from the frontend page.

- [ ] **Step 5: Mirror the shared table contracts in board types**

- Add `'chat'` to `Panel`.
- Add `chatToasts?: boolean` and `onChatToastsChange?: (on: boolean) => void` to `BoardRoom`.
- Add optional `chatToasts`, `chatToastsOn`, `chatToastsOff`, `chatToastsHint`, and `tabChat` to `BoardChromeCopy`.
- Add `chat?: ReactNode` and `toasts?: ReactNode` to `BoardSlots`.

Update `makeBoardProps` from the catalog so tests use actual English copy.

- [ ] **Step 6: Port the shared table chat behavior into `_Board`**

Follow `apps/ui/src/table/Table/Table.tsx` exactly:

- `DRAWER_WIDTH.chat = 420`;
- `hasChat = Boolean(slots?.chat) && Boolean(copy.table.tabChat)`;
- add the chat rail item after modes;
- show notification settings only when chat/copy/handler exist;
- include chat preference in `hasUpperSettings`/`hasSettings`;
- render `slots.toasts` only while `panel !== 'chat'` and preference is enabled;
- render `<div className={kit.chatPanel}>{slots.chat}</div>` for the chat panel.

Reuse the kit CSS already imported by the fork; do not duplicate drawer/toast/chat-panel CSS.

- [ ] **Step 7: Wire the board route to the shared chat view**

In `index.tsx`, own:

```ts
const chat = useRoomChatView()
const [panel, setPanel] = useState<Panel | null>(null)
const [chatToasts, setChatToasts] = useState(true)
```

Build toast items only from live-capable remote user messages:

```tsx
const toastItems = chat.messages
  .filter((m) => !m.system && m.memberId && m.memberId !== chat.selfMemberId)
  .map((m) => ({
    id: m.id,
    node: <Message text={m.text} who={m.who} time={m.time} authorRole={m.role} />,
  }))
```

Pass `panel/onPanelChange`, the room preference, and slots:

```tsx
slots={{
  chat: <RoomChat view={chat} />,
  toasts: <ToastStack items={toastItems} copy={t('toasts', { returnObjects: true })} onOpen={() => setPanel('chat')} />,
}}
```

Because `ToastStack` marks its initial items seen and is unmounted while the drawer/preference hides it, history sync and messages received while hidden do not replay later.

- [ ] **Step 8: Run board, toast, type, and style tests**

```bash
pnpm --filter @release/ui test -- src/blocks/Toast/ToastStack.test.tsx
pnpm --filter @release/web test -- 'src/pages/board/[gameId]/__tests__/boardComponent.test.tsx' 'src/pages/board/[gameId]/__tests__/board.test.tsx'
pnpm --filter @release/ui typecheck
pnpm --filter @release/web typecheck
pnpm --filter @release/web stylelint
```

Expected: PASS, including initial-history suppression and open/disabled drawer transitions.

- [ ] **Step 9: Commit table integration**

```bash
git add apps/ui/src/index.ts apps/ui/src/blocks/Toast/ToastStack.test.tsx apps/frontend/src/entities/game/board/types.ts 'apps/frontend/src/pages/board/[gameId]/_Board.tsx' 'apps/frontend/src/pages/board/[gameId]/index.tsx' 'apps/frontend/src/pages/board/[gameId]/__tests__/fixture.ts' 'apps/frontend/src/pages/board/[gameId]/__tests__/boardComponent.test.tsx' 'apps/frontend/src/pages/board/[gameId]/__tests__/board.test.tsx'
git commit -m "feat(chat): add table chat and notifications"
```

---

### Task 9: Put the same conversation on the results screen

**Files:**
- Modify: `apps/frontend/src/pages/board/[gameId]/stats.tsx`
- Modify: `apps/frontend/src/pages/board/[gameId]/__tests__/stats.test.tsx`

**Interfaces:**
- Consumes: `useRoomChatView()` and `<RoomChat>` from Task 6; shared `Stats.chat` slot already implemented in `@release/ui`.
- Produces: the approved fixed 420px results chat panel with independent result scrolling.

- [ ] **Step 1: Add failing stats integration tests**

Define `const sendChat = vi.fn(() => true)` and extend the session mock with `chat: { entries: [], selfMemberId: 'member-a', send: sendChat }`. Assert the actual page supplies the slot and sends through it:

```tsx
it('renders the persistent results chat and sends through the room session', () => {
  render(<StatsPage />)
  expect(screen.getByPlaceholderText('chat.placeholder')).toBeTruthy()
  fireEvent.change(screen.getByPlaceholderText('chat.placeholder'), { target: { value: 'gg' } })
  fireEvent.keyDown(screen.getByPlaceholderText('chat.placeholder'), { key: 'Enter' })
  expect(sendChat).toHaveBeenCalledWith('gg')
})
```

Update the translation mock so `t('chat', { returnObjects: true })` returns `{ placeholder: 'chat.placeholder', send: 'chat.send', empty: 'chat.empty' }`; keep the existing empty-object behavior for unrelated object-copy keys.

Keep the existing results/winner/leave assertions unchanged.

- [ ] **Step 2: Run the stats suite and verify failure**

```bash
pnpm --filter @release/web test -- 'src/pages/board/[gameId]/__tests__/stats.test.tsx'
```

Expected: FAIL because `Stats` receives no `chat` slot.

- [ ] **Step 3: Supply the existing shared slot**

Call `const chat = useRoomChatView()` and pass:

```tsx
chat={<RoomChat view={chat} />}
```

Do not add page CSS: `@release/ui`'s approved `Stats.chatMode`, internal result `ScrollArea`, and 420px `chatDock` already implement the story.

- [ ] **Step 4: Run stats, UI stats, and type tests**

```bash
pnpm --filter @release/web test -- 'src/pages/board/[gameId]/__tests__/stats.test.tsx' 'src/pages/board/[gameId]/__tests__/statsRealMatch.test.tsx' 'src/pages/board/[gameId]/__tests__/toLobby.test.tsx'
pnpm --filter @release/ui test -- src/screens/Stats/Stats.test.tsx
pnpm --filter @release/web typecheck
```

Expected: PASS; returning to lobby retains the chat because it calls `leaveGame`, not `leaveSession`.

- [ ] **Step 5: Commit results integration**

```bash
git add 'apps/frontend/src/pages/board/[gameId]/stats.tsx' 'apps/frontend/src/pages/board/[gameId]/__tests__/stats.test.tsx'
git commit -m "feat(chat): carry room chat into results"
```

---

### Task 10: Verify the complete room flow and issue acceptance criteria

**Files:**
- Modify only if verification exposes a defect: the owning task's source/test files, followed by a focused regression test and a separate fix commit.

**Interfaces:**
- Consumes: the completed feature from Tasks 1–9.
- Produces: evidence that focused tests, full repository checks, and real WebRTC behavior agree.

- [ ] **Step 1: Run all focused chat and screen suites together**

```bash
pnpm --filter @release/ui test -- src/blocks/Chat/Chat.test.tsx src/blocks/Toast/ToastStack.test.tsx src/screens/Stats/Stats.test.tsx
pnpm --filter @release/web test -- src/network/chat/journal.test.ts src/shared/lib/persistence.test.ts src/network/lobby/host.test.ts src/network/session/relay.test.ts src/network/envelope.test.ts src/network/useLobby.test.ts src/features/chat/model.test.ts src/pages/lobby/__tests__/lobby.test.tsx 'src/pages/board/[gameId]/__tests__/boardComponent.test.tsx' 'src/pages/board/[gameId]/__tests__/board.test.tsx' 'src/pages/board/[gameId]/__tests__/stats.test.tsx'
```

Expected: all PASS.

- [ ] **Step 2: Run repository-wide verification**

```bash
pnpm test
pnpm typecheck
pnpm lint
pnpm build
```

Expected: all commands exit 0. Report any pre-existing or environment-only failure separately; do not describe a partial run as full success.

- [ ] **Step 3: Start a real local signaling flow**

Run:

```bash
pnpm dev:p2p
```

Open two browser tabs or profiles with distinct per-tab `sessionStorage`. Create a host room in the first and join from the second. Keep browser devtools available to inspect `release:chat`, but do not mutate the record during the happy-path pass.

- [ ] **Step 4: Verify cross-screen continuity and presentation**

1. Exchange multiline and HTML-looking text in the lobby; confirm it stays plain text.
2. Change one game mode; confirm one localized system entry appears and changes language with the UI.
3. Start the match; confirm the same history appears in the table drawer.
4. With the drawer closed, receive five remote messages; confirm only four notifications remain, hover pauses them, own/system messages do not notify, and clicking one opens chat.
5. Finish/navigate to stats; confirm the same history remains in the fixed right column and results scroll independently.
6. Return to lobby; confirm history remains because the room still exists.

- [ ] **Step 5: Verify late join, guest reconnect, and host restore**

1. Add a third fresh tab after several messages; confirm it receives the complete history without a notification burst.
2. Reload a guest in lobby and again during a match; confirm old messages remain self-authored, no duplicate join entry appears, and one reconnect entry is appended.
3. Reload the host during a running match; confirm the journal and member mapping restore, guests reconnect, and the next sent message has a higher sequence than the pre-reload tail.
4. Leave/kick a participant; confirm their historical name dims, their messages remain, and kick does not later produce a duplicate leave entry.
5. Disband the room; confirm `release:chat` is gone in the host tab.

- [ ] **Step 6: Inspect the final diff and history**

```bash
git status --short
git diff --check
git log --oneline --decorate -12
```

Expected: no unexpected generated files are staged, no whitespace errors, and each implementation task is represented by its focused commit.

- [ ] **Step 7: Commit only verification-driven fixes, if any**

For each discovered defect, first add a focused failing regression test, then the smallest fix, rerun its owning focused suite plus Step 2, and commit with a concrete message such as:

```bash
git add 'apps/frontend/src/pages/board/[gameId]/index.tsx' 'apps/frontend/src/pages/board/[gameId]/__tests__/board.test.tsx'
git commit -m "fix(chat): avoid replaying synced history as notifications"
```

If verification finds no defect, create no empty commit.

---

## Acceptance Coverage Map

| Acceptance criterion | Owning tasks |
|---|---|
| Text exchange for host/player/spectator | 3–5 |
| Lobby, table, and stats playground fidelity | 7–9 |
| One history across navigation | 4, 7–9 |
| Full late-join/reconnect history | 4–5 |
| Host journal/sequence restore | 2, 5 |
| No count-based truncation | 1 |
| Sender metadata cannot be spoofed | 3–4 |
| Semantic localized system entries | 5–6 |
| Departed-author dimming and live role recolour | 5–6 |
| Notification visibility/capacity/lifetime/pause | 8 |
| Real two-peer WebRTC verification | 10 |
