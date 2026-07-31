# Table Interaction Surface and Page Wiring — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `Table` interactive and render `/board/:gameId` from real `@release/engine` state.

**Architecture:** `Table` stays one component the playground and the page both render. Its 32 flat props regroup into `state` / `actions` / `copy` / `room` / `panel` / `slots` by who owns the data. Gesture state lives in a kit hook (`useTableInteractions`) and emits completed intents only; the frontend owns domain state (`useGame`), the adapters (`toTableState`, `toAction`), and routing.

**Tech Stack:** TypeScript, React 19, CSS Modules, Vitest + @testing-library/react, pnpm workspaces, Vite source aliases.

**Spec:** [`2026-07-31-table-interaction-design.md`](./2026-07-31-table-interaction-design.md)

## Global Constraints

- **No string literals in `.tsx`.** All user-visible text goes through `t()` in `@release/web`, or arrives as a `copy` prop in `@release/ui`. `@release/ui` never imports i18next.
- **`@release/ui` imports nothing from `@release/engine`.** Action types are mirrored structurally (Decision 7). The seam is proven at compile time in `apps/frontend/src/entities/game/`.
- **`@release/ui` never calls `Date.now()` or `Math.random()`.** Time arrives on the action; the kit reports deadline crossings through a callback (Decision 8).
- **All text through `<Typography>`** (semantic `variant`, or raw `base` + `tk`). No hand-written font declarations, no `composes` from the typography scale.
- **Colors from design tokens only** — `var(--*)` from `apps/ui/src/design/tokens.css`. Never a raw `#hex`, `rgb()` or named color. Missing a color → add the token first.
- **Spacing uses logical properties** (`padding-inline`, `margin-block-start`) — stylelint enforces this.
- **Code comments in English.** Existing Russian comments are legacy; do not add new ones.
- **Translation keys must exist in both `en` and `ru`** (`packages/translation/src/locales/*/common.json`). A key present in one only silently falls back.
- **Page tests live in `__tests__/`**, never beside the page — generouted eagerly imports every non-`_` module under `pages/`.
- **Every new test is verified by mutation.** Break the code the test names, confirm it goes red, restore. A test that passes against broken code is a plan failure, not a passing test.

**Verification commands** (run from the repo root):

```bash
pnpm typecheck && pnpm lint && pnpm test
```

---

# Milestone 1 — Prop regrouping (no behaviour change)

Milestone 1 is deliberately a no-op refactor so it reviews as one. Every task here ends with the playground and the board page rendering exactly what they rendered before.

### Task 1: Extract grouped types and fold `copy` + `room`

**Files:**
- Create: `apps/ui/src/table/Table/types.ts`
- Modify: `apps/ui/src/table/Table/Table.tsx` (props interface + destructure + usages)
- Modify: `apps/ui/src/index.ts:98-101` (Table exports)
- Modify: `apps/playground/stories/TableStory/TableStory.tsx:196-232` (the `<Table>` call)
- Modify: `apps/frontend/src/pages/board/[gameId]/_layout.tsx`
- Test: `apps/ui/src/table/Table/Table.test.tsx`

**Interfaces:**
- Produces: `TableState`, `TableRoom`, `TableCopyBundle`, `TableSlots`, `Panel`, `TableProps` from `apps/ui/src/table/Table/types.ts`. Task 2 adds `panel`/`onPanelChange` to `TableProps`; Task 3 adds `eliminated` and `connection`; Task 5 adds `TableActions`.

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/table/Table/Table.test.tsx`. This is the first test for `Table`, so it also establishes the fixture other tasks reuse.

```tsx
import { render } from '@testing-library/react'
import Table from './Table'
import { makeTableProps } from './testFixture'

it('renders the local player name and every opponent seat', () => {
  const props = makeTableProps()
  const { getByText } = render(<Table {...props} />)
  expect(getByText('kernel_panic')).toBeTruthy()
})

it('reads participants and spectators from room, not state', () => {
  const props = makeTableProps()
  // A spectator present in `room` must reach Participants; nothing about the
  // engine-fed `state` should carry it.
  expect('spectators' in props.state).toBe(false)
  expect(props.room.spectators.length).toBeGreaterThan(0)
})
```

- [ ] **Step 2: Create the shared test fixture**

Create `apps/ui/src/table/Table/testFixture.ts`. It builds a full props object from the existing mock so each test overrides only what it asserts on.

```ts
import enCommon from '@release/translation/locales/en/common.json'
import { makeTable } from '@/mocks/table'
import type { TableProps } from './types'

// Full, valid props for Table. Tests override only the slice they assert on:
//   makeTableProps({ room: { ...base.room, role: 'guest' } })
export function makeTableProps(over: Partial<TableProps> = {}): TableProps {
  const mock = makeTable(3)
  return {
    state: {
      you: mock.you,
      opponents: mock.opponents,
      decks: mock.decks,
      turn: mock.turn,
      history: mock.history,
      setup: mock.setup,
    },
    room: {
      role: 'host',
      code: '4F2A-9K',
      participants: mock.participants,
      spectators: mock.spectators,
    },
    copy: {
      table: enCommon.table,
      modes: enCommon.gameModes,
      rules: enCommon.rulesBlock,
      seat: enCommon.seat,
      participants: enCommon.participants,
      history: enCommon.moveHistory,
      reconnect: enCommon.reconnect,
      gameOver: enCommon.gameOver,
      lobbyCode: enCommon.lobbyCode,
      turnDock: enCommon.turnDock,
    },
    ...over,
  } as TableProps
}
```

`apps/ui/vitest.config.ts` aliases only `@`. Add `@release/translation` so the fixture can read the real catalog:

```ts
resolve: {
  alias: {
    '@': new URL('./src', import.meta.url).pathname,
    '@release/translation': new URL('../../packages/translation/src', import.meta.url).pathname,
  },
},
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @release/ui test -- Table.test.tsx`
Expected: FAIL — `types.ts` does not exist, `TableProps` has no `room`.

- [ ] **Step 4: Write `types.ts`**

```ts
import type { SwitchLang } from '@/blocks/LangSwitcher'
import type { LobbyCodeCopy } from '@/blocks/LobbyCode'
import type { RulesCopy } from '@/blocks/Rules'
import type { Card } from '@/cards/types'
import type { GameModesCopy, Setup } from '@/game/modes'
import type { GameOverCopy } from '@/table/GameOver/GameOver'
import type { HandItem } from '@/table/Hand/Hand'
import type { HistoryEntry, MoveHistoryCopy } from '@/table/MoveHistory/MoveHistory'
import type { PauseGameCopy, PausePlayer } from '@/table/PauseGame/PauseGame'
import type { Participant, ParticipantsCopy, Spectator } from '@/table/Participants/Participants'
import type { ReconnectCopy } from '@/table/Reconnect'
import type { ReleaseSlots } from '@/table/ReleaseZone/ReleaseZone'
import type { SeatCopy } from '@/table/Seat/Seat'
import type { TurnDockCopy, TurnDockState } from '@/table/TurnDock/TurnDock'
import type { ReactNode } from 'react'

export type Panel = 'settings' | 'history' | 'participants' | 'rules' | 'modes'

export interface TableOpponent {
  id: string
  name: string
  handCount: number
  release: ReleaseSlots
}

// Everything the engine's projection can answer. Assembled by the consumer's
// adapter; nothing here is room- or session-shaped.
export interface TableState {
  you: {
    name: string
    hand: HandItem[]
    release: ReleaseSlots
  }
  opponents: TableOpponent[]
  decks: {
    main: number
    events: number
    discard?: Card | null
    discardCount: number
  }
  turn?: string
  history: HistoryEntry[]
  setup: Setup
}

// Everything the session/P2P layer answers. The engine has no concept of a
// spectator, a room code, or a pause.
export interface TableRoom {
  role?: 'host' | 'guest'
  code?: string
  participants: Participant[]
  spectators: Spectator[]
  spectatorLimit?: number
  onSpectatorLimitChange?: (n: number) => void
  onKickSpectator?: (id: string) => void
  lang?: SwitchLang
  onLangChange?: (lang: SwitchLang) => void
  paused?: boolean
  onPauseChange?: (on: boolean) => void
  pausePlayers?: PausePlayer[]
  pauseSelfId?: string
  pauseHostId?: string
  onPauseToggleReady?: () => void
}

// `TableChromeCopy` is the interface currently named `TableCopy` inside
// Table.tsx — Step 5 moves it into this file under the new name. It is the
// table's own chrome strings (deck/discard labels, tab labels, pause labels),
// not the bundle.
export interface TableCopyBundle {
  table: TableChromeCopy
  modes: GameModesCopy
  rules: RulesCopy
  seat: SeatCopy
  participants: ParticipantsCopy
  history: MoveHistoryCopy
  reconnect: ReconnectCopy
  gameOver: GameOverCopy
  lobbyCode: LobbyCodeCopy
  turnDock: TurnDockCopy
  pause?: PauseGameCopy
}

export interface TableSlots {
  // App-only chrome the playground has no equivalent of: navigation out of the
  // match, and the consumer's non-fatal error notice.
  corner?: ReactNode
  banner?: ReactNode
}

export interface TableOver {
  winnerId: string
  condition?: 'release' | 'lastStanding'
}

export interface TableProps {
  state: TableState
  room: TableRoom
  copy: TableCopyBundle
  slots?: TableSlots
  over?: TableOver | null
  onOverContinue?: () => void
  view?: ViewState | null
  turnDockState?: TurnDockState
  turnDockDanger?: boolean
  turnDockSeconds?: number
  turnDockProgress?: number
}

// Retired in Task 3 — kept here so Task 1 stays a pure regrouping.
export type ViewState = 'oppEliminated' | 'youEliminated' | 'oppDisconnect' | 'youDisconnect'
```

Move the existing `TableCopy` interface out of `Table.tsx` into `types.ts`, renamed `TableChromeCopy` (it is the table's own chrome strings — deck/discard labels, tab labels — not the bundle). Re-export it under the old name from `apps/ui/src/index.ts` so no consumer breaks:

```ts
export type { TableChromeCopy as TableCopy } from './table/Table/types'
export type { TableProps, TableRoom, TableState, TableCopyBundle, TableSlots } from './table/Table/types'
```

- [ ] **Step 5: Rewrite `Table.tsx`'s signature**

Replace the 32-prop destructure with:

```tsx
export default function Table({
  state,
  room,
  copy,
  slots,
  over = null,
  onOverContinue,
  view = null,
  turnDockState = 'push',
  turnDockDanger = false,
  turnDockSeconds = 16,
  turnDockProgress = 0.55,
}: TableProps) {
  const { you, opponents, decks, turn, history, setup } = state
  const {
    role = 'guest',
    code,
    participants,
    spectators,
    spectatorLimit,
    onSpectatorLimitChange,
    onKickSpectator,
    lang,
    onLangChange,
    paused = false,
    onPauseChange,
    pausePlayers = [],
    pauseSelfId,
    pauseHostId,
    onPauseToggleReady,
  } = room
```

Then rename copy references throughout the body — this is mechanical and exhaustive:

| Before | After |
|---|---|
| `copy.*` (deck, discard, tab labels, pause labels) | `copy.table.*` |
| `modesCopy` | `copy.modes` |
| `rulesCopy` | `copy.rules` |
| `seatCopy` | `copy.seat` |
| `participantsCopy` | `copy.participants` |
| `historyCopy` | `copy.history` |
| `reconnectCopy` | `copy.reconnect` |
| `gameOverCopy` | `copy.gameOver` |
| `lobbyCodeCopy` / `codeCopy` | `copy.lobbyCode` |
| `turnDockCopy` / `turnCopy` | `copy.turnDock` |
| `pauseCopy` | `copy.pause` |

Delete the now-pointless local aliases `const codeCopy = lobbyCodeCopy` and `const turnCopy = turnDockCopy`. `canPause` becomes `isHost && Boolean(onPauseChange) && Boolean(copy.table.pauseGame)`.

Render `slots` inside the root `<div className={styles.table}>`, after `<HudBackground>`:

```tsx
{slots?.banner}
{slots?.corner}
```

Add the two positions to `Table.module.css` using existing tokens and logical properties:

```css
.banner {
  position: absolute;
  inset-block-start: 16px;
  inset-inline: 0;
  z-index: 5;
  display: flex;
  justify-content: center;
  pointer-events: none;
}

.corner {
  position: absolute;
  inset-block-start: 16px;
  inset-inline-start: 16px;
  z-index: 5;
}
```

Wrap each slot in its class: `<div className={styles.banner}>{slots.banner}</div>`.

- [ ] **Step 6: Update both consumers**

`TableStory.tsx` — replace the flat props on `<Table>` with the groups. `state` drops `participants` / `spectators`; they move to `room` alongside `role`, `code`, `specLimit`, the kick handler, `lang`, and the whole pause block.

`_layout.tsx` — `PLACEHOLDER_STATE` loses `participants` and `spectators`, and the nine `t('…')` calls fold into one `copy` object:

```tsx
<Table
  state={PLACEHOLDER_STATE}
  room={{ participants: [], spectators: [] }}
  copy={{
    table: t('table', { returnObjects: true }),
    modes: t('gameModes', { returnObjects: true }),
    rules: t('rulesBlock', { returnObjects: true }),
    seat: t('seat', { returnObjects: true }),
    participants: t('participants', { returnObjects: true }),
    history: t('moveHistory', { returnObjects: true }),
    reconnect: t('reconnect', { returnObjects: true }),
    gameOver: t('gameOver', { returnObjects: true }),
    lobbyCode: t('lobbyCode', { returnObjects: true }),
    turnDock: t('turnDock', { returnObjects: true }),
  }}
/>
```

- [ ] **Step 7: Run the full suite**

Run: `pnpm typecheck && pnpm --filter @release/ui test && pnpm --filter @release/web test`
Expected: PASS. Typecheck is the real gate here — it catches every missed rename.

- [ ] **Step 8: Verify the test by mutation**

Change `room.spectators` to be read from `state` in `Table.tsx`. Confirm `Table.test.tsx` goes red. Restore.

- [ ] **Step 9: Visual check**

Run: `pnpm dev:playground`, open `/table`. Compare against `main`: seats, decks, discard, dock, rail, every drawer panel, pause window, game-over overlay. Nothing should differ.

- [ ] **Step 10: Commit**

```bash
git add apps/ui/src/table/Table apps/ui/src/index.ts apps/ui/vitest.config.ts apps/playground/stories/TableStory apps/frontend/src/pages/board
git commit -m "refactor(ui): Table props group by who owns the data"
```

---

### Task 2: Controlled `panel` with uncontrolled fallback

**Files:**
- Modify: `apps/ui/src/table/Table/types.ts`
- Modify: `apps/ui/src/table/Table/Table.tsx:270` (the `useState<Panel | null>`)
- Test: `apps/ui/src/table/Table/Table.test.tsx`

**Interfaces:**
- Consumes: `TableProps`, `Panel`, `makeTableProps` from Task 1.
- Produces: `panel?: Panel | null` and `onPanelChange?: (panel: Panel | null) => void` on `TableProps`. Task 17 binds them to `?panel=`.

- [ ] **Step 1: Write the failing tests**

Append to `apps/ui/src/table/Table/Table.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { vi } from 'vitest'

it('opens a panel on its own when `panel` is not supplied', () => {
  const props = makeTableProps()
  const { getByRole, getByText } = render(<Table {...props} />)
  fireEvent.click(getByRole('button', { name: props.copy.table.tabHistory }))
  expect(getByText(props.copy.history.title)).toBeTruthy()
})

it('does not update itself when `panel` is supplied', () => {
  const props = makeTableProps()
  const onPanelChange = vi.fn()
  const { getByRole, queryByText } = render(
    <Table {...props} panel={null} onPanelChange={onPanelChange} />,
  )
  fireEvent.click(getByRole('button', { name: props.copy.table.tabHistory }))
  expect(onPanelChange).toHaveBeenCalledWith('history')
  // Controlled: the parent did not re-render with a new panel, so nothing opened.
  expect(queryByText(props.copy.history.title)).toBeNull()
})

it('reports null when the active tab is clicked again', () => {
  const props = makeTableProps()
  const onPanelChange = vi.fn()
  const { getByRole } = render(
    <Table {...props} panel="history" onPanelChange={onPanelChange} />,
  )
  fireEvent.click(getByRole('button', { name: props.copy.table.tabHistory }))
  expect(onPanelChange).toHaveBeenCalledWith(null)
})
```

If `MoveHistory` has no heading matching `copy.history.title`, assert on a `data-testid` you add to the `Drawer` content wrapper instead — do not invent a copy key.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @release/ui test -- Table.test.tsx`
Expected: FAIL — `panel` is not a prop; the controlled test opens the panel anyway.

- [ ] **Step 3: Implement**

In `types.ts`, add to `TableProps`:

```ts
  // Controlled/uncontrolled: omit both and Table owns the open panel. Supply
  // `panel` and Table renders exactly what it is told, reporting intent through
  // `onPanelChange` — which is how the page binds the drawer to the URL.
  panel?: Panel | null
  onPanelChange?: (panel: Panel | null) => void
```

In `Table.tsx`, replace `const [panel, setPanel] = useState<Panel | null>(null)` and the `toggle` helper:

```tsx
const [ownPanel, setOwnPanel] = useState<Panel | null>(null)
const controlled = panelProp !== undefined
const panel = controlled ? panelProp : ownPanel

const toggle = (p: Panel) => {
  const next = panel === p ? null : p
  if (!controlled) setOwnPanel(next)
  onPanelChange?.(next)
}
```

Destructure the prop as `panel: panelProp` to keep the derived `panel` name the body already uses. `lastOpen`, the `useEffect` and `drawerWidth` are unchanged — they read the derived `panel` either way.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @release/ui test -- Table.test.tsx`
Expected: PASS (3 new tests).

- [ ] **Step 5: Verify by mutation**

Make `toggle` always call `setOwnPanel(next)` regardless of `controlled`. Confirm the "does not update itself" test goes red. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/table/Table
git commit -m "feat(ui): Table's drawer answers to its consumer"
```

---

### Task 3: Retire `view` for state-driven elimination and room-driven connection

**Files:**
- Modify: `apps/ui/src/table/Table/types.ts`
- Modify: `apps/ui/src/table/Table/Table.tsx` (opponent map, `youEliminated`, `Reconnect`)
- Modify: `apps/ui/src/mocks/table.ts` (add `eliminated` to the opponent shape)
- Modify: `apps/playground/stories/TableStory/TableStory.tsx:45-51,168-177` (the VIEW_STATES selector)
- Test: `apps/ui/src/table/Table/Table.test.tsx`

**Interfaces:**
- Produces: `TableState.you.eliminated?: boolean`, `TableOpponent.eliminated?: boolean`, `TableRoom.connection?: 'online' | 'reconnecting'`, `TableRoom.disconnected?: string[]`. `ViewState` and the `view` prop are deleted.

- [ ] **Step 1: Write the failing tests**

First add two stable hooks to `Seat`, because the table renders many zeros and a
bare `getByText('0')` would pass against a no-op: `data-testid={`seat-${player.id}`}`
on its root, and `data-testid="hand-count"` on the card-count element.

```tsx
it('zeroes the hand of an eliminated opponent and leaves the others alone', () => {
  const base = makeTableProps()
  const [out, alive] = base.state.opponents
  const opponents = base.state.opponents.map((o) =>
    o.id === out.id ? { ...o, eliminated: true } : o,
  )
  const { getByTestId } = render(
    <Table {...base} state={{ ...base.state, opponents }} />,
  )
  // The comparison against a live sibling is what makes this falsifiable —
  // the mock gives every opponent a non-zero hand.
  expect(within(getByTestId(`seat-${out.id}`)).getByTestId('hand-count').textContent).toBe('0')
  expect(
    within(getByTestId(`seat-${alive.id}`)).getByTestId('hand-count').textContent,
  ).not.toBe('0')
})

it('shows the reconnect overlay from room.connection, not from a view flag', () => {
  const base = makeTableProps()
  const { getByText } = render(
    <Table {...base} room={{ ...base.room, connection: 'reconnecting' }} />,
  )
  expect(getByText(base.copy.reconnect.title)).toBeTruthy()
})

it('marks an opponent listed in room.disconnected', () => {
  const base = makeTableProps()
  const id = base.state.opponents[0].id
  const { getByText } = render(
    <Table {...base} room={{ ...base.room, disconnected: [id] }} />,
  )
  expect(getByText(base.copy.seat.disconnected)).toBeTruthy()
})
```

Read the actual key names off `enCommon.reconnect` and `enCommon.seat` before writing these — use what exists, do not add keys in this task.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @release/ui test -- Table.test.tsx`
Expected: FAIL — `eliminated`, `connection` and `disconnected` are not props.

- [ ] **Step 3: Implement**

In `types.ts`: add `eliminated?: boolean` to `TableOpponent` and to `TableState['you']`; add to `TableRoom`:

```ts
  // Connection is a session fact, never a game fact. `reconnecting` is the
  // local peer; `disconnected` names peers seen as gone.
  connection?: 'online' | 'reconnecting'
  disconnected?: string[]
```

Delete `ViewState` and the `view` prop.

In `Table.tsx`, replace the opponent map's flags:

```tsx
{opponents.map((p) => {
  const eliminated = Boolean(p.eliminated)
  const disconnected = disconnectedIds.has(p.id)
  const shown = eliminated ? { ...p, handCount: 0, release: EMPTY_RELEASE } : p
  return (
    <Seat
      key={p.id}
      player={shown}
      active={turn === p.id}
      eliminated={eliminated}
      disconnected={disconnected}
      copy={copy.seat}
    />
  )
})}
```

with `const disconnectedIds = new Set(room.disconnected ?? [])` above the return. Replace `const youEliminated = view === 'youEliminated'` with `const youEliminated = Boolean(you.eliminated)`, and `{view === 'youDisconnect' && <Reconnect …>}` with `{room.connection === 'reconnecting' && <Reconnect copy={copy.reconnect} />}`.

Note the index-based `i === 0` conditions are gone — elimination and disconnection are now per-player facts, which is the point.

- [ ] **Step 4: Update the mock and the story**

`makeTable` gains `eliminated: false` on each opponent. `TableStory`'s `VIEW_STATES` selector keeps its four options but now maps them onto the new props:

```tsx
const eliminatedId = view === 'oppEliminated' ? state.opponents[0]?.id : undefined
const disconnected = view === 'oppDisconnect' && state.opponents[0] ? [state.opponents[0].id] : []
const storyState = {
  ...state,
  you: { ...state.you, eliminated: view === 'youEliminated' },
  opponents: state.opponents.map((o) => ({ ...o, eliminated: o.id === eliminatedId })),
}
```

and `connection: view === 'youDisconnect' ? 'reconnecting' : 'online'` on `room`. The story keeps its selector; only what it drives changes.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm typecheck && pnpm --filter @release/ui test`
Expected: PASS.

- [ ] **Step 6: Verify by mutation**

Hardcode `disconnectedIds` to an empty set — confirm the `room.disconnected` test goes red. Then make the eliminated branch keep the original `handCount` — confirm the elimination test goes red. Restore both.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src apps/playground/stories/TableStory
git commit -m "refactor(ui): elimination is state, disconnection is the room"
```

---

### Task 4: Derive the dock, keep a playground override

**Files:**
- Modify: `apps/ui/src/table/Table/types.ts`
- Modify: `apps/ui/src/table/Table/Table.tsx` (the `<TurnDock>` call)
- Create: `apps/ui/src/table/Table/dock.ts`
- Modify: `apps/playground/stories/TableStory/TableStory.tsx`
- Test: `apps/ui/src/table/Table/dock.test.ts`

**Interfaces:**
- Consumes: `TableState` from Task 1.
- Produces: `deriveDock(state, selfId, now)` from `apps/ui/src/table/Table/dock.ts`, returning `{ state: TurnDockState; danger: boolean; seconds: number; progress: number; activePlayer?: string }`. `TableProps.dock?: Partial<DockView>` replaces the four `turnDock*` props.

`state.window` and `state.pending` do not exist on `TableState` until Task 5. So this task derives from what exists — `turn` and `you` — and Task 9 extends `deriveDock` once the window and pending land. Write `deriveDock` with that seam in mind: it takes the whole `state`.

- [ ] **Step 1: Write the failing test**

Create `apps/ui/src/table/Table/dock.test.ts`:

```ts
import { deriveDock } from './dock'

const base = {
  you: { name: 'you', hand: [], release: {} },
  opponents: [{ id: 'p2', name: 'kernel_panic', handCount: 5, release: {} }],
  decks: { main: 40, events: 12, discardCount: 0 },
  history: [],
  setup: {},
}

it('is `draw` on your turn before you have drawn', () => {
  const d = deriveDock({ ...base, turn: 'you', hasDrawn: false }, 'you', 0)
  expect(d.state).toBe('draw')
})

it('is `push` on your turn once you have drawn', () => {
  const d = deriveDock({ ...base, turn: 'you', hasDrawn: true }, 'you', 0)
  expect(d.state).toBe('push')
})

it('is `waiting` on someone else’s turn, and names them', () => {
  const d = deriveDock({ ...base, turn: 'p2', hasDrawn: true }, 'you', 0)
  expect(d.state).toBe('waiting')
  expect(d.activePlayer).toBe('kernel_panic')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @release/ui test -- dock.test.ts`
Expected: FAIL — `./dock` does not exist.

- [ ] **Step 3: Implement `dock.ts`**

```ts
import type { TurnDockState } from '@/table/TurnDock/TurnDock'
import type { TableState } from './types'

export interface DockView {
  state: TurnDockState
  danger: boolean
  seconds: number
  progress: number
  activePlayer?: string
}

// `now` is supplied by the caller — the kit never reads the clock itself.
export function deriveDock(state: TableState, selfId: string, now: number): DockView {
  const yours = state.turn === selfId
  const activePlayer = state.opponents.find((o) => o.id === state.turn)?.name
  return {
    state: yours ? (state.hasDrawn ? 'push' : 'draw') : 'waiting',
    danger: false,
    seconds: 0,
    progress: 0,
    activePlayer,
  }
}
```

Add `hasDrawn?: boolean` and `selfId: string` to `TableState` in `types.ts` — the projection carries both (`PlayerView.turn.hasDrawn`, `PlayerView.self.id`), so this is not invention.

- [ ] **Step 4: Wire it into `Table.tsx`**

```tsx
const derived = deriveDock(state, state.selfId, nowRef.current)
const dockView = { ...derived, ...dock }
```

where `dock?: Partial<DockView>` is the new prop and `nowRef` is `useRef(0)` for now — Task 9 replaces it with the deadline interval. Pass `dockView.state` / `.danger` / `.seconds` / `.progress` / `.activePlayer` to `<TurnDock>`, and delete the four `turnDock*` props from `types.ts`.

- [ ] **Step 5: Update the story**

`TableStory`'s dock selector now writes the override:

```tsx
dock={{ state: dockDemo === 'reaction503' ? 'reaction' : dockDemo, danger: dockDemo === 'reaction503', seconds: 16, progress: 0.55 }}
```

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm typecheck && pnpm --filter @release/ui test`
Expected: PASS.

- [ ] **Step 7: Verify by mutation**

Invert the `hasDrawn` ternary in `deriveDock`. Confirm two dock tests go red. Restore.

- [ ] **Step 8: Commit**

```bash
git add apps/ui/src/table/Table apps/playground/stories/TableStory
git commit -m "feat(ui): the dock reads the turn instead of being told"
```

---

# Milestone 2 — `Table` becomes interactive

### Task 5: The kit's structural mirror of the action types

**Files:**
- Create: `apps/ui/src/table/Table/intents.ts`
- Modify: `apps/ui/src/table/Table/types.ts`
- Modify: `apps/ui/src/index.ts`

**Interfaces:**
- Produces: `TableTarget`, `TableChoice`, `TablePending`, `TableWindow`, `TableActions` from `apps/ui/src/table/Table/intents.ts`. Task 11 asserts these are mutually assignable with the engine's `Target`, `Choice`, `PendingView`, `WindowView`.

These mirror `packages/engine/src/actions.ts` and `packages/engine/src/view.ts` member for member. The kit imports nothing from the engine (Decision 7); `packages/engine/src/state.ts:11-13` already sets this precedent for `Setup`.

- [ ] **Step 1: Write `intents.ts`**

```ts
// Structural mirror of @release/engine's action surface. The kit carries no
// domain dependency (Decision 7), so these are declared rather than imported.
// apps/frontend/src/entities/game/contract.test-d.ts asserts both directions of
// assignability — if the engine adds a member and this file does not, the
// frontend stops compiling.

export type ReleaseSlotId = 'frontend' | 'backend' | 'database'
export type NeutralizeMethodId = 'debugger' | 'monitoring' | 'sacrifice'

export type TableTarget =
  | { kind: 'player'; player: string }
  | { kind: 'release'; player: string; slot: ReleaseSlotId }
  | { kind: 'monitoring'; player: string }
  | { kind: 'card'; card: string }

export type TableChoice =
  | { kind: 'discardForRelease'; card: string }
  | { kind: 'defend'; card: string | null; combo?: string }
  | { kind: 'neutralize503'; method: NeutralizeMethodId; card?: string }
  | { kind: 'crush'; method: NeutralizeMethodId; card?: string }
  | { kind: 'requestCard'; card: string }
  | { kind: 'giveCard'; card: string }
  | { kind: 'handLimit'; cards: string[] }

export type TablePending =
  | { kind: 'discardForRelease'; player: string; options: string[] }
  | {
      kind: 'defend'
      player: string
      attacker: string
      attackCard: string
      sudo: boolean
      options: string[]
      openedAt: number
      deadline: number
      scope: 'release' | 'hand'
    }
  | { kind: 'neutralize503'; player: string; methods: NeutralizeMethodId[] }
  | { kind: 'crush'; player: string; slot: ReleaseSlotId; methods: NeutralizeMethodId[] }
  | { kind: 'requestCard'; player: string; target: string }
  | { kind: 'giveCard'; player: string; requested: string }
  | { kind: 'handLimit'; player: string; excess: number; options: string[] }

export interface TableWindow {
  player: string
  slot: ReleaseSlotId
  round: number
  // Both ends of the span, so the ring's sweep is exact rather than assumed.
  openedAt: number
  deadline: number
  passed: string[]
  canAttackWith: string[]
}

// Intents out. Never an Action — the kit does not know the player's id or the
// clock; the consumer stamps both (Decision 8).
export interface TableActions {
  onPlay?: (card: string, target?: TableTarget, combo?: string) => void
  onDraw?: (pile?: number) => void
  onPush?: () => void
  onAttack?: (card: string, combo?: string) => void
  onPass?: () => void
  onUnpass?: () => void
  onResolve?: (choice: TableChoice) => void
  onWindowExpired?: () => void
  onOverContinue?: () => void
  // Legality is the engine's answer, never the UI's. Returns [] when the card
  // needs no target.
  legalTargets?: (card: string) => TableTarget[]
}
```

- [ ] **Step 2: Extend `TableState` and `TableProps`**

In `types.ts`, add to `TableState`:

```ts
  playable: string[]
  frozen: string[]
  pending?: TablePending | null
  window?: TableWindow | null
  // Keyed by card uid — the projection's answer to "what may pair with this",
  // so the kit looks the pairing up rather than deciding it.
  comboOptions?: Record<string, string[]>
```

`selfId` and `hasDrawn` are already on `TableState` from Task 4 — do not re-add them.

and to `TableProps`: `actions?: TableActions`. Move `onOverContinue` off `TableProps` into `TableActions` and update the `<GameOver>` call to `actions?.onOverContinue`.

- [ ] **Step 3: Give the engine the other end of the span**

`WindowView` and `PendingView`'s `defend` variant carry only `deadline`. A ring
sweep needs the span, and deriving it from a hardcoded constant would make a
visible countdown wrong whenever the engine's timings change. So add
`openedAt: number` to both in `packages/engine/src/view.ts`, and set it where the
fake opens a window (`packages/engine/src/fake/window.ts`) and where it raises a
`defend` pending (`packages/engine/src/fake/attacks.ts`) — in both cases it is
the `at` of the action that opened it, which the reducer already has.

The mirror in `intents.ts` above already declares both fields; the assertions in
Task 11 are what will catch it if one side is missed.

Run: `pnpm --filter @release/engine test`
Expected: PASS — the conformance suite covers projection shape, so a missed
assignment surfaces here.

- [ ] **Step 4: Export from the kit**

```ts
export type {
  TableActions,
  TableChoice,
  TablePending,
  TableTarget,
  TableWindow,
} from './table/Table/intents'
```

- [ ] **Step 5: Fix the fixture and both consumers**

`makeTableProps` gains `selfId: 'you'`, `playable: []`, `frozen: []`. `TableStory` and `_layout.tsx` gain the same on their state objects.

- [ ] **Step 6: Verify**

Run: `pnpm typecheck && pnpm --filter @release/ui test`
Expected: PASS, no behaviour change.

- [ ] **Step 7: Commit**

```bash
git add apps/ui/src apps/playground apps/frontend/src/pages/board
git commit -m "feat(ui): the table declares the intents it can emit"
```

---

### Task 6: `useTableInteractions` — idle and selected

**Files:**
- Create: `apps/ui/src/table/Table/useTableInteractions.ts`
- Test: `apps/ui/src/table/Table/useTableInteractions.test.ts`

**Interfaces:**
- Consumes: `TableActions`, `TableTarget` from Task 5.
- Produces: `useTableInteractions({ state, actions })` returning `{ phase, selected, comboWith, accentAt, onCardClick, onTargetPick, cancel, targets }`. Task 8 wires it into `Table.tsx`.

- [ ] **Step 1: Write the failing tests**

```ts
import { act, renderHook } from '@testing-library/react'
import { vi } from 'vitest'
import { useTableInteractions } from './useTableInteractions'

const hand = [
  { uid: 'c1', card: { id: 'attack-bug' } },
  { uid: 'c2', card: { id: 'release-frontend' } },
]
const setup = (over = {}) => ({
  state: { selfId: 'you', you: { hand }, playable: ['c1'], frozen: [], ...over },
  actions: { onPlay: vi.fn(), legalTargets: vi.fn(() => []) },
})

it('ignores a card that is not playable', () => {
  const opts = setup()
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(1))
  expect(result.current.phase).toBe('idle')
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
})

it('plays a targetless card immediately', () => {
  const opts = setup()
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  expect(opts.actions.onPlay).toHaveBeenCalledWith('c1', undefined, undefined)
  expect(result.current.phase).toBe('idle')
})

it('waits for a target when the card has legal targets', () => {
  const opts = setup()
  opts.actions.legalTargets = vi.fn(() => [{ kind: 'player', player: 'p2' }])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  expect(result.current.phase).toBe('selected')
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
})

it('dispatches exactly one intent on a legal target pick', () => {
  const opts = setup()
  const target = { kind: 'player', player: 'p2' } as const
  opts.actions.legalTargets = vi.fn(() => [target])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  act(() => result.current.onTargetPick(target))
  expect(opts.actions.onPlay).toHaveBeenCalledTimes(1)
  expect(opts.actions.onPlay).toHaveBeenCalledWith('c1', target, undefined)
  expect(result.current.phase).toBe('idle')
})

it('dispatches nothing on an illegal target pick', () => {
  const opts = setup()
  opts.actions.legalTargets = vi.fn(() => [{ kind: 'player', player: 'p2' }])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  act(() => result.current.onTargetPick({ kind: 'player', player: 'p3' }))
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
  expect(result.current.phase).toBe('selected')
})

it('cancels back to idle without dispatching', () => {
  const opts = setup()
  opts.actions.legalTargets = vi.fn(() => [{ kind: 'player', player: 'p2' }])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  act(() => result.current.cancel())
  expect(result.current.phase).toBe('idle')
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @release/ui test -- useTableInteractions.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
import { useCallback, useMemo, useState } from 'react'
import type { TableActions, TableTarget } from './intents'
import type { TableState } from './types'

export type Phase = 'idle' | 'selected' | 'comboPending'

interface Options {
  state: Pick<TableState, 'selfId' | 'you' | 'playable' | 'frozen'>
  actions?: TableActions
}

const sameTarget = (a: TableTarget, b: TableTarget) =>
  a.kind === b.kind && JSON.stringify(a) === JSON.stringify(b)

export function useTableInteractions({ state, actions }: Options) {
  const [selected, setSelected] = useState<string | null>(null)

  const targets = useMemo(
    () => (selected ? (actions?.legalTargets?.(selected) ?? []) : []),
    [selected, actions],
  )

  const phase: Phase = selected ? 'selected' : 'idle'

  const cancel = useCallback(() => setSelected(null), [])

  const onCardClick = useCallback(
    (index: number) => {
      const item = state.you.hand[index]
      if (!item || !state.playable.includes(item.uid)) return
      const legal = actions?.legalTargets?.(item.uid) ?? []
      if (legal.length === 0) {
        actions?.onPlay?.(item.uid, undefined, undefined)
        setSelected(null)
        return
      }
      setSelected(item.uid)
    },
    [state.you.hand, state.playable, actions],
  )

  const onTargetPick = useCallback(
    (target: TableTarget) => {
      if (!selected) return
      if (!targets.some((t) => sameTarget(t, target))) return
      actions?.onPlay?.(selected, target, undefined)
      setSelected(null)
    },
    [selected, targets, actions],
  )

  const accentAt = useCallback(
    (index: number) => (state.you.hand[index]?.uid === selected ? 'var(--accent)' : undefined),
    [state.you.hand, selected],
  )

  return { phase, selected, comboWith: null, targets, accentAt, onCardClick, onTargetPick, cancel }
}
```

Check `apps/ui/src/design/tokens.css` for the accent token's real name before using `var(--accent)`; if there is none, add one rather than hardcoding a color.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @release/ui test -- useTableInteractions.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Verify by mutation**

Delete the `state.playable.includes` guard. Confirm "ignores a card that is not playable" goes red. Then delete the `targets.some` guard and confirm "dispatches nothing on an illegal target pick" goes red. Restore both.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/table/Table
git commit -m "feat(ui): a card selects, a target commits"
```

---

### Task 7: The combo phase

**Files:**
- Modify: `apps/ui/src/table/Table/useTableInteractions.ts`
- Test: `apps/ui/src/table/Table/useTableInteractions.test.ts`

**Interfaces:**
- Consumes: everything from Task 6.
- Produces: `comboWith: string | null` becomes live; `Options` gains `comboOptions?: (card: string) => string[]`, supplied by `Table` from `state`.

A combo needs two hand selections before one intent exists. Legality of the pairing is the engine's answer, delivered through `comboOptions` — the kit never inspects card tags.

- [ ] **Step 1: Write the failing tests**

```ts
it('enters comboPending when the selected card has combo partners', () => {
  const opts = setup()
  opts.comboOptions = vi.fn(() => ['c2'])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  expect(result.current.phase).toBe('comboPending')
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
})

it('dispatches one intent carrying the combo once the partner is picked', () => {
  const opts = setup({ playable: ['c1', 'c2'] })
  opts.comboOptions = vi.fn((card) => (card === 'c1' ? ['c2'] : []))
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  act(() => result.current.onCardClick(1))
  expect(opts.actions.onPlay).toHaveBeenCalledTimes(1)
  expect(opts.actions.onPlay).toHaveBeenCalledWith('c1', undefined, 'c2')
})

it('refuses a partner outside the offered options', () => {
  const opts = setup({ playable: ['c1', 'c2'] })
  opts.comboOptions = vi.fn(() => ['c3'])
  const { result } = renderHook(() => useTableInteractions(opts))
  act(() => result.current.onCardClick(0))
  act(() => result.current.onCardClick(1))
  expect(opts.actions.onPlay).not.toHaveBeenCalled()
  expect(result.current.phase).toBe('comboPending')
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @release/ui test -- useTableInteractions.test.ts`
Expected: FAIL — `comboOptions` is ignored; phase never becomes `comboPending`.

- [ ] **Step 3: Implement**

Add `comboOptions?: (card: string) => string[]` to `Options`, a `const [combo, setCombo] = useState<string | null>(null)` and a `const [awaitingCombo, setAwaitingCombo] = useState(false)`. In `onCardClick`, branch before the targetless dispatch:

```ts
if (awaitingCombo && selected) {
  const partners = comboOptions?.(selected) ?? []
  if (!partners.includes(item.uid)) return
  const legal = actions?.legalTargets?.(selected) ?? []
  if (legal.length === 0) {
    actions?.onPlay?.(selected, undefined, item.uid)
    reset()
    return
  }
  setCombo(item.uid)
  setAwaitingCombo(false)
  return
}

const partners = comboOptions?.(item.uid) ?? []
if (partners.length > 0) {
  setSelected(item.uid)
  setAwaitingCombo(true)
  return
}
```

`phase` becomes `awaitingCombo ? 'comboPending' : selected ? 'selected' : 'idle'`; `onTargetPick` passes `combo ?? undefined` as the third argument; `reset()` clears all three pieces of state and is what `cancel` calls.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @release/ui test -- useTableInteractions.test.ts`
Expected: PASS (9 tests).

- [ ] **Step 5: Verify by mutation**

Delete the `partners.includes(item.uid)` guard. Confirm "refuses a partner outside the offered options" goes red. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/table/Table
git commit -m "feat(ui): a combo waits for its partner before it means anything"
```

---

### Task 8: Wire the gestures into `Table`

**Files:**
- Modify: `apps/ui/src/table/Table/Table.tsx`
- Modify: `apps/ui/src/table/Table/Table.module.css`
- Modify: `apps/ui/src/table/ReleaseZone/ReleaseZone.tsx` (slot click-through)
- Test: `apps/ui/src/table/Table/Table.test.tsx`

**Interfaces:**
- Consumes: `useTableInteractions` (Tasks 6–7), `TableActions` (Task 5).
- Produces: `Table` renders the targeting arrow and dispatches through `actions`.

- [ ] **Step 1: Write the failing test**

```tsx
it('plays a targetless card straight from the hand', () => {
  const base = makeTableProps()
  const onPlay = vi.fn()
  const uid = base.state.you.hand[0].uid
  const { container } = render(
    <Table
      {...base}
      state={{ ...base.state, playable: [uid] }}
      actions={{ onPlay, legalTargets: () => [] }}
    />,
  )
  fireEvent.mouseDown(container.querySelectorAll('[data-hand-slot]')[0])
  expect(onPlay).toHaveBeenCalledWith(uid, undefined, undefined)
})

it('draws from the dock', () => {
  const base = makeTableProps()
  const onDraw = vi.fn()
  const { getByRole } = render(
    <Table
      {...base}
      state={{ ...base.state, turn: 'you', hasDrawn: false }}
      actions={{ onDraw }}
    />,
  )
  fireEvent.click(getByRole('button', { name: base.copy.turnDock.draw }))
  expect(onDraw).toHaveBeenCalledTimes(1)
})
```

Read the real key off `enCommon.turnDock` for the draw button's accessible name. `Hand` already passes the slot element to `onCardClick`; add `data-hand-slot` to its slot `<div>` so tests and the anchor registry (milestone 4) have a stable hook.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @release/ui test -- Table.test.tsx`
Expected: FAIL — `Hand` has no `onCardClick` and `TurnDock` has no `onDraw`.

- [ ] **Step 3: Implement**

In `Table.tsx`:

```tsx
const gestures = useTableInteractions({
  state,
  actions,
  comboOptions: (card) => state.comboOptions?.[card] ?? [],
})
```

`comboOptions` is already on `TableState` from Task 5.

Pass the handlers down:

```tsx
<Hand items={you.hand} onCardClick={(i) => gestures.onCardClick(i)} accentAt={gestures.accentAt} />
```

```tsx
<TurnDock
  state={dockView.state}
  danger={dockView.danger}
  seconds={dockView.seconds}
  progress={dockView.progress}
  activePlayer={dockView.activePlayer}
  copy={copy.turnDock}
  paused={paused}
  onDraw={actions?.onDraw ? () => actions.onDraw?.() : undefined}
  onPush={actions?.onPush}
  onPass={actions?.onPass}
/>
```

Render the arrow while a target is awaited, using the existing `Arrow` primitive (`from` / `to` / `color`), with cursor position tracked in a `useState<Point | null>` fed by a `mousemove` listener mounted only during `phase === 'selected'`. Add `onKeyDown` for `Escape` → `gestures.cancel()` and a click handler on the root that cancels when the click lands outside a target.

Make opponent seats and release slots dispatch `gestures.onTargetPick`:

```tsx
<Seat … onPick={(target) => gestures.onTargetPick(target)} targets={gestures.targets} />
```

`Seat` gains `onPick?: (t: TableTarget) => void` and `targets?: TableTarget[]`; it highlights only what appears in `targets` and calls `onPick` on click. `ReleaseZone` gains the same two props and emits `{ kind: 'release', player, slot }` per slot.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm typecheck && pnpm --filter @release/ui test`
Expected: PASS.

- [ ] **Step 5: Verify by mutation**

Pass `onCardClick={undefined}` to `Hand`. Confirm "plays a targetless card straight from the hand" goes red. Restore.

- [ ] **Step 6: Commit**

```bash
git add apps/ui/src/table
git commit -m "feat(ui): the hand answers the pointer"
```

---

### Task 9: Pending prompts and the reaction window

**Files:**
- Modify: `apps/ui/src/table/Table/Table.tsx`
- Create: `apps/ui/src/table/Table/PendingPrompt/PendingPrompt.tsx`
- Create: `apps/ui/src/table/Table/PendingPrompt/PendingPrompt.module.css`
- Create: `apps/ui/src/table/Table/PendingPrompt/index.ts`
- Modify: `apps/ui/src/table/Table/dock.ts` (window + pending drive the dock)
- Test: `apps/ui/src/table/Table/PendingPrompt/PendingPrompt.test.tsx`, `apps/ui/src/table/Table/dock.test.ts`

**Interfaces:**
- Consumes: `TablePending`, `TableChoice`, `TableWindow` (Task 5); `ConfirmAction` from `@/table/ConfirmAction`.
- Produces: `<PendingPrompt pending copy onResolve />`, rendering one prompt per `TablePending` kind. `deriveDock` gains window/pending handling.

`PendingPromptCopy` is a new copy block — one prompt string plus one action label per kind, plus shared `confirm` and `decline`. Declare it in `PendingPrompt.tsx`, and add `pending?: PendingPromptCopy` and `window?: WindowCopy` to `TableCopyBundle` in `types.ts`. Task 15 adds the keys to both catalogs; this task's fixture supplies literals so the tests do not wait on translation.

- [ ] **Step 1: Write the failing tests**

```tsx
it('resolves discardForRelease with the picked card', () => {
  const onResolve = vi.fn()
  const { getAllByRole, getByRole } = render(
    <PendingPrompt
      pending={{ kind: 'discardForRelease', player: 'you', options: ['c1', 'c2'] }}
      hand={[{ uid: 'c1', card: { id: 'attack-bug' } }, { uid: 'c2', card: { id: 'release-frontend' } }]}
      copy={copy}
      onResolve={onResolve}
    />,
  )
  fireEvent.click(getAllByRole('option')[1])
  fireEvent.click(getByRole('button', { name: copy.confirm }))
  expect(onResolve).toHaveBeenCalledWith({ kind: 'discardForRelease', card: 'c2' })
})

it('lets you decline a defence explicitly', () => {
  const onResolve = vi.fn()
  const { getByRole } = render(
    <PendingPrompt pending={defendPending} hand={hand} copy={copy} onResolve={onResolve} />,
  )
  fireEvent.click(getByRole('button', { name: copy.decline }))
  expect(onResolve).toHaveBeenCalledWith({ kind: 'defend', card: null })
})

it('keeps confirm inert until a selection exists', () => {
  const { getByRole } = render(
    <PendingPrompt pending={defendPending} hand={hand} copy={copy} onResolve={vi.fn()} />,
  )
  expect(getByRole('button', { name: copy.confirm })).toHaveProperty('disabled', true)
})
```

And in `dock.test.ts`:

```ts
it('is a danger reaction while a defence is pending against you', () => {
  const d = deriveDock({ ...base, turn: 'p2', pending: defendPending }, 'you', 0)
  expect(d.state).toBe('reaction')
  expect(d.danger).toBe(true)
})

it('sweeps the ring across the window’s own span, not a constant', () => {
  const window = { openedAt: 0, deadline: 10_000, canAttackWith: ['c1'] }
  const d = deriveDock({ ...base, turn: 'p2', window }, 'you', 4_000)
  expect(d.seconds).toBe(6)
  // 6s left of a 10s span — exact, so a wrong span cannot pass this.
  expect(d.progress).toBeCloseTo(0.6)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @release/ui test`
Expected: FAIL — `PendingPrompt` does not exist; `deriveDock` ignores `pending` and `window`.

- [ ] **Step 3: Implement `PendingPrompt`**

One component, switching on `pending.kind`. Card-picking kinds (`discardForRelease`, `defend`, `giveCard`, `handLimit`) render the offered `options` resolved against `hand` as selectable `role="option"` cards; method-picking kinds (`neutralize503`, `crush`) render their `methods`; `requestCard` renders a card-type picker. Every kind ends in `<ConfirmAction open label={copy.confirm} disabled={!complete} onConfirm={…} />`. `defend` additionally renders a decline button that resolves `{ kind: 'defend', card: null }` — the explicit "I could block and choose not to" from the contract.

`handLimit` collects `excess` cards before `complete` is true; the choice carries the array.

- [ ] **Step 4: Extend `deriveDock`**

```ts
const mine = state.pending?.player === selfId
if (mine && state.pending) {
  const timed = 'deadline' in state.pending ? state.pending : undefined
  return {
    state: 'reaction',
    danger: state.pending.kind === 'defend' || state.pending.kind === 'neutralize503',
    ...clock(timed?.openedAt, timed?.deadline, now),
    activePlayer,
  }
}
if (state.window && state.window.canAttackWith.length > 0) {
  const { openedAt, deadline } = state.window
  return { state: 'reaction', danger: false, ...clock(openedAt, deadline, now), activePlayer }
}
```

with `clock(openedAt, deadline, now)` returning `{ seconds: 0, progress: 0 }` when either bound is undefined, and otherwise:

```ts
const seconds = Math.max(0, Math.ceil((deadline - now) / 1000))
const span = deadline - openedAt
const progress = span > 0 ? Math.min(1, Math.max(0, (deadline - now) / span)) : 0
```

Both bounds come off the view (Task 5's `openedAt`), so the sweep is exact and no constant is involved. `span > 0` guards a zero-length window rather than dividing by zero.

- [ ] **Step 5: Render both in `Table.tsx`**

```tsx
{state.pending?.player === state.selfId && copy.pending && (
  <PendingPrompt
    pending={state.pending}
    hand={you.hand}
    copy={copy.pending}
    onResolve={(choice) => actions?.onResolve?.(choice)}
  />
)}
```

The window's attack affordance reuses the hand: while `state.window` is open and `canAttackWith` is non-empty, `useTableInteractions` gates on `canAttackWith` instead of `playable` and dispatches `actions.onAttack` instead of `onPlay`. Add that branch to the hook and a test for it alongside Task 7's.

`TurnDock`'s `onPass` maps to `actions.onPass`; render an unpass affordance when `state.window.passed.includes(state.selfId)`.

- [ ] **Step 6: Run to verify it passes**

Run: `pnpm typecheck && pnpm --filter @release/ui test`
Expected: PASS.

- [ ] **Step 7: Verify by mutation**

Make `PendingPrompt`'s confirm button always enabled. Confirm "keeps confirm inert until a selection exists" goes red. Then hardcode `danger: false` in `deriveDock` and confirm the danger test goes red. Restore both.

- [ ] **Step 8: Commit**

```bash
git add apps/ui/src/table
git commit -m "feat(ui): the table asks, and carries the answer back"
```

---

### Task 10: Take mock legality out of the kit's public surface

**Files:**
- Modify: `apps/ui/src/cards/catalogue.ts:386-395`
- Modify: `apps/ui/src/cards/index.ts:6-8`
- Modify: `apps/ui/src/index.ts:29-31`
- Create: `apps/playground/stories/ComboStory/mockLegality.ts`
- Modify: `apps/playground/stories/ComboStory/ComboStory.tsx:6,193,205-206,337`

`cardCanTarget`, `isComboSource` and `validComboTarget` are labelled mock logic in the catalogue and are now superseded — the kit gates on `playable`, `canAttackWith`, `legalTargets` and `comboOptions`. Their only consumer is `ComboStory`, a design-exploration story with no engine behind it. So they move into the story rather than being deleted: the kit's public API loses them, the story keeps working.

- [ ] **Step 1: Move the three functions**

Cut them from `catalogue.ts` into `apps/playground/stories/ComboStory/mockLegality.ts` verbatim, with a header comment recording that they were mock logic retired from `@release/ui` and that legality is the engine's answer everywhere else.

- [ ] **Step 2: Drop them from both barrels**

Remove the three names from `apps/ui/src/cards/index.ts` and `apps/ui/src/index.ts`.

- [ ] **Step 3: Repoint `ComboStory`**

```ts
import { cardById } from '@/cards'
import { cardCanTarget, isComboSource, validComboTarget } from './mockLegality'
```

- [ ] **Step 4: Verify nothing else referenced them**

Run: `grep -rn "cardCanTarget\|isComboSource\|validComboTarget" apps packages --include="*.ts" --include="*.tsx" | grep -v node_modules`
Expected: only `mockLegality.ts` and `ComboStory.tsx`.

Then: `pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/cards apps/ui/src/index.ts apps/playground/stories/ComboStory
git commit -m "refactor(ui): mock legality leaves the library"
```

---

### Task 11: `@release/table-adapter` — the shared seam

**Files:**
- Create: `packages/table-adapter/package.json`
- Create: `packages/table-adapter/src/toTableState.ts` + `src/toTableState.test.ts`
- Create: `packages/table-adapter/src/toAction.ts` + `src/toAction.test.ts`
- Create: `packages/table-adapter/tsconfig.json`
- Create: `packages/table-adapter/vitest.config.ts`
- Create: `packages/table-adapter/src/index.ts`
- Create: `packages/table-adapter/src/contract.test-d.ts`

**Interfaces:**
- Consumes: `@release/engine` types; `TableTarget`, `TableChoice`, `TablePending`, `TableWindow`, `TableState` from `@release/ui` (Task 5).
- Produces: the package `@release/table-adapter`, which Task 12 (playground) and Task 17 (the board page) both import. This task delivers the scaffold, the compile-time assertions, and both adapters.

`PlayerView` → `TableState` is needed by two consumers: the playground's live story and the frontend's board page. Neither can import the other — the playground must not depend on `@release/web`. And it cannot live in `@release/ui`, which imports nothing from the engine (Decision 7).

So it is its own package: the one place allowed to see both sides, which makes it the natural home for the assertions that keep the structural mirror honest. `@release/ui` stays engine-free; the frontend's `entities/game/` becomes a re-export, preserving its layer rule.

- [ ] **Step 1: Scaffold the package**

`packages/table-adapter/package.json`, mirroring `packages/engine`'s shape:

```json
{
  "name": "@release/table-adapter",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "scripts": {
    "typecheck": "release-tsc --noEmit -p tsconfig.json",
    "test": "vitest run --passWithNoTests"
  },
  "dependencies": {
    "@release/engine": "workspace:*",
    "@release/ui": "workspace:*"
  },
  "devDependencies": {
    "@release/lint": "workspace:*"
  }
}
```

Copy `packages/engine/tsconfig.json` and `vitest.config.ts` as the starting point, adding path aliases for `@release/engine` and `@release/ui` so both resolve from source. `pnpm-workspace.yaml` already globs `packages/*`, so no change there.

`src/index.ts` starts as a barrel exporting only the assertions' types; Tasks 15 and 16 fill it in.

- [ ] **Step 2: Write the assertions**

`packages/table-adapter/src/contract.test-d.ts` — compile-time only, `release-tsc` is the runner:

```ts
import type { Choice, PendingView, Target, WindowView } from '@release/engine'
import type { TableChoice, TablePending, TableTarget, TableWindow } from '@release/ui'

// Decision 7: @release/ui mirrors the engine's action surface structurally
// rather than importing it. These assertions are what make that safe — if the
// engine gains a Target variant or a Pending kind and the kit does not, this
// file stops compiling and names the missing member.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

export const targetsMatch: Exact<Target, TableTarget> = true
export const choicesMatch: Exact<Choice, TableChoice> = true
export const pendingMatch: Exact<PendingView, TablePending> = true
export const windowMatch: Exact<WindowView, TableWindow> = true
```

- [ ] **Step 3: Join it to the workspace scripts**

Run: `pnpm install`, then `pnpm -r typecheck`
Expected: the new package is picked up by `pnpm -r` and typechecks clean.

- [ ] **Step 4: Verify by mutation**

Add `| { kind: 'bogus' }` to `Target` in `packages/engine/src/actions.ts`. Re-run `pnpm -r typecheck`; expect FAILURE on `targetsMatch`. Restore.

This mutation is the single most important one in the plan — it is the only thing standing between Decision 7 and silent drift. Do not skip it.

- [ ] **Step 5: Commit the scaffold**

```bash
git add packages/table-adapter pnpm-lock.yaml
git commit -m "feat(adapter): one place may see both sides"
```

---

#### `toTableState` — the projection becomes a table

Lives at `packages/table-adapter/src/toTableState.ts`, tested at `packages/table-adapter/src/toTableState.test.ts`. Both the playground (Task 12) and the board page (Task 17) import it from here.

**Interfaces:**
- Consumes: `PlayerView`, `Event` from `@release/engine`; `TableState` from `@release/ui`.
- Produces: `toTableState(view: PlayerView, log: Event[], labels: HistoryLabels): TableState`, plus:

```ts
// One label per member of the engine's Event union — the adapter maps event
// types to translated text, replacing the mock's free-form `kind` literals.
// Task 15 adds the matching keys under `moveHistory` in both catalogs.
export type HistoryLabels = Record<Event['type'], string>
```

Tests build `labels` with `Object.fromEntries` over the event types they exercise.

- [ ] **Step 6: Write the failing tests**

```ts
import { describe, expect, it } from 'vitest'
import { toTableState } from './toTableState'

const view = {
  self: {
    id: 'you',
    name: 'you',
    hand: [{ uid: 'c1', id: 'attack-bug' }],
    release: {},
    playable: ['c1'],
    frozen: [],
  },
  opponents: [{ id: 'p2', name: 'bot', handCount: 3, release: {}, eliminated: false }],
  decks: { piles: [30, 10], events: 8, discardCount: 2, discardTop: 'attack-ddos' },
  turn: { player: 'you', index: 4, hasDrawn: false },
  window: null,
  pending: null,
  setup: {},
  over: null,
}

it('sums the piles into the single deck count the table renders', () => {
  expect(toTableState(view, [], labels).decks.main).toBe(40)
})

it('carries hand uids through unchanged so animation keys stay stable', () => {
  expect(toTableState(view, [], labels).you.hand[0].uid).toBe('c1')
})

it('renders a placeholder for a card id the catalogue does not know', () => {
  const unknown = { ...view, self: { ...view.self, hand: [{ uid: 'c9', id: 'not-a-card' }] } }
  expect(() => toTableState(unknown, [], labels)).not.toThrow()
  expect(toTableState(unknown, [], labels).you.hand[0].card).toBeTruthy()
})

it('marks an eliminated opponent', () => {
  const out = { ...view, opponents: [{ ...view.opponents[0], eliminated: true }] }
  expect(toTableState(out, [], labels).opponents[0].eliminated).toBe(true)
})

it('folds the event log into history newest first', () => {
  const log = [
    { type: 'drawn', player: 'you', at: 1 },
    { type: 'played', player: 'p2', card: 'attack-bug', at: 2 },
  ]
  const history = toTableState(view, log, labels).history
  expect(history.length).toBe(2)
  expect(history[0].kind).toBe(labels.played)
})
```

Read the real `Event` union from `packages/engine/src/events.ts` and the real `HistoryEntry` from `apps/ui/src/table/MoveHistory/MoveHistory.tsx` before writing the last test — match their actual field names, including `parent`.

- [ ] **Step 7: Run to verify it fails**

Run: `pnpm --filter @release/table-adapter test -- toTableState`
Expected: FAIL — module not found.

- [ ] **Step 8: Implement**

Pure function, no React. Key decisions to encode:

1. `decks.main` is `piles.reduce((a, b) => a + b, 0)` — the kit renders one deck; split piles are #61's problem.
2. `discardTop` resolves through `cardById`; a miss yields the placeholder card rather than throwing, since `assetUrl` throws on unknown assets.
3. `history` maps each visible event's `type` to a translated label from `copy`, and preserves `parent` so `MoveHistory` can build its tree.
4. `playable`, `frozen`, `pending`, `window`, `selfId`, `hasDrawn` and `comboOptions` pass through structurally — the assertions in Task 11 are what license that.
5. `participants` and `spectators` are *not* produced here. They are `room`.

- [ ] **Step 9: Run to verify it passes**

Run: `pnpm --filter @release/table-adapter test -- toTableState`
Expected: PASS.

- [ ] **Step 10: Verify by mutation**

Change the pile sum to `piles[0]`. Confirm the deck-count test goes red. Then make the unknown-card path call `assetUrl` directly and confirm the placeholder test goes red. Restore both.

- [ ] **Step 11: Commit**

```bash
git add packages/table-adapter
git commit -m "feat(adapter): the projection becomes a table"
```


---

#### `toAction` — an intent becomes an action

Lives at `packages/table-adapter/src/toAction.ts`, tested at `packages/table-adapter/src/toAction.test.ts`.

**Interfaces:**
- Consumes: `Action`, `Target`, `Choice` from `@release/engine`.
- Produces: `toAction(intent, player, at): Action`, where `intent` is a discriminated union mirroring `TableActions`' callbacks.

- [ ] **Step 12: Write the failing tests**

```ts
it('stamps the player and the clock onto a play', () => {
  expect(toAction({ kind: 'play', card: 'c1' }, 'you', 1234)).toEqual({
    type: 'PLAY',
    player: 'you',
    card: 'c1',
    target: undefined,
    combo: undefined,
    at: 1234,
  })
})

it('carries the target and the combo through untouched', () => {
  const target = { kind: 'player', player: 'p2' } as const
  const a = toAction({ kind: 'play', card: 'c1', target, combo: 'c2' }, 'you', 9)
  expect(a).toMatchObject({ type: 'PLAY', target, combo: 'c2' })
})

it('omits the player on WINDOW_EXPIRED, which belongs to no one', () => {
  expect(toAction({ kind: 'windowExpired' }, 'you', 7)).toEqual({ type: 'WINDOW_EXPIRED', at: 7 })
})

it('wraps a choice into RESOLVE', () => {
  const choice = { kind: 'defend', card: null } as const
  expect(toAction({ kind: 'resolve', choice }, 'you', 3)).toEqual({
    type: 'RESOLVE',
    player: 'you',
    choice,
    at: 3,
  })
})
```

- [ ] **Step 13: Run to verify it fails**

Run: `pnpm --filter @release/table-adapter test -- toAction`
Expected: FAIL — module not found.

- [ ] **Step 14: Implement**

An exhaustive `switch` over the intent kinds with a `never` default, so a new engine action that gains a kit callback cannot be silently dropped:

```ts
default: {
  const exhaustive: never = intent
  throw new Error(`unhandled intent: ${JSON.stringify(exhaustive)}`)
}
```

`WINDOW_EXPIRED` is the one action carrying no `player` — its type in `actions.ts` has only `type` and `at`.

- [ ] **Step 15: Run to verify it passes**

Run: `pnpm --filter @release/table-adapter test -- toAction`
Expected: PASS.

- [ ] **Step 16: Verify by mutation**

Hardcode `at: 0` in the play branch. Confirm the stamping test goes red. Restore.

- [ ] **Step 17: Commit**

```bash
git add packages/table-adapter
git commit -m "feat(adapter): an intent becomes an action"
```


### Task 12: An engine-driven `TableStory`

**Files:**
- Modify: `apps/playground/package.json`
- Modify: `apps/playground/vite.config.ts`
- Modify: `apps/playground/tsconfig.json`
- Create: `apps/playground/stories/TableStory/useFakeGame.ts`
- Modify: `apps/playground/stories/TableStory/TableStory.tsx`

**Interfaces:**
- Consumes: `createFakeEngine`, `FAKE_DECK`, `FAKE_EVENTS` from `@release/engine`; `TableProps` from `@release/ui`.
- Produces: a `live` toggle on the story. This is milestone 2's acceptance gate.

- [ ] **Step 1: Wire `@release/engine` into the playground**

`package.json` dependencies gain `"@release/engine": "workspace:*"`. `vite.config.ts` gains the alias next to the existing ui alias:

```ts
const engineSrc = fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url))
// …
{ find: '@release/engine', replacement: engineSrc },
```

`tsconfig.json` paths gain `"@release/engine": ["../../packages/engine/src/index.ts"]`. Run `pnpm install`.

- [ ] **Step 2: Write `useFakeGame.ts`**

```ts
import {
  type Action,
  type Event,
  type GameState,
  type PlayerView,
  createFakeEngine,
  FAKE_DECK,
  FAKE_EVENTS,
} from '@release/engine'
import { useCallback, useMemo, useState } from 'react'

const engine = createFakeEngine()

export function useFakeGame(opponents: number) {
  const [state, setState] = useState<GameState>(() =>
    engine.createGame({
      gameId: 'playground',
      seed: 1,
      players: [
        { id: 'you', name: 'you' },
        ...Array.from({ length: opponents }, (_, i) => ({ id: `p${i + 2}`, name: `bot${i + 2}` })),
      ],
      setup: {},
      deck: FAKE_DECK,
      events: FAKE_EVENTS,
    }),
  )
  const [log, setLog] = useState<Event[]>([])

  const dispatch = useCallback((action: Action) => {
    setState((prev) => {
      const { state: next, events } = engine.reduce(prev, action)
      setLog((l) => [...l, ...events])
      return next
    })
  }, [])

  const view: PlayerView = useMemo(() => engine.project(state, 'you'), [state])
  const legalTargets = useCallback((card: string) => engine.legalTargets(state, 'you', card), [state])

  return { view, log, dispatch, legalTargets }
}
```

Read `engine.createGame`'s real `setup` expectations from `packages/engine/src/fake/setup.ts` before passing `{}` — if it requires mode keys, pass the same `DEFAULT_SETUP` the kit uses.

- [ ] **Step 3: Add the `live` mode to the story**

A `mock | live` toggle beside the existing `host | guest` switch. In `live`, the story builds `TableProps` from `useFakeGame`'s `view` and passes real `actions` that stamp `player: 'you'` and `at: Date.now()` — the playground is a consumer, so it owns the clock, exactly as the frontend will. In `mock`, everything behaves as today. The existing selectors (`view`, `end`, `dock`) apply only in `mock` mode and are disabled in `live`.

Build the story's `TableProps` with `toTableState` from `@release/table-adapter` (Task 11) — the same adapter the board page uses in Task 17. There is no second mapping to keep in sync.

- [ ] **Step 4: Play it**

Run: `pnpm dev:playground`, open `/table`, switch to `live`. Play a full solo game: draw, play a card, release, trigger a reaction window, defend, reach a win.

Expected: every step works without the frontend. This is the milestone's definition of done — if a step is impossible, the gap is in this milestone, not the next one.

- [ ] **Step 5: Verify**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/playground
git commit -m "feat(playground): the table plays a real game"
```

---

# Milestone 3 — The page

### Task 13: `@release/engine` and `@release/table-adapter` in the frontend build

**Files:**
- Modify: `apps/frontend/package.json`
- Modify: `apps/frontend/vite.config.ts:7-10,36-43`
- Modify: `apps/frontend/tsconfig.json:5-10`
- Modify: `apps/frontend/vitest.config.ts`

- [ ] **Step 1: Add the dependency and the three aliases**

`package.json` dependencies gain `"@release/engine": "workspace:*"` and `"@release/table-adapter": "workspace:*"`. In `vite.config.ts`:

```ts
const engineSrc = fileURLToPath(new URL('../../packages/engine/src/index.ts', import.meta.url))
```

and `{ find: '@release/engine', replacement: engineSrc }` in the alias array, plus the same pair for `@release/table-adapter` → `../../packages/table-adapter/src/index.ts`. `tsconfig.json` paths gain both. Mirror both aliases into `vitest.config.ts` so tests resolve them too.

- [ ] **Step 2: Verify**

Run: `pnpm install && pnpm typecheck`
Expected: PASS.

- [ ] **Step 3: Commit**

```bash
git add apps/frontend/package.json apps/frontend/vite.config.ts apps/frontend/tsconfig.json apps/frontend/vitest.config.ts pnpm-lock.yaml
git commit -m "build(web): the frontend can see the engine and the adapter"
```

---

### Task 14: `entities/game` re-exports the contract

**Files:**
- Modify: `apps/frontend/src/entities/game/types.ts`

**Interfaces:**
- Consumes: `@release/engine` types; `@release/table-adapter` (Task 11).
- Produces: `entities/game` as the frontend's single door onto the contract, so `features/` and `pages/` never import either package directly.

The compile-time assertions live in `@release/table-adapter` (Task 11), not here — the package is the layer that sees both sides.

- [ ] **Step 1: Replace the placeholder**

`types.ts` currently declares a three-field `GameState` placeholder whose comment says so. Replace it wholesale:

```ts
// The engine is the contract. This module exists so the frontend's one-way
// import rule holds: features/ and pages/ import game types from entities/,
// not from the packages directly.
export type {
  Action,
  CardId,
  CardUid,
  Choice,
  Engine,
  Event,
  GameConfig,
  GameState,
  Pending,
  PendingView,
  PlayerId,
  PlayerView,
  Target,
  WindowView,
} from '@release/engine'

export { toAction, toTableState } from '@release/table-adapter'
export type { HistoryLabels } from '@release/table-adapter'
```

- [ ] **Step 2: Repoint the old placeholder's importers**

Run: `grep -rn "entities/game" apps/frontend/src`
Every hit that used the three-field `GameState` needs repointing at the engine's real one. `network/types.ts` carries the per-turn snapshot as an opaque object — leave that alone; it is the sync layer's, not the engine's.

- [ ] **Step 3: Verify**

Run: `pnpm --filter @release/web typecheck && pnpm --filter @release/web test`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add apps/frontend/src/entities/game
git commit -m "feat(web): one door onto the contract"
```

---

### Task 15: Copy for pending, window and the error banner

**Files:**
- Modify: `packages/translation/src/locales/en/common.json`
- Modify: `packages/translation/src/locales/ru/common.json`

Every key must exist in both files — a key in one only silently falls back.

- [ ] **Step 1: Add the `pending` block**

One prompt string plus its action labels per `Pending` kind: `discardForRelease`, `defend`, `neutralize503`, `crush`, `requestCard`, `giveCard`, `handLimit`. Plus shared `confirm` and `decline`.

- [ ] **Step 2: Add the `window` block**

The reaction-window banner plus the attack and pass affordances.

- [ ] **Step 3: Add the engine-error key**

One string for the non-fatal banner `useGame` raises when `reduce` throws.

- [ ] **Step 4: Extend `moveHistory`**

It currently holds `draw` and `eliminated`, because the mock supplied `HistoryEntry.kind` as a free-form Russian literal. The adapter now maps event types to translated labels, so every `type` in the `Event` union needs a key. Read `packages/engine/src/events.ts` and add one per member.

- [ ] **Step 5: Verify**

Run: `pnpm lint && pnpm typecheck`
Expected: PASS. The typed-key augmentation in `@release/translation` catches a key added to one catalog only.

- [ ] **Step 6: Commit**

```bash
git add packages/translation/src/locales
git commit -m "feat(i18n): the table learns to ask in two languages"
```

---

### Task 16: `useGame`

**Files:**
- Create: `apps/frontend/src/features/play-game/useGame.ts`
- Test: `apps/frontend/src/features/play-game/useGame.test.ts`

**Interfaces:**
- Consumes: `toAction` from `@release/table-adapter` (Task 11); `Engine`, `GameState`, `PlayerView` via `entities/game` (Task 14).
- Produces: `useGame({ engine, config, selfId })` returning `{ view, log, error, dispatch, legalTargets }`. Task 17 renders it.

- [ ] **Step 1: Write the failing tests**

```ts
it('stamps every dispatched action with the player and a clock reading', () => {
  const reduce = vi.fn((s, a) => ({ state: s, events: [] }))
  const { result } = renderHook(() => useGame({ engine: { ...fake, reduce }, config, selfId: 'you' }))
  act(() => result.current.dispatch({ kind: 'push' }))
  const action = reduce.mock.calls[0][1]
  expect(action.player).toBe('you')
  expect(typeof action.at).toBe('number')
})

it('keeps the last good state and raises the banner when reduce throws', () => {
  const reduce = vi.fn(() => {
    throw new Error('rules bug')
  })
  const { result } = renderHook(() => useGame({ engine: { ...fake, reduce }, config, selfId: 'you' }))
  const before = result.current.view
  act(() => result.current.dispatch({ kind: 'push' }))
  expect(result.current.view).toBe(before)
  expect(result.current.error).toBeTruthy()
})

it('fires WINDOW_EXPIRED once when the deadline passes, not on every tick', () => {
  vi.useFakeTimers()
  const reduce = vi.fn((s, a) => ({ state: s, events: [] }))
  const engine = { ...fake, reduce, project: () => ({ ...baseView, window: { deadline: Date.now() + 1000, canAttackWith: [], passed: [], player: 'p2', slot: 'frontend', round: 1 } }) }
  renderHook(() => useGame({ engine, config, selfId: 'you' }))
  act(() => vi.advanceTimersByTime(3000))
  const expired = reduce.mock.calls.filter(([, a]) => a.type === 'WINDOW_EXPIRED')
  expect(expired.length).toBe(1)
  vi.useRealTimers()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @release/web test -- useGame`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```ts
export function useGame({ engine, config, selfId }: Options) {
  const [state, setState] = useState<GameState>(() => engine.createGame(config))
  const [log, setLog] = useState<Event[]>([])
  const [error, setError] = useState<string | null>(null)

  const dispatch = useCallback(
    (intent: Intent) => {
      const action = toAction(intent, selfId, Date.now())
      setState((prev) => {
        try {
          const { state: next, events } = engine.reduce(prev, action)
          setLog((l) => [...l, ...events])
          setError(null)
          return next
        } catch (e) {
          // The reducer is someone else's code. Losing a live match to a rules
          // bug is worse than a degraded one, so keep the last good state.
          setError(e instanceof Error ? e.message : String(e))
          return prev
        }
      })
    },
    [engine, config, selfId],
  )
  // …
}
```

The deadline interval lives here: one `useEffect` keyed on `view.window?.deadline` that sets a timeout for the remaining milliseconds and dispatches `{ kind: 'windowExpired' }` once, clearing on unmount and on deadline change. A timeout rather than a polling interval is what makes "once, not per tick" structural instead of guarded.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @release/web test -- useGame`
Expected: PASS.

- [ ] **Step 5: Verify by mutation**

Remove the `try`/`catch`. Confirm the last-good-state test goes red. Then swap the timeout for a 100 ms interval and confirm the once-only test goes red. Restore both.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/play-game
git commit -m "feat(web): the game survives its own reducer"
```

---

### Task 17: The page

**Files:**
- Modify: `apps/frontend/src/pages/board/[gameId]/_layout.tsx`
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/board.test.tsx`

**Interfaces:**
- Consumes: `useGame` (Task 16), `toTableState` from `@release/table-adapter` (Task 11), `useSession` from `~/app/providers/SessionProvider`.
- Produces: `/board/:gameId` on real state. `PLACEHOLDER_STATE` is deleted.

- [ ] **Step 1: Write the failing tests**

Extend the existing `board.test.tsx`:

```tsx
it('renders the local player’s hand from the projection, not a placeholder', () => {
  const { container } = renderBoard()
  expect(container.querySelectorAll('[data-hand-slot]').length).toBeGreaterThan(0)
})

it('opens a drawer panel from the ?panel= query', () => {
  const { getByText } = renderBoard({ search: '?panel=rules' })
  expect(getByText(en.rulesBlock.title)).toBeTruthy()
})

it('leaves the drawer closed with no ?panel=', () => {
  const { queryByText } = renderBoard()
  expect(queryByText(en.rulesBlock.title)).toBeNull()
})
```

`renderBoard` wraps the page in the app's router and session providers — follow the pattern already in `apps/frontend/src/pages/lobby/__tests__/lobby.test.tsx`.

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @release/web test -- board`
Expected: FAIL — the page still renders `PLACEHOLDER_STATE`.

- [ ] **Step 3: Implement**

```tsx
export default function BoardPage() {
  const { t } = useTranslation()
  const session = useSession()
  const [params, setParams] = useSearchParams()
  const { view, log, error, dispatch, legalTargets } = useGame({ engine, config, selfId })

  const panel = (params.get('panel') as Panel | null) ?? null
  const onPanelChange = (next: Panel | null) =>
    setParams((prev) => {
      const q = new URLSearchParams(prev)
      if (next) q.set('panel', next)
      else q.delete('panel')
      return q
    })

  return (
    <div data-testid="board-page">
      <Table
        state={toTableState(view, log, t('moveHistory', { returnObjects: true }))}
        room={{
          role: session.isHost ? 'host' : 'guest',
          code: session.roomCode ?? undefined,
          participants,
          spectators,
          onKickSpectator: session.kick,
          lang: i18n.language as SwitchLang,
          onLangChange: (l) => i18n.changeLanguage(l),
        }}
        actions={{
          onPlay: (card, target, combo) => dispatch({ kind: 'play', card, target, combo }),
          onDraw: (pile) => dispatch({ kind: 'draw', pile }),
          onPush: () => dispatch({ kind: 'push' }),
          onAttack: (card, combo) => dispatch({ kind: 'attack', card, combo }),
          onPass: () => dispatch({ kind: 'pass' }),
          onUnpass: () => dispatch({ kind: 'unpass' }),
          onResolve: (choice) => dispatch({ kind: 'resolve', choice }),
          legalTargets,
        }}
        copy={{
          table: t('table', { returnObjects: true }),
          modes: t('gameModes', { returnObjects: true }),
          rules: t('rulesBlock', { returnObjects: true }),
          seat: t('seat', { returnObjects: true }),
          participants: t('participants', { returnObjects: true }),
          history: t('moveHistory', { returnObjects: true }),
          reconnect: t('reconnect', { returnObjects: true }),
          gameOver: t('gameOver', { returnObjects: true }),
          lobbyCode: t('lobbyCode', { returnObjects: true }),
          turnDock: t('turnDock', { returnObjects: true }),
          pending: t('pending', { returnObjects: true }),
          window: t('window', { returnObjects: true }),
        }}
        panel={panel}
        onPanelChange={onPanelChange}
        slots={{
          corner: <LeaveGame />,
          banner: error ? <ErrorBanner>{t('game.engineError')}</ErrorBanner> : null,
        }}
      />
      <Outlet />
    </div>
  )
}
```

Delete `PLACEHOLDER_STATE` entirely. The page stays thin — hook, adapters, `t()`, the query binding, the slots — per the layer rule in `apps/frontend/CLAUDE.md`.

`participants` and `spectators` are derived from `session.state.peers` exactly as `pages/lobby/_LobbyView.tsx:43-44` does it — `role === 'host' || role === 'player'` are participants, `role === 'guest'` are spectators. Reuse that split rather than reinventing it.

**Three `room` fields have no source and are left unset.** `UseLobby` (`apps/frontend/src/network/useLobby.ts:63-81`) exposes `state`, `status`, `roomCode`, `isHost`, `kick`, `setMaxPlayers`, `transferHost`, `setSetup`, `disband`, `leaveSession` — and nothing more. So:

1. **`spectatorLimit` / `onSpectatorLimitChange`** — `LobbyState` carries `maxPlayers`, not a spectator cap. The host's spectator slider therefore does not render on the board. This is a real gap in the session layer, not something to fake from `maxPlayers`.
2. **`connection`** — `LobbyStatus` is `'idle' | 'connecting' | 'in-lobby' | 'kicked' | 'disbanded' | 'error'`. There is no `reconnecting`, so the `Reconnect` overlay has no trigger yet.
3. **`disconnected`** — no per-peer liveness is tracked, so no seat renders as disconnected.

All three props are optional, so the page compiles and runs without them. Do **not** invent session APIs to fill these in — note them and move on. They belong to [#60](https://github.com/MythHand/ReleaseBoardGameP2P/issues/60), the P2P sync layer, which is where peer liveness gets modelled.

Where the engine config comes from is a real question this task must answer: the seed and player roster come from the lobby session, so read them from `useSession()`. If the session does not carry a seed yet, generate one with `crypto.getRandomValues` at game start on the host and store it on the session — the engine never sources randomness itself.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --filter @release/web test -- board`
Expected: PASS.

- [ ] **Step 5: Verify by mutation**

Make `onPanelChange` a no-op. Confirm the `?panel=` test still passes (it reads, not writes) but add a click assertion that goes red. Then hardcode `panel={null}` and confirm the `?panel=rules` test goes red. Restore.

- [ ] **Step 6: Play it in the app**

Run: `pnpm dev`, open `/board/test`. Play through draw → play → release → reaction → defend. Confirm browser-back closes an open drawer rather than leaving the page.

- [ ] **Step 7: Full verification**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: all green.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/pages/board
git commit -m "feat(web): the board stops pretending"
```

---

## Definition of done

- [ ] `Table` takes six grouped props; no `turnDock*`, no `view`, no flat `*Copy`
- [ ] `panel` is controlled from `?panel=` on the page and uncontrolled in the playground
- [ ] Gesture state lives only in `useTableInteractions`; `Table` has no domain `useState`
- [ ] `@release/ui` imports nothing from `@release/engine`, and `@release/table-adapter`'s `contract.test-d.ts` proves the mirror is exact
- [ ] `toTableState` exists once, in `@release/table-adapter`, and both the playground story and the board page import it
- [ ] `WindowView` and the `defend` pending carry `openedAt`, so the ring sweeps a real span
- [ ] A solo game is playable end to end at `playground/table` with no frontend
- [ ] `/board/:gameId` renders projected state; `PLACEHOLDER_STATE` is deleted
- [ ] `cardCanTarget`, `isComboSource`, `validComboTarget` are gone from `@release/ui`'s public API
- [ ] New copy exists in both `en` and `ru`
- [ ] Every new test verified by mutation
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` green

## Deliberately not here

Milestone 4 (the animation anchor registry and the event → preset driver, with the `Interaction audit` story updated) and the five card surfaces in [#61](https://github.com/MythHand/ReleaseBoardGameP2P/issues/61). Neither is blocked by this plan.
