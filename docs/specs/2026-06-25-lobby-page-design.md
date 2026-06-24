# Lobby Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the full lobby page in `apps/frontend`, extending `useLobby` to sync game settings and disband, and add a "continue session" entry to the start screen.

**Architecture:** Three milestones — network layer (protocol + state extensions), `_LobbyView` UI component, start screen extension — implemented together on one branch. The UI consumes `useSession()` from the existing `SessionProvider`.

**Tech Stack:** React 19, TypeScript, Tailwind v4, `@release/ui` primitives, `@release/translation` (react-i18next), PeerJS P2P transport.

## Global Constraints

- No new `*.module.css` files — all styling via Tailwind v4 utilities in `@release/web`.
- All user-visible strings use `t()` with keys present in both `en` and `ru` catalogs in `packages/translation/src/locales/`.
- Consume components from `@release/ui` where applicable (`Avatar`, `Badge`, `Button`, `Slider`, `Toggle`, `Modal`, `ModeSelect`).
- `pnpm lint`, `pnpm typecheck`, and `pnpm test` must pass after each milestone.
- `GAME_MODES.map(ModeSelect)` pattern for game settings (no `GameSettings` block component).

---

## Scope

### Part 1 — Network layer

**Files changed:**
- `apps/frontend/src/network/types.ts`
- `apps/frontend/src/network/lobby/state.ts`
- `apps/frontend/src/network/lobby/host.ts`
- `apps/frontend/src/network/useLobby.ts`

#### Protocol changes

`LOBBY_CONFIG_UPDATED` payload extended from `{ maxPlayers: number }` to:
```ts
{ maxPlayers?: number; setup?: Setup }
```

New message added to `Message` union in `types.ts`:
```ts
| { type: 'LOBBY_DISBANDED'; payload: Record<string, never> }
```

`LobbyStatus` gains `'disbanded'`:
```ts
export type LobbyStatus = 'idle' | 'connecting' | 'in-lobby' | 'kicked' | 'disbanded' | 'error'
```

#### State (`lobby/state.ts`)

`LobbyState` gains `setup: Setup` (defaults to `DEFAULT_SETUP` from `@release/ui`):
```ts
export interface LobbyState {
  selfId: string
  hostId: string
  maxPlayers: number
  setup: Setup
  peers: Record<string, PeerInfo>
}
```

`applyConfig` updated to accept a patch object:
```ts
export function applyConfig(
  state: LobbyState,
  patch: { maxPlayers?: number; setup?: Setup }
): LobbyState {
  return {
    ...state,
    ...(patch.maxPlayers !== undefined && { maxPlayers: patch.maxPlayers }),
    ...(patch.setup !== undefined && { setup: patch.setup }),
  }
}
```

#### `UseLobby` additions (`useLobby.ts`)

```ts
setSetup(setup: Setup): void
disband(): void
```

`setSetup` (host only): broadcasts `LOBBY_CONFIG_UPDATED` with `{ setup }`.

`disband` (host only): broadcasts `LOBBY_DISBANDED`, then calls `leaveSession()`.

Guest-side `onMessage` additions:
```ts
case 'LOBBY_DISBANDED':
  if (fromHost) {
    leaveSession()
    setStatus('disbanded')
  }
  break
```

---

### Part 2 — LobbyView component

**Files changed:**
- `apps/frontend/src/pages/lobby/_SessionView.tsx` (rewrite in-place with full lobby design)
- `apps/frontend/src/pages/lobby/_LobbyFlow.tsx` (update: handle `'disbanded'` status)

#### Layout

Two-column grid matching `apps/ui/src/screens/Lobby/Lobby.tsx`:

**Left column — game modes panel**
```tsx
const { t, i18n } = useTranslation()
const modesCopy = i18n.language.startsWith('en') ? MODES_COPY_EN : MODES_COPY_RU

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
      value={session.state.setup[m.key] ?? ''}
      readOnly={!session.isHost}
      onChange={(v) => session.setSetup({ ...session.state.setup, [m.key]: v })}
    />
  )
})}
```

Header: `t('lobby.modes')` + lock tag `t('lobby.modesLockedHint')` when guest.

**Right column — roster panel**

Room code display + share link `<Input readOnly>` with copy trailing button.

Player list (`role: 'host' | 'player'`):
- `Avatar`, name, role `Badge`, ready `Badge` or self-ready `Toggle`
- Host-only: `<Slider>` for capacity (min = `Math.max(2, playerCount)`, max = 6, calls `session.setMaxPlayers(n)`)
- Host-only kick button for other peers

Spectator list (`role: 'guest'`):
- `Avatar`, name, spectator `Badge`
- Host-only kick button

Action bar:
- Ready toggle button (non-host)
- Start button (host only, disabled unless `session.canStart`, title = `t('lobby.startHint')`)
- Back — navigate `/start`, session stays alive
- Leave — `session.leaveSession()` then navigate `/start`
- Disband button (host only) → confirmation `Modal` → calls `session.disband()`

`_LobbyFlow` also handles `status === 'disbanded'` like `'kicked'`: shows a message and a link back to `/start`.

---

### Part 3 — Start screen "continue session"

**Files changed:**
- `apps/frontend/src/pages/start.tsx`
- `apps/frontend/src/pages/lobby/_LobbyFlow.tsx`
- `packages/translation/src/locales/en/common.json`
- `packages/translation/src/locales/ru/common.json`

#### `start.tsx`

```tsx
const session = useSession()
const navigate = useNavigate()
const hasSession = session.status === 'in-lobby' && !!session.state

// In <Menu>:
{hasSession && (
  <MenuButton onClick={() => navigate('/lobby', { state: { resumed: true } })}>
    {t('start.continueSession')}
  </MenuButton>
)}
```

Placement: between the create/join group and the rules/github group.

#### `_LobbyFlow.tsx` — seed change

```ts
const [continued, setContinued] = useState(
  session.status !== 'in-lobby' || !!(location.state as { resumed?: boolean })?.resumed
)
```

This skips the "active session" intermediate prompt when arriving via the start screen Continue button.

---

## New translation keys

| Key | EN | RU |
|-----|----|----|
| `start.continueSession` | continue session | продолжить сессию |
| `lobby.modesLockedHint` | managed by host | настраивает хост |
| `lobby.disbandTitle` | Disband lobby? | Расформировать лобби? |
| `lobby.disbandConfirm` | The lobby will be closed and all connected players will be disconnected. This cannot be undone. | Лобби будет закрыто, все подключённые игроки — отключены. Действие нельзя отменить. |
| `lobby.disband` | disband | расформировать |
