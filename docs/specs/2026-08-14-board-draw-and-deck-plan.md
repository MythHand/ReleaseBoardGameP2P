# Draw and deck animations on the board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The board plays the two Wave 1 playground scenes — a card being drawn, and the deck being rebuilt, split or merged — from engine events instead of from a demo button.

**Architecture:** The board's beat queue (`useBeats`, landed in #96) keeps the queue, the shadow and the reduced-motion policy, and stops knowing what any beat *is*: `planBeats` becomes an ordered walk producing a plan union, and each kind gets its own runner file. Two enabling changes come first — the ordinary `drawn` event becomes public with its card redacted, so an opponent's draw is animatable at all; and `decks.main` becomes an array of pile counts, so a split has somewhere to land.

**Tech Stack:** TypeScript, React 19, Vitest + @testing-library/react, WAAPI through `@release/ui`'s `play()` registry, CSS Modules + design tokens.

**Spec:** [`docs/specs/2026-08-14-board-draw-and-deck-design.md`](./2026-08-14-board-draw-and-deck-design.md)

**Branch:** `feat/97-draw-and-deck`, forked from `feat/96-board-animation-layer`. PRs into `feat/96`, continuing the train `main ← 89 ← 96 ← 97`.

## Global Constraints

- **Comments in English.** Existing Russian comments are legacy; do not add new ones. (Root `CLAUDE.md`.)
- **No string literals in `.tsx`.** All user-visible copy goes through `t()` / translation keys; `@release/ui` receives copy as props. (Root `CLAUDE.md`.)
- **CSS Modules + design tokens.** No hardcoded colour anywhere — `var(--*)` from `apps/ui/src/design/tokens.css`. Spacing in plain px, logical properties (`padding-inline`, `margin-block-start`) — stylelint enforces this.
- **Feature-Sliced imports are one-way:** `pages/` → `features/` → `entities/` → `shared/`. A feature must not import from a sibling feature. (`apps/frontend/CLAUDE.md`.)
- **`prefers-reduced-motion` is honoured by the queue, in one place.** `play()` drives WAAPI directly and does not check it. No runner added by this plan may read the preference itself.
- **A movement found in two scenes is a module that has not been packaged yet.** Port into the shared home; never copy into a second place.
- **Every gap goes in the register.** `docs/animations/backlog.md` *and* the playground's `Interaction audit` page. A local workaround nobody hears about is how one movement ends up written three times.
- **Verification commands** (run from the repo root): `pnpm test`, `pnpm typecheck`, `pnpm lint`.
- Existing invariant numbering (`I1`–`I10`) is defined in [`docs/animations/README.md`](../animations/README.md) and referenced by number throughout.

---

### Task 1: The draw becomes public, the card stays secret

`visibleTo` answers one question — who may see that this happened. A draw needs two answers: everyone at the table watches a card being taken, and only the drawer sees its face. Today `drawn` encodes the second as `visibleTo: [drawer]`, and `forViewer` drops the whole event, so an opponent's draw reaches this peer as nothing at all. This task splits the two facts.

**Files:**
- Create: `packages/engine/src/redact.ts`
- Create: `packages/engine/src/redact.test.ts`
- Modify: `packages/engine/src/index.ts`
- Modify: `packages/engine/src/fake/reduce.ts:120-127`
- Modify: `packages/engine/src/fake/reduce.test.ts:65-71`
- Modify: `apps/frontend/src/network/session/audience.ts`
- Modify: `apps/frontend/src/network/session/audience.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `redactFor(event: Event, viewerId: PlayerId): Event`, exported from `@release/engine`. After this task, every peer receives `drawn { id, player, pile, deckSize }` for every draw, plus `card` when they are the drawer.

- [ ] **Step 1: Write the failing test for the redaction rule**

Create `packages/engine/src/redact.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { Event } from './events'
import { redactFor } from './redact'

const drawn = (over: Partial<Extract<Event, { type: 'drawn' }>> = {}): Event =>
  ({
    id: 7,
    type: 'drawn',
    player: 'p1',
    card: 'attack-bug',
    pile: 0,
    deckSize: 39,
    ...over,
  }) as Event

describe('redactFor', () => {
  it('keeps the card for the player who drew it', () => {
    const own = drawn()
    expect(redactFor(own, 'p1')).toBe(own)
  })

  // The point of the whole change: the DRAW survives for everyone, only the
  // identity goes. Before this, the event was dropped and an opponent's draw
  // was invisible to every other peer.
  it('strips the card for everyone else, and keeps the draw itself', () => {
    const seen = redactFor(drawn(), 'p2') as Extract<Event, { type: 'drawn' }>
    expect(seen.card).toBeUndefined()
    expect(seen).toEqual({ id: 7, type: 'drawn', player: 'p1', pile: 0, deckSize: 39 })
  })

  // A trigger is turned up in front of everybody, so its `drawn` never carried
  // a card to begin with — there is nothing here to hide.
  it('leaves a trigger draw alone', () => {
    const trigger = drawn({ card: undefined })
    expect(redactFor(trigger, 'p2')).toBe(trigger)
  })

  it('leaves every other event untouched', () => {
    const revealed = { id: 8, type: 'revealed', player: 'p1', card: 'trigger-error-503' } as Event
    expect(redactFor(revealed, 'p2')).toBe(revealed)
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @release/engine test -- redact`
Expected: FAIL — `Failed to resolve import "./redact"`.

- [ ] **Step 3: Write the redaction**

Create `packages/engine/src/redact.ts`:

```ts
import type { Event } from './events'
import type { PlayerId } from './state'

// `visibleTo` answers ONE question — who may see that this happened. A draw
// needs two answers: everybody at the table watches a card being taken, and
// nobody but the drawer sees its face. Encoding the second as
// `visibleTo: [drawer]` made the whole event private, so an opponent's draw
// reached other peers as nothing at all — no event to animate, only a hand
// count that ticked up.
//
// So the identity is redacted and the event survives. The rule lives HERE
// because the engine is the only party that knows which secrets exist; the
// transport applies what it is handed and never re-derives it from a payload.
export function redactFor(event: Event, viewerId: PlayerId): Event {
  if (event.type !== 'drawn' || event.card === undefined) return event
  if (event.player === viewerId) return event
  const { card: _identity, ...open } = event
  return open
}
```

- [ ] **Step 4: Export it and run the test again**

In `packages/engine/src/index.ts`, add beside the other value exports (keep the file's alphabetical-by-module grouping — put it after the `./rng` line):

```ts
export { redactFor } from './redact'
```

Run: `pnpm --filter @release/engine test -- redact`
Expected: PASS (4 tests).

- [ ] **Step 5: Rewrite the engine test that pinned the old behaviour**

In `packages/engine/src/fake/reduce.test.ts`, replace the test at lines 65-71 with:

```ts
// The draw is a public fact — everyone at the table sees a card taken. Its
// IDENTITY is not, and that is redacted per viewer (`redactFor`) rather than
// hidden by dropping the event. Pinned here because an animation on every peer
// now depends on this event arriving at all.
it('announces the draw to the table and carries the card for the drawer', () => {
  const s = withoutTriggers(engine.createGame(config()))
  const r = reduce(s, { type: 'DRAW', player: 'p1', at: 1000 })
  const drawn = r.events[0]
  expect(drawn.visibleTo).toBeUndefined()
  expect(drawn.type === 'drawn' && drawn.card).toBeDefined()
})
```

- [ ] **Step 6: Run it and watch it fail**

Run: `pnpm --filter @release/engine test -- reduce`
Expected: FAIL — `expected [ 'p1' ] to be undefined`.

- [ ] **Step 7: Make the ordinary draw public**

In `packages/engine/src/fake/reduce.ts`, in the `else` branch of `runDrawSequence` (lines 120-127), delete the `visibleTo` line so the call reads:

```ts
      log.add({
        type: 'drawn',
        player: owed.player,
        card: card.id,
        pile: pileIndex,
        deckSize: main[pileIndex].length,
      })
```

- [ ] **Step 8: Run the engine suite**

Run: `pnpm --filter @release/engine test`
Expected: PASS. If `properties.test.ts` or a projection test asserts that an opponent's feed omits draws, update the assertion to the new rule — the card is absent, the event is not.

- [ ] **Step 9: Write the failing test for the transport applying it**

In `apps/frontend/src/network/session/audience.test.ts`, replace the `privateEvent` fixture (lines 4-13) — a `drawn` is no longer the right example of a wholly private event — and add the redaction tests. The new fixture and tests:

```ts
// `handTransfer` is genuinely private to its two ends: nobody else may know it
// happened at all. A draw is NOT that shape any more — see the redaction tests.
const privateEvent: Event = {
  id: 2,
  type: 'handTransfer',
  from: 'a',
  to: 'b',
  card: 'attack-bug',
  visibleTo: ['a', 'b'],
}

const drawnEvent: Event = {
  id: 4,
  type: 'drawn',
  player: 'a',
  card: 'attack-bug',
  pile: 0,
  deckSize: 30,
}

it('shows a draw to the whole table, with the card only for the drawer', () => {
  const [mine] = forViewer([drawnEvent], 'a') as [Extract<Event, { type: 'drawn' }>]
  const [theirs] = forViewer([drawnEvent], 'b') as [Extract<Event, { type: 'drawn' }>]
  expect(mine.card).toBe('attack-bug')
  // The event itself survives for the onlooker — that is what makes an
  // opponent's draw animatable at all.
  expect(theirs.card).toBeUndefined()
  expect(theirs.player).toBe('a')
})
```

Update the two existing tests that name `privateEvent` so they still describe `handTransfer` (`forViewer([privateEvent], 'c')` is `[]`; `forViewer([privateEvent], 'a')` is `[privateEvent]`), and the ordering test to use ids `[1, 2]` as before.

- [ ] **Step 10: Run it and watch it fail**

Run: `pnpm --filter @release/web test -- audience`
Expected: FAIL — `expected 'attack-bug' to be undefined` on the onlooker's card.

- [ ] **Step 11: Delegate from the transport**

In `apps/frontend/src/network/session/audience.ts`:

```ts
import type { Event, PlayerId } from '@release/engine'
import { redactFor } from '@release/engine'

// The engine is the only party that knows which secrets exist, so it declares
// each event's audience on `visibleTo` (absent means public) and, where an event
// is public but one of its FIELDS is not, how to redact it. This layer reads the
// audience and applies the engine's own redaction; it never re-derives either
// answer from an event's payload.
export function forViewer(events: Event[], viewerId: PlayerId): Event[] {
  return events
    .filter((e) => e.type !== 'rejected' && (!e.visibleTo || e.visibleTo.includes(viewerId)))
    .map((e) => redactFor(e, viewerId))
}
```

- [ ] **Step 12: Run the frontend network tests**

Run: `pnpm --filter @release/web test -- session`
Expected: PASS.

- [ ] **Step 13: Full check and commit**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

```bash
git add packages/engine/src/redact.ts packages/engine/src/redact.test.ts packages/engine/src/index.ts packages/engine/src/fake/reduce.ts packages/engine/src/fake/reduce.test.ts apps/frontend/src/network/session/audience.ts apps/frontend/src/network/session/audience.test.ts
git commit -m "feat(engine): a draw is public, the card it took is not (#97)"
```

---

### Task 2: The draw deck becomes piles

`decks.main` is one number today, summed from `view.decks.piles` under the comment *"The kit renders one deck; split piles are #61's problem"*. The engine has been splitting for real since `release.ts:137`. This task makes the board show what the projection already knows, and gives a flight somewhere to aim.

**Files:**
- Modify: `apps/ui/src/table/Table/types.ts:41-48`
- Create: `apps/ui/src/table/Table/piles.ts`
- Modify: `apps/ui/src/index.ts`
- Modify: `apps/ui/src/table/Table/Table.tsx:288-297`
- Modify: `apps/ui/src/table/Table/Table.module.css`
- Modify: `apps/ui/src/mocks/table.ts:50-56,122-128`
- Modify: `apps/ui/src/table/Table/dock.test.ts:10`
- Modify: `apps/frontend/src/entities/game/board/types.ts:60-70`
- Modify: `apps/frontend/src/entities/game/board/toBoardState.ts:188-192`
- Modify: `apps/frontend/src/entities/game/board/toBoardState.test.ts:41`
- Modify: `apps/frontend/src/entities/game/board/anchors.ts`
- Modify: `apps/frontend/src/entities/game/board/anchors.test.tsx`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx:407-424`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.module.css`
- Modify: `apps/frontend/src/pages/board/[gameId]/_layout.tsx:20`
- Modify: `apps/frontend/src/features/game-intro/useDealIntro.ts:305,330,410,477`
- Modify: `apps/frontend/src/features/game-intro/__tests__/useDealIntro.test.tsx:33`
- Modify: `apps/frontend/src/features/game-intro/__tests__/useDealIntroMotion.test.tsx:30,85,119`
- Modify: `apps/frontend/src/features/board-beats/useBeats.test.tsx:35,79,98,127`
- Modify: `apps/frontend/src/features/board-beats/planBeats.test.ts:23`
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/board.test.tsx`

**Interfaces:**
- Consumes: nothing from Task 1.
- Produces:
  - `TableState['decks']['main']: number[]` and `BoardState['decks']['main']: number[]` — one entry per draw pile, in the engine's own pile order.
  - `pileWidthFor(count: number): number` from `@release/ui`.
  - On `BoardAnchors`: `pileBox(index: number): HTMLElement | null` and `bindPile(index: number, el: HTMLDivElement | null): void`. **`deckBox` is removed** — pile 0's box is `pileBox(0)`.

- [ ] **Step 1: Write the failing test for the adapter**

In `apps/frontend/src/entities/game/board/toBoardState.test.ts`, replace the assertion at line 41. The fixture at line 20 already projects two piles (`piles: [30, 10]`), which is exactly the case that was being flattened:

```ts
  // The projection has always carried the piles; the adapter used to sum them
  // because the board could only draw one. It draws them all now, so the shape
  // travels through untouched.
  expect(toBoardState(view, [], labels).decks.main).toEqual([30, 10])
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @release/web test -- toBoardState`
Expected: FAIL — `expected 40 to deeply equal [ 30, 10 ]`.

- [ ] **Step 3: Widen both state shapes**

In `apps/ui/src/table/Table/types.ts`, inside `decks`:

```ts
    // One entry per draw pile, in the engine's own pile order — Git Branch
    // splits the deck and `drawn.pile` names which of them a card came off, so
    // a single total could answer neither question.
    main: number[]
```

Make the identical change in `apps/frontend/src/entities/game/board/types.ts`. The two shapes are held in step by `contract.test-d.ts`, so changing one without the other is a compile error — which is the point.

- [ ] **Step 4: Pass the piles through**

In `apps/frontend/src/entities/game/board/toBoardState.ts`, replace the `main:` line and its comment:

```ts
    decks: {
      // The projection's own pile list, not a total: `drawn.pile` names one of
      // these, and a split has to be visible for Git Branch to be aimable.
      main: view.decks.piles,
```

- [ ] **Step 5: Run the adapter test**

Run: `pnpm --filter @release/web test -- toBoardState`
Expected: PASS.

- [ ] **Step 6: Add the shared width ramp**

Create `apps/ui/src/table/Table/piles.ts`:

```ts
// How wide a draw pile is drawn, given how many are on the table. One value,
// two renderers — the kit's Table and the board's fork of it — because a number
// copied into both is a number that drifts in one of them.
//
// Git Branch plus Sudo can put three main piles out at once, and the row shares
// the table with the hand and the dock, so the width comes down as the count
// goes up. The single-pile width is the one the screen was designed at and does
// not move.
const PILE_W = [150, 120, 100]

export const pileWidthFor = (count: number): number => PILE_W[Math.min(count, 3) - 1] ?? 100
```

Export it from `apps/ui/src/index.ts` alongside the other table exports:

```ts
export { pileWidthFor } from './table/Table/piles'
```

- [ ] **Step 7: Render the row in the kit**

In `apps/ui/src/table/Table/Table.tsx`, replace the decks block (lines 288-297):

```tsx
        <div className={styles.decks}>
          <div className={styles.pileRow}>
            {decks.main.map((count, i) => (
              <Pile
                // biome-ignore lint/suspicious/noArrayIndexKey: a pile IS its index — the engine names it that way in `drawn.pile`, and the halves of a split stay where the pile was
                key={i}
                label={copy.table.deck}
                deck="base"
                count={count}
                width={pileWidthFor(decks.main.length)}
                countPos="tl"
              />
            ))}
          </div>
          <Pile
            label={copy.table.events}
            deck="ai"
            count={decks.events}
            width={150}
            countPos="tl"
          />
        </div>
```

Add `pileWidthFor` to the import from `./piles` at the top of the file.

In `apps/ui/src/table/Table/Table.module.css`, after the `.decks` rule:

```css
/* the draw piles sit side by side: a split can put three of them out, and a
   column would run off the top and bottom of a vertically-centred block */
.pileRow {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
```

- [ ] **Step 8: Fix the kit's own fixtures**

`apps/ui/src/mocks/table.ts:51` — `main: number` becomes `main: number[]`; line 123 — `main: 78` becomes `main: [78]`.
`apps/ui/src/table/Table/dock.test.ts:10` — `main: 40` becomes `main: [40]`.

Run: `pnpm --filter @release/ui test && pnpm --filter @release/ui typecheck`
Expected: PASS.

- [ ] **Step 9: Write the failing anchors test**

In `apps/frontend/src/entities/game/board/anchors.test.tsx`, add:

```ts
it('pileBox keys by index — a draw aims at the pile its event names', () => {
  const { seen } = mount()
  const anchors = seen[0]
  const a = document.createElement('div')
  const b = document.createElement('div')
  anchors.bindPile(0, a)
  anchors.bindPile(1, b)
  expect(anchors.pileBox(0)).toBe(a)
  expect(anchors.pileBox(1)).toBe(b)
  // A pile that is not on the table answers null rather than falling back to
  // pile 0 — aiming a flight at the wrong deck is worse than not flying it.
  expect(anchors.pileBox(2)).toBeNull()
  // React calls a ref callback with null on unmount; a merged-away pile must
  // not linger in the registry.
  anchors.bindPile(1, null)
  expect(anchors.pileBox(1)).toBeNull()
})
```

- [ ] **Step 10: Run it and watch it fail**

Run: `pnpm --filter @release/web test -- anchors`
Expected: FAIL — `anchors.bindPile is not a function`.

- [ ] **Step 11: Replace `deckBox` with the pile registry**

In `apps/frontend/src/entities/game/board/anchors.ts`:

- Delete `deckBox: RefObject<HTMLDivElement | null>` from the interface and `const deckBox = useRef<HTMLDivElement>(null)` from the body, and drop `deckBox` from the returned object and from the `useMemo` deps.
- Add to the interface, beside `handSlotAt`:

```ts
  /** a draw pile's CARD box, by the index the engine names in `drawn.pile` */
  pileBox: (index: number) => HTMLElement | null
  bindPile: (index: number, el: HTMLDivElement | null) => void
```

- Add to the body, beside the seat bindings:

```ts
  const pileEls = useRef<Record<number, HTMLDivElement | null>>({})
  const pileBox = useCallback((index: number) => pileEls.current[index] ?? null, [])
  // A merge takes piles off the table, so an unbound index must answer null
  // rather than keep a node that is no longer rendered.
  const bindPile = useCallback((index: number, el: HTMLDivElement | null) => {
    if (el) pileEls.current[index] = el
    else delete pileEls.current[index]
  }, [])
```

- Add `pileBox, bindPile` to the returned object and to the `useMemo` dependency array.

- [ ] **Step 12: Repoint the deal intro**

In `apps/frontend/src/features/game-intro/useDealIntro.ts`, at lines 305 and 330, replace `rectOf(r.deckBox.current)` with `rectOf(r.pileBox(0))`.

At line 410 the intro tracks the deck counting down as it deals; it now tracks pile 0:

```ts
      setDeckCount(l.decks.main[0] ?? 0)
```

At line 477, where the shadow is published:

```ts
        // Only pile 0 counts down: the opening deals from the single pile a
        // fresh game starts with, and any others are left exactly as they are.
        decks: { ...live.decks, main: [deckCount, ...live.decks.main.slice(1)] },
```

- [ ] **Step 13: Update every fixture the shape reaches**

- `useDealIntro.test.tsx:33` and `useDealIntroMotion.test.tsx:30` — replace `deckBox: createRef<HTMLDivElement>(),` with `pileBox: () => null,` and `bindPile: () => {},`.
- `useDealIntroMotion.test.tsx:85` — `main: 100` becomes `main: [100]`; line 119 — `expect(shadow?.decks.main).toBe(104)` becomes `expect(shadow?.decks.main).toEqual([104])`.
- `useBeats.test.tsx:35` — `main: 10` becomes `main: [10]`; line 79 — replace `deckBox: { current: null },` with `pileBox: () => null,` and `bindPile: () => {},`; line 98 — `main: 40` becomes `main: [40]`; line 127 — `{(beats.shadow ?? live).decks.main}` becomes `{(beats.shadow ?? live).decks.main.join(',')}`.
- `planBeats.test.ts:23` — `main: 10` becomes `main: [10]`.
- `_layout.tsx:20` — `main: 0` becomes `main: []`.

Run: `pnpm typecheck`
Expected: PASS. Any remaining error is another fixture with the old shape — fix it the same way.

- [ ] **Step 14: Write the failing board render test**

In `apps/frontend/src/pages/board/[gameId]/__tests__/board.test.tsx`, add (following the file's existing render helper and props fixture):

```tsx
it('draws one pile per entry in the projection', () => {
  const { getAllByText } = renderBoard({
    state: { ...props.state, decks: { ...props.state.decks, main: [12, 12] } },
  })
  // The deck label appears once per pile — a split is two decks on the table,
  // not one deck showing a bigger number.
  expect(getAllByText(props.copy.table.deck)).toHaveLength(2)
})
```

- [ ] **Step 15: Run it and watch it fail**

Run: `pnpm --filter @release/web test -- board.test`
Expected: FAIL — one element found, two expected.

- [ ] **Step 16: Render the row on the board**

In `apps/frontend/src/pages/board/[gameId]/_Board.tsx`, replace the decks block (lines 407-424):

```tsx
      <div className={kit.decks}>
        <div className={cls(opening.deckStack, enter)} ref={anchors.decks}>
          <div className={opening.pileRow}>
            {decks.main.map((count, i) => (
              <Pile
                // biome-ignore lint/suspicious/noArrayIndexKey: a pile IS its index — the engine names it that way in `drawn.pile`, and a split leaves the halves where the pile was
                key={i}
                label={copy.table.deck}
                deck="base"
                count={count}
                width={pileWidthFor(decks.main.length)}
                countPos="tl"
                boxRef={(el) => anchors.bindPile(i, el)}
              />
            ))}
          </div>
          <Pile
            label={copy.table.events}
            deck="ai"
            count={decks.events}
            width={150}
            countPos="tl"
          />
        </div>
      </div>
```

Add `pileWidthFor` to the existing `@release/ui` import list.

In `apps/frontend/src/pages/board/[gameId]/_Board.module.css`, after `.deckStack`:

```css
/* the draw piles sit side by side — see the kit's own `.pileRow`. This one is
   the board's because the opening animates the stack around it. */
.pileRow {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}
```

- [ ] **Step 17: Run everything**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 18: Commit**

```bash
git add apps/ui/src apps/frontend/src
git commit -m "feat(web): the draw deck becomes as many piles as the table has (#97)"
```

---

### Task 3: The centre stands for the whole match

The table centre is mounted inside `{intro && …}` because the deal is its only user today. Every draw stages there, so it has to exist whenever the board does.

**Files:**
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx:443-460`
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/boardAnchors.test.tsx`

**Interfaces:**
- Consumes: Task 2's board render (same file, adjacent block).
- Produces: `anchors.centre.current` is non-null for the life of the board mount, with or without an `intro` prop. The node carries `data-board-centre` so a DOM test can find it through the CSS-module hash.

- [ ] **Step 1: Write the failing test**

In `apps/frontend/src/pages/board/[gameId]/__tests__/boardAnchors.test.tsx`, add:

```tsx
// Every draw stages at the centre, on every turn — so it cannot be a node that
// exists only while the opening runs. A board rendered with no `intro` at all
// is the case that used to have nowhere to aim.
it('keeps the table centre mounted after the opening is gone', () => {
  const { container } = renderBoard({ intro: undefined })
  expect(container.querySelector('[data-board-centre]')).not.toBeNull()
})
```

Use the file's existing render helper; if it always passes an `intro`, add the override as shown.

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @release/web test -- boardAnchors`
Expected: FAIL — `expected null not to be null`.

- [ ] **Step 3: Take the centre out of the intro's guard**

In `apps/frontend/src/pages/board/[gameId]/_Board.tsx`, change the block so the box is unconditional and only its contents belong to the deal:

```tsx
      {/* the centre: where cards stand while the table is looking at them — the
          player's own cards gather here during the opening, and every drawn card
          stages here for the rest of the match. Mounted for the whole life of
          the board, because a flight cannot aim at a node that is not there yet.
          pointer-events: none — outside a beat it is an empty box and must not
          catch clicks meant for the table. */}
      <div className={opening.centre} data-board-centre ref={anchors.centre}>
        {intro &&
          deal.staged.map((s) => {
            const data = cardById(s.card)
            if (!data) return null
            return (
              // …the existing staged-card JSX, unchanged
            )
          })}
      </div>
```

Keep the body of the `map` exactly as it is; only the guard and the wrapper change.

- [ ] **Step 4: Run the board tests**

Run: `pnpm --filter @release/web test -- board`
Expected: PASS, including the existing intro tests — the deal still renders its staged cards.

- [ ] **Step 5: Commit**

```bash
git add "apps/frontend/src/pages/board/[gameId]"
git commit -m "refactor(web): the table centre outlives the opening that built it (#97)"
```

---

### Task 4: `planBeats` becomes an ordered walk

The planner folds one kind today and ignores position. A batch can now arrive as `[deckReshuffled, drawn, drawn, pilesChanged]`, and playing those out of order shows a card drawn from a pile that has not been refilled yet. This task is pure — no DOM, no React, no timing — and carries most of the correctness of the feature.

**Files:**
- Modify: `apps/frontend/src/features/board-beats/planBeats.ts`
- Modify: `apps/frontend/src/features/board-beats/planBeats.test.ts`
- Modify: `apps/frontend/src/features/board-beats/index.ts`

**Interfaces:**
- Consumes: `BoardState['decks']['main']: number[]` (Task 2).
- Produces:

```ts
export interface PlannedDraw {
  key: string
  eventId: number
  player: string
  pile: number
  mine: boolean
  card?: string
  reveal?: { card: string; discardId: number }
}
export type PileStep =
  | { kind: 'split'; at: number; piles: number[] }
  | { kind: 'merge'; withDiscard: boolean; piles: number[] }
  | { kind: 'fromDiscard'; at: number; piles: number[] }
export type BeatPlan =
  | { kind: 'draw'; key: string; draws: PlannedDraw[] }
  | { kind: 'discard'; key: string; cards: DiscardCard[] }
  | { kind: 'reshuffle'; key: string; cards: number }
  | { kind: 'piles'; key: string; steps: PileStep[] }
export function classifyPiles(before: number[], after: number[]): PileStep | null
export function planBeats(events: Event[], before: BoardState): BeatPlan[]
```

`DiscardSource` and `DiscardCard` keep the shapes they have today.

- [ ] **Step 1: Write the failing tests for the walk**

Append to `apps/frontend/src/features/board-beats/planBeats.test.ts` (keep the existing `boardBefore` / `discarded` helpers and every existing test — they must all still pass):

```ts
const drawn = (id: number, over: Partial<Extract<Event, { type: 'drawn' }>> = {}): Event =>
  ({ id, type: 'drawn', player: 'p1', card: 'attack-bug', pile: 0, deckSize: 39, ...over }) as Event

describe('planBeats — the draw', () => {
  it('reads my own draw off the card the event still carries', () => {
    const [beat] = planBeats([drawn(4)], boardBefore())
    expect(beat).toMatchObject({ kind: 'draw' })
    expect(beat.kind === 'draw' && beat.draws[0]).toMatchObject({
      eventId: 4,
      pile: 0,
      mine: true,
      card: 'attack-bug',
    })
  })

  // The redaction leaves the event and takes the card. That, and only that, is
  // what tells an onlooker's draw apart from a trigger.
  it('reads an opponent’s draw as a face-down flight to their seat', () => {
    const [beat] = planBeats([drawn(4, { player: 'p2', card: undefined })], boardBefore())
    expect(beat.kind === 'draw' && beat.draws[0]).toMatchObject({
      player: 'p2',
      mine: false,
      card: undefined,
      reveal: undefined,
    })
  })

  it('names a trigger from the reveal that follows it', () => {
    const events: Event[] = [
      drawn(4, { card: undefined }),
      { id: 5, type: 'revealed', player: 'p1', card: 'trigger-error-503' } as Event,
      discarded(6, { card: 'trigger-error-503', reason: 'trigger' }),
    ]
    const beats = planBeats(events, boardBefore())
    expect(beats).toHaveLength(1)
    expect(beats[0].kind === 'draw' && beats[0].draws[0].reveal).toEqual({
      card: 'trigger-error-503',
      discardId: 6,
    })
  })

  // The trigger's card is at the CENTRE when it is filed, not in a hand or a
  // zone. The draw beat flies it out from where it stands, so the discard
  // planner must not also claim it — that would be two flights for one card.
  it('leaves the trigger’s own discard to the draw that revealed it', () => {
    const events: Event[] = [
      drawn(4, { card: undefined }),
      { id: 5, type: 'aiRevealed', player: 'p1', aiCard: 'trigger-ai', eventCard: 'ai-x' } as Event,
      discarded(6, { card: 'trigger-ai', reason: 'trigger' }),
    ]
    const beats = planBeats(events, boardBefore())
    expect(beats.map((b) => b.kind)).toEqual(['draw'])
  })

  it('puts a multi-draw in one beat, in the order it was drawn', () => {
    const beats = planBeats([drawn(4), drawn(5, { pile: 1 })], boardBefore())
    expect(beats).toHaveLength(1)
    expect(beats[0].kind === 'draw' && beats[0].draws.map((d) => d.pile)).toEqual([0, 1])
  })
})

describe('planBeats — order', () => {
  // The refill happens INSIDE the draw sequence, before the card is taken
  // (fake/reduce.ts:88). A queue that played these the other way round would
  // show a card drawn from a pile that has not been rebuilt yet.
  it('rebuilds the deck before the draw it made possible', () => {
    const events: Event[] = [
      { id: 3, type: 'deckReshuffled', cards: 12 } as Event,
      drawn(4),
      { id: 5, type: 'pilesChanged', piles: [11] } as Event,
    ]
    const beats = planBeats(events, boardBefore({ decks: { main: [0], events: 5, discardCount: 12 } } as Partial<BoardState>))
    expect(beats.map((b) => b.kind)).toEqual(['reshuffle', 'draw'])
  })

  // A run coalesces; it does not reach across something else. Two discards on
  // either side of a draw are two gestures, because that is what happened.
  it('does not let a discard run swallow one on the far side of a draw', () => {
    const events = [discarded(4), drawn(5), discarded(6, { card: 'protection-debugger' })]
    const beats = planBeats(events, boardBefore())
    expect(beats.map((b) => b.kind)).toEqual(['discard', 'draw', 'discard'])
  })
})

describe('classifyPiles', () => {
  // The event carries counts and nothing else — not the operation, not the
  // index. Recovering it positionally is a derivation, not a guess: a split
  // leaves the halves where the pile was, so one index accounts for two.
  it('reads a split from the pile that became two', () => {
    expect(classifyPiles([24], [12, 12])).toEqual({ kind: 'split', at: 0, piles: [12, 12] })
    expect(classifyPiles([10, 20, 30], [10, 10, 10, 30])).toEqual({
      kind: 'split',
      at: 1,
      piles: [10, 10, 10, 30],
    })
  })

  it('reads a merge, and whether the discard came with it', () => {
    expect(classifyPiles([4, 6], [10])).toEqual({ kind: 'merge', withDiscard: false, piles: [10] })
    // Sudo gathers the discard in too, so the survivor holds more than the
    // piles did — which is the only signal that the discard flew.
    expect(classifyPiles([4, 6], [15])).toEqual({ kind: 'merge', withDiscard: true, piles: [15] })
  })

  it('reads Git Branch + Sudo’s second step as the discard becoming a pile', () => {
    expect(classifyPiles([12, 12], [12, 12, 6])).toEqual({
      kind: 'fromDiscard',
      at: 2,
      piles: [12, 12, 6],
    })
  })

  // A pile that runs out ceases to exist. Nothing moves — the cards were face
  // down before and there are none after — so there is no beat to play.
  it('plays nothing for a pruned empty pile', () => {
    expect(classifyPiles([0, 10], [10])).toBeNull()
  })

  it('plays nothing when the counts say nothing happened', () => {
    expect(classifyPiles([10], [10])).toBeNull()
    expect(classifyPiles([0, 0], [0])).toBeNull()
  })
})
```

Add `classifyPiles` to the import at the top of the test file.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @release/web test -- planBeats`
Expected: FAIL — `classifyPiles is not a function`, and the draw tests find no `draw` plan.

- [ ] **Step 3: Add the plan union and the classifier**

In `apps/frontend/src/features/board-beats/planBeats.ts`, keep `DiscardSource`, `DiscardCard`, `FROM_RELEASE`, `slotHolding` and `sourceOf` exactly as they are, and replace `BeatPlan` and `planBeats` with:

```ts
// One card leaving a pile. `card` is present only when this peer is entitled to
// the identity: its own draw, redacted for everyone else (`redactFor`). A
// trigger carries none either — its name arrives on the reveal that follows.
export interface PlannedDraw {
  key: string
  eventId: number
  player: string
  pile: number
  /** the drawer is this peer — it flips at the centre and settles into the fan */
  mine: boolean
  card?: string
  /**
   * turned up in front of the whole table. `discardId` is the trigger's own
   * `discarded`, which the DRAW beat owns: the card is at the centre when it is
   * filed, and flying it from a hand slot it never occupied would be a lie.
   */
  reveal?: { card: string; discardId: number }
}

export type PileStep =
  | { kind: 'split'; at: number; piles: number[] }
  | { kind: 'merge'; withDiscard: boolean; piles: number[] }
  | { kind: 'fromDiscard'; at: number; piles: number[] }

export type BeatPlan =
  | { kind: 'draw'; key: string; draws: PlannedDraw[] }
  | { kind: 'discard'; key: string; cards: DiscardCard[] }
  | { kind: 'reshuffle'; key: string; cards: number }
  | { kind: 'piles'; key: string; steps: PileStep[] }

// `pilesChanged` carries counts and NOTHING else — not which operation ran, not
// which pile split (docs/animations/backlog.md). It is recoverable positionally,
// so this derives rather than guesses, and the whole derivation lives here with
// the reasoning attached instead of being spread over a beat.
//
// Order matters: a prune is checked before a merge, because [0, 10] -> [10] fits
// both shapes and only one of them happened.
export function classifyPiles(before: number[], after: number[]): PileStep | null {
  const kept = before.filter((n) => n > 0)
  // A pile that ran out ceased to exist: the survivors keep their counts, and
  // nothing on screen moves — the cards were face down before and gone after.
  if (after.length < before.length && kept.length === after.length) {
    if (kept.every((n, i) => n === after[i])) return null
  }
  if (after.length === 1 && before.length > 1 && after[0] > 0) {
    const gathered = before.reduce((a, b) => a + b, 0)
    // Sudo gathers the discard in as well, so the survivor holds more than the
    // piles did. That difference is the only signal that the discard flew too.
    return { kind: 'merge', withDiscard: after[0] > gathered, piles: after }
  }
  if (after.length === before.length + 1) {
    // The halves stay where the pile was (fake/piles.ts), so the first index
    // whose count changed is the pile that split — and it accounts for two.
    const at = before.findIndex((n, i) => n !== after[i])
    if (at >= 0 && before[at] === after[at] + after[at + 1]) {
      return { kind: 'split', at, piles: after }
    }
    // Nothing existing moved and one pile arrived at the end: Git Branch's Sudo
    // step, where the discard is appended unshuffled as a pile of its own.
    return { kind: 'fromDiscard', at: after.length - 1, piles: after }
  }
  return null
}

// The engine emits a trigger's reveal IMMEDIATELY after the card-less `drawn`
// that turned it up, and its `discarded` immediately after that
// (fake/triggers.ts:123,139). Looking ahead by position rather than scanning the
// batch is what keeps a later, unrelated reveal from being read as this draw's.
function revealAfter(events: Event[], i: number): { card: string; discardId: number } | null {
  const reveal = events[i + 1]
  if (!reveal) return null
  const card =
    reveal.type === 'revealed' ? reveal.card : reveal.type === 'aiRevealed' ? reveal.aiCard : null
  if (card == null) return null
  const filed = events[i + 2]
  if (filed?.type !== 'discarded' || filed.card !== card) return null
  return { card, discardId: filed.id }
}

export function planBeats(events: Event[], before: BoardState): BeatPlan[] {
  const claimed = new Set<number>()
  // discards the draw beat has taken over — a revealed trigger leaves from the
  // centre, so the discard planner must not claim it a second time
  const owned = new Set<number>()
  const plans: BeatPlan[] = []
  let piles = before.decks.main

  // A run of one kind coalesces into one beat; anything else closes it. That is
  // what makes a hand-limit discard of three read as one gesture while a discard
  // on the far side of a draw stays a gesture of its own.
  let draw: Extract<BeatPlan, { kind: 'draw' }> | null = null
  let discard: Extract<BeatPlan, { kind: 'discard' }> | null = null
  let pileRun: Extract<BeatPlan, { kind: 'piles' }> | null = null
  const flush = () => {
    if (draw) plans.push(draw)
    // A discard beat with nothing aimable is not a beat: every card in the run
    // failed to find a source, which the projection still resolves on its own.
    if (discard && discard.cards.length > 0) plans.push(discard)
    if (pileRun) plans.push(pileRun)
    draw = null
    discard = null
    pileRun = null
  }

  for (let i = 0; i < events.length; i++) {
    const e = events[i]
    if (e.type === 'drawn') {
      if (!draw) flush()
      const reveal = e.card === undefined ? revealAfter(events, i) : null
      if (reveal) owned.add(reveal.discardId)
      draw ??= { kind: 'draw', key: `draw:${e.id}`, draws: [] }
      draw.draws.push({
        key: `w${e.id}`,
        eventId: e.id,
        player: e.player,
        pile: e.pile,
        mine: e.player === before.selfId,
        card: e.card,
        reveal: reveal ?? undefined,
      })
      continue
    }
    if (e.type === 'discarded') {
      if (owned.has(e.id)) continue
      const source = sourceOf(e, before, claimed)
      // No source means the card is not where the board can see it — a case the
      // rules have not settled (docs/animations/backlog.md). Nothing is invented:
      // it is not flown, and the projection still puts it in the discard.
      if (!source) continue
      if (!discard) flush()
      discard ??= { kind: 'discard', key: `discard:${e.id}`, cards: [] }
      discard.cards.push({ key: `d${e.id}`, eventId: e.id, card: e.card, source })
      continue
    }
    if (e.type === 'deckReshuffled') {
      flush()
      plans.push({ kind: 'reshuffle', key: `reshuffle:${e.id}`, cards: e.cards })
      continue
    }
    if (e.type === 'pilesChanged') {
      const step = classifyPiles(piles, e.piles)
      // The running counts advance either way: a prune plays nothing, but the
      // NEXT step has to be classified against the table as it now stands.
      piles = e.piles
      if (!step) continue
      if (!pileRun) flush()
      pileRun ??= { kind: 'piles', key: `piles:${e.id}`, steps: [] }
      pileRun.steps.push(step)
      continue
    }
    // Everything else breaks a run and plays nothing. That is the default, not a
    // gap: the board is driven by the projection, and a beat only ever adds a way
    // of GETTING to the next one.
  }
  flush()
  return plans
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @release/web test -- planBeats`
Expected: PASS — the new tests and all thirteen existing ones.

- [ ] **Step 5: Export the new types**

In `apps/frontend/src/features/board-beats/index.ts`, add `BeatPlan`, `PlannedDraw`, `PileStep` and `classifyPiles` to the existing exports.

- [ ] **Step 6: Typecheck**

Run: `pnpm typecheck`
Expected: FAIL in `useBeats.ts` — `beatOf` reads `plan.cards` on a union that no longer always has it. Narrow it for now so the tree compiles, and leave the real dispatch to Task 5:

```ts
    for (const plan of planBeats(fresh, before)) {
      if (plan.kind === 'discard') queue.current.push(beatOf(plan, before))
    }
```

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/board-beats
git commit -m "feat(web): a batch becomes beats in the order it happened (#97)"
```

---

### Task 5: A beat can advance the board under itself

Today a beat renders one fixed `base` for its whole life. Two things in this feature need the shadow to move while a beat runs: the fan growing between the cards of a multi-draw (I8), and a new pile existing before `flyFrom` can measure it. `IntroBeat` already publishes its own shadow — this generalizes that exception into the queue, and lifts the discard runner out into a file of its own while the queue is open.

**Files:**
- Create: `apps/frontend/src/features/board-beats/discardBeat.tsx`
- Modify: `apps/frontend/src/features/board-beats/useBeats.ts`
- Modify: `apps/frontend/src/features/board-beats/index.ts`
- Test: `apps/frontend/src/features/board-beats/useBeats.test.tsx`

**Interfaces:**
- Consumes: `BeatPlan` (Task 4).
- Produces:

```ts
/** what a runner is handed: the projection it animates away from, and a way to move it */
export interface BeatRun {
  base: BoardState
  publish: (state: BoardState) => void
}
export function useDiscardBeat(anchors: BoardAnchors): {
  overlay: ReactNode[]
  run: (plan: Extract<BeatPlan, { kind: 'discard' }>, ctx: BeatRun) => Promise<void>
}
```

`Beats` (the hook's return) gains `gapAt: number | null` and `gapSize: number`, both `null` / `1` until Task 6 fills them.

- [ ] **Step 1: Write the failing test for the advancing shadow**

Add to `apps/frontend/src/features/board-beats/useBeats.test.tsx`:

```tsx
// The generalization of what the opening already did. A runner that publishes
// moves the board under itself — which is how the second card of a multi-draw
// aims at the fan the first one grew (I8), and how a split's new pile exists
// before it is measured.
it('renders what a running beat publishes, and drops it when the queue drains', async () => {
  motion.reduced = false
  sent.calls = []
  // A beat that parks after publishing, so the published state can be observed
  // while it is still up.
  const published = { ...preDiscard, decks: { ...preDiscard.decks, main: [7] } } as BoardState
  const { getByTestId } = renderWithBeat((ctx) => {
    ctx.publish(published)
    return new Promise<void>(() => {})
  })
  await flush()
  expect(getByTestId('deck').textContent).toBe('7')
})
```

This needs a probe that can queue an arbitrary runner. Add it beside `Probe`, driving the queue through the intro slot — the one beat the queue takes wholesale — so the test does not have to fabricate an engine batch:

```tsx
// The intro slot is the queue's own "here is a beat, run it" door. Using it
// keeps this test about the SHADOW rather than about planning.
const renderWithBeat = (run: (ctx: { publish: (s: BoardState) => void }) => Promise<void>) =>
  render(
    <Probe
      live={preDiscard}
      events={[]}
      anchors={stub}
      intro={{ key: 'g1', shadow: null, run, collapse: () => {} }}
    />,
  )
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @release/web test -- useBeats`
Expected: FAIL — the deck reads `10` (the live projection), because nothing the beat publishes is rendered.

- [ ] **Step 3: Give the queue a published shadow**

In `apps/frontend/src/features/board-beats/useBeats.ts`:

Change `Beat` and add the run context:

```ts
/** what a runner is handed: the projection it animates away from, and a way to move it */
export interface BeatRun {
  base: BoardState
  publish: (state: BoardState) => void
}

interface Beat {
  key: string
  /** the projection this beat animates AWAY from — the board while it runs */
  base: BoardState
  /** it owns the table: input is dead while it runs */
  exclusive: boolean
  run: (ctx: BeatRun) => Promise<void>
}
```

Add the state, beside `running`:

```ts
  // What the RUNNING beat has moved the board to. The opening always published a
  // shape of its own; this is the same door, opened to every beat, because a
  // multi-draw grows the fan between its cards (I8) and a split has to render a
  // pile before it can be measured. It lives and dies with the beat: cleared when
  // one starts and again when the queue drains, so it can never outlast the run
  // that produced it.
  const [advanced, setAdvanced] = useState<BoardState | null>(null)
```

In `drain`, clear it as each beat starts and hand `publish` to the runner:

```ts
      let next = queue.current.shift()
      while (next && alive.current) {
        runningRef.current = next
        setRunning(next)
        setAdvanced(null)
        try {
          await next.run({ base: next.base, publish: setAdvanced })
        } catch (err) {
          if (import.meta.env.DEV) console.error('[beats] %s failed', next.key, err)
        }
        next = queue.current.shift()
      }
```

…and in the `finally`, add `setAdvanced(null)` beside `setRunning(null)`.

Update the returned shadow:

```ts
    shadow: (running?.exclusive ? (advanced ?? intro?.shadow) : (advanced ?? running?.base)) ?? null,
```

The intro's `run` is now called with a context it ignores; its `IntroBeat['run']` signature in `entities/game/board/types.ts` stays `() => Promise<void>`, which is assignable.

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @release/web test -- useBeats`
Expected: PASS, including every existing queue test.

- [ ] **Step 5: Lift the discard runner into its own file**

Create `apps/frontend/src/features/board-beats/discardBeat.tsx`:

```tsx
import { cardById } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import { nextFrames, scatterAt, useDiscardExit } from '@release/ui/animations'
import { useCallback, useRef } from 'react'
import type { BoardAnchors } from '~/entities/game/board'
import type { BeatPlan, DiscardCard } from './planBeats'
import type { BeatRun } from './useBeats'

// A card leaves the table for the discard. The movement itself belongs to the
// shared step (`useDiscardExit`); what lives here is only where each card
// starts from, and the wait that makes measuring it honest.
//
// No onLanded: the heap is derived from these same events in toBoardState, so
// the cards this step flew are already in the projection it hands over to. A
// second set of books here would be a second source for one heap.

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useDiscardBeat(anchors: BoardAnchors) {
  const { overlay, send } = useDiscardExit(anchors.discardBox)
  const latest = useRef({ anchors, send })
  latest.current = { anchors, send }

  const whereFrom = useCallback((c: DiscardCard): Rect | null => {
    const a = latest.current.anchors
    if (c.source.kind === 'hand') return rectOf(a.handSlotAt(c.source.index))
    if (c.source.kind === 'release') return rectOf(a.releaseSlot(c.source.player, c.source.slot))
    return a.seatBox(c.source.player)
  }, [])

  const toLeaving = useCallback(
    (c: DiscardCard): Leaving | null => {
      const card = cardById(c.card)
      const from = whereFrom(c)
      if (!card || !from) return null
      // The SAME Scatter the adapter rests this card on (I7): the flight ends on
      // the pose the heap already holds for it, so nothing moves on handover.
      return { key: c.key, card, from, scatter: scatterAt(c.eventId) }
    },
    [whereFrom],
  )

  const run = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'discard' }>, _ctx: BeatRun) => {
      // WAIT FOR THE SHADOW, THEN MEASURE — in that order, and the order is the
      // whole point. The queue starts this from inside a layout effect, so at
      // entry React has committed the projection that ARRIVED: the card is
      // already out of the fan and its slot with it. The shadow that puts the
      // slot back is a commit away. Two frames is how we get to the other side
      // of it (the same reason the carrier waits, I2).
      //
      // Measuring before this yields `null` for a one-card hand (no flight at
      // all) and the wrong slot for a larger one — and no test can see it,
      // because a stub that hands back a detached node measures the same either
      // way. `useBeats.test.tsx` queries the probe's real DOM for exactly this.
      await nextFrames()
      const items = plan.cards.map(toLeaving).filter((it): it is Leaving => it != null)
      if (items.length > 0) await latest.current.send(items)
    },
    [toLeaving],
  )

  return { overlay, run }
}
```

- [ ] **Step 6: Call it from the queue**

In `useBeats.ts`, delete `whereFrom`, `toLeaving`, `beatOf`, the `rectOf` helper and the `useDiscardExit` call, and put in their place:

```ts
  const discards = useDiscardBeat(anchors)

  // The queue builds a Beat out of a plan and the runner that plays it. It knows
  // that a beat HAS a runner; it does not know what any of them do.
  const beatOf = useCallback(
    (plan: BeatPlan, base: BoardState): Beat | null => {
      if (plan.kind === 'discard') {
        return { key: plan.key, base, exclusive: false, run: (ctx) => discards.run(plan, ctx) }
      }
      return null
    },
    [discards.run],
  )
```

…and in the batch effect:

```ts
    for (const plan of planBeats(fresh, before)) {
      const beat = beatOf(plan, before)
      if (beat) queue.current.push(beat)
    }
```

Return `overlays: discards.overlay`, plus the two fan fields Task 6 will fill:

```ts
  return {
    shadow: (running?.exclusive ? (advanced ?? intro?.shadow) : (advanced ?? running?.base)) ?? null,
    overlays: discards.overlay,
    exclusive: running?.exclusive ?? false,
    // The fan opens for cards on their way into it. Nothing does that yet.
    gapAt: null,
    gapSize: 1,
  }
```

Add `gapAt: number | null` and `gapSize: number` to the `Beats` interface, and export `BeatRun` and `useDiscardBeat` from `index.ts`.

- [ ] **Step 7: Run the whole queue suite**

Run: `pnpm --filter @release/web test -- board-beats`
Expected: PASS — this is a refactor, and every existing test is the regression check that it changed no behaviour.

- [ ] **Step 8: Full check and commit**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

```bash
git add apps/frontend/src/features/board-beats
git commit -m "refactor(web): a beat may move the board under itself, and the discard moves out (#97)"
```

---

### Task 6: The draw

Three branches out of one flight to the centre, and the trigger's whole life inside one beat.

**Files:**
- Create: `apps/frontend/src/features/board-beats/drawBeat.tsx`
- Create: `apps/frontend/src/features/board-beats/drawBeat.test.tsx`
- Modify: `apps/frontend/src/features/board-beats/useBeats.ts`
- Modify: `apps/frontend/src/features/board-beats/index.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx:485-490`
- Test: `apps/frontend/src/features/board-beats/useBeats.test.tsx`

**Interfaces:**
- Consumes: `PlannedDraw` (Task 4), `BeatRun` (Task 5), `anchors.pileBox` and `anchors.centre` (Tasks 2, 3).
- Produces:

```ts
export function useDrawBeat(anchors: BoardAnchors): {
  overlay: ReactNode[]
  gapAt: number | null
  gapSize: number
  run: (plan: Extract<BeatPlan, { kind: 'draw' }>, ctx: BeatRun) => Promise<void>
}
```

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/board-beats/drawBeat.test.tsx`. It drives the runner through a probe with real DOM, because the fan is measured out of it:

```tsx
import { cardById } from '@release/ui'
import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import { useDrawBeat } from './drawBeat'
import type { PlannedDraw } from './planBeats'

const played = vi.hoisted(() => ({ names: [] as string[] }))
vi.mock('@release/ui/animations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@release/ui/animations')>()),
  play: (name: string) => {
    played.names.push(name)
    return { finished: Promise.resolve() } as unknown as Animation
  },
}))

const base = {
  you: { name: 'You', hand: [], release: {} },
  opponents: [{ id: 'p2', name: 'Two', handCount: 3, release: {} }],
  decks: { main: [10], events: 5, discardCount: 0, discardHeap: [] },
  selfId: 'p1',
  history: [],
  setup: {},
  playable: [],
  frozen: [],
} as unknown as BoardState

const node = () => document.createElement('div')
const anchors = {
  hand: { current: node() },
  centre: { current: node() },
  discardBox: { current: node() },
  pileBox: () => node(),
  seatBox: () => ({ left: 0, top: 0, width: 150, height: 210 }),
  seatOf: () => node(),
  handSlotAt: () => null,
  releaseSlot: () => null,
  bindPile: () => {},
  bindSeat: () => {},
  bindReleaseSlot: () => {},
} as unknown as BoardAnchors

const draw = (over: Partial<PlannedDraw> = {}): PlannedDraw => ({
  key: 'w4',
  eventId: 4,
  player: 'p1',
  pile: 0,
  mine: true,
  card: 'attack-bug',
  ...over,
})

function run(draws: PlannedDraw[]) {
  const published: BoardState[] = []
  let start: (() => Promise<void>) | null = null
  function Probe() {
    const beat = useDrawBeat(anchors)
    start = () =>
      beat.run({ kind: 'draw', key: 'draw:4', draws }, {
        base,
        publish: (s) => published.push(s),
      })
    return <>{beat.overlay}</>
  }
  render(<Probe />)
  return { published, go: () => act(async () => void (await start?.())) }
}

it('takes my own card to the centre, turns it over, and sits it in the fan', async () => {
  played.names = []
  const { published, go } = run([draw()])
  await go()
  expect(played.names).toContain('drawToCenter')
  // The hand it publishes is the fan the NEXT card of the batch must aim at.
  expect(published.at(-1)?.you.hand.map((h) => h.card.id)).toEqual(['attack-bug'])
})

it('sends an opponent’s card to their seat, face down', async () => {
  played.names = []
  const { published, go } = run([draw({ player: 'p2', mine: false, card: undefined })])
  await go()
  expect(played.names).toEqual(['drawToCenter', 'dealToSeat'])
  // Their count goes up; nothing enters this peer's fan, and no identity is
  // invented for a card the projection never named.
  expect(published.at(-1)?.opponents[0].handCount).toBe(4)
})

it('grows the fan between the cards of a multi-draw (I8)', async () => {
  played.names = []
  const { published, go } = run([draw(), draw({ key: 'w5', eventId: 5, card: 'attack-ddos' })])
  await go()
  expect(published.at(-1)?.you.hand).toHaveLength(2)
})

it('reveals a trigger at the centre and files it in the discard itself', async () => {
  played.names = []
  const { go } = run([
    draw({ card: undefined, reveal: { card: 'trigger-error-503', discardId: 6 } }),
  ])
  await go()
  // The reveal ends where the card is filed: it stands at the centre, so it
  // leaves from the centre. flipCard is played by `patch`, not by `play`.
  expect(played.names).toContain('drawToCenter')
  expect(played.names).toContain('centerToDiscard')
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @release/web test -- drawBeat`
Expected: FAIL — `Failed to resolve import "./drawBeat"`.

- [ ] **Step 3: Write the runner**

Create `apps/frontend/src/features/board-beats/drawBeat.tsx`:

```tsx
import type { CardData } from '@release/ui'
import { CARD_W, cardAreaOf, cardById, cardBoxIn } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import {
  play,
  scatterAt,
  useDiscardExit,
  useFlyer,
  useHandArrival,
  wait,
} from '@release/ui/animations'
import { useCallback, useRef } from 'react'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import type { BeatPlan, PlannedDraw } from './planBeats'
import type { BeatRun } from './useBeats'

// A card is drawn. One flight to the centre, then a branch on who drew it and
// what it turned out to be — the scene is `DrawCardStory`, driven here by the
// events instead of by a click on a deck.
//
// The trigger's WHOLE life is in this beat, reveal to discard. The engine files
// it in the same batch (fake/triggers.ts:123,139), so a card left standing at
// the centre would contradict a projection that has already put it in the heap.
// It never touches a hand or a zone, so it leaves from where it stands: the
// flyer stays pinned at the centre (I4) and the shared exit step takes it from
// there.

const BEFORE_FLIP = 220 // the card rests at the centre before it turns over
const AFTER_FLIP = 560 // flipCard is 420; the rest is a pause to read it by
const REVEAL_HOLD = 900 // how long a revealed trigger stands for the table
const SEAT_SHRINK = 0.7 // an opponent's card lands smaller, dissolving into the count

// An opponent's closed card. The projection never says what it is, so nothing
// here may guess: this carries no face, only the base deck's cover, and it is
// always flown faceDown. Card reads `deck` for the back and nothing else.
const COVER: CardData = {
  id: 'unknown',
  name: '',
  category: 'protection',
  deck: 'base',
  art: '',
  tags: [],
  qty: 0,
}

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useDrawBeat(anchors: BoardAnchors) {
  const { overlay: flyerOverlay, raise, pin, patch, drop, elOf } = useFlyer()
  const exit = useDiscardExit(anchors.discardBox)

  // The run's own state, held in a ref because the whole beat is one closure and
  // the fan grows inside it (I8). Reading the board's props here instead would
  // give every card after the first the fan the batch STARTED with.
  const ctx = useRef<BeatRun | null>(null)

  const {
    overlay: handOverlay,
    gapAt,
    gapSize,
    arrive,
  } = useHandArrival(anchors.hand, (gap, landed) => {
    const c = ctx.current
    if (!c) return
    const hand = [...c.base.you.hand]
    hand.splice(gap, 0, ...landed.map((it) => ({ uid: it.key, card: it.card })))
    // The published state becomes the base the NEXT card aims at — the board
    // really has that many cards in the fan now, and the last frame of this beat
    // has to equal the projection it hands over to.
    const next = { ...c.base, you: { ...c.base.you, hand } }
    c.base = next
    c.publish(next)
  })

  const latest = useRef({ anchors, arrive, exit })
  latest.current = { anchors, arrive, exit }

  // deck -> centre, face down. The one leg every draw has, whoever drew it.
  const toCentre = useCallback(
    async (d: PlannedDraw): Promise<Rect | null> => {
      const a = latest.current.anchors
      const cell = rectOf(a.pileBox(d.pile))
      const centre = rectOf(a.centre.current)
      if (!cell || !centre) return null
      const from = cardAreaOf(cell)
      const face = d.card ?? d.reveal?.card
      const card = (face ? cardById(face) : null) ?? COVER
      const [el] = await raise([{ key: 'draw', card, at: from, faceDown: true }])
      if (el) {
        const anim = play('drawToCenter', el, { from, to: centre })
        if (anim) await anim.finished
        pin('draw', centre) // I4 — the next leg starts from where it stands
      }
      return centre
    },
    [raise, pin],
  )

  const run = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'draw' }>, beat: BeatRun) => {
      ctx.current = beat
      for (const d of plan.draws) {
        const centre = await toCentre(d)
        if (!centre) continue

        if (d.reveal) {
          // A trigger is turned up for the whole table and stands there.
          await wait(BEFORE_FLIP)
          patch('draw', { faceDown: false })
          await wait(AFTER_FLIP)
          await wait(REVEAL_HOLD)
          const card = cardById(d.reveal.card)
          if (card) {
            // It leaves from the centre on the same scatter the heap already
            // rests it on (I7) — the flyer IS the card, so the step flies the
            // node rather than mounting a copy of it.
            await latest.current.exit.send([
              {
                key: `d${d.reveal.discardId}`,
                card,
                node: elOf('draw'),
                scatter: scatterAt(d.reveal.discardId),
              },
            ])
          }
          drop('draw')
          continue
        }

        if (d.mine && d.card) {
          await wait(BEFORE_FLIP)
          patch('draw', { faceDown: false })
          await wait(AFTER_FLIP)
          const card = cardById(d.card)
          const at = rectOf(elOf('draw'))
          drop('draw')
          // The step measures the fan itself; what it needs from here is how
          // many cards are already in it — the fan this beat has grown so far.
          // The fan this beat has grown SO FAR — `ctx.current.base`, not the
          // one the batch started with (I8).
          const grown = ctx.current?.base.you.hand.length ?? 0
          if (card && at) await latest.current.arrive([{ key: `h${d.eventId}`, card, from: at }], grown)
          continue
        }

        // Somebody else's, and closed. It flies to their seat as a back and
        // dissolves into the counter — a closed card has no identity in the
        // projection, so it never turns over.
        const seat = latest.current.anchors.seatBox(d.player)
        const el = elOf('draw')
        if (el && seat) {
          // `seatBox` already trims the seat to a card box (I6); shrinking it
          // further is what makes the card read as sinking into the counter.
          const to = cardBoxIn(seat, CARD_W * SEAT_SHRINK)
          const anim = play('dealToSeat', el, { from: centre, to })
          if (anim) await anim.finished
        }
        drop('draw')
        const c = ctx.current
        if (c) {
          const next: BoardState = {
            ...c.base,
            opponents: c.base.opponents.map((o) =>
              o.id === d.player ? { ...o, handCount: o.handCount + 1 } : o,
            ),
          }
          c.base = next
          c.publish(next)
        }
      }
      ctx.current = null
    },
    [toCentre, patch, drop, elOf],
  )

  return { overlay: [...flyerOverlay, ...handOverlay, ...exit.overlay], gapAt, gapSize, run }
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @release/web test -- drawBeat`
Expected: PASS (4 tests).

- [ ] **Step 5: Queue it**

In `useBeats.ts`, add the runner beside the discard one and extend the dispatch:

```ts
  const discards = useDiscardBeat(anchors)
  const draws = useDrawBeat(anchors)

  const beatOf = useCallback(
    (plan: BeatPlan, base: BoardState): Beat | null => {
      if (plan.kind === 'discard') {
        return { key: plan.key, base, exclusive: false, run: (ctx) => discards.run(plan, ctx) }
      }
      if (plan.kind === 'draw') {
        return { key: plan.key, base, exclusive: false, run: (ctx) => draws.run(plan, ctx) }
      }
      return null
    },
    [discards.run, draws.run],
  )
```

Return the fan fields and both overlays:

```ts
    overlays: [...discards.overlay, ...draws.overlay],
    gapAt: draws.gapAt,
    gapSize: draws.gapSize,
```

- [ ] **Step 6: Let the board's fan open for a drawn card**

In `apps/frontend/src/pages/board/[gameId]/_Board.tsx` (lines 488-489), the fan currently only ever opens for the deal:

```tsx
                gapAt={deal.gapAt ?? beats.gapAt}
                gapSize={deal.gapAt != null ? deal.gapSize : beats.gapSize}
```

The opening is exclusive, so the two can never both be open — the deal wins the tie for the same reason it wins the shadow's.

- [ ] **Step 7: Run everything**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src
git commit -m "feat(web): a drawn card reaches the hand, a seat, or the table's eyes (#97)"
```

---

### Task 7: The deck rebuilt, split and merged

**Files:**
- Create: `apps/frontend/src/features/board-beats/deckBeat.tsx`
- Create: `apps/frontend/src/features/board-beats/deckBeat.test.tsx`
- Modify: `apps/frontend/src/features/board-beats/useBeats.ts`
- Modify: `apps/frontend/src/features/board-beats/index.ts`

**Interfaces:**
- Consumes: `PileStep`, `classifyPiles` (Task 4), `BeatRun` (Task 5), `anchors.pileBox` (Task 2).
- Produces:

```ts
export function useDeckBeat(anchors: BoardAnchors): {
  overlay: ReactNode[]
  runReshuffle: (plan: Extract<BeatPlan, { kind: 'reshuffle' }>, ctx: BeatRun) => Promise<void>
  runPiles: (plan: Extract<BeatPlan, { kind: 'piles' }>, ctx: BeatRun) => Promise<void>
}
```

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/board-beats/deckBeat.test.tsx`, using the same `play` mock and probe shape as `drawBeat.test.tsx` (repeated rather than shared — the two files describe different movements and a shared harness would couple them):

```tsx
import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import { useDeckBeat } from './deckBeat'
import type { BeatPlan } from './planBeats'

const played = vi.hoisted(() => ({ names: [] as string[] }))
vi.mock('@release/ui/animations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@release/ui/animations')>()),
  play: (name: string) => {
    played.names.push(name)
    return { finished: Promise.resolve() } as unknown as Animation
  },
}))

const base = {
  you: { name: 'You', hand: [], release: {} },
  opponents: [],
  decks: { main: [24], events: 5, discardCount: 6, discardHeap: [] },
  selfId: 'p1',
  history: [],
  setup: {},
  playable: [],
  frozen: [],
} as unknown as BoardState

const node = () => document.createElement('div')
const anchors = {
  hand: { current: node() },
  centre: { current: node() },
  discardBox: { current: node() },
  pileBox: () => node(),
  seatBox: () => null,
  seatOf: () => null,
  handSlotAt: () => null,
  releaseSlot: () => null,
  bindPile: () => {},
  bindSeat: () => {},
  bindReleaseSlot: () => {},
} as unknown as BoardAnchors

function harness() {
  const published: BoardState[] = []
  const api: { beat?: ReturnType<typeof useDeckBeat> } = {}
  function Probe() {
    api.beat = useDeckBeat(anchors)
    return <>{api.beat.overlay}</>
  }
  render(<Probe />)
  const ctx = { base, publish: (s: BoardState) => published.push(s) }
  return { published, api, ctx }
}

it('carries the discard onto the deck when the table recycles it', async () => {
  played.names = []
  const { api, ctx } = harness()
  const plan = { kind: 'reshuffle', key: 'reshuffle:3', cards: 12 } as Extract<BeatPlan, { kind: 'reshuffle' }>
  await act(async () => void (await api.beat?.runReshuffle(plan, ctx)))
  expect(played.names).toContain('gatherToDeck')
})

// The new pile must be RENDERED before flyFrom can measure it — that is what
// the published shadow is for. A split that animated against the old pile list
// would have nothing to fly to.
it('publishes the new pile before it animates the split', async () => {
  played.names = []
  const { api, ctx, published } = harness()
  const plan = {
    kind: 'piles',
    key: 'piles:5',
    steps: [{ kind: 'split', at: 0, piles: [12, 12] }],
  } as Extract<BeatPlan, { kind: 'piles' }>
  await act(async () => void (await api.beat?.runPiles(plan, ctx)))
  expect(published[0]?.decks.main).toEqual([12, 12])
  expect(played.names).toContain('flyFrom')
})

it('absorbs every other pile into the survivor on a merge', async () => {
  played.names = []
  const { api, ctx } = harness()
  const plan = {
    kind: 'piles',
    key: 'piles:5',
    steps: [{ kind: 'merge', withDiscard: false, piles: [24] }],
  } as Extract<BeatPlan, { kind: 'piles' }>
  await act(async () =>
    void (await api.beat?.runPiles(plan, { ...ctx, base: { ...base, decks: { ...base.decks, main: [12, 12] } } })),
  )
  expect(played.names).toContain('absorbToDeck')
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @release/web test -- deckBeat`
Expected: FAIL — `Failed to resolve import "./deckBeat"`.

- [ ] **Step 3: Write the runner**

Create `apps/frontend/src/features/board-beats/deckBeat.tsx`:

```tsx
import type { CardData } from '@release/ui'
import { cardAreaOf } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import { nextFrames, play, useFlyer, wait } from '@release/ui/animations'
import { useCallback, useRef } from 'react'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import type { BeatPlan, PileStep } from './planBeats'
import type { BeatRun } from './useBeats'

// What happens to the draw piles themselves. Three movements, one scene
// (`DeckAnimationsStory`), and none of them carries a card whose face anybody
// sees: a pile is face down before and after, so what moves is the pile.
//
// The card that CAUSES a split or a merge is Git Branch / Git Merge and belongs
// to #108. This is the movement it will reuse.

const GATHER_MS = 360 // the heap collecting itself into a pile
const TURN_MS = 460 // the gathered pile turning face down on the deck
const SPLIT_MS = 520
const MERGE_MS = 520
const STEP_HOLD = 360 // the standard short beat between deck steps

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useDeckBeat(anchors: BoardAnchors) {
  const { overlay, raise, patch, drop, elOf } = useFlyer()
  const latest = useRef({ anchors })
  latest.current = { anchors }

  // The discard becomes a pile: it gathers where it lies, flies to the pile's
  // spot face up, and turns over on landing. `deckReshuffled` and Git Branch's
  // Sudo step are the same movement — one shuffles and the other does not, and
  // neither is visible from outside.
  const discardOntoPile = useCallback(
    async (pile: number, top: CardData | undefined) => {
      const a = latest.current.anchors
      const fromCell = rectOf(a.discardBox.current)
      const toCell = rectOf(a.pileBox(pile))
      // No top card means an empty discard: nothing to carry, and nothing this
      // beat may invent a face for.
      if (!fromCell || !toCell || !top) return
      const from = cardAreaOf(fromCell)
      const [el] = await raise([{ key: 'pile', card: top, at: from }])
      await wait(GATHER_MS)
      if (el) {
        const anim = play('gatherToDeck', el, { from, to: cardAreaOf(toCell), duration: 560 })
        if (anim) await anim.finished
      }
      await wait(STEP_HOLD)
      patch('pile', { faceDown: true })
      await wait(TURN_MS)
      drop('pile')
    },
    [raise, patch, drop],
  )

  const runReshuffle = useCallback(
    async (_plan: Extract<BeatPlan, { kind: 'reshuffle' }>, ctx: BeatRun) => {
      // The recycled discard always lands on pile 0: `refillFromDiscard` runs
      // only when every pile is empty and replaces `main` with a single one.
      // The card that carries the flight is the discard's own top, from the
      // projection the board is still showing — never a chosen one.
      await discardOntoPile(0, ctx.base.decks.discard ?? undefined)
    },
    [discardOntoPile],
  )

  const step = useCallback(
    async (s: PileStep, ctx: BeatRun) => {
      const a = latest.current.anchors
      if (s.kind === 'merge') {
        const to = rectOf(a.pileBox(0))
        const flights: Promise<unknown>[] = []
        if (to) {
          // Every pile but the survivor, and each from its OWN rect. The target
          // is measured once — only the sources differ.
          for (let i = 1; i < ctx.base.decks.main.length; i++) {
            const el = a.pileBox(i)
            if (!el) continue
            const anim = play('absorbToDeck', el, {
              from: rectOf(el),
              to,
              duration: MERGE_MS,
            })
            if (anim) flights.push(anim.finished)
          }
          if (s.withDiscard) {
            const heap = a.discardBox.current
            if (heap) {
              const anim = play('absorbToDeck', heap, {
                from: rectOf(heap),
                to,
                duration: MERGE_MS,
              })
              if (anim) flights.push(anim.finished)
            }
          }
        }
        await Promise.all(flights)
        advance(ctx, s.piles)
        return
      }

      if (s.kind === 'split') {
        // FLIP: the half is already in its new DOM place and is animated FROM
        // the rect its source pile had. So the source is measured BEFORE the
        // publish that remounts the row (I1), and the flight after it.
        const from = rectOf(a.pileBox(s.at))
        advance(ctx, s.piles)
        await nextFrames()
        const el = a.pileBox(s.at + 1)
        if (el && from) {
          const anim = play('flyFrom', el, { from, duration: SPLIT_MS })
          if (anim) await anim.finished
        }
        return
      }

      // fromDiscard — the discard becomes a further pile at the end of the row.
      // It has to exist before anything can land on it, so it is published first
      // and flown into second. The top card is read BEFORE the publish: the
      // projection this beat animates away from is the one that still has a
      // discard to carry.
      const top = ctx.base.decks.discard ?? undefined
      advance(ctx, s.piles)
      await nextFrames()
      await discardOntoPile(s.at, top)
    },
    [discardOntoPile],
  )

  const runPiles = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'piles' }>, ctx: BeatRun) => {
      // Git Branch + Sudo emits TWO changes in one batch — a split, then the
      // discard becoming a further pile. Each runs against the table as the last
      // one left it, which is why `ctx.base` is re-read every time.
      for (const s of plan.steps) {
        await step(s, ctx)
        await wait(STEP_HOLD)
      }
    },
    [step],
  )

  return { overlay, runReshuffle, runPiles }
}

// The board with a different row of piles — published to the queue AND written
// back into the run's own base. Both, because Git Branch + Sudo has a SECOND
// step, and it has to run against the table the first one left: publishing
// alone would show the right thing and then classify the next step against a
// row that no longer exists.
function advance(ctx: BeatRun, piles: number[]): void {
  ctx.base = { ...ctx.base, decks: { ...ctx.base.decks, main: piles } }
  ctx.publish(ctx.base)
}
```

- [ ] **Step 4: Run the test**

Run: `pnpm --filter @release/web test -- deckBeat`
Expected: PASS (3 tests).

- [ ] **Step 5: Queue both kinds**

In `useBeats.ts`:

```ts
  const decks = useDeckBeat(anchors)
```

…and in `beatOf`:

```ts
      if (plan.kind === 'reshuffle') {
        return { key: plan.key, base, exclusive: false, run: (ctx) => decks.runReshuffle(plan, ctx) }
      }
      if (plan.kind === 'piles') {
        return { key: plan.key, base, exclusive: false, run: (ctx) => decks.runPiles(plan, ctx) }
      }
```

Add `decks.runReshuffle, decks.runPiles` to the `useCallback` deps and `...decks.overlay` to `overlays`.

- [ ] **Step 6: Run everything**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src/features/board-beats
git commit -m "feat(web): the deck is rebuilt, split and merged on the board (#97)"
```

---

### Task 8: The docs and the register catch up

The page shows state, the spec explains application, and a finding nobody wrote down is indistinguishable from a finding nobody noticed. This is not paperwork appended to the feature — it is the half of it the next task reads.

**Files:**
- Modify: `docs/animations/recipes.md`
- Modify: `docs/animations/reference.md`
- Modify: `docs/animations/backlog.md`
- Modify: `apps/playground/stories/AnimationAuditStory/AnimationAuditStory.tsx`

**Interfaces:**
- Consumes: everything Tasks 1-7 landed.
- Produces: no code surface.

- [ ] **Step 1: Write the two live-board recipes**

In `docs/animations/recipes.md`, after "A card leaves the hand for the discard (live board)", add two recipes in the same schema the file's header defines (**When to call · Visual result · Elements / refs · Sequence · Params & timings · Invariants · End state & cleanup · Building blocks · Live reference**):

- **"A card is drawn (live board)"** — trigger `drawn`, planned by `planBeats` and run by `drawBeat`. Name the three branches and what decides between them (the card's presence, and the reveal that follows). State the timings verbatim: `drawToCenter` 480, `BEFORE_FLIP` 220, `AFTER_FLIP` 560, `REVEAL_HOLD` 900, `dealToSeat` at `CARD_W × 0.7`. Invariants: I1, I2, I4 (the flyer is pinned at the centre so the exit starts from where it stands), I7 (the trigger's exit uses `scatterAt(discardId)`), I8 (the fan grows between the cards of a batch through the published shadow). Live reference: `DrawCardStory`.
- **"The deck is rebuilt, split, merged (live board)"** — triggers `deckReshuffled` and `pilesChanged`. Include the classification table from §5 of the design doc verbatim, and say plainly that the event names neither its operation nor the split index. Timings: `GATHER_MS` 360, `TURN_MS` 460, `SPLIT_MS` 520, `MERGE_MS` 520, `STEP_HOLD` 360, `gatherToDeck` at 560. Live reference: `DeckAnimationsStory`.

- [ ] **Step 2: Add the beat kinds to the reference**

In `docs/animations/reference.md`, in the section #96 added for the board's layer, add a row per beat kind — `draw`, `discard`, `reshuffle`, `piles` — naming the file that runs it, the events it is planned from, and the presets it plays. Add `pileWidthFor` to the card-geometry helpers table.

- [ ] **Step 3: Run the docs test**

Run: `pnpm --filter @release/ui test -- docs`
Expected: PASS. This task adds no preset and no exported step, so the test has nothing new to demand — but it is the check that nothing was quietly added either.

- [ ] **Step 4: Write the four findings**

In `docs/animations/backlog.md`, add four entries in the file's own schema (`**Что не хватает.** / **Чем грозит.** / **Что закроет.** / **Статус.**`), matching the surrounding entries' language:

1. **`drawn` был приватным, и добор соперника было нечем анимировать** — status `решено`, with what the resolution was (`redactFor`, the event public, the identity redacted) and why the issue's premise read the other way. Keep this one even though it is solved: the issue text is still out there stating the opposite.
2. **`pilesChanged` не называет ни операцию, ни индекс разделения** — status `времянка`, with the positional derivation written out and the note that the event could carry the answer instead.
3. **Сколько триггер стоит в центре — значения нет** — status `открыто`. `AI_HOLD = 4000` in `DrawCardStory` is the AI branch's; a plain reveal has no source, and `REVEAL_HOLD = 900` is this task's own choice. Points at #84.
4. **Ширина стопки при нескольких колодах не утверждена** — status `времянка`, naming `pileWidthFor`'s ramp (150 / 120 / 100) as the stopgap.

- [ ] **Step 5: Put the same four in the visible register**

In `apps/playground/stories/AnimationAuditStory/AnimationAuditStory.tsx`, add four `Issue` entries to the findings register (section 3, from line 662) with bilingual `what` / `problem` / `where` and the matching `Status` (`ok` for the resolved one, `open` for the hold, `reuse`/`rework` as fits the other two). Update the scenario rows for `Draw card` and `Deck animations` to say they now run on the board.

- [ ] **Step 6: Full check and commit**

Run: `pnpm test && pnpm typecheck && pnpm lint`
Expected: all pass.

```bash
git add docs/animations apps/playground/stories/AnimationAuditStory
git commit -m "docs(animations): the draw and the deck, and the four things they turned up (#97)"
```

- [ ] **Step 7: Verify the whole feature in the browser**

Run the playground and the board together and watch the movements against their scenes:

```bash
pnpm dev:all
```

Check, in this order: a draw of your own card (centre, flip, into the fan); a multi-draw where the second card aims at the fan the first one grew; an opponent's draw reaching their seat as a back; a trigger revealing at the centre and leaving for the discard; and — with the deck run down — the discard gathering back onto the pile. `prefers-reduced-motion` on: every one of them collapses to its end state and the board still lands on the projection.

---

## Self-Review

**Spec coverage.** §1 ordered walk → Task 4. §2 the draw's three branches and the trigger's exit → Tasks 4 (planning) and 6 (running). §3 `drawn` public + `redactFor` → Task 1. §4 piles, layout, anchors → Task 2; the centre mounted for the match → Task 3. §5 the deck beat and the classifier → Tasks 4 (`classifyPiles`) and 7. §6 the publishing shadow → Task 5. §7 the file layout → Tasks 5, 6, 7. §8 reduced motion — nothing to do, asserted by the existing `never animates when motion is reduced` test, which every task keeps green. §9 tests → distributed, one per task. §10 the four findings → Task 8. §11 docs → Task 8.

**One deliberate gap:** the design's §3 consequence — an opponent's draw appearing in move history — needs no task. `cardTextOf` already returns `undefined` for a card-less `drawn`, and `toBoardState` already maps every visible event into history, so it happens by itself once Task 1 lands. It is worth an eye during Task 8's browser check.
