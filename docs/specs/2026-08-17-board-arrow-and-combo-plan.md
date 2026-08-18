# Arrow Targeting and Combo Pair Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the arrow aim gesture (#99) and the combo pair scene (#100) from the playground to the real board, driven by engine legality and engine events.

**Architecture:** Two stacked PRs. PR A (`feat/99-arrow-targeting`, based on `feat/97-draw-and-deck`) adds legal targets to the engine projection and replaces the board's click-select with the pull-to-stage gesture plus the tracking arrow. PR B (`feat/100-combo-pair`, based on `feat/99-arrow-targeting`) adds combo legality to the projection, moves the Sudo half's discard-banking to resolution with real `discarded` events, ports ComboStory's staging fold, and adds a combo beat with two entry points (adopt local staging / full fold from the actor's seat).

**Tech Stack:** TypeScript, React 19, WAAPI via `@release/ui/animations` presets, Vitest. Monorepo: `packages/engine` (pure reducer + projection), `apps/ui` (`@release/ui` kit + animation vocabulary), `apps/frontend` (`@release/web`, Feature-Sliced).

**Spec:** [docs/specs/2026-08-17-board-arrow-and-combo-design.md](./2026-08-17-board-arrow-and-combo-design.md) — read it first; every decision below argues from it.

## Global Constraints

- Plan location note: this repo keeps plans in `docs/specs/` next to designs (see `2026-08-14-board-draw-and-deck-plan.md`), not `docs/superpowers/plans/`.
- **No rules changes in the engine.** View/projection fields, event emissions, and banking *timing* are allowed; anything that changes a legal outcome is not. A rules doubt goes to `docs/rules/backlog.md` with a `> ❓ **Не из правил.**` marker, never into code.
- **Zero new animation presets expected.** If one becomes unavoidable it needs a row in `docs/animations/reference.md` or `apps/ui/src/animations/docs.test.ts` fails.
- **Legality is the engine's answer, never the UI's** (existing comment in `packages/engine/src/view.ts`). No card-tag inspection in the frontend to decide what may be played, paired, or targeted.
- **FSD layering** (`apps/frontend/CLAUDE.md`): `pages → features → entities → shared`; a feature never imports a sibling feature — shared beat/staging contracts live in `apps/frontend/src/entities/game/board/types.ts`.
- **Animations are assembled from modules** (root `CLAUDE.md`): staging flights use `play()` presets and the shared steps (`useFlyer`, `useHandArrival`, `useDiscardExit`); no hand-written `el.animate` outside presets.
- **Code comments in English.** All user-visible text through translation keys (none are needed by this plan — the scenes add no copy).
- CSS: co-located `*.module.css`, colors only via `var(--*)` tokens, logical properties.
- Commit style (from `git log`): `type(scope): lowercase descriptive clause (#issue)` — e.g. `feat(web): the arrow aims from a staged card (#99)`.
- Test commands: engine `pnpm --filter @release/engine test`, frontend `pnpm --filter @release/web test`, ui `pnpm --filter @release/ui test`, all `pnpm test`, plus `pnpm typecheck` and `pnpm lint` before each commit (pre-commit hook runs lint-staged + typecheck).
- Reduced motion: beats collapse inside `useBeats` (never in runners); *gesture-layer* choreography must ask `useReducedMotion()` itself (`~/shared/lib/useReducedMotion`) — `play()` checks nothing by design.

## File Structure

**PR A**
- Modify: `packages/engine/src/view.ts` — `self.targets`
- Modify: `packages/engine/src/fake/project.ts` — compute targets
- Test: `packages/engine/src/fake/project.test.ts`
- Modify: `apps/ui/src/index.ts` — export `HandPlayDrop` type
- Modify: `apps/frontend/src/entities/game/board/types.ts` — `BoardState.targets`, `StagedHandoff`
- Modify: `apps/frontend/src/entities/game/board/toBoardState.ts` — targets passthrough
- Test: `apps/frontend/src/entities/game/board/toBoardState.test.ts` (exists — extend)
- Modify: `apps/frontend/src/pages/board/[gameId]/_useBoardInteractions.ts` — strip click-select; targets from state
- Create: `apps/frontend/src/pages/board/[gameId]/_useBoardStaging.ts` — pull → stage → aim → dispatch/cancel
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx` — wire `onPlay`, arrow, centre renders
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.module.css` — staged/pending card at centre
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/boardStaging.test.tsx` (new), existing `boardComponent.test.tsx` updated

**PR B**
- Modify: `packages/engine/src/view.ts` — `self.combos`
- Modify: `packages/engine/src/state.ts` — `Pending` defend gains `combo?: CardInstance`
- Modify: `packages/engine/src/fake/project.ts` — compute combos
- Modify: `packages/engine/src/fake/attacks.ts`, `packages/engine/src/fake/release.ts`, `packages/engine/src/fake/handAttacks.ts` — banking at resolution + `discarded` emissions
- Tests: `project.test.ts`, `attacks.test.ts`, `handAttacks.test.ts`, `release.test.ts`
- Modify: `apps/ui/src/index.ts` — export `PAIR_AUX`, `PAIR_AUX_POSE`
- Modify: `apps/frontend/src/entities/game/board/toBoardState.ts` — combos passthrough (delete `toComboOptions`), release `support`
- Modify: `apps/frontend/src/pages/board/[gameId]/_useBoardStaging.ts` — the pair: partner pick, fold, pair cancel
- Create: `apps/frontend/src/features/board-beats/comboBeat.tsx` — runner
- Modify: `apps/frontend/src/features/board-beats/planBeats.ts` — `attackPlaced` / `releasePlaced` / `pairToDiscard`
- Modify: `apps/frontend/src/features/board-beats/useBeats.ts` — wire the runner + staging handoff
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx` — pending `CardPair`, `support` on zones, handoff ref
- Tests: `planBeats.test.ts`, `boardStaging.test.tsx`, `boardComponent.test.tsx`
- Docs: `docs/animations/recipes.md`, `docs/animations/backlog.md`, `docs/rules/backlog.md`, audit page `apps/playground/stories/AnimationAuditStory`

---

# Part 1 — PR A: arrow targeting (#99), branch `feat/99-arrow-targeting`

The branch already exists with the design doc committed. All Part 1 work happens on it.

### Task 1: Engine — legal targets in the projection

**Files:**
- Modify: `packages/engine/src/view.ts` (the `PlayerView.self` block)
- Modify: `packages/engine/src/fake/project.ts`
- Test: `packages/engine/src/fake/project.test.ts`

**Interfaces:**
- Consumes: `attackTargets(state, viewerId, cardId): Target[]` from `./core` (already imported by project.ts), `playableFor` (same file).
- Produces: `PlayerView.self.targets: Record<CardUid, Target[]>` — an entry **only** for playable cards that need a target; a playable card with no entry needs none. Task 2 and the gesture layer rely on exactly this shape.

- [ ] **Step 1: Write the failing tests**

Open `packages/engine/src/fake/project.test.ts`, copy the local setup pattern already in that file (it builds a `GameState` via `createFakeEngine` + hand priming like `attacks.test.ts` does). Add:

```ts
it('projects legal targets for playable attacks and nothing else', () => {
  // prime: it is p1's turn, draw obligation met, p1 holds an attack + a release
  const s = primed({
    p1: [{ uid: 'attack-bug#0', id: 'attack-bug' }, { uid: 'release-frontend#0', id: 'release-frontend' }, { uid: 'defense-hotfix#0', id: 'defense-hotfix' }],
  })
  const view = project(s, 'p1')
  // the attack targets every living opponent's seat
  expect(view.self.targets['attack-bug#0']).toEqual([{ kind: 'player', player: 'p2' }])
  // a release needs no target: no entry, not an empty one
  expect(view.self.targets['release-frontend#0']).toBeUndefined()
  // an unplayable card (defence on your own turn) has no entry either
  expect(view.self.targets['defense-hotfix#0']).toBeUndefined()
})

it('projects release and monitoring targets for DDoS', () => {
  // prime p2 with a standing release + monitoring, p1 holds attack-ddos
  const view = project(sWithP2Release, 'p1')
  expect(view.self.targets['attack-ddos#0']).toEqual(
    expect.arrayContaining([
      { kind: 'monitoring', player: 'p2' },
      { kind: 'release', player: 'p2', slot: 'frontend' },
    ]),
  )
})

it('projects no targets while a window or pending suspends play', () => {
  // any state where playableFor returns [] — e.g. after p1 plays a release
  expect(project(windowOpen, 'p2').self.targets).toEqual({})
})
```

Adapt `primed`/`sWithP2Release`/`windowOpen` to the helpers the file actually has — the assertions above are the contract; reuse the file's existing state builders rather than inventing new ones.

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @release/engine test -- project`
Expected: FAIL — `targets` is undefined on the view.

- [ ] **Step 3: Implement**

In `packages/engine/src/view.ts`, inside `PlayerView.self` after `playable`:

```ts
    // Legal targets per playable card, the engine's own answer — an entry only
    // for a card that needs one. A playable card with no entry plays without a
    // target. Same authority as `playable`: attackTargets is what onPlay checks.
    targets: Record<CardUid, Target[]>
```

Add `import type { Target } from './actions'` to view.ts.

In `packages/engine/src/fake/project.ts`, below `playableFor`:

```ts
// An entry only for the playable cards that need a target — the same
// `attackTargets` the reducer itself validates against, so the offer and the
// acceptance cannot drift.
export function targetsFor(state: GameState, viewerId: PlayerId): Record<CardUid, Target[]> {
  const result: Record<CardUid, Target[]> = {}
  const hand = state.players[viewerId].hand
  for (const uid of playableFor(state, viewerId)) {
    const card = hand.find((c) => c.uid === uid)
    if (!card || rulesFor(card.id)?.kind !== 'attack') continue
    result[uid] = attackTargets(state, viewerId, card.id)
  }
  return result
}
```

Add `Target` to the imports from `'../actions'` (create the import — project.ts has none today) and wire it in `project()`:

```ts
      playable: playableFor(state, viewerId),
      targets: targetsFor(state, viewerId),
```

Note: `playableFor` already guarantees an attack is listed only when `attackTargets(...).length > 0`, so no empty arrays appear.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @release/engine test`
Expected: PASS, including the untouched suites (the view only grew a field).

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/view.ts packages/engine/src/fake/project.ts packages/engine/src/fake/project.test.ts
git commit -m "feat(engine): the projection answers where each playable card may aim (#99)"
```

### Task 2: Adapter — targets reach the board, click-select goes

**Files:**
- Modify: `apps/frontend/src/entities/game/board/types.ts` (BoardState)
- Modify: `apps/frontend/src/entities/game/board/toBoardState.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/_useBoardInteractions.ts`
- Test: `apps/frontend/src/entities/game/board/toBoardState.test.ts`, `apps/frontend/src/pages/board/[gameId]/__tests__/boardComponent.test.tsx`

**Interfaces:**
- Consumes: `PlayerView.self.targets` (Task 1). Engine `Target` and kit `TableTarget` are structurally identical unions (compare `packages/engine/src/actions.ts:3-11` with `apps/ui/src/table/Table/intents.ts:10-18`).
- Produces: `BoardState.targets: Record<string, TableTarget[]>`; a reduced `useBoardInteractions` whose click handles ONLY window attacks and no-target immediate plays. Tasks 3–5 rely on `state.targets` and on clicks NOT selecting targeting cards anymore.

- [ ] **Step 1: Write the failing adapter test**

In `toBoardState.test.ts`, following the file's existing fixture pattern:

```ts
it('passes the projection targets through as table targets', () => {
  const view = baseView({
    self: { ...base.self, targets: { 'attack-bug#0': [{ kind: 'player', player: 'p2' }] } },
  })
  const state = toBoardState(view, [], labels)
  expect(state.targets).toEqual({ 'attack-bug#0': [{ kind: 'player', player: 'p2' }] })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @release/web test -- toBoardState`
Expected: FAIL — `targets` is undefined.

- [ ] **Step 3: Implement the passthrough**

`types.ts`, in `BoardState` after `frozen: string[]`:

```ts
  // Legal targets per playable card — the projection's answer (PlayerView.self.targets),
  // engine Target and TableTarget being one structural shape. An entry only for a
  // card that needs a target.
  targets?: Record<string, TableTarget[]>
```

(`TableTarget` is already imported in that file's import block from `@release/ui` — add it if absent.)

`toBoardState.ts`, in the returned object after `frozen`:

```ts
    // Structural passthrough — Target and TableTarget are one shape; licensed
    // the same way `pending`/`window` are by contract.test-d.ts.
    targets: view.self.targets as BoardState['targets'],
```

Check `apps/frontend/src/entities/game/board/contract.test-d.ts` (or `engineContract.test-d.ts` — whichever holds the `Exact<>` assertions the comments cite) and add the matching assertion:

```ts
assertExact<Target, TableTarget>() // follow the file's existing Exact<> idiom verbatim
```

`EMPTY_TABLE` in `_layout.tsx` needs no change (`targets` is optional), but add `targets: {}` there anyway so the empty table is explicit.

- [ ] **Step 4: Strip click-select from `_useBoardInteractions.ts`**

Replace the hook body so the whole file becomes:

```ts
import type { TableActions } from '@release/ui'
import { useCallback } from 'react'
import type { BoardState } from '~/entities/game/board/types'

export interface Options {
  state: Pick<BoardState, 'selfId' | 'you' | 'playable' | 'frozen' | 'window' | 'targets'>
  actions?: TableActions
}

// Click gestures for the table: only the plays a click can COMPLETE. A window
// attack (the window names the release) and a no-target play dispatch at once.
// A card that needs a target is played by pulling it out of the fan — the
// staging gesture (_useBoardStaging) owns that, and combo pairing moves there
// with #100.
export function useBoardInteractions({ state, actions }: Options) {
  const onCardClick = useCallback(
    (index: number) => {
      const item = state.you.hand[index]
      if (!item) return

      // The window's attack affordance reuses the hand: gated by
      // `canAttackWith`, not `playable`; no combo, no target.
      const attackable = state.window?.canAttackWith ?? []
      if (attackable.length > 0) {
        if (!attackable.includes(item.uid)) return
        actions?.onAttack?.(item.uid, undefined)
        return
      }

      if (!state.playable.includes(item.uid)) return
      // A card with targets is pulled, not clicked (the staging gesture).
      if ((state.targets?.[item.uid] ?? []).length > 0) return
      actions?.onPlay?.(item.uid, undefined, undefined)
    },
    [state.you.hand, state.playable, state.window, state.targets, actions],
  )

  return { onCardClick }
}
```

Deliberately removed with it: the `phase`/`selected`/`combo`/`awaitingCombo` state, `sameTarget`, `onTargetPick`, `accentAt`, `cancel`. `sameTarget` moves to the staging hook in Task 3 (same code). The main-first click combo goes with this — the spec's grounding section says why, and PR B lands the support-first replacement. This temporarily removes the only UI path that could dispatch an untargeted combo (`operation + Sudo`); acceptable inside a stacked pair of PRs that land together, and named in the PR description.

- [ ] **Step 5: Fix `_Board.tsx` compile errors minimally**

`_Board.tsx` references `gestures.phase`, `gestures.selected`, `gestures.targets`, `gestures.accentAt`, `gestures.onTargetPick`, `gestures.cancel`, and the arrow effect. To keep this task compiling without pulling Task 3 in, replace those uses with inert values: delete the arrow `useEffect` (lines starting `const arrow = useArrow()` stay — Task 3 rewires it), pass `targets={[]}` and `onPick={() => {}}` to `Seat`/`ReleaseZone`, drop `accentAt`, and simplify `handleTableClick` and the Escape effect to no-ops for the selection case (the deal-skip branch stays). Update `useBoardInteractions` call to the new two-argument options `{ state, actions }`. Task 3 immediately replaces these stubs — they exist so this commit stands alone.

Update `boardComponent.test.tsx`: delete or `it.skip` the tests that exercised click-select/`legalTargets` (note their names — Task 4 revives their scenarios through the staging gesture; the click-dispatch tests for window attacks and no-target plays stay and must still pass).

- [ ] **Step 6: Run tests and typecheck**

Run: `pnpm --filter @release/web test && pnpm typecheck`
Expected: PASS (with the noted skips).

- [ ] **Step 7: Commit**

```bash
git add -A apps/frontend packages/engine apps/ui
git commit -m "feat(web): targets ride the projection; click keeps only what it can finish (#99)"
```

### Task 3: The staging gesture — pull, stand at the centre, aim

**Files:**
- Create: `apps/frontend/src/pages/board/[gameId]/_useBoardStaging.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.module.css`
- Modify: `apps/ui/src/index.ts` (one export line)
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/boardStaging.test.tsx`

**Interfaces:**
- Consumes: `Hand`'s `onPlay?: (uid: string, drop: HandPlayDrop) => boolean` and `HandPlayDrop { x, y, rect?: DOMRect }` (`apps/ui/src/table/Hand/Hand.tsx:83-87`); `useFlyer` / `useHandArrival` / `useArrow` / `centerOf` / `play('playToCenter', …)`; `BoardAnchors.centre` and `anchors.handSlotAt(index)`; `state.targets` (Task 2).
- Produces the hook consumed by `_Board.tsx`:

```ts
export interface StagedCard { uid: string; card: CardData; index: number /* index in you.hand at pull time */ }
export function useBoardStaging(args: {
  state: BoardState
  anchors: BoardAnchors
  actions?: TableActions
  events: Event[]           // the feed — watched for `rejected` after dispatch
  enabled: boolean          // false while the deal or an exclusive beat owns the table
}): {
  staged: StagedCard | null
  dispatched: boolean       // true between dispatch and the projection moving
  targets: TableTarget[]    // the staged card's — [] when nothing staged
  arrow: { from: Point | null; to: Point | null; active: boolean }
  overlay: ReactNode[]      // flyer + return-flight overlays
  gapAt: number | null      // fan gap while a cancel returns cards
  gapSize: number
  handItems: HandItem[]     // you.hand minus the staged card
  onHandPlay: (uid: string, drop: HandPlayDrop) => boolean
  onTargetPick: (target: TableTarget) => void
  cancel: () => void
}
```

- [ ] **Step 1: Export `HandPlayDrop` from the kit barrel**

In `apps/ui/src/index.ts` line 107 area, extend:

```ts
export type { HandItem, HandPlayDrop } from './table/Hand/Hand'
```

- [ ] **Step 2: Write the failing board test**

`boardStaging.test.tsx`, using the same render harness as `boardComponent.test.tsx` (copy its providers/fixture setup; supply a projection where it is the viewer's turn, drawn, holding `attack-bug#0` with `targets: { 'attack-bug#0': [{ kind: 'player', player: 'p2' }] }`):

```ts
it('a pulled attack stages at the centre, aims, and a press on the seat dispatches with the target', async () => {
  const onPlay = vi.fn()
  render(boardWith({ targets: { 'attack-bug#0': [{ kind: 'player', player: 'p2' }] } }, { onPlay }))
  // drag the card out of the fan: pointer down on the slot, move past the
  // 6px threshold, release over the table (Hand's own drag contract)
  await pullCardFromFan('attack-bug#0')
  // the staged card left the fan and stands at the centre
  expect(screen.getByTestId('board-centre-staged')).toBeInTheDocument()
  expect(fanUids()).not.toContain('attack-bug#0')
  // the seat is lit and a press on it dispatches
  await pressSeat('p2')
  expect(onPlay).toHaveBeenCalledWith('attack-bug#0', { kind: 'player', player: 'p2' }, undefined)
})

it('a pull of a no-target card is refused and the fan keeps it', async () => {
  render(boardWith({ targets: {} }))
  await pullCardFromFan('release-frontend#0')
  expect(fanUids()).toContain('release-frontend#0')
})
```

Write the small `pullCardFromFan`/`pressSeat`/`fanUids` helpers against the real DOM (`[data-hand-slot]`, seat test ids) — check how `boardComponent.test.tsx` fires pointer events and follow it. Under jsdom the WAAPI flights resolve immediately or are skipped via the reduced-motion path — assert on DOM/dispatch outcomes, not animation frames.

- [ ] **Step 3: Run to verify failure**

Run: `pnpm --filter @release/web test -- boardStaging`
Expected: FAIL — no `board-centre-staged` node, `onPlay` not called.

- [ ] **Step 4: Implement `_useBoardStaging.ts`**

The shape (key parts in full — the file assembles them):

```ts
import type { Event } from '@release/engine'
import type { CardData, HandItem, HandPlayDrop, Point, TableActions, TableTarget } from '@release/ui'
import { centerOf, useArrow } from '@release/ui'
import { nextFrames, play, useFlyer, useHandArrival } from '@release/ui/animations'
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import { useReducedMotion } from '~/shared/lib/useReducedMotion'

// sameTarget: moved verbatim from the pre-#99 _useBoardInteractions.ts
const sameTarget = (a: TableTarget, b: TableTarget): boolean => { /* …same switch… */ }

export function useBoardStaging({ state, anchors, actions, events, enabled }) {
  const [staged, setStaged] = useState<StagedCard | null>(null)
  const [dispatched, setDispatched] = useState(false)
  const reduced = useReducedMotion()
  const arrowCtl = useArrow()
  const flyer = useFlyer()
  const arrival = useHandArrival(anchors.hand, () => setStaged(null))
  // handlers that run after an await read refs, not state (I8)
  const stagedRef = useRef(staged); stagedRef.current = staged
  const dispatchedRef = useRef(dispatched); dispatchedRef.current = dispatched

  const targets = useMemo(
    () => (staged && !dispatched ? (state.targets?.[staged.uid] ?? []) : []),
    [staged, dispatched, state.targets],
  )

  const aimFromCentre = useCallback(() => {
    const el = anchors.centre.current
    if (el) arrowCtl.aim(centerOf(el))
  }, [anchors.centre, arrowCtl.aim])

  const onHandPlay = useCallback((uid: string, drop: HandPlayDrop): boolean => {
    if (!enabled || stagedRef.current) return false
    const index = state.you.hand.findIndex((c) => c.uid === uid)
    const item = state.you.hand[index]
    if (!item) return false
    if ((state.targets?.[uid] ?? []).length === 0) return false // pull only what must aim
    setStaged({ uid, card: item.card, index })
    void (async () => {
      const cRect = anchors.centre.current?.getBoundingClientRect()
      if (!reduced && drop.rect && cRect) {
        const [el] = await flyer.raise([{ key: 'stage', card: item.card, at: drop.rect }])
        if (el) await play('playToCenter', el, { from: drop.rect, to: cRect })?.finished
        flyer.drop('stage')
      }
      aimFromCentre()
    })()
    return true
  }, [enabled, state.you.hand, state.targets, reduced, aimFromCentre, flyer.raise, flyer.drop, anchors.centre])

  const onTargetPick = useCallback((target: TableTarget) => {
    const s = stagedRef.current
    if (!s || dispatchedRef.current) return
    if (!targets.some((t) => sameTarget(t, target))) return
    arrowCtl.stop()
    setDispatched(true)
    actions?.onPlay?.(s.uid, target, undefined)
  }, [targets, actions, arrowCtl.stop])

  const cancel = useCallback(() => {
    const s = stagedRef.current
    if (!s || dispatchedRef.current) return
    arrowCtl.stop()
    const cRect = anchors.centre.current?.getBoundingClientRect()
    if (reduced || !cRect) { setStaged(null); return }
    // back into the fan at the slot it came from; onLanded clears `staged`
    void arrival.arrive([{ key: s.uid, card: s.card, from: cRect }], state.you.hand.length - 1, s.index)
  }, [reduced, state.you.hand.length, arrowCtl.stop, arrival.arrive, anchors.centre])

  // the projection moved our card out of the hand: the play was accepted —
  // staging's job is done, the centre pending render takes over seamlessly
  useEffect(() => {
    const s = stagedRef.current
    if (!s || !dispatchedRef.current) return
    if (!state.you.hand.some((c) => c.uid === s.uid)) { setStaged(null); setDispatched(false) }
  }, [state.you.hand])

  // the engine said no: the staged card returns to the fan
  useEffect(() => {
    const s = stagedRef.current
    if (!s || !dispatchedRef.current) return
    const rejectedOurs = events.some(
      (e) => e.type === 'rejected' && 'card' in e.action && e.action.card === s.uid,
    )
    if (rejectedOurs) { setDispatched(false); cancel() }
  }, [events, cancel])

  const handItems = useMemo(
    () => (staged ? state.you.hand.filter((c) => c.uid !== staged.uid) : state.you.hand),
    [state.you.hand, staged],
  )

  return { staged, dispatched, targets, arrow: arrowCtl, overlay: [...flyer.overlay, ...arrival.overlay],
           gapAt: arrival.gapAt, gapSize: arrival.gapSize, handItems, onHandPlay, onTargetPick, cancel }
}
```

Nuances the implementation must keep:
- The `rejected` watch fires `cancel()` only after clearing `dispatched` — `cancel` refuses while dispatched.
- `cancel`'s gap index is the staged card's pull-time `index`, so the card returns to its own slot (the projection re-inserts it there when the filter drops).
- `enabled` is false while the deal or an exclusive beat runs — same gate the click actions already have (`INERT_ACTIONS`).

- [ ] **Step 5: Wire `_Board.tsx`**

Replacing Task 2's stubs:

```tsx
const staging = useBoardStaging({
  state, anchors, actions,
  events: intro?.events ?? [],
  enabled: !(deal.active || beats.exclusive),
})
```

- `<Arrow from={staging.arrow.from} to={staging.arrow.to} />` replaces the old arrow usage; delete the local `useArrow()` and its effect.
- `Seat`/`ReleaseZone`: `targets={staging.targets}` and `onPick={(t) => staging.onTargetPick(t)}`.
- `Hand`: `items={staging.handItems}` (was `you.hand`), `onPlay={deal.active ? undefined : staging.onHandPlay}`, `gapAt={deal.gapAt ?? beats.gapAt ?? staging.gapAt}`, `gapSize` follows the same precedence chain, `onCardClick` keeps routing to `gestures.onCardClick`.
- The centre node renders the staged card once the flyer has dropped it:

```tsx
<div className={opening.centre} data-board-centre ref={anchors.centre}>
  {intro && deal.staged.map(/* …unchanged deal branch… */)}
  {staging.staged && staging.overlay.length === 0 && (
    <div className={opening.centreCard} data-testid="board-centre-staged">
      <Card card={staging.staged.card} interactive={false} width="100%" />
    </div>
  )}
</div>
```

The `overlay.length === 0` guard is ComboStory's own (`ComboStory.tsx:427`): while the flyer still carries the card to the centre — or the return flight carries it back — the static centre render must not double it.

- Escape and the table-click cancel: in the Escape effect and `handleTableClick`, the condition becomes `staging.staged && !staging.dispatched` → `staging.cancel()`. Presses on a lit target resolve in `onTargetPick` before bubbling (Seat stops propagation via its own click handling — verify; if it does not, check `e.target.closest('[data-hand-slot]')` AND whether the pick already cleared staging this tick, mirroring the old comment).
- Render `{staging.overlay}` next to `{deal.overlays}{beats.overlays}`.

`_Board.module.css`: add

```css
.centreCard {
  position: absolute;
  inset-block-start: 50%;
  inset-inline-start: 50%;
  translate: -50% -50%;
  inline-size: 100px;
}
```

(match the width the centre's staged deal cards use — read the existing `.stagedCard` rule and reuse its sizing token if one exists).

- [ ] **Step 6: Run tests**

Run: `pnpm --filter @release/web test && pnpm typecheck && pnpm lint`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add -A apps/frontend apps/ui
git commit -m "feat(web): a card is pulled from the fan, stands at the centre and aims (#99)"
```

### Task 4: Cancel and rejection paths under test

**Files:**
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/boardStaging.test.tsx`
- Modify (only if a test exposes a gap): `_useBoardStaging.ts`, `_Board.tsx`

- [ ] **Step 1: Write the failing tests**

```ts
it('a press on nothing valid returns the staged card to the fan', async () => {
  render(boardWith({ targets: BUG_TARGETS }))
  await pullCardFromFan('attack-bug#0')
  fireEvent.click(screen.getByRole('presentation')) // the table root
  await waitFor(() => expect(fanUids()).toContain('attack-bug#0'))
})

it('Escape cancels the staging', async () => { /* same, via keyDown Escape on window */ })

it('a rejected action returns the staged card', async () => {
  const { rerender } = render(boardWith({ targets: BUG_TARGETS }))
  await pullCardFromFan('attack-bug#0')
  await pressSeat('p2')
  // the engine answers with a rejection in the feed; the projection is unchanged
  rerender(boardWith({ targets: BUG_TARGETS }, {}, [rejectedEvent('attack-bug#0')]))
  await waitFor(() => expect(fanUids()).toContain('attack-bug#0'))
})

it('the staged card must not be cancellable after dispatch', async () => {
  render(boardWith({ targets: BUG_TARGETS }))
  await pullCardFromFan('attack-bug#0')
  await pressSeat('p2')
  fireEvent.keyDown(window, { key: 'Escape' })
  expect(screen.getByTestId('board-centre-staged')).toBeInTheDocument()
})

it('reduced motion stages without flights', async () => { /* matchMedia mock; pull; assert staged node exists immediately */ })
```

- [ ] **Step 2: Run to verify failures, fix, re-run**

Run: `pnpm --filter @release/web test -- boardStaging`
Each failure names its gap; fix inside the hook/board wiring only. Expected end state: PASS.

- [ ] **Step 3: Commit**

```bash
git add -A apps/frontend
git commit -m "test(web): staging returns on a miss, on Escape and on a rejection (#99)"
```

### Task 5: The seam — pending attack renders at the centre

**Files:**
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx`
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/boardComponent.test.tsx`

**Interfaces:**
- Consumes: `state.pending` (`TablePending`, defend variant carries `attackCard: string`, `sudo: boolean` — `apps/ui/src/table/Table/intents.ts:34-44`), `cardById` from `@release/ui`.
- Produces: the `.centre` node renders the pending attack statically — the exact node PR B's beat animates into and measures out of. Test id: `board-centre-pending`.

- [ ] **Step 1: Write the failing test**

```ts
it('a pending attack stands at the centre for every viewer', () => {
  render(boardWith({ pending: { kind: 'defend', player: 'p2', attacker: 'p1',
    attackCard: 'attack-bug', sudo: false, options: [], openedAt: 0, deadline: 15000, scope: 'hand' } }))
  expect(screen.getByTestId('board-centre-pending')).toBeInTheDocument()
})
```

- [ ] **Step 2: Run to verify failure, implement**

In the centre node (after the staged branch; the two are mutually exclusive in practice — staging clears when the projection moves):

```tsx
{!staging.staged && state.pending?.kind === 'defend' && (() => {
  const data = cardById(state.pending.attackCard)
  return data ? (
    <div className={opening.centreCard} data-testid="board-centre-pending" data-pending-play>
      <Card card={data} interactive={false} width="100%" />
    </div>
  ) : null
})()}
```

`data-pending-play` is the anchor PR B's discard-split beat queries — name it now so the contract is stable.

- [ ] **Step 3: Run tests, commit**

Run: `pnpm --filter @release/web test`
Expected: PASS.

```bash
git add -A apps/frontend
git commit -m "feat(web): the thrown attack stands at the centre while the defence decides (#99)"
```

### Task 6: PR A docs and the pull request

**Files:**
- Modify: `apps/playground/stories/AnimationAuditStory/*` (the register + the arrow scenario status — locate the status table inside the story)
- Modify: `docs/animations/backlog.md`

- [ ] **Step 1: Record what this PR decided and what it left**

- Audit page: arrow scenario status → on the board; add a register line for touch input.
- `docs/animations/backlog.md`: the touch-input finding (an aim gesture on a touchscreen is undecided — from #99's own scope note), expanded form: what breaks (no touch path stages a card), what closes it (a decided gesture + a story).

- [ ] **Step 2: Full check, commit, push, PR**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all green.

```bash
git add -A
git commit -m "docs(animations): the arrow reaches the board; touch aiming goes on record (#99)"
git push -u origin feat/99-arrow-targeting
gh pr create --draft --base feat/97-draw-and-deck --title "Arrow targeting on the board (#99)" --body "…summary: projection targets, pull-to-stage, aim, cancel/reject returns; combo click flow removed here, replaced in #100 (stacked next). Spec: docs/specs/2026-08-17-board-arrow-and-combo-design.md"
```

---

# Part 2 — PR B: the combo pair (#100), branch `feat/100-combo-pair`

- [ ] **Branch first:** `git checkout -b feat/100-combo-pair` (on top of `feat/99-arrow-targeting`).

### Task 7: Engine — combo legality in the projection

**Files:**
- Modify: `packages/engine/src/view.ts`
- Modify: `packages/engine/src/fake/project.ts`
- Test: `packages/engine/src/fake/project.test.ts`

**Interfaces:**
- Consumes: `playableFor` (same file), `canAttackWith` from `./window` (already imported), `rulesFor`.
- Produces: `PlayerView.self.combos: Record<CardUid, CardUid[]>` — keyed by the SUPPORT card's uid (support-first staging), values are partner uids legal *right now*. An absent key means the support cannot start a pair. Tasks 9–10 rely on this exact orientation.

- [ ] **Step 1: Write the failing tests**

```ts
it('pairs Sudo with playable sudo-carriers on the holder turn', () => {
  // p1's turn, drawn; hand: support-sudo#0, attack-bug#0 (targets exist), defense-rollback#0
  const view = project(s, 'p1')
  // rollback is a defence — not playable on your own turn, so not pairable here
  expect(view.self.combos['support-sudo#0']).toEqual(['attack-bug#0'])
})

it('pairs Sudo with canAttackWith cards inside a reaction window', () => {
  // p1 released; window open; p2 holds support-sudo#0 + attack-bug#0
  expect(project(windowOpen, 'p2').self.combos['support-sudo#0']).toEqual(['attack-bug#0'])
})

it('pairs Code Review with a playable release only when a third card can pay', () => {
  // releaseCond base; hand of exactly [release-frontend#0, support-code-review#0]:
  // the pair would leave nothing to pay the cost — release.ts rejects it, so the offer must too
  expect(project(twoCardHand, 'p1').self.combos['support-code-review#0']).toBeUndefined()
  // …and with a third card in hand the pairing appears
  expect(project(threeCardHand, 'p1').self.combos['support-code-review#0']).toEqual(['release-frontend#0'])
})

it('offers no combos while a defence pending suspends play', () => {
  expect(project(pendingDefend, 'p2').self.combos).toEqual({})
})
```

Cost nuance source: `release.ts:268` — neither the release nor the comboed Code Review can pay; under `releaseCond: 'easy'` there is no cost and the two-card hand pairs fine (add that variant assertion).

- [ ] **Step 2: Run to verify failure**

Run: `pnpm --filter @release/engine test -- project` → FAIL (`combos` undefined).

- [ ] **Step 3: Implement**

`view.ts`, `self` block after `targets`:

```ts
    // For each support card in hand: the partner uids it may legally start a
    // pair with right now (support-first staging). Turn context pairs Sudo with
    // playable sudo-carriers and Code Review with a payable release; a reaction
    // window pairs Sudo with canAttackWith. Absent key: no pair possible.
    combos: Record<CardUid, CardUid[]>
```

`project.ts`:

```ts
export function combosFor(state: GameState, viewerId: PlayerId): Record<CardUid, CardUid[]> {
  const me = state.players[viewerId]
  const result: Record<CardUid, CardUid[]> = {}
  const playable = new Set(playableFor(state, viewerId))
  const throwable = new Set(canAttackWith(state, viewerId))
  for (const s of me.hand) {
    if (s.id !== 'support-sudo' && s.id !== 'support-code-review') continue
    const partners = me.hand
      .filter((c) => {
        if (c.uid === s.uid) return false
        const rules = rulesFor(c.id)
        if (s.id === 'support-sudo') {
          if (rules?.sudo !== true) return false
          return playable.has(c.uid) || throwable.has(c.uid)
        }
        // Code Review rides a release being PLAYED — and the pair must leave a
        // card to pay the cost (release.ts:268), unless the mode waives it.
        if (rules?.kind !== 'release' || !playable.has(c.uid)) return false
        return state.setup.releaseCond === 'easy' || me.hand.length >= 3
      })
      .map((c) => c.uid)
    if (partners.length > 0) result[s.uid] = partners
  }
  return result
}
```

Wire `combos: combosFor(state, viewerId)` into `project()` next to `targets`.

Known question, NOT solved here: the engine accepts a frozen/replayLocked Sudo as a combo partner (`onAttack` checks only identity). Whether the freeze should bar the combo is a rules question — Step 5 records it; `combosFor` mirrors what the engine accepts today.

- [ ] **Step 4: Run tests**

Run: `pnpm --filter @release/engine test` → PASS.

- [ ] **Step 5: Record the frozen-combo rules question**

Append to `docs/rules/backlog.md` (follow the file's entry format): does DDoS's freeze / Rollback's replay lock bar the card from riding as a combo half? The engine currently allows it; `combosFor` mirrors that. Add the `> ❓ **Не из правил.**` marker at the relevant spot in `docs/rules/cards.md` (the Sudo entry) per the root CLAUDE.md rule.

- [ ] **Step 6: Commit**

```bash
git add packages/engine docs/rules
git commit -m "feat(engine): the projection answers which pairs a support may start (#100)"
```

### Task 8: Engine — the pair is banked at resolution, and says so

**Files:**
- Modify: `packages/engine/src/state.ts` (Pending defend)
- Modify: `packages/engine/src/fake/attacks.ts` (onAttack, onDefend, onHandDefend)
- Modify: `packages/engine/src/fake/release.ts` (hand-attack path, DDoS path)
- Modify: `packages/engine/src/fake/handAttacks.ts` (openHandAttack)
- Test: `packages/engine/src/fake/attacks.test.ts`, `handAttacks.test.ts`, `release.test.ts`

**Interfaces:**
- Produces: `Pending(defend).combo?: CardInstance`; `discarded` events with reasons `attackSpent` / `defenceSpent` on every resolution path; the Sudo half reaches `decks.discard` only at resolution. planBeats (Task 11) keys the pair's discard split off these events.

- [ ] **Step 1: Write the failing engine tests**

In `attacks.test.ts` (reuse `staged`, `SUDO`, `BUG`, `HOTFIX`, `NOTABUG` fixtures):

```ts
it('holds the sudo half on the pending, not in the discard', () => {
  const r = reduce(staged([BUG, SUDO], [NOTABUG]), { type: 'ATTACK', player: 'p2', card: BUG.uid, combo: SUDO.uid, at: 1001 })
  expect(r.state.decks.discard).not.toContainEqual(SUDO)
  expect(r.state.pending).toMatchObject({ kind: 'defend', combo: SUDO })
  expect(r.events.map((e) => e.type)).toEqual(['attacked']) // unchanged at attack time
})

it('banks both halves with attackSpent when the hit is taken', () => {
  const attacked = reduce(staged([BUG, SUDO], []), { type: 'ATTACK', player: 'p2', card: BUG.uid, combo: SUDO.uid, at: 1001 })
  const r = reduce(attacked.state, { type: 'RESOLVE', player: 'p1', choice: { kind: 'defend', card: null }, at: 1002 })
  const discards = r.events.filter((e) => e.type === 'discarded')
  expect(discards).toMatchObject([
    { card: BUG.id, reason: 'attackSpent', player: 'p2' },
    { card: SUDO.id, reason: 'attackSpent', player: 'p2' },
  ])
  // parent: both discards hang off the tookHit event
  const hit = r.events.find((e) => e.type === 'tookHit')
  for (const d of discards) expect(d.parent).toBe(hit?.id)
  expect(r.state.decks.discard).toEqual(expect.arrayContaining([BUG, SUDO]))
})

it('banks the defence with defenceSpent and the cancelled attack with attackSpent', () => {
  // plain BUG vs HOTFIX cancel: expect discarded(HOTFIX, defenceSpent) + discarded(BUG, attackSpent)
})

it('on Rollback return only the defence is banked — the attack goes to a hand', () => {
  // expect exactly one discarded (ROLLBACK, defenceSpent); BUG in the attacker hand
})

it('DDoS emits attackSpent for what it consumed', () => {
  // PLAY attack-ddos at a monitoring: discarded(attack-ddos, attackSpent) in the same batch
})
```

Mirror the take-hit and defended shapes for hand attacks in `handAttacks.test.ts` (PLAY with `target: { kind: 'player' }`, `combo`), asserting the sudo half stays on the pending and lands with `attackSpent` at resolution.

- [ ] **Step 2: Run to verify failures**

Run: `pnpm --filter @release/engine test` — the new tests FAIL; note which EXISTING assertions also fail (any that pinned the sudo card in the discard at attack time, or resolution event lists without `discarded`). Those existing tests change in Step 4 — deliberately, with the spec as the license.

- [ ] **Step 3: Implement**

`state.ts`, defend variant after `sudo: boolean`:

```ts
      // The Sudo that rode the attack. Held HERE while the exchange is open —
      // like the attack card itself, which lives only on this pending — and
      // banked at resolution, so the discard pile never shows a half of a pair
      // the table still sees standing at the centre.
      combo?: CardInstance
```

`attacks.ts` `onAttack`: delete the `discard(spent, [sudoCard])` spread; the return becomes:

```ts
  return {
    state: {
      ...spent,
      pending: {
        kind: 'defend',
        player: w.target.player,
        attacker: action.player,
        attack: card.uid,
        attackId: card.id,
        sudo,
        ...(sudoCard ? { combo: sudoCard } : {}),
        canDefendWith: defencesFor(state, w.target.player, sudo),
        openedAt: action.at,
        deadline: action.at + DEFEND_MS,
        scope: 'release',
      },
      eventSeq: log.seq,
    },
    events: log.events,
  }
```

Add one banking helper at the top of `attacks.ts` (both defend paths use it):

```ts
// Bank cards and say so — every spent card leaves a `discarded` the board can
// plan a movement from (the reasons existed unemitted; see the design doc).
function bankSpent(
  state: GameState,
  log: Log,
  player: PlayerId,
  cards: CardInstance[],
  reason: 'attackSpent' | 'defenceSpent',
  parent?: number,
): GameState {
  for (const c of cards) log.add({ type: 'discarded', player, card: c.id, reason }, parent)
  return { ...discard(state, cards), eventSeq: log.seq }
}
```

`onDefend` (release scope) — the resolution paths, with `const combo = pending.combo ? [pending.combo] : []`:
- take-hit (`choice.card === null`): capture `const hitId = log.add({ type: 'tookHit', player: action.player })` (log.add returns the id) and replace `discard({ ...state, pending: null }, [attackCard])` with `bankSpent({ ...state, pending: null }, log, attacker, [attackCard, ...combo], 'attackSpent', hitId)`. The attacker owns the spend (`player: attacker` in the event) — it was their card; assert this in the tests.
- `effect === 'return'`: `next = bankSpent(next, log, action.player, spentDefence, 'defenceSpent', defendedId)` then `next = bankSpent(next, log, attacker, combo, 'attackSpent', defendedId)` (the attack card itself goes to a hand — no discard, no event). Capture `defendedId` from the `defended` log.add.
- `effect === 'reflect'` and cancel: `bankSpent(..., attacker, [attackCard, ...combo], 'attackSpent', defendedId)` + `bankSpent(..., action.player, spentDefence, 'defenceSpent', defendedId)`.

`onHandDefend`: the same four shapes, scope hand (no window reopen).

`release.ts` hand-attack path: delete the `withSudoSpent` banking; pass the sudo through — change `openHandAttack` (in `handAttacks.ts`) to take `combo: CardInstance | undefined` after `sudo` and set `...(combo ? { combo } : {})` on the pending it builds. Call site: `openHandAttack(spent, log, action.player, card, action.target.player, sudo, sudoCombo, action.at)` where `const sudoCombo = spentCards.find((c) => c.uid === action.combo)`.

`release.ts` DDoS path: after building `banked`, emit the events (DDoS resolves now, so banking time is right — it just was silent):

```ts
    if (card.id === 'attack-ddos') {
      for (const c of spentCards) {
        log.add({ type: 'discarded', player: action.player, card: c.id, reason: 'attackSpent' })
      }
      const banked = { /* …existing spread… */, eventSeq: log.seq }
      return { state: resolveDdos(banked, log, action.player, action.target), events: log.events }
    }
```

(DDoS never has a combo — no sudo tag — so `spentCards` is the one card; the loop is for shape-consistency.)

- [ ] **Step 4: Update the existing assertions the change legitimately moves**

Re-run `pnpm --filter @release/engine test`. For each failure: if it pinned silent banking (sudo in discard at attack time) or an event list without the new `discarded` entries, update it to the new contract; anything else failing is a real bug in Step 3. Also run the conformance suite (it runs as part of the package tests — `conformance.ts` drives `describeEngine`) and reconcile any event-count or discard-content assumption it makes.

- [ ] **Step 5: Verify nothing reads the discard mid-pending**

The spec's safety claim, pinned as a test: while a defend pending is open, `playableFor` is `[]` (operations unreachable), draws are rejected (`onDraw`: 'a decision is pending'), so `refillFromDiscard` cannot run. Add one test asserting a DRAW during a sudo-attack pending is rejected — the reshuffle can never see the withheld half.

- [ ] **Step 6: Run all engine tests, commit**

Run: `pnpm --filter @release/engine test && pnpm typecheck` → PASS.

```bash
git add packages/engine
git commit -m "feat(engine): a spent pair is banked at resolution, and the discard hears about it (#100)"
```

### Task 9: Kit exports and the adapter — combos and the release support

**Files:**
- Modify: `apps/ui/src/index.ts`
- Modify: `apps/frontend/src/entities/game/board/types.ts`
- Modify: `apps/frontend/src/entities/game/board/toBoardState.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx` (support wiring only)
- Test: `apps/frontend/src/entities/game/board/toBoardState.test.ts`

**Interfaces:**
- Consumes: `PlayerView.self.combos` (Task 7); `ReleaseView.*.codeReview` (already projected, currently dropped by `toReleaseSlots`); `ReleaseZone`'s existing `support?: ReleaseSupport` prop (`apps/ui/src/table/ReleaseZone/ReleaseZone.tsx:19,24`).
- Produces: `BoardState.comboOptions` fed from the engine; `BoardState.you.support` / `BoardOpponent.support` (`ReleaseSupport`); barrel exports `PAIR_AUX`, `PAIR_AUX_POSE`.

- [ ] **Step 1: Barrel exports**

`apps/ui/src/index.ts:56` becomes:

```ts
export { default as CardPair, PAIR_AUX, PAIR_AUX_POSE } from './primitives/CardPair'
```

Also export the support type where ReleaseZone's types are exported (line 117 area): `export type { ReleaseSlots, ReleaseSupport } from './table/ReleaseZone/ReleaseZone'`.

- [ ] **Step 2: Failing adapter tests**

```ts
it('feeds comboOptions from the projection, not the rules table', () => {
  const view = baseView({ self: { ...base.self, combos: { 'support-sudo#0': ['attack-bug#0'] } } })
  expect(toBoardState(view, [], labels).comboOptions).toEqual({ 'support-sudo#0': ['attack-bug#0'] })
})

it('carries a released Code Review as the slot support', () => {
  const view = baseView({ self: { ...base.self, release: { frontend: { uid: 'r#0', card: 'release-frontend', codeReview: 'support-code-review' } } } })
  const state = toBoardState(view, [], labels)
  expect(state.you.support?.frontend?.id).toBe('support-code-review')
})
```

- [ ] **Step 3: Implement**

- Delete `toComboOptions` entirely (and its comment); `comboOptions: view.self.combos` in the return.
- Add beside `toReleaseSlots`:

```ts
// The aux lying under a release — a played Code Review. ReleaseZone renders it
// tucked under via its `support` prop (the ComboStory zone already does).
function toReleaseSupport(release: ReleaseView): ReleaseSupport {
  return {
    frontend: release.frontend?.codeReview ? cardOrPlaceholder(release.frontend.codeReview) : undefined,
    backend: release.backend?.codeReview ? cardOrPlaceholder(release.backend.codeReview) : undefined,
    database: release.database?.codeReview ? cardOrPlaceholder(release.database.codeReview) : undefined,
  }
}
```

- `types.ts`: `you.support?: ReleaseSupport` and `BoardOpponent.support?: ReleaseSupport` (import the type from `@release/ui`). Fill both in `toBoardState` (`support: toReleaseSupport(view.self.release)` / per opponent). Update the stale comment on `toReleaseSlots` ("both are dropped here") — the codeReview half no longer is.
- `_Board.tsx`: pass `support={you.support}` to the player's `ReleaseZone`. For opponents, check how `Seat` renders its release zone (`apps/ui/src/table/Seat/Seat.tsx`) — if it forwards a `support` prop, pass `p.support` through; if it does not, add the optional prop to `Seat` and forward it to its internal zone (composition: Seat passes through, the zone stays the renderer).

- [ ] **Step 4: Run, commit**

Run: `pnpm --filter @release/web test && pnpm --filter @release/ui test && pnpm typecheck` → PASS.

```bash
git add -A apps/ui apps/frontend
git commit -m "feat(web): combos come from the projection and a code review lies under its release (#100)"
```

### Task 10: Staging grows the pair

**Files:**
- Modify: `apps/frontend/src/pages/board/[gameId]/_useBoardStaging.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.module.css`
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/boardStaging.test.tsx`

**Interfaces:**
- Consumes: `state.comboOptions` (engine-fed since Task 9), `CardPair` + `PAIR_AUX_POSE` + `enterPose` + `play('foldIntoPair')` + `slotPlacement`/`CARD_W`/`CARD_RATIO` (all barrel-exported), `state.window` (a window pair dispatches `onAttack` straight from the fold).
- Produces (extends the Task 3 return): `staged` becomes `StagedPlay | null` where

```ts
export interface StagedPlay {
  support: StagedCard | null   // the pulled Sudo / Code Review (null for a plain targeted pull)
  main: StagedCard | null      // the partner once picked (or the plain pulled card)
  phase: 'aim' | 'partner' | 'target' | 'dispatched'
  merged: boolean              // the pair flyer owns the centre
}
```

plus `accentAt(index)` for partner lighting, `onCardClick(index)` for the partner pick (the board routes hand clicks here while `phase === 'partner'`), and `pairRef: RefObject<HTMLDivElement | null>` — the persistent pair-flyer node `_Board` mounts. Task 11 reads `staged`/`pairRef` through the handoff (Task 11 defines it). The Task 3 return keeps its shape; its `dispatched` boolean becomes derived (`staged?.phase === 'dispatched'`) rather than separate state, so the two can never disagree.

- [ ] **Step 1: Failing tests**

```ts
it('a pulled support lights its partners and a click folds the pair', async () => {
  const onPlay = vi.fn()
  render(boardWith({
    comboOptions: { 'support-sudo#0': ['attack-bug#0'] },
    targets: { 'attack-bug#0': [{ kind: 'player', player: 'p2' }] },
  }, { onPlay }))
  await pullCardFromFan('support-sudo#0')
  expect(accentOf('attack-bug#0')).toBeTruthy()      // partner lit
  await clickFanCard('attack-bug#0')                  // fold
  await pressSeat('p2')                               // aim resolved
  expect(onPlay).toHaveBeenCalledWith('attack-bug#0', { kind: 'player', player: 'p2' }, 'support-sudo#0')
})

it('a release partner dispatches without a target', async () => {
  // comboOptions: code-review -> release-frontend; after the fold expect
  // onPlay('release-frontend#0', undefined, 'support-code-review#0')
})

it('a window pair dispatches onAttack straight from the fold', async () => {
  // state.window with canAttackWith ['attack-bug#0']; pull sudo, click bug →
  // onAttack('attack-bug#0', 'support-sudo#0'), no target phase
})

it('cancel returns both halves to the fan', async () => {
  // pull support, pick partner, then Escape → both uids back in fanUids()
})

it('a support with no partners cannot be pulled', async () => {
  // comboOptions: {} → pull refused, fan keeps the card
})
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @release/web test -- boardStaging` → FAIL.

- [ ] **Step 3: Implement the pair staging**

Port ComboStory's mechanics into the hook (`ComboStory.tsx` is the reference; translate, don't reinvent):

- `onHandPlay` accepts a pull when EITHER `(state.targets?.[uid] ?? []).length > 0` (plain aim, Task 3 path — `main` set, `phase: 'aim'`) OR `(state.comboOptions?.[uid] ?? []).length > 0` (support pull — `support` set, `phase: 'partner'`, arrow armed from the centre exactly as the plain path does).
- `accentAt(index)`: while `phase === 'partner'`, a hand card whose uid is in `state.comboOptions[support.uid]` lights with `var(--cat-${itemCategory})` (ComboStory keeps the source's category colour — use the support card's `card.category`).
- `onCardClick(index)` (partner pick), ported from `pickPartner` (`ComboStory.tsx:277-333`) with these board substitutions — this is the fold, verbatim in structure:
  - partner box from fan geometry, NOT the rotated slot rect (I6):

```ts
const slotBox = (i: number, total: number): Rect | undefined => {
  const hr = anchors.hand.current?.getBoundingClientRect()
  if (!hr) return undefined
  const base = slotPlacement(i, total)
  const height = CARD_W * CARD_RATIO
  return { left: hr.left + hr.width / 2 + base.x - CARD_W / 2, top: hr.bottom + base.y - height, width: CARD_W, height }
}
```

  (index/total measured against `handItems` — the fan as rendered, support already filtered out.)
  - `arrowCtl.stop()`, mount `CardPair` in the persistent `pairRef` node, `await nextFrames()`, cancel subtree animations (I3), pin the node to the centre rect, paint first frames `enterPose(mainHand, cRect)` / `enterPose(cRect, cRect)` (identity — the degenerate case, NO branch), `await nextFrames()`, then both `play('foldIntoPair', …)` calls with `MERGE_MS = 620`, aux with `pose: PAIR_AUX_POSE, snap: true`. Copy the constant values from ComboStory.
  - after the fold, by partner kind: `state.window` open → `actions?.onAttack?.(main.uid, support.uid)`, `phase: 'dispatched'`; partner has targets → `phase: 'target'`, re-aim from centre; else (release) → `actions?.onPlay?.(main.uid, undefined, support.uid)`, `phase: 'dispatched'`.
- `onTargetPick` gains the combo: `actions?.onPlay?.(main.uid, target, support?.uid)`.
- `cancel` for a merged pair — ported from `cancelStage` (`ComboStory.tsx:177-199`): two `Arriving` items with `el: pairRef.current`, `anchor: 'aux' | 'main'`, `from: cRect`; gap at the SUPPORT's pull-time index sized 2 (the approved motion returns as one group; the fan settles to projection order on land — same acceptance ComboStory made for "the middle").
- `handItems` filters both staged uids; the projection-movement watch (Task 3) clears on the MAIN uid leaving the hand; the rejected watch matches `e.action.card === main.uid` OR `e.action.combo === support?.uid` (ATTACK carries `card`+`combo` too).
- Hand gating: `_Board` sets `style={{ pointerEvents: merged || dispatched ? 'none' : undefined }}` on the hand wrapper while a pair is standing/flying (ComboStory's overlay case) and stops `mousedown` propagation inside the fan; hand clicks route to `staging.onCardClick` while `phase === 'partner'`, to `gestures.onCardClick` otherwise.
- `_Board` mounts the pair flyer once, after the overlays:

```tsx
<div className={opening.pairFlyer} ref={staging.pairRef} aria-hidden="true">
  {staging.staged?.merged && staging.staged.support && staging.staged.main && (
    <CardPair main={staging.staged.main.card} aux={staging.staged.support.card} width="100%" />
  )}
</div>
```

with `.pairFlyer { position: fixed; inset-block-start: 0; inset-inline-start: 0; opacity: 0; pointer-events: none; }` — position: fixed against the viewport, no containing block above it (the flight-carrier exception in `apps/playground/CLAUDE.md` applies to the board equally; verify no ancestor creates one).
- Reduced motion: pulls and folds place instantly (no `raise`/`play` calls), phases and dispatches identical.

- [ ] **Step 4: Run tests** — `pnpm --filter @release/web test && pnpm typecheck && pnpm lint` → PASS.

- [ ] **Step 5: Commit**

```bash
git add -A apps/frontend
git commit -m "feat(web): a support pulls, its partner folds in, the pair plays as one (#100)"
```

### Task 11: The combo beat — attacked, released, and the split to the discard

**Files:**
- Modify: `apps/frontend/src/entities/game/board/types.ts` (the handoff contract)
- Modify: `apps/frontend/src/features/board-beats/planBeats.ts`
- Create: `apps/frontend/src/features/board-beats/comboBeat.tsx`
- Modify: `apps/frontend/src/features/board-beats/useBeats.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx` (pending pair + handoff ref)
- Test: `apps/frontend/src/features/board-beats/planBeats.test.ts`

**Interfaces:**
- Consumes: `attacked` / `released` / `discarded` events; `BoardAnchors` (`seatBox`, `centre`, `releaseSlot`, `handSlotAt`); presets `foldIntoPair`, `enterPose`, `playToCenter`, `playToReleaseZone`; `useDiscardExit`'s pair split (`Leaving.aux` + `el`); the centre pending node (`[data-pending-play]`, Task 5, upgraded below).
- Produces:

```ts
// entities/game/board/types.ts — the staging → beat handoff. A ref, not state:
// the beat reads it once at run start (I8) and calls release() to clear it.
export interface StagedHandoff {
  mainUid: string
  supportUid?: string
  el: HTMLElement | null   // the staged node at the centre (pair flyer or single-card node)
  release: () => void      // clears the page's staging state
}
```

`planBeats` gains three plan kinds (shapes below); `useBeats` accepts `staging?: RefObject<StagedHandoff | null>` and wires `useComboBeat(anchors, staging)`.

- [ ] **Step 1: Failing plan tests**

In `planBeats.test.ts`, following its existing fixture style:

```ts
it('an attacked event plans an attackPlaced beat, sudo or not', () => {
  const plans = planBeats([attacked({ id: 5, attacker: 'p2', card: 'attack-bug', sudo: true, target: 'p1' })], before)
  expect(plans).toEqual([{ kind: 'attackPlaced', key: 'attack:5', eventId: 5, attacker: 'p2', card: 'attack-bug', sudo: true }])
})

it('a released with codeReview plans a releasePlaced beat; a plain released plans nothing', () => {
  expect(planBeats([released({ id: 7, player: 'p1', slot: 'frontend', card: 'release-frontend', codeReview: 'support-code-review' })], before))
    .toEqual([{ kind: 'releasePlaced', key: 'release:7', eventId: 7, player: 'p1', slot: 'frontend', card: 'release-frontend', codeReview: 'support-code-review' }])
  expect(planBeats([released({ id: 8, player: 'p1', slot: 'frontend', card: 'release-frontend' })], before)).toEqual([])
})

it('resolution discards of the pending pair take the pair exit, others keep the discard beat', () => {
  const withPending = { ...before, pending: { kind: 'defend', attackCard: 'attack-bug', sudo: true, /* … */ } }
  const events = [tookHit({ id: 9 }), discarded({ id: 10, player: 'p2', card: 'attack-bug', reason: 'attackSpent' }),
                  discarded({ id: 11, player: 'p2', card: 'support-sudo', reason: 'attackSpent' })]
  const plans = planBeats(events, withPending)
  expect(plans).toEqual([{ kind: 'pairToDiscard', key: 'pairOut:10', main: { eventId: 10, card: 'attack-bug' }, aux: { eventId: 11, card: 'support-sudo' } }])
})

it('a plain attack resolution routes its one discard through pairToDiscard too', () => {
  // pending sudo:false → pairToDiscard with aux: undefined — the centre card is
  // what flies, and sourceOf could never find it (it is in no hand and no zone)
})
```

- [ ] **Step 2: Run to verify failure** — `pnpm --filter @release/web test -- planBeats` → FAIL.

- [ ] **Step 3: Extend `planBeats.ts`**

New members of `BeatPlan`:

```ts
  | { kind: 'attackPlaced'; key: string; eventId: number; attacker: string; card: string; sudo: boolean }
  | { kind: 'releasePlaced'; key: string; eventId: number; player: string; slot: string; card: string; codeReview: string }
  | { kind: 'pairToDiscard'; key: string; main: { eventId: number; card: string }; aux?: { eventId: number; card: string } }
```

In the walk:
- `attacked` → `flush()`, push `attackPlaced` (fields off the event; `target` is not carried — the pair settles at the centre, not at a seat).
- `released` with `e.codeReview` → `flush()`, push `releasePlaced`. Without `codeReview`: fall through to the default (unchanged pass-through).
- `discarded`: BEFORE the existing `sourceOf` routing — when `before.pending?.kind === 'defend'` and the event's card matches the pending's halves, claim it for the pair exit:

```ts
    if (e.type === 'discarded') {
      if (owned.has(e.id)) continue
      const p = before.pending
      if (p?.kind === 'defend' && pairOut && e.card === 'support-sudo' && p.sudo && !pairOut.aux) {
        pairOut.aux = { eventId: e.id, card: e.card }
        continue
      }
      if (p?.kind === 'defend' && e.card === p.attackCard && !pairOut) {
        flush()
        pairOut = { kind: 'pairToDiscard', key: `pairOut:${e.id}`, main: { eventId: e.id, card: e.card } }
        continue
      }
      /* …existing sourceOf path… */
    }
```

with `let pairOut: Extract<BeatPlan, { kind: 'pairToDiscard' }> | null = null` beside the other run accumulators and pushed by `flush()` like the rest. Order guard: the engine emits the attack card's discard before the sudo's (Task 8 pins it), and only ONE exchange can be pending, so a second `attack-bug` discard in the same batch (impossible today) would fall through to the ordinary discard beat — safe by construction. On a Rollback return the attack card produces NO discard event and the sudo's `discarded` arrives with the pending still naming `attackCard` — handle it: the sudo match must not require `pairOut` to exist; make the sudo branch create `pairOut` with `main: undefined` — adjust the type to `main?:` and the runner to fly whichever halves exist. Cover with a fifth plan test (`rollback return: only the sudo half flies out`).

- [ ] **Step 4: Implement `comboBeat.tsx`**

One hook, three runs, the two entry points as one branch:

```tsx
// same 5-line helper discardBeat.tsx keeps privately — copy it, don't import
// across runners
const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useComboBeat(anchors: BoardAnchors, staging?: RefObject<StagedHandoff | null>) {
  const { overlay: exitOverlay, send } = useDiscardExit(anchors.discardBox)
  const flyer = useFlyer()
  const latest = useRef({ anchors, staging, send })
  latest.current = { anchors, staging, send }

  // attackPlaced: the play reaches the centre. Local staging → it is ALREADY
  // there: adopt and release. No staging → fold/fly in from where it came.
  const runAttack = useCallback(async (plan, ctx: BeatRun) => {
    await nextFrames() // the shadow that renders `before` has committed (I2)
    const { anchors: a, staging: s } = latest.current
    const handoff = s?.current
    if (handoff && handoff.mainUid && plan.attacker === ctx.base.selfId) {
      // the actor's own play: the staged node stands exactly where the pending
      // render takes over — nothing to move, hand the table back
      handoff.release()
      return
    }
    // everyone else (and a local click-thrown window attack, which staged nothing):
    // the halves fold in from the actor's side — seat for an opponent, the hand
    // slot the card left for the local thrower (found by id, as sourceOf does)
    const el = await foldIn(plan.attacker, plan.card, plan.sudo ? 'support-sudo' : undefined, ctx)
    if (el) flyer.drop('fold') // the centre pending render takes over (last frame = projection)
  }, [foldIn, flyer.drop])

  // The full fold: raise a carrier at the centre, paint both halves standing at
  // the source, fold them into the pair's pose. The aux is the same movement
  // with PAIR_AUX_POSE as its rest — no branch (the degenerate case is built in).
  // Returns the carrier element still HELD — the caller decides whether the pair
  // stays (attack → drop, the pending render is underneath) or flies on
  // (release → playToReleaseZone first).
  const foldIn = useCallback(
    async (actor: string, cardId: string, auxId: string | undefined, ctx: BeatRun) => {
      const a = latest.current.anchors
      const cRect = rectOf(a.centre.current)
      const main = cardById(cardId)
      const aux = auxId ? cardById(auxId) : null
      if (!cRect || !main) return null
      const mine = actor === ctx.base.selfId
      const handIndex = mine ? ctx.base.you.hand.findIndex((h) => h.card.id === cardId) : -1
      const fromRect =
        (mine && handIndex >= 0 ? rectOf(a.handSlotAt(handIndex)) : null) ?? a.seatBox(actor)
      if (!fromRect) return null
      const [el] = await flyer.raise([
        aux
          ? { key: 'fold', at: cRect, content: <CardPair main={main} aux={aux} width="100%" /> }
          : { key: 'fold', at: cRect, card: main },
      ])
      if (!el) return null
      for (const anim of el.getAnimations?.({ subtree: true }) ?? []) anim.cancel() // I3
      const mainEl = aux ? el.querySelector<HTMLElement>('[data-main]') : el
      const auxEl = aux ? el.querySelector<HTMLElement>('[data-aux]') : null
      if (mainEl) mainEl.style.transform = enterPose(fromRect, cRect)
      if (auxEl) auxEl.style.transform = enterPose(fromRect, cRect)
      await nextFrames() // the painted frame at the source (I2)
      const flights = [
        mainEl ? play('foldIntoPair', mainEl, { from: fromRect, box: cRect, dur: 620 }) : null,
        auxEl
          ? play('foldIntoPair', auxEl, { from: fromRect, box: cRect, pose: PAIR_AUX_POSE, dur: 620, snap: true })
          : null,
      ]
      await Promise.all(flights.map((f) => f?.finished))
      return el
    },
    [flyer.raise],
  )

  // releasePlaced: the pair flies into the owner's slot; the zone's static
  // support render (Task 9) is the landing pose.
  const runRelease = useCallback(async (plan, ctx: BeatRun) => {
    await nextFrames()
    const { anchors: a, staging: s } = latest.current
    const handoff = s?.current
    const cRect = rectOf(a.centre.current)
    const toRect = rectOf(a.releaseSlot(plan.player, plan.slot))
    if (!cRect || !toRect) { handoff?.release(); return }
    if (handoff && plan.player === ctx.base.selfId && handoff.el) {
      // the actor's staged pair is at the centre: fly THAT node to the slot
      await play('playToReleaseZone', handoff.el, { from: cRect, to: toRect })?.finished
      handoff.release()
      return
    }
    const el = await foldIn(plan.player, plan.card, plan.codeReview, ctx)
    if (el) await play('playToReleaseZone', el, { from: cRect, to: toRect })?.finished
    flyer.drop('fold')
  }, [foldIn, flyer.drop])

  // pairToDiscard: the pending pair at the centre splits into two singles.
  const runPairOut = useCallback(async (plan, _ctx: BeatRun) => {
    await nextFrames()
    const a = latest.current.anchors
    const el = a.centre.current?.querySelector<HTMLElement>('[data-pending-play]') ?? null
    const from = el ? rectOf(el) : null
    if (!from) return // nothing measurable: the projection resolves it (never stranded)
    const main = plan.main ? cardById(plan.main.card) : null
    const aux = plan.aux ? cardById(plan.aux.card) : null
    const items: Leaving[] = main
      ? [{ key: `p${plan.main.eventId}`, card: main, aux, el, from, layer: 0, scatter: scatterAt(plan.main.eventId) }]
      : aux ? [{ key: `p${plan.aux.eventId}`, card: aux, from, scatter: scatterAt(plan.aux.eventId) }] : []
    if (items.length > 0) await latest.current.send(items)
  }, [])

  return { overlay: [...exitOverlay, ...flyer.overlay], runAttack, runRelease, runPairOut }
}
```

The elided fold bodies follow ComboStory's `pickPartner` sequence exactly (I3 cancel, pin, `enterPose` first frames, `foldIntoPair` × halves) — the same discipline as Task 10, sourced from a seat/hand rect instead of the fan. The aux half's split in `runPairOut` reuses `useDiscardExit`'s own pair handling (`Leaving.aux` + `el` — it measures `[data-aux]`, trims to a card box, starts at `PAIR_AUX.rot` as a number, one layer under its main). Note the pair split lands on `scatterAt(eventId)` of each half's own `discarded` event — the same Scatter `toDiscardHeap` rests them on (I7).

`useBeats.ts`: add `staging` to the args, `const combo = useComboBeat(anchors, staging)` beside the other runners, three `beatOf` clauses (`attackPlaced` → `combo.runAttack`, `releasePlaced` → `combo.runRelease`, `pairToDiscard` → `combo.runPairOut`, all `exclusive: false`), and `combo.overlay` in the overlays concat.

`_Board.tsx`:
- Build the handoff ref from staging state (a `useRef<StagedHandoff | null>` kept current in a layout effect: set while `staging.staged?.phase === 'dispatched'`, with `el` = pair flyer node or the staged single-card node, `release` = the staging hook's internal clear).
- Pass it to `useBeats({ …, staging: handoffRef })`.
- Upgrade the Task 5 pending render: when `state.pending.kind === 'defend' && state.pending.sudo`, render `<CardPair main={cardById(state.pending.attackCard)!} aux={cardById('support-sudo')!} width="100%" />` inside the `[data-pending-play]` node (keep the single `Card` for `sudo: false`). The runner's fold lands on `PAIR_AUX_POSE` — `CardPair`'s own inline pose — so the handover is invisible (the spec's "last frame is the projection").

- [ ] **Step 5: Run all frontend tests** — `pnpm --filter @release/web test && pnpm typecheck` → PASS (plan tests green; board tests from Tasks 3–5, 10 still green).

- [ ] **Step 6: Commit**

```bash
git add -A apps/frontend
git commit -m "feat(web): the pair folds in from events and splits back out to the discard (#100)"
```

### Task 12: End-to-end board tests for the combo scenes

**Files:**
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/boardStaging.test.tsx`, `boardComponent.test.tsx`

- [ ] **Step 1: Write the tests, watch them fail, fix what they expose**

```ts
it('a sudo pending renders the pair at the centre', () => {
  render(boardWith({ pending: defendPending({ attackCard: 'attack-bug', sudo: true }) }))
  const node = screen.getByTestId('board-centre-pending')
  expect(node.querySelector('[data-aux]')).toBeInTheDocument()
})

it('an opponent sudo attack plans the full fold (no local staging)', () => {
  // feed an `attacked {sudo: true, attacker: opponent}` batch through the board
  // and assert via the queue: the centre pending pair appears after the beat
  // (jsdom: reduced-motion collapse path is acceptable — assert the end state)
})

it('the resolution splits the pending pair into the discard heap', () => {
  // before: pending sudo defend; batch: tookHit + 2 × discarded(attackSpent)
  // after drain: pending gone, discard heap holds both cards (toDiscardHeap)
})

it('a dispatched pair survives a projection tick without flicker', () => {
  // dispatched staging + unchanged projection rerender → staged pair still rendered once
})
```

Run: `pnpm --filter @release/web test` until green; fixes go to the file that owns the behavior (runner, staging hook, or board wiring), never into the test.

- [ ] **Step 2: Commit**

```bash
git add -A apps/frontend
git commit -m "test(web): the combo pair plays out from staging, from events and into the heap (#100)"
```

### Task 13: PR B docs and the pull request

**Files:**
- Modify: `docs/animations/recipes.md` (the combo recipe, `:404-487`)
- Modify: `docs/animations/backlog.md`
- Modify: `apps/playground/stories/AnimationAuditStory/*`
- Modify: `apps/playground/stories/ComboStory/mockLegality.ts` (header note only, if stale)

- [ ] **Step 1: Rewrite the combo recipe**

`recipes.md:404-487` describes the pre-`foldIntoPair` click-to-start scene. Rewrite it to the shipped shape: pull the support → partners light → fold (`enterPose` first frame, `foldIntoPair` per half, aux on `PAIR_AUX_POSE`) → aim/target when the partner needs one → `attacked`/`released(codeReview)` beats on the board → `pairToDiscard` split at resolution. Reference the board files, keep the invariant references (I1, I2, I3, I6, I7, I8) accurate to the code written in Tasks 10–11.

- [ ] **Step 2: Register the findings**

- Audit page: combo scenario → on the board; register lines for the two findings below.
- `docs/animations/backlog.md`: (1) the Rollback return — the pair exit sends the sudo half out and the attack card goes to a hand with NO movement on the board until #101's exchange choreography; what closes it: the defence scenes. (2) the pair-cancel single-gap return — both halves land in one gap and the fan settles to projection order; acceptable per ComboStory's own middle-return, revisit only if it reads badly on the board.
- `docs/rules/backlog.md` entry from Task 7 Step 5 double-checked in this pass.

- [ ] **Step 3: Full check, push, PR**

Run: `pnpm test && pnpm typecheck && pnpm lint` → all green.

```bash
git add -A
git commit -m "docs(animations): the combo recipe matches the board; two findings on record (#100)"
git push -u origin feat/100-combo-pair
gh pr create --draft --base feat/99-arrow-targeting --title "Combo pair on the board (#100)" --body "…summary: projection combos, resolution banking with real discarded events, support-first staging fold, comboBeat with staged/full-fold entries, pair split to the discard. Spec: docs/specs/2026-08-17-board-arrow-and-combo-design.md"
```
