# Invite screen — Design

## Goal

Bring the frontend's invite route `/lobby/:lobbyId` onto the invite screen already
designed in the playground (`playground/invite`), with all five reachable states —
`form`, `connecting`, `connected`, `failed`, `notFound`.

Getting there requires extracting the layout that the start screen and the invite
screen share, so "the same layout" stays true instead of drifting apart the way the
current copies already have.

Spectator ("guest") joining is not supported yet and stays out of scope.

## Context

`@release/ui` already ships the finished screen — `apps/ui/src/screens/Invite/`,
exported as `Invite` with `InviteCopy` / `InviteState` / `SlotAvailability` /
`JoinRole`. It is i18n-agnostic (all copy via props) and implements every state.
`apps/playground/stories/InviteStory/` drives it with two selectors.

The frontend does not use it. `apps/frontend/src/pages/lobby/[lobbyId].tsx` renders
a bare `Shell` + card + `JoinLobbyForm`, branching on `session.status` for five
cases: join form, kicked, disbanded, an "already in a session" Continue/Leave
interstitial, and the live `_LobbyView`.

The same divergence exists on the start screen. `apps/frontend/src/pages/start.module.css`
opens with `/* Ported from apps/ui/src/screens/Start/Start.module.css. */` and is a
third copy of the shared background chrome. It has already drifted: `start.tsx`
renders `.bg`, `.blur` and `.scrim` but **no `HudBackground`**, so the frontend's
`/start` is missing the HUD grid the playground shows.

> **Superseded in part.** Decision 1 below was reversed during implementation: `apps/ui/src/screens/`
> is a design *mockup*, not a dependency, so the frontend implements the screen itself and shares a
> `ScreenShell` of its own between `/start` and `/lobby/:lobbyId`. See
> [`2026-07-27-invite-screen-plan.md`](./2026-07-27-invite-screen-plan.md). Everything else here —
> the state machine, the error classification, the layout measurements, the copy decisions — still
> governs, and `ScreenShell` carries the same values this document specifies.

## Decisions

1. ~~**Consume `@release/ui`, don't re-port.**~~ *(Superseded — see the note above.)* The page becomes a thin adapter. This is
   the CLAUDE.md rule for `apps/frontend` ("All visuals come from `@release/ui`") and
   the only option under which "the same layout" survives future edits.

2. **Only the join-form branch changes.** `kicked`, `disbanded`, the interstitial and
   `_LobbyView` keep their current appearance; `pages/lobby/_ui.tsx` and `_ui.module.css`
   stay for them.

3. **The role control renders locked to player.** The wire protocol has no field for a
   requested role — `handleJoinRequest` calls `assignRole(state)` and the host decides.
   Slot availability is also unknowable before connecting, since a joiner learns the
   roster only after the DataChannel opens. So the control is shown and disabled rather
   than hidden, keeping the layout intact for when spectator joining lands.

4. **`SlotAvailability` gains `'playerOnly'`**, symmetric with the existing
   `'spectatorOnly'`: spectator disabled, player selected, no note. A value on an axis
   that already exists, rather than a second prop interacting with the first.

5. **`full` is unreachable and stays unimplemented in the app.** `assignRole` falls back
   to spectator when player slots run out, so a joiner is never turned away for capacity.
   The `Invite` component keeps the state for the sandbox; the frontend never produces it.

6. **`connected` ends when the roster arrives**, not on a timer. See "State mapping".

7. **One shared column, at the compact scale.** The start and invite screens share their
   chrome and their opening column; the shared version uses the invite screen's compact
   type scale, and the start screen moves to it. See "Layout measurements" for why the
   reverse direction does not fit.

8. **Migrating `/start` is chrome-only.** It picks up the shared shell and the restored
   HUD grid. It does not gain the printed-edition block or the credits that
   `@release/ui`'s `Start` renders — that is a content change nobody asked for, so
   `physicalEditionCopy` is optional on the shell.

9. **`/start` does not adopt `@release/ui`'s `Start` screen.** That screen owns its three
   modals with local `useState`, plus its own nickname/code/setup state and its own
   create and join forms. The frontend routes modals through `?modal=` (`useModalRoute`
   → `AppModals` → `ModalRouter`) and has a fourth menu item — the continue-session
   button — that `Start`'s hard-coded menu has no slot for. Adopting it would mean losing
   routed modals or growing `Start` a controlled-modal API, and would orphan
   `CreateLobbyForm` / `JoinLobbyForm` along with the `~/shared/ui/Form` validation rule
   they exist to satisfy. `Start`'s component is not exported from `apps/ui/src/index.ts`
   today (only the `StartCopy` type is), which points the same way.

## Layout measurements

Measured in the playground at 1440×900, RU logo (`301×105`; the EN variant is `301×115`,
so it renders taller at the same width).

| | start screen | invite screen |
|---|---|---|
| column height | 747px | 829px |
| column bottom | 819px (credits at 833 — **14px** clear) | 893px (**7px** clear) |
| logo | 167px tall @ 480px wide | 92px tall @ 263px wide |
| tags → description gap | 38px | 22px |
| description | 72px, `body-lg`, 460px wide | 91px, `body`, 420px wide |
| gap below description | 96px | 44px |
| column body | menu, 325px | form 426px + 44 gap + home button 43px |

Neither screen has spare vertical room today. Applying the start screen's rhythm to the
invite column grows it to **950px**: the action slot lands at y=838–908 so the connect
button straddles the fold, and the home-page button ends at **1014px — 114px below a
900px viewport**.

The arithmetic behind that: the form stack below the description is a fixed 513px
(426 form + 44 gap + 43 button). With 72px of top padding, a 900px viewport leaves 315px
for logo + tags + description + gaps. The invite screen currently spends 297px; the start
screen spends 505px. The invite screen's 263px logo is therefore not a stylistic
preference — it is the largest that clears the fold.

Applying the invite screen's compact scale to the start column shrinks it 747 → 651px,
which fits with room to spare. That is the direction this design takes: the start screen's
logo drops from 480px to 263px and its description tightens to `body` at 420px with a
44px gap below.

## `ScreenShell` — new in `@release/ui`

A new unit under `apps/ui/src/screens/ScreenShell/` holding everything the two screens
share:

- the four background layers — `.bg` (photo), `.blur` (11px, three-stop mask), `.scrim`,
  and `HudBackground` with `tone="grid"`
- the language corner — `.langShade` (340×200) + `.langCorner` at `72px`/`76px`, rendered
  only when both `lang` and `onLangChange` are given
- `.content` → `.col` (460px)
- the opening column at the compact scale: `ReleaseLogo` (263px, `-7px` inline start,
  12px below), tags (22px below), description (`body`, max 420px)

Props: `logoAlt`, `logoVariant`, `tags`, `description`, optional `lang` / `onLangChange`,
optional `physicalEditionCopy` (rendered in the bottom-right at `15px`/`51px`/`56%`/`440px`
when given), optional `corners` for extra absolutely-positioned blocks, and `children` —
the column body below the description.

**Height contract.** `.root` takes `block-size: 100%`, so every consumer must give it a
parent with a *definite* height. `StartStory.module.css` and `InviteStory`'s stage already
do. The frontend does not: `app/app.module.css` `.root` is `min-block-size: 100vh`, and a
percentage height does not resolve against `min-height` — the shell would collapse. So the
frontend pages keep a thin `100vh` wrapper class of their own, which is what
`pages/start.module.css` `.root` already provides today.

`screens/Start` then renders `<ScreenShell>` with the menu as children and its credits and
`VideoPlayer` via `corners`; `screens/Invite` renders it with the form as children.

## `Invite` changes

Beyond composing `ScreenShell`, one behavioural change:

```ts
export type SlotAvailability = 'open' | 'playerOnly' | 'spectatorOnly' | 'full'
```

- the spectator button's `disabled` becomes `specOnly || noSlots || playerOnly || busy`
- the note stays gated on `specOnly || noSlots`, so `playerOnly` renders none
- `effectiveRole` forces `'player'` under `playerOnly`, mirroring how `specOnly` forces
  `'spectator'`

No CSS or copy changes. The fixed-height `.fields` container already reserves the note's
space, so the layout is unchanged.

`InviteStory` gains a matching availability option (`playerOnly` — "только игрок" /
"player only") so the sandbox covers the state the app actually ships. `STATES_DEFAULT`
applies to it unchanged.

## Frontend changes

### `pages/lobby/_InviteScreen.tsx` (new)

The adapter. Underscore-prefixed so generouted ignores it, matching `_LobbyView.tsx`. It
builds `InviteCopy` from `t()`, derives the state, and wires the callbacks. Its only
styling is the `100vh` wrapper the height contract requires — a one-class
`_InviteScreen.module.css`, no visual rules.

It is a separate file rather than inline in the page because the page's remaining job is a
branch on `session.status`, while this assembles the whole `InviteCopy` object and derives
the state. Split this way it is testable by rendering it with a stubbed session, no route
params involved.

### `pages/lobby/[lobbyId].tsx`

```
kicked / disbanded        → status card (unchanged)
in-lobby && state:
    !continued            → Continue/Leave interstitial (unchanged)
    !peers[hostId]        → <InviteScreen />   (renders `connected`)
    otherwise             → <LobbyView />      (unchanged)
otherwise                 → <InviteScreen />   (replaces the join form)
```

The mount-time `clearError()` stays, so arriving fresh after a previous failure shows the
form rather than a stale error.

### `pages/start.tsx` + `start.module.css`

Compose `ScreenShell`; delete the ported chrome from the module CSS. The HUD grid returns.
The menu, the routed modals and the continue-session button are untouched.

`_app.tsx` is not touched: it renders the global `LanguageSwitch` only on `/start`, and
the shell draws its own corner switcher on the invite route.

### `network/useLobby.ts`

`UseLobby` gains one field:

```ts
errorKind: 'not-found' | 'connection' | null
```

Set wherever `error` is set — `onError`, `surfaceSetupError`, and the host-disconnect
branch — as `'not-found'` when the PeerJS error type is `peer-unavailable`, else
`'connection'`. Cleared by `clearError` and `leaveSession` alongside `error`.

This exists because `session.error` is a raw English PeerJS string
(`peer-unavailable: Could not connect to peer f96nmt`) that cannot be localized or matched
on safely. After this change those strings stop reaching the user; the action slot shows
the localized `notFoundStatus` / `connectError` line instead.

Second fix in the same file: `joinRoom` assigns `transportRef.current = t` without closing
any existing transport. Since `Invite` reuses `onJoin` for retry, every retry after a
`peer-unavailable` failure strands a live peer. `joinRoom` closes the previous transport
before creating one. The start-screen join modal has the same latent leak and is fixed by
the same change.

`JoinLobbyForm`, `useJoinLobby` and `CreateLobbyForm` are otherwise unchanged —
`JoinLobbyForm` still backs the start-screen join modal.

## State mapping

`_InviteScreen` derives `InviteState` in priority order:

| session | `InviteState` |
|---|---|
| `status === 'connecting'` | `connecting` |
| `status === 'error'`, `errorKind === 'not-found'` | `notFound` |
| `status === 'error'`, otherwise | `failed` |
| `status === 'in-lobby'` and `!state.peers[state.hostId]` | `connected` |
| anything else | `form` |

"Roster has not arrived" is `!state.peers[state.hostId]`. On join, `createLobbyState`
seeds `peers` with only the joiner; the host entry appears when its `PEER_LIST` arrives
and `applyPeerList` replaces the map. An exact signal, no timer and no counting. It also
self-corrects for a host, whose `selfId === hostId` makes `peers[hostId]` present from the
first frame — a host never passes through `connected`.

Callbacks:

- **`onJoin(nickname, code, role)`** — `role` is ignored while spectator joining is
  unsupported (it is always `'player'` under `playerOnly`). Awaits `joinLobby(code, nickname)`,
  then `goToLobby(formatted)`. A rejection is swallowed; `error` / `errorKind` already
  drive `failed` and `notFound`. Same body `JoinLobbyForm` uses today.
- **`onCancel`** (visible only in `connecting`) — `session.leaveSession()`, which resets to
  `idle` → `form`. `_InviteScreen` is not remounted and `Invite` holds nickname and code in
  its own state, so the typed values survive.
- **`onHome`** — `session.leaveSession()` then navigate to `/start`, matching today's Back
  link. This button renders in every state, so it is also the way out of `connected`.

Retry needs no new callback: `Invite` reuses `onJoin` and swaps the button label.

## Copy

A new `invite.*` block in `packages/translation/src/locales/{en,ru}/common.json`. Both
catalogs already exist verbatim as the `COPY` constant in
`apps/playground/stories/InviteStory/InviteStory.tsx`; they move to the catalog, and the
story then reads them from there as it already does for `physicalEdition`.

`invite.*` holds only the invite-specific fields — form title, field labels, role labels,
the action labels and the status lines. The shared opening column reuses the existing
`start.logoAlt`, `start.tagOpenP2P`, `start.tagBoardCard` and `start.description`, since
the whole point of `ScreenShell` is that this part of the two screens is one thing. The
story's `COPY` currently carries its own near-duplicate wording for those four; the
`start.*` values win and the duplicates are dropped rather than migrated.

`physicalEdition` and `gameModes` are already central. `_InviteScreen` reads the former
with `t('physicalEdition', { returnObjects: true })`, the pattern `_LobbyView` uses.
`logoVariant` derives from `i18n.resolvedLanguage`, as `AppLogo` does.

## Note on the frontend form rule

`apps/frontend/CLAUDE.md` requires every form to use `~/shared/ui/Form`. `Invite` contains
no `<form>` element — it is `Input`s plus a `Button` with its own required-field feedback
(`play('shake', …)` on empty fields). It does not break the rule, and it satisfies the
rule's purpose. Recorded here so it is not "fixed" later.

## Milestones

| | Scope |
|---|---|
| **M1** | `ScreenShell` in `@release/ui` — chrome, lang corner, `.content`/`.col`, the compact opening column, `children` and the optional slots |
| **M2** | `screens/Start` composes `ScreenShell`; the start screen moves to the compact scale. The one visible design change; verified against `StartStory` |
| **M3** | `screens/Invite` composes `ScreenShell`; `SlotAvailability` gains `playerOnly`; `InviteStory` gains the option |
| **M4** | `pages/start.tsx` composes `ScreenShell`; ported chrome leaves `start.module.css`; HUD grid restored |
| **M5** | `network/useLobby.ts` — `errorKind`, and `joinRoom` closing an existing transport |
| **M6** | `/lobby/:lobbyId` renders `_InviteScreen`; `invite.*` copy; tests |

M1–M2 carry the only real regression risk and come first, where the playground catches
them before anything is built on top.

`pnpm lint`, `pnpm typecheck` and `pnpm test` pass after each milestone.

## Testing

- `_InviteScreen` — a table test over the state derivation: the five session shapes map to
  the five `InviteState` values, rendered with a stubbed session.
- `useLobby` — `errorKind` is `'not-found'` for a `peer-unavailable` error and
  `'connection'` for a network error; a re-join closes the previous transport instead of
  orphaning it.
- `pages/lobby/__tests__/lobby.test.tsx` — four tests exercise the pre-session branch and
  are rewritten against the new screen: "shows the join form when there is no session",
  "pre-fills the code from a shared /lobby/:lobbyId link", "clears a stale error on mount",
  and "pre-session Back resets the (failed) session" (its `lobby.back` target becomes the
  shell's home button). The remaining twelve — kicked, disbanded, the interstitial and
  `_LobbyView` — must pass untouched; that is the regression signal for decision 2. Their
  `inSession()` fixture already seeds `peers.h` against `hostId: 'h'`, so the new roster
  check resolves to `_LobbyView` for them exactly as before.
- `base()` in that file constructs a complete `UseLobby`, so it gains `errorKind: null`
  when M5 lands — the type is re-exported through `~/entities/lobby`, which is what the
  test imports.
- `ScreenShell` is verified visually through `StartStory` and `InviteStory` rather than by
  unit test — it is pure layout.

## Known limitations

A host that opens the DataChannel but never sends `PEER_LIST` leaves the screen on
`connected` indefinitely, and that state has no cancel button. Connection-level failures
still resolve correctly (`onDisconnect` and `onError` flip to `error` → `failed`), so this
only bites when the host is alive but silent. `onHome` is the escape. If it shows up in
practice, the remedy is a floor-and-ceiling on the state — reveal the lobby once the roster
arrives, but no sooner than ~400ms and no later than ~3s.

## Out of scope

- **Spectator / guest joining.** Needs a requested-role field on `JOIN_REQUEST` and for
  `assignRole` to honour it. When it lands, `playerOnly` becomes `open` and the role
  control is already in place.
- **Real slot availability before connecting.** Would need the host to publish capacity
  through signaling; P2P gives a joiner nothing until the DataChannel opens.
- **`/start` adopting `@release/ui`'s `Start` screen** — see decision 9. If wanted, it
  needs a controlled-modal API on `Start` and belongs in its own spec.
- **`kicked` / `disbanded` / the Continue-Leave interstitial** keep their current
  appearance.
