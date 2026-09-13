# Lobby bots — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development
> (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use
> checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bots are asked for in the lobby, with a slider beside the capacity one, and the roomless
solo session is deleted.

**Architecture:** The bot count becomes a third field of the lobby config, beside `maxPlayers` and
`setup`, travelling on the message that already carries those. It is a ceiling rather than a
roster: every reader derives `min(bots, capacity − humans)`, so arriving players push bots aside and
departing ones bring them back, and no seat is ever "held" by a bot. Real bot seats are minted once,
at Start, where the seating is already built and broadcast.

**Tech Stack:** TypeScript, React 19, Vite, Vitest + @testing-library/react (jsdom), pnpm
workspaces, Biome + Stylelint.

**Spec:** [`docs/specs/2026-09-13-lobby-bots-design.md`](./2026-09-13-lobby-bots-design.md)

## Global Constraints

- **Comments in English**, in full prose, explaining *why*. This repository holds them to an
  unusually high standard; match the voice of the file you are editing.
- **No string literals in `.tsx`** — every user-visible string through `t()`, and every key must
  exist in **both** `packages/translation/src/locales/en/common.json` and `…/ru/common.json`. A key
  in one only falls back silently.
- **All text renders through `<Typography>`** from `@release/ui`; colors are `var(--*)` design
  tokens only; spacing uses logical properties (`margin-block-start`, not `margin-top`).
- **`apps/frontend/src/network/` may never import i18next or `@release/translation`.** Bot display
  names are passed *into* it.
- **Capacity is 2–6** (`docs/rules/general.md:13`). Bots are **0–5**. Humans + bots ≤ capacity.
- **`effectiveBots(state) = max(0, min(state.bots, state.maxPlayers − playerCount(state)))`** — the
  single expression every reader uses.
- **`canStart`:** `playerCount + effectiveBots ≥ 2`, and every human player ready.
- **The bots slider's own max is a flat 5**, never `capacity − humans`: the stored number is what the
  host asked for, the seats show what the table can give.
- **The bots slider is not rendered for guests**, exactly as the capacity slider beside it already is.
- Run from the worktree root: `pnpm test`, `pnpm typecheck`, `pnpm lint`.
- A pre-commit hook runs lint-staged plus a full typecheck; each commit takes ~40 seconds.
- **Never use `git stash`** — the stash stack is shared with other checkouts of this repository and
  holds other people's entries. Use a temporary commit to set work aside.
- Commit messages in this repository's voice: a lowercase conventional-commit prefix, then a body
  explaining why rather than restating the diff. No attribution lines.
- Baseline before this plan: **1511 tests passing**.

## Precondition — discard the uncommitted `leaveGame` fix

The working tree carries an uncommitted fix to `leaveGame`'s `role: 'solo'` branch and its test. The
spec says to drop it: Task 6 deletes the branch it guards, so the bug it fixes stops existing. Before
Task 1:

```bash
git checkout -- apps/frontend/src/network/useLobby.ts apps/frontend/src/network/useLobby.test.ts
git status --short   # expect only the two new docs/specs files
```

## File Structure

**Modified**

| Path | Change |
|---|---|
| `apps/frontend/src/network/lobby/state.ts` | `LobbyState.bots`, `createLobbyState`, `applyConfig`, new `effectiveBots` |
| `apps/frontend/src/network/lobby/host.ts` | `MAX_BOTS`, `setBots`, `canStart` counts bots |
| `apps/frontend/src/network/types.ts` | `LOBBY_CONFIG_UPDATED` payload gains `bots`; wire `Seat` gains `bot` |
| `apps/frontend/src/entities/game/seats.ts` | new `botSeats` |
| `apps/frontend/src/network/useLobby.ts` | `setBots`; `startGame(botNames)` appends bot seats; deletions in Task 6 |
| `apps/frontend/src/features/start-game/useStartGame.ts` | builds bot names from the catalog |
| `apps/frontend/src/pages/board/[gameId]/index.tsx` | a bot seat is present, never disconnected |
| `apps/frontend/src/entities/game/stats/toStatPlayers.ts` | a bot seat reads as in-game |
| `apps/frontend/src/pages/lobby/_LobbyView.tsx` | the slider and the bot rows |
| `apps/ui/src/screens/Lobby/Lobby.tsx` | the same control in the kit |
| `packages/translation/src/locales/{en,ru}/common.json` | three keys added, two removed |

**Deleted in Task 6:** `network/transport/loopback.ts` (+ test), `network/session/solo.ts` (+ test),
`features/start-game/useStartSolo.ts` (+ test), and the in-file solo paths.

`apps/playground/stories/LobbyStory/LobbyStory.tsx` needs **no change**: it passes
`lobbyScreenCopy={{ ru: ruCommon.lobbyScreen, en: enCommon.lobbyScreen }}` wholesale, so new keys
reach it automatically.

---

### Task 1: The bot count, and the rules that read it

**Files:**
- Modify: `apps/frontend/src/network/lobby/state.ts`
- Modify: `apps/frontend/src/network/lobby/host.ts`
- Modify: `apps/frontend/src/network/types.ts` (the `LOBBY_CONFIG_UPDATED` payload only)
- Test: `apps/frontend/src/network/lobby/state.test.ts`, `apps/frontend/src/network/lobby/host.test.ts`

**Interfaces:**
- Consumes: nothing (first task).
- Produces: `LobbyState.bots: number`; `effectiveBots(state: LobbyState): number`;
  `MAX_BOTS = 5`; `setBots(state: LobbyState, bots: number): Result`; `canStart` counting bots;
  `applyConfig` accepting `{ bots?: number }`.

Nothing behaves differently until a caller sets `bots`, which is what makes this safe to land alone.

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/network/lobby/state.test.ts`. Build the fixture the way the file's
existing tests do — if they use a helper, reuse it; otherwise this literal works:

```ts
const table = (maxPlayers: number, bots: number, humans: number): LobbyState =>
  createLobbyState({
    selfId: 'h',
    hostId: 'h',
    maxPlayers,
    bots,
    peers: Array.from({ length: humans }, (_, i) => ({
      id: i === 0 ? 'h' : `p${i}`,
      clientId: `c${i}`,
      name: `P${i}`,
      role: i === 0 ? ('host' as const) : ('player' as const),
      ready: true,
      where: 'lobby' as const,
    })),
  })

it('defaults to no bots', () => {
  expect(table(6, 0, 1).bots).toBe(0)
})

// The ceiling, which is the whole displacement policy: people take the seats
// first, and the number says how many of whatever is left should be bots.
it('gives only the seats people have not taken', () => {
  expect(effectiveBots(table(6, 3, 1))).toBe(3)
  expect(effectiveBots(table(6, 3, 4))).toBe(2)
  expect(effectiveBots(table(6, 3, 6))).toBe(0)
})

// Asked-for is remembered, so a seat freed by someone leaving comes back as a
// bot without the host touching the slider.
it('remembers what was asked for when the table frees up again', () => {
  const full = table(6, 3, 6)
  expect(effectiveBots(full)).toBe(0)
  expect(effectiveBots({ ...full, peers: table(6, 3, 4).peers })).toBe(2)
})

it('never returns a negative count when capacity is below the people present', () => {
  expect(effectiveBots(table(2, 3, 4))).toBe(0)
})

it('carries bots through applyConfig', () => {
  expect(applyConfig(table(6, 0, 1), { bots: 2 }).bots).toBe(2)
  // An absent key leaves the field alone, exactly as maxPlayers and setup do.
  expect(applyConfig(table(6, 2, 1), { setup: {} }).bots).toBe(2)
})
```

Append to `apps/frontend/src/network/lobby/host.test.ts` (reuse that file's own fixture helper if it
has one):

```ts
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
```

Import `effectiveBots`, `createLobbyState`, `applyConfig` and `type LobbyState` in the state test,
and `setBots`, `MAX_BOTS`, `canStart` in the host test.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @release/web test -- lobby/state.test.ts lobby/host.test.ts
```

Expected: FAIL — `effectiveBots`/`setBots`/`MAX_BOTS` are not exported, and `bots` is not a known
property of the `createLobbyState` argument.

- [ ] **Step 3: Add the field and the derivation**

In `apps/frontend/src/network/lobby/state.ts`, add to `LobbyState` after `maxPlayers`:

```ts
  // How many bots the host has ASKED for — a ceiling, not a reservation. What
  // the table can actually seat is `effectiveBots` below, which shrinks as
  // people take the seats and grows back when they leave. Storing the request
  // rather than the outcome is what keeps a bot from ever costing a person a
  // seat, and what saves this from needing a displacement rule.
  bots: number
```

Give `createLobbyState` the same optional argument (`bots?: number`) and `bots: args.bots ?? 0` in
its return. Widen `applyConfig`'s patch to `{ maxPlayers?: number; setup?: Setup; bots?: number }`
and add the matching spread line:

```ts
    ...(patch.bots !== undefined && { bots: patch.bots }),
```

Then, directly under `playerCount`:

```ts
// What the table can actually seat, given who is in it. Every reader derives
// bots from this rather than storing which seats are bots — storing that is
// what would force a displacement rule when somebody joins, a kick rule for a
// thing that cannot be kicked, and a ready rule for a thing that is always
// ready. `Math.max(0, …)` covers a capacity lowered below the people already
// present, where the subtraction goes negative.
export function effectiveBots(state: LobbyState): number {
  return Math.max(0, Math.min(state.bots, state.maxPlayers - playerCount(state)))
}
```

- [ ] **Step 4: Add the host action and widen `canStart`**

In `apps/frontend/src/network/lobby/host.ts`, import `effectiveBots` alongside `playerCount`, and add
above `canStart`:

```ts
// The rules seat 2–6 (docs/rules/general.md:13), so one human and five bots is
// the largest table a lone host can ask for.
export const MAX_BOTS = 5

export function setBots(state: LobbyState, bots: number): Result {
  const clamped = Math.min(MAX_BOTS, Math.max(0, Math.trunc(bots)))
  return {
    state: applyConfig(state, { bots: clamped }),
    outgoing: [
      { to: 'broadcast', message: { type: 'LOBBY_CONFIG_UPDATED', payload: { bots: clamped } } },
    ],
  }
}
```

Replace `canStart`'s first line so bots count toward the two seats a match needs. Nothing about the
ready check changes — a bot has no readiness to report, and only people can hold up a start:

```ts
export function canStart(state: LobbyState): boolean {
  if (playerCount(state) + effectiveBots(state) < 2) return false
  return Object.values(state.peers)
    .filter((p) => p.role === 'host' || p.role === 'player')
    .every((p) => p.ready)
}
```

Finally, in `apps/frontend/src/network/types.ts`, widen the message payload:

```ts
  | { type: 'LOBBY_CONFIG_UPDATED'; payload: { maxPlayers?: number; setup?: Setup; bots?: number } }
```

The guest side needs nothing further: `useLobby`'s handler is already
`commit(applyConfig(current, msg.payload))`, so a broadcast bot count lands the same way a capacity
change does.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @release/web test -- lobby/state.test.ts lobby/host.test.ts
pnpm typecheck
```

Expected: PASS. `typecheck` will flag every `createLobbyState` call site that must now pass `bots`
— there are several in `useLobby.ts` and in tests. Give each `bots: 0`; a room starts with none.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/network/lobby apps/frontend/src/network/types.ts apps/frontend/src/network/useLobby.ts
git commit -m "feat(web): the lobby learns how many bots the host has asked for"
```

---

### Task 2: Setting the count, and seating bots when the match starts

**Files:**
- Modify: `apps/frontend/src/entities/game/seats.ts`
- Modify: `apps/frontend/src/network/useLobby.ts` (the `UseLobby` interface, a new `setBots`
  callback beside `setMaxPlayers` at ~line 1310, and `startGame`'s seating at ~line 1560)
- Modify: `apps/frontend/src/features/start-game/useStartGame.ts`
- Test: `apps/frontend/src/entities/game/seats.test.ts` (create if absent; append if present),
  `apps/frontend/src/network/useLobby.test.ts`

**Interfaces:**
- Consumes: `effectiveBots` and `MAX_BOTS` from Task 1.
- Produces: `botSeats(count: number, afterHumans: number, names: string[]): Seat[]`;
  `UseLobby.setBots(n: number): void`; `UseLobby.startGame(botNames: string[]): void`.

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/entities/game/seats.test.ts`:

```ts
import { botSeats, seatsFor } from './seats'

// Bot seats continue the same p1..pN sequence the humans are numbered in,
// because the engine seats a table, not two kinds of player.
it('numbers bot seats after the humans', () => {
  const seats = botSeats(2, 3, ['Бот 1', 'Бот 2'])
  expect(seats.map((s) => s.playerId)).toEqual(['p4', 'p5'])
  expect(seats.map((s) => s.name)).toEqual(['Бот 1', 'Бот 2'])
  expect(seats.every((s) => s.bot)).toBe(true)
})

// A bot holds no connection, so its ids exist only to be a stable key. They
// carry a colon so they can never collide with a PeerJS id, which is drawn
// from an alphabet that has none.
it('gives a bot an address nothing can dial', () => {
  const [seat] = botSeats(1, 1, ['Бот 1'])
  expect(seat.peerId).toContain(':')
  expect(seat.peerId).toBe(seat.clientId)
})

it('asks for no seats when no bots were asked for', () => {
  expect(botSeats(0, 2, [])).toEqual([])
})
```

Append to `apps/frontend/src/network/useLobby.test.ts`:

```ts
it('seats the asked-for bots after the humans when the match starts', async () => {
  const { result } = await hostWithGuest()
  act(() => {
    result.current.setBots(2)
  })
  act(() => {
    result.current.startGame(['Бот 1', 'Бот 2'])
  })

  const seats = result.current.seats
  expect(seats.map((s) => s.playerId)).toEqual(['p1', 'p2', 'p3', 'p4'])
  expect(seats.filter((s) => s.bot).map((s) => s.name)).toEqual(['Бот 1', 'Бот 2'])
  // The humans are untouched by the presence of bots.
  expect(seats.filter((s) => !s.bot)).toHaveLength(2)
})

it('seats nobody extra when no bots were asked for', async () => {
  const { result } = await hostWithGuest()
  act(() => {
    result.current.startGame([])
  })
  expect(result.current.seats.some((s) => s.bot)).toBe(false)
})
```

`hostWithGuest()` is this file's own helper (`useLobby.test.ts:471`): it renders the hook, creates a
room, and connects one guest — leaving a two-human lobby with the host ready.

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @release/web test -- seats.test.ts useLobby.test.ts
```

Expected: FAIL — `botSeats` is not exported, and `setBots` is not a function on the hook.

- [ ] **Step 3: Mint bot seats**

In `apps/frontend/src/entities/game/seats.ts`, below `seatsFor`:

```ts
// A bot's address. It holds no connection, so this exists only to be a stable
// key for the row and the seat — nothing is ever sent to it. The colon keeps it
// out of the PeerJS id space, whose alphabet has none, so a synthetic address
// can never collide with a real peer.
const botAddress = (n: number) => `bot:${n}`

// The seats the bots take, continuing the human numbering. `afterHumans` is how
// many seats the people already took, and `names` must hold exactly `count`
// entries: they are display copy and cannot be built here, because this module
// is below the i18n boundary (see useStartGame).
export function botSeats(count: number, afterHumans: number, names: string[]): Seat[] {
  return Array.from({ length: count }, (_, i) => ({
    playerId: seatId(afterHumans + i),
    peerId: botAddress(i + 1),
    clientId: botAddress(i + 1),
    name: names[i] ?? '',
    bot: true,
  }))
}
```

- [ ] **Step 4: Wire the hook**

In `apps/frontend/src/network/useLobby.ts`:

Add to the `UseLobby` interface, directly under `setMaxPlayers(n: number): void`:

```ts
  // How many of the free seats should be bots. A ceiling the table honours as
  // far as it fits — see `effectiveBots`.
  setBots(n: number): void
```

Change the interface's `startGame(): void` to:

```ts
  // `botNames` is display copy, so it arrives from the features layer rather
  // than being built here: `network/` may not import i18next.
  startGame(botNames: string[]): void
```

Add the callback immediately after `setMaxPlayers` (~line 1319), mirroring it exactly:

```ts
  const setBots = useCallback(
    (n: number) => {
      const current = stateRef.current
      if (!current || !isHostRef.current) return
      const r = setBotsFn(current, n)
      commit(r.state)
      dispatch(r.outgoing)
    },
    [commit, dispatch],
  )
```

importing it alongside the other host actions as `setBots as setBotsFn`, and `effectiveBots` from
`./lobby/state`.

In `startGame`, take the argument and append the seats:

```ts
  const startGame = useCallback(
    (botNames: string[]) => {
      const current = stateRef.current
      const t = transportRef.current
      if (!current || !t || !isHostRef.current) return
      matchSeqRef.current += 1
      const id = `${current.hostId}-${matchSeqRef.current}`

      const humans = seatsFor(current.peers)
      const mine = seatOf(humans, current.selfId)
      if (!mine) return
      // The ceiling resolved once, here, at the only moment it matters: from
      // now on this seating is frozen and broadcast, and nobody derives it again.
      const dealt = [...humans, ...botSeats(effectiveBots(current), humans.length, botNames)]
```

The rest of `startGame` is unchanged — `dealt` already flows into `createSession`, the start gate,
`GAME_STARTING` and `applySeats`. Two details that need no work but should be checked while you are
here: `createSession` maps each player through `{ playerId, peerId, name, bot }`, so pass
`bot: seat.bot` for the referee to flag the seat, and the gate must expect the **human** seats only
(`humans.map((s) => s.playerId)`) — a bot runs no opening and would hold the table for the full
intro cap.

Add `setBots` and the updated `startGame` to the returned object and to both dependency arrays.

- [ ] **Step 5: Build the names above the boundary**

In `apps/frontend/src/features/start-game/useStartGame.ts`:

```ts
import { useTranslation } from '@release/translation'
import { useSession } from '~/app/providers/SessionProvider'
import { effectiveBots } from '~/network'

// Host-start trigger. It broadcasts rather than navigating: the host used to
// walk to the board alone, leaving every guest behind in the lobby.
//
// The bot names are built HERE and handed down. `network/` may not import
// i18next, so the layer that owns the copy is the layer that supplies it.
export function useStartGame() {
  const session = useSession()
  const { t } = useTranslation()
  return () => {
    const bots = session.state ? effectiveBots(session.state) : 0
    session.startGame(Array.from({ length: bots }, (_, i) => t('lobbyScreen.botName', { n: i + 1 })))
  }
}
```

`effectiveBots` must be re-exported from `~/network`'s barrel (`apps/frontend/src/network/index.ts`)
for this import to resolve — add it there beside the existing `LobbyState` export. The copy key
itself lands in Task 4; until then `t` returns the key, which is harmless for the tests here.

- [ ] **Step 6: Run the tests to verify they pass**

```bash
pnpm --filter @release/web test -- seats.test.ts useLobby.test.ts
pnpm typecheck
```

Expected: PASS. `typecheck` will flag every other `startGame()` call — `_LobbyView.tsx` goes through
`useStartGame`, so the only remaining callers should be tests; give them `[]`.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/entities/game apps/frontend/src/network apps/frontend/src/features/start-game
git commit -m "feat(web): the asked-for bots take the seats nobody claimed"
```

---

### Task 3: A bot seat is present, not missing

**Files:**
- Modify: `apps/frontend/src/network/types.ts` (the `Seat` interface)
- Modify: `apps/frontend/src/pages/board/[gameId]/index.tsx` (~lines 62-77)
- Modify: `apps/frontend/src/entities/game/stats/toStatPlayers.ts`
- Test: `apps/frontend/src/entities/game/stats/toStatPlayers.test.ts` (append; create if absent),
  `apps/frontend/src/pages/board/[gameId]/__tests__/` (the board's existing page test file)

**Interfaces:**
- Consumes: `botSeats` from Task 2, which already sets `bot: true`.
- Produces: `Seat.bot?: boolean` on the wire.

The board decides who is at the table by looking each seat up in the roster. A bot is in no roster,
so without this it renders as a player who has dropped, and the results screen calls it offline.

- [ ] **Step 1: Write the failing tests**

In `apps/frontend/src/entities/game/stats/toStatPlayers.test.ts`:

```ts
// A bot is in no roster, and absence is how this module spells "offline" —
// so without the check a bot would be reported as a player who left.
it('reports a bot seat as being in the game, not offline', () => {
  const rows = toStatPlayers({
    tally: {},
    seats: [
      { playerId: 'p1', peerId: 'peer-a', clientId: 'c-a', name: 'Ann' },
      { playerId: 'p2', peerId: 'bot:1', clientId: 'bot:1', name: 'Бот 1', bot: true },
    ],
    peers: {
      'peer-a': {
        id: 'peer-a',
        clientId: 'c-a',
        name: 'Ann',
        role: 'host',
        ready: true,
        where: 'stats',
      },
    },
  })
  expect(rows.map((r) => r.location)).toEqual(['stats', 'game'])
  expect(rows[1].name).toBe('Бот 1')
})
```

And in `apps/frontend/src/pages/board/[gameId]/__tests__/boardPresence.test.tsx`, which already owns
this question — its neighbour asserts a dropped player *does* wear the marker, so this is the same
assertion negated. It uses that file's own `session()` fixture and `renderBoardWith()` helper:

```tsx
// A bot holds no connection, and absence is how this board spells "dropped" —
// so without the check a bot would wear the offline marker for the whole match.
it('never marks a bot seat offline', async () => {
  sessionValue = session({
    seats: [
      { playerId: 'p1', peerId: 'me', clientId: 'c-me', name: 'Ann' },
      { playerId: 'p2', peerId: 'bot:1', clientId: 'bot:1', name: 'Бот 1', bot: true },
    ],
    state: {
      selfId: 'me',
      hostId: 'me',
      maxPlayers: 6,
      bots: 1,
      setup: {},
      peers: {
        me: { id: 'me', clientId: 'c-me', name: 'Ann', role: 'host', ready: true, where: 'game' },
      },
    },
  })
  renderBoardWith()

  expect(await screen.findByText('Бот 1')).toBeTruthy()
  expect(screen.queryByText(/^(offline|нет связи)$/i)).toBeNull()
})
```

- [ ] **Step 2: Run the tests to verify they fail**

```bash
pnpm --filter @release/web test -- toStatPlayers.test.ts
```

Expected: FAIL — `location` comes back `'offline'` for the bot row, and `bot` is not a known
property of `Seat`.

- [ ] **Step 3: Put `bot` on the wire and teach the three readers**

In `apps/frontend/src/network/types.ts`, add to `Seat`:

```ts
  // A seat the engine plays itself. It holds no connection, so every reader
  // that treats "no peer in the roster" as "this player dropped" has to know
  // the difference — the board's presence and disconnected lists, and the
  // results screen's whereabouts. It rides GAME_STARTING with the rest of the
  // seating, so every peer learns it at the same moment.
  bot?: boolean
```

In `apps/frontend/src/pages/board/[gameId]/index.tsx`:

```ts
  const participants = seats.map((seat) => {
    const live = peerMap[seat.peerId]
    return {
      id: seat.peerId,
      name: live?.name ?? seat.name,
      // A bot is always here: it has no connection to lose.
      connected: Boolean(live) || Boolean(seat.bot),
    }
  })

  const disconnected = seats
    .filter((s) => !s.bot && !peerMap[s.peerId])
    .map((s) => s.playerId)
```

In `apps/frontend/src/entities/game/stats/toStatPlayers.ts`:

```ts
      // Absence IS the offline signal — nobody announces their own
      // disconnection, so `where` has no such member to read. A bot is the one
      // seat that is absent from the roster without having gone anywhere.
      location: seat.bot ? 'game' : (peer?.where ?? 'offline'),
```

- [ ] **Step 4: Run the tests to verify they pass**

```bash
pnpm --filter @release/web test
pnpm typecheck
```

Expected: PASS, with the whole frontend suite green — these three readers are on the board's hot path.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/network/types.ts apps/frontend/src/pages/board apps/frontend/src/entities/game/stats
git commit -m "feat(web): a bot seat is present at the table, not missing from it"
```

---

### Task 4: The slider, and the rows it fills

**Files:**
- Modify: `apps/frontend/src/pages/lobby/_LobbyView.tsx`
- Modify: `packages/translation/src/locales/en/common.json`,
  `packages/translation/src/locales/ru/common.json`
- Test: `apps/frontend/src/pages/lobby/__tests__/` (the existing lobby page test file)

**Interfaces:**
- Consumes: `UseLobby.setBots` (Task 2), `effectiveBots` (Task 1).
- Produces: nothing further.

After this task the feature is usable end to end.

- [ ] **Step 1: Add the copy**

In `packages/translation/src/locales/en/common.json`, inside `lobbyScreen`, after `"capacity"`:

```json
    "bots": "Bots",
    "botName": "Bot {{n}}",
    "roleBot": "bot",
```

The same keys in `packages/translation/src/locales/ru/common.json`:

```json
    "bots": "Ботов",
    "botName": "Бот {{n}}",
    "roleBot": "бот",
```

- [ ] **Step 2: Write the failing test**

Append to the lobby page's existing test file, following its setup for a host and for a guest:

This file's `t` mock **echoes the key and ignores interpolation**, so every bot row renders the same
string `lobbyScreen.botName`. Count them with `getAllByText` rather than reaching for a per-bot
label that the mock cannot produce. It builds a session with its own `inSession()` helper and
renders through `renderInRouter`:

```tsx
it('lets the host ask for bots and shows them in the free seats', () => {
  const session = inSession()
  sessionValue = {
    ...session,
    isHost: true,
    state: { ...session.state!, maxPlayers: 6, bots: 2 },
  }
  renderInRouter(<LobbyView />)

  expect(screen.getByText('lobbyScreen.bots')).toBeTruthy()
  // Two bot rows: one per bot the host asked for.
  expect(screen.getAllByText('lobbyScreen.botName')).toHaveLength(2)
})

// The slider is the host's, exactly as the capacity slider beside it is. A
// guest still sees the bots — in the rows.
it('hides the bots slider from a guest but not the bots', () => {
  const session = inSession()
  sessionValue = {
    ...session,
    isHost: false,
    state: { ...session.state!, maxPlayers: 6, bots: 1 },
  }
  renderInRouter(<LobbyView />)

  expect(screen.queryByText('lobbyScreen.bots')).toBeNull()
  expect(screen.getAllByText('lobbyScreen.botName')).toHaveLength(1)
})
```

Check how many humans `inSession()` seats before asserting the counts: bots are capped at
`capacity − humans`, so with capacity 6 and two humans already in that fixture, asking for 2 gives 2.

- [ ] **Step 3: Run the test to verify it fails**

```bash
pnpm --filter @release/web test -- lobby
```

Expected: FAIL — no bots control and no bot rows are rendered.

- [ ] **Step 4: Render the slider and the rows**

In `apps/frontend/src/pages/lobby/_LobbyView.tsx`, import `effectiveBots` from `~/network` and add
beside the existing `capacity` binding:

```tsx
  const bots = effectiveBots(state)
```

Change the players count so the header describes the table that will be dealt rather than only its
people:

```tsx
                {players.length + bots} / {capacity}
```

Add the slider directly after the capacity one, inside the same `{isHost && …}` region or as its own
identical guard:

```tsx
            {isHost && (
              <Slider
                className={styles.capRow}
                label={t('lobbyScreen.bots')}
                value={state.bots}
                min={0}
                max={MAX_BOTS}
                onChange={session.setBots}
              />
            )}
```

Note it binds `state.bots`, the raw asked-for number, not `bots` — the control shows what was asked
for while the rows show what the table can give. Import `MAX_BOTS` from `~/network`, re-exporting it
from the network barrel beside `effectiveBots` if it is not already there.

Then put the bots between the people and the empty slots:

```tsx
  const slots: { key: string; peer: PeerInfo | null; bot?: number }[] = [
    ...players.map((p) => ({ key: p.id, peer: p })),
    ...Array.from({ length: bots }, (_, i) => ({ key: `bot-${i}`, peer: null, bot: i + 1 })),
    ...Array.from({ length: Math.max(0, capacity - players.length - bots) }, (_, j) => ({
      key: `empty-${players.length + bots + j}`,
      peer: null as PeerInfo | null,
    })),
  ]
```

and render the bot case in the existing `slots.map`, between the player branch and the `EmptySlot`
fallback:

```tsx
                ) : slot.bot ? (
                  <PlayerSlot
                    key={key}
                    name={t('lobbyScreen.botName', { n: slot.bot })}
                    badge={
                      <Badge tone="muted" size="sm" outlined>
                        {t('lobbyScreen.roleBot')}
                      </Badge>
                    }
                    status={<Badge tone="success">{t('lobbyScreen.ready')}</Badge>}
                  />
                ) : (
```

No dropdown: a bot cannot be kicked, only counted down. You will need to destructure `bot` from the
mapped slot alongside `key` and `peer`.

- [ ] **Step 5: Run the tests to verify they pass**

```bash
pnpm --filter @release/web test
pnpm typecheck
pnpm lint
```

Expected: PASS.

- [ ] **Step 6: Play it**

Run `pnpm dev`, create a game, and in the lobby drag BOTS to 2. Expect two bot rows in the free
seats, the count to read `3 / 6`, and START to become available with you alone plus bots. Start it
and confirm the bots take their turns. This is the first point at which the new flow is real; do not
move on if it is not.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/pages/lobby packages/translation/src/locales
git commit -m "feat(web): the lobby asks how many of the free seats should be bots"
```

---

### Task 5: The same control in the kit

**Files:**
- Modify: `apps/ui/src/screens/Lobby/Lobby.tsx`

**Interfaces:**
- Consumes: nothing from earlier tasks — the kit screen is standalone and holds its own state.
- Produces: `LobbyCopy.bots`, `LobbyCopy.botName`, `LobbyCopy.roleBot`.

`apps/ui/src/screens/` is this repository's visual source of truth, and the frontend lobby is a
re-implementation of it. A control that exists in one and not the other is exactly the drift that
rule exists to prevent.

- [ ] **Step 1: Add the copy fields**

In the `LobbyCopy` interface, after `capacity: string`:

```ts
  bots: string
  // Interpolated with the bot's number, the way the frontend's catalog does it.
  botName: string
  roleBot: string
```

`LobbyStory` passes `lobbyScreen` from the translation catalogs wholesale, so the keys added in
Task 4 already satisfy this — no story change is needed.

- [ ] **Step 2: Hold the count**

Beside `const [capacity, setCapacity] = useState(initialCapacity)`:

```ts
  const [bots, setBots] = useState(0)
```

and, next to the screen's existing `playersFull`/`minCapacity` derivations:

```ts
  // The same ceiling the app applies: people take the seats first, and the
  // number says how many of whatever is left should be bots.
  const shownBots = Math.max(0, Math.min(bots, capacity - players.length))
```

- [ ] **Step 3: Render it**

Add a `Slider` immediately after the capacity one, with the same `className={styles.capRow}`,
`label={copy.bots}`, `value={bots}`, `min={0}`, `max={5}`, `onChange={setBots}`, inside the same
`{isHost && …}` guard.

The screen currently builds its column as `const slots: (Player | null)[] = [...players]` followed by
`while (slots.length < capacity) slots.push(null)`. Widen that to carry a bot's number, so the three
kinds of row stay distinguishable:

```tsx
  // A row is a player, a bot (carrying its number), or an empty seat.
  const slots: (Player | { bot: number } | null)[] = [
    ...players,
    ...Array.from({ length: shownBots }, (_, i) => ({ bot: i + 1 })),
  ]
  while (slots.length < capacity) slots.push(null)
```

and in the render, between the player branch and the `EmptySlot` fallback:

```tsx
            ) : slot && 'bot' in slot ? (
              <PlayerSlot
                key={`bot-${slot.bot}`}
                name={copy.botName.replace('{{n}}', String(slot.bot))}
                badge={
                  <Badge tone="muted" size="sm" outlined>
                    {copy.roleBot}
                  </Badge>
                }
                status={<Badge tone="success">{copy.ready}</Badge>}
              />
            ) : (
```

`copy.botName` is interpolated by hand here because `@release/ui` is i18n-agnostic: it receives copy
as props and has no `t` to call.

- [ ] **Step 4: Verify**

```bash
pnpm --filter @release/ui test
pnpm typecheck
pnpm lint
```

Then `pnpm dev:playground`, open the Lobby story, and drag the new slider: bot rows should appear in
the free seats and give way as you add players.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/screens/Lobby
git commit -m "ui(lobby): the reference screen gains the bots the app now offers"
```

---

### Task 6: Delete the roomless path

**Files:**
- Delete: `apps/frontend/src/network/transport/loopback.ts`, `loopback.test.ts`,
  `apps/frontend/src/network/session/solo.ts`, `solo.test.ts`,
  `apps/frontend/src/features/start-game/useStartSolo.ts`, `useStartSolo.test.ts`
- Rename + rewrite: `apps/frontend/src/network/session/soloPlay.test.ts` → `botPlay.test.ts`
- Modify: `apps/frontend/src/network/useLobby.ts`, `apps/frontend/src/shared/lib/persistence.ts`,
  `apps/frontend/src/shared/ui/Form.tsx`, `apps/frontend/src/shared/ui/Form.test.tsx`,
  `apps/frontend/src/pages/start.tsx`,
  `apps/frontend/src/features/create-lobby/CreateLobbyForm.tsx` (+ its `.module.css` and test),
  `packages/translation/src/locales/{en,ru}/common.json`

**Interfaces:**
- Consumes: everything from Tasks 1-4, which is what makes this deletable.
- Produces: nothing. `UseLobby` loses `startSolo`; `StoredSession` loses `role: 'solo'` and its
  nullable `roomCode`.

- [ ] **Step 1: Keep the coverage that is worth keeping**

`soloPlay.test.ts` is the only test that drives bots through a real keeper end to end, and that
coverage is still worth having once its subject is gone. Rename it to
`apps/frontend/src/network/session/botPlay.test.ts` and replace only its setup — all three
assertions stay exactly as they are (the gate holds bots until the human's intro reports; a bot seat
takes its turn and hands it back; no hand is ever projected to a seat nobody holds).

The setup currently goes through `buildSoloTable` and `createLoopbackTransport`, both deleted in this
task. Build the session directly instead, the way `referee.test.ts` already does:

```ts
function botGame(botCount: number) {
  const engine = createFakeEngine()
  const { session } = createSession({
    gameId: 'g1',
    keeperId: 'p1',
    engine,
    seed: 17,
    players: [
      { playerId: 'p1', peerId: 'peer-me', name: 'Ann' },
      ...Array.from({ length: botCount }, (_, i) => ({
        playerId: `p${i + 2}`,
        peerId: null,
        name: `Бот ${i + 1}`,
        bot: true,
      })),
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const ref: SessionRef = { current: session }
  const gate = createStartGate({ expect: ['p1'] })
  const ticker = manualTicker()
  const keeper = attachKeeper({ ref, transport: fakeTransport(), now: () => Date.now(), ticker, gate })
  return { ref, gate, ticker, keeper }
}
```

`fakeTransport()` stands for the same minimal transport double `remoteLink.test.ts` builds — reuse
that file's, rather than writing a third one. Keep seed 17: its comment records that it was chosen
by running the suite, and a different seed may open the match with a trigger that stops the turn
from reaching the bot.

- [ ] **Step 2: Delete the files**

```bash
git rm apps/frontend/src/network/transport/loopback.ts apps/frontend/src/network/transport/loopback.test.ts
git rm apps/frontend/src/network/session/solo.ts apps/frontend/src/network/session/solo.test.ts
git rm apps/frontend/src/features/start-game/useStartSolo.ts apps/frontend/src/features/start-game/useStartSolo.test.ts
```

- [ ] **Step 3: Remove the in-file paths**

In `apps/frontend/src/network/useLobby.ts`: delete `startSolo` and `restoreSolo` entirely, their
entries in the `UseLobby` interface, the returned object and both dependency arrays, the
`if (restoreSolo()) return` line in the mount effect, and `leaveGame`'s `role === 'solo'` branch so
it reads simply `rememberGame(null)` again. Delete the now-unused imports.

In `apps/frontend/src/shared/lib/persistence.ts`: `StoredSession.role` goes back to
`'host' | 'guest'` and `roomCode` back to `string`. `typecheck` will then point at the two
nullability guards that change forced — in `restoreHost` and `runGuestReconnect` — which go too.

In `apps/frontend/src/pages/start.tsx`: delete the second `MenuButton` and the `role === 'solo'`
branch in `resume()`.

In `apps/frontend/src/features/create-lobby/CreateLobbyForm.tsx`: delete the bots `Slider`, the
second submit, the `intent` branch in `onSubmit`, the `bots` state and the `useStartSolo` import, so
the form is the single-submit form it was. Remove `.botsRow` from its module CSS and the solo test
from its test file.

In `apps/frontend/src/shared/ui/Form.tsx`: revert the submitter merge to
`onSubmit(Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>)`, and delete
the two submitter tests from `Form.test.tsx`. With one submit button there is nothing to tell apart,
and the Safari 15 defect that merge fixed cannot occur.

In both locale files: delete `start.soloCta` and `start.soloNote`, and delete `start.botsLabel` and
`start.botName` — the lobby's own `lobbyScreen.bots`/`botName` replaced them in Task 4.

- [ ] **Step 4: Verify nothing references the deleted world**

```bash
grep -rn "startSolo\|restoreSolo\|buildSoloTable\|createLoopbackTransport\|SOLO_PEER_ID\|'solo'" apps/frontend/src packages/translation/src
```

Expected: no matches outside comments that describe history. Then:

```bash
pnpm test
pnpm typecheck
pnpm lint
```

Expected: PASS, with the suite smaller than the 1511 baseline by the deleted tests and larger by the
ones added in Tasks 1-4.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor(web): one front door for bots, and the roomless one goes"
```

---

### Task 7: Say that the old design was superseded

**Files:**
- Modify: `docs/specs/2026-09-09-solo-bot-mode-design.md`

A committed design describing a flow the code no longer has is the documentation equivalent of a
comment that outlived its fact.

- [ ] **Step 1: Add the banner**

Directly under that document's header block, add:

```markdown
> **Superseded in part, 2026-09-13.** Decisions 1, 3, 4 and 5 — the roomless session, its synthetic
> roster, the start-screen entry and the create-form control — were replaced by
> [`2026-09-13-lobby-bots-design.md`](./2026-09-13-lobby-bots-design.md), which asks for bots in the
> lobby instead. The rest of this document still describes the shipped code: `Seat.bot`, the
> `driveUnattended` driver, `restoreSeats`' bot branch, the stall warning, and the open pacing
> question in decision 8.
```

- [ ] **Step 2: Commit**

```bash
git add docs/specs/2026-09-09-solo-bot-mode-design.md
git commit -m "docs(specs): mark the roomless solo decisions superseded"
```

---

## Done when

- `pnpm test`, `pnpm typecheck` and `pnpm lint` pass from the worktree root.
- Creating a game, setting BOTS in the lobby, and starting deals a table of people plus bots, and
  the bots play.
- A guest sees the bot rows and no bots slider.
- Nothing in the tree refers to a roomless solo session.

## Still open after this plan

**Pacing.** The keeper commits a bot action every 250ms while the board animates a beat over roughly
1–4s, so a bot-heavy round can consume a human's 30s turn before their board shows it. Putting bots
in a room makes this everyone's problem rather than one player's. The design and the three candidate
fixes are in the earlier spec's decision 8; the ticker interval is not the lever, because it also
drives the window deadline and the absence grace.

**The `driveAbsent` rename still collides with `feat/108-git-cards`,** which adds a test calling the
old name. The branches merge cleanly as text and then fail to typecheck; whichever lands second
renames that one call.
