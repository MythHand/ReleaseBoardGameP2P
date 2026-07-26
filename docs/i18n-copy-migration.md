# i18n: centralizing UI-kit copy — open decisions

> Status: **in progress, blocked on decisions below.** Started 2026-07-07 on branch `feat/design-iteration`.

## Problem

UI-kit (`@release/ui`) components ship their display copy as inline bundles in the
component `.tsx` — `export const <NAME>_COPY_RU / <NAME>_COPY_EN`. That is the
**wrong place**: translations should live in the single source of truth, the
central catalog `packages/translation/src/locales/{en,ru}/common.json`.

`@release/ui` must stay **i18n-agnostic** (no i18next import — project rule). So the
fix is: strings move to the catalog, the component keeps only its `…Copy`
interface + a required `copy` prop, and the **consumer** feeds copy from the
catalog.

## The recipe (proven, batch 1)

1. Add a namespace to `common.json` (ru + en) with the component's strings.
2. Component `.tsx`: delete the `_COPY_RU/EN` bundles; `copy` prop becomes **required**.
3. `apps/ui/src/index.ts`: drop the `<NAME>_COPY_*` exports (keep the type).
4. Consumers pass `copy` from the catalog:
   - Playground reads the catalog as **raw JSON data** — `@release/translation`
     is aliased to its `src` in the playground's `vite.config.ts` + `tsconfig.json`
     (added as a dep); a story does
     `pick(lang, { ru: ruCommon.<ns>, en: enCommon.<ns> })`.
   - `Table` (which composes many of these) takes each sub-copy as a **required prop**
     instead of mapping `lang → bundle` internally.

## Done (6/12) — committed `f6dd8d8`

`TurnDock`, `Seat`, `GameOver`, `Participants`, `MoveHistory`, `Reconnect`.
Catalog namespaces added: `turnDock`, `seat`, `gameOver`, `participants`,
`moveHistory`, `reconnect`. `apps/ui` + `apps/playground` typecheck green.

## Remaining (6/12)

`Modes` (`game/modes.ts`), `LobbyCode`, `Table` (own `TABLE_COPY`),
`PhysicalEdition`, `Rules`, `Lobby` (screen).

## Open decisions (resolve before finishing)

1. **Namespace collision — `Rules` and `Lobby`.**
   The catalog already has `rules` and `lobby` namespaces — these belong to the
   **frontend** (`@release/web` calls `t('lobby.copy')` etc.). The UI-kit
   `RulesCopy` / `LobbyCopy` have a different, wider shape. Merging kit copy into
   `rules` / `lobby` would clobber the frontend's namespace.
   - **Option A (recommended, no cross-team edit):** give each UI-kit component its
     own namespace — `gameModes`, `lobbyCode`, `table`, `physicalEdition`, and for
     the colliders `rulesBlock` + `lobbyScreen`. Never merge into the frontend's
     `rules` / `lobby`. Cost: catalog temporarily holds both (e.g. `rules` +
     `rulesBlock`) with similar text.
   - **Option B:** reconcile/merge into one shared namespace — this **touches the
     frontend's namespace usage**, so it's a coordination task with the frontend
     owner (@ditayler).

2. **Frontend companions.** Making `Table`'s copy props required breaks the
   frontend's consumers (its placeholder `<Table>`, and `MODES_COPY` used directly
   in `CreateLobbyForm` / `_LobbyView`). Those are the **frontend owner's** files —
   not touched here. They need companion changes in lockstep. Until then, repo-wide
   `pnpm typecheck` is red on `@release/web` and batch commits use `--no-verify`.

3. **Full single-source vs interim duplication.** Option A above leaves the
   frontend still importing its own copy (not yet from the same kit namespace).
   True "one source for everything" needs the frontend to consume the kit
   namespaces too — a joint step, likely alongside issue #51 (frontend consumes
   ui-kit screens as controlled components).

## Turn-key checklist — the remaining 6

Per component: the bundle, the catalog namespace (Option A above), and **every file that
imports/uses it** (so no re-discovery). Legend:

- **(self)** the component that defines the bundle — recipe step 2 (drop bundles, `copy`
  required) + step 3 (drop the `index.ts` export).
- **(agg)** a `@release/ui` **aggregator** that today builds this copy from `lang` and
  passes it down (`Table` and the screens `Lobby`/`Start`/`Invite`). It must stop the
  `lang → bundle` map and take the copy **as a prop** — which **cascades** to its own
  consumers. Do the leaf blocks first, aggregators last.
- **(story)** playground story — feed from the catalog (`pick(lang, { ru: ruCommon.<ns>, en: enCommon.<ns> })`).
- **⚠️ FE** frontend consumer — **@ditayler's zone, do NOT edit here**; list is for the companion PR.

Suggested order (leaf → aggregator; the two colliders need Option A confirmed first):

**1. `Table` own — `TABLE_COPY` → `table`**  ·  no FE, no collision (simplest)
- (self) `apps/ui/src/table/Table/Table.tsx` + `apps/ui/src/index.ts`
- (story) `apps/playground/stories/TableStory/TableStory.tsx`

**2. `LobbyCode` — `LOBBY_CODE_COPY` → `lobbyCode`**  ·  no FE, no collision
- (self) `apps/ui/src/blocks/LobbyCode/LobbyCode.tsx` (+ `blocks/LobbyCode/index.ts`) + `apps/ui/src/index.ts`
- (agg) `table/Table/Table.tsx`, `screens/Lobby/Lobby.tsx` — both build `codeCopy` from `lang`
- (story) `apps/playground/stories/blocks/LobbyCodeBlock.tsx`

**3. `PhysicalEdition` — `PHYSICAL_EDITION_COPY` → `physicalEdition`**  ·  no FE, no collision
- (self) `apps/ui/src/blocks/PhysicalEdition/PhysicalEdition.tsx` (+ its `index.ts`) + `apps/ui/src/index.ts`
- (agg) `screens/Start/Start.tsx`, `screens/Invite/Invite.tsx`
- (story) `apps/playground/stories/blocks/PhysicalEditionBlock.tsx`

**4. `Modes` — `MODES_COPY` (`game/modes.ts`) → `gameModes`**  ·  ⚠️ FE
- (self) `apps/ui/src/game/modes.ts` + `apps/ui/src/index.ts`
- (agg) `table/GameModes/GameModes.tsx`, `table/Table/Table.tsx`, `screens/Lobby/Lobby.tsx`
- (story) `TableStory`, `StartStory`, `blocks/GameSettingsBlock`, `kit/TogglesKit`
- ⚠️ FE: `apps/frontend/src/features/create-lobby/CreateLobbyForm.tsx`, `apps/frontend/src/pages/lobby/_LobbyView.tsx` (import `MODES_COPY_*` directly)

**5. `Rules` — `RULES_COPY` → `rulesBlock`**  ·  ⚠️ collides with catalog `rules` → use `rulesBlock` (Option A)  ·  ⚠️ FE
- (self) `apps/ui/src/blocks/Rules/Rules.tsx` (+ its `index.ts`) + `apps/ui/src/index.ts`
- (agg) `table/Table/Table.tsx`, `screens/Start/Start.tsx`, `screens/Lobby/Lobby.tsx`
- (story) `TableStory`, `StartStory`, `blocks/RulesBlock`
- ⚠️ FE: `apps/frontend/src/features/rules/Rules.tsx`

**6. `Lobby` screen — `LOBBY_COPY` → `lobbyScreen`**  ·  ⚠️ collides with catalog `lobby` → use `lobbyScreen` (Option A)  ·  do LAST
- (self/agg) `apps/ui/src/screens/Lobby/Lobby.tsx` — the biggest aggregator: builds `LOBBY_COPY` **and** `modesCopy`/`rulesCopy`/`codeCopy`, so finish #2/#4/#5 before this.
- (story) `apps/playground/stories/LobbyStory/LobbyStory.tsx` — renders `<Lobby>`; today passes only `lang`, must supply the copy from the catalog after migration.

## Boundary

This work lives in **`@release/ui` + `@release/playground` + `packages/translation`**
only. The frontend (`@release/web`) is the other owner's area and is **not** edited
here.
