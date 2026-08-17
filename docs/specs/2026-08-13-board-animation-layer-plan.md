# Board Animation Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The board's animation machinery gets one home — the last forked flight step promoted, a board-wide anchor registry, and an event→beat queue — proven by one live choreography: a card leaving a hand for the discard.

**Architecture:** `useDiscardExit` joins its two siblings in `@release/ui/animations`. `IntroRefs` becomes a board-level `BoardAnchors` owned by `_Board.tsx`. A queue in `features/board-beats/` folds each batch of engine events into beats, renders the pre-batch projection as a shadow while one runs, and drops the shadow on drain so the board can never be stranded. `prefers-reduced-motion` is checked in that one place.

**Tech Stack:** TypeScript, React 19, Vite, Vitest + Testing Library, CSS Modules + design tokens, WAAPI through `@release/ui`'s `play()` presets.

Design: [`docs/specs/2026-08-13-board-animation-layer-design.md`](./2026-08-13-board-animation-layer-design.md).
Issue: [#96](https://github.com/MythHand/ReleaseBoardGameP2P/issues/96), sub-task of [#88](https://github.com/MythHand/ReleaseBoardGameP2P/issues/88).
Branch: `feat/96-board-animation-layer` (already created, spec committed as `f518c2b`).

## Global Constraints

- **`prefers-reduced-motion` is honoured by every animation.** `play()` in `@release/ui` drives WAAPI directly and does **not** check it — only CSS modules do. The queue checks it, once, in `useBeats`.
- **No string literals in `.tsx`.** All user-visible copy goes through `t()` with keys present in **both** `packages/translation/src/locales/en/common.json` and `…/ru/common.json`. (This task adds no user-visible copy.)
- **All text renders through `<Typography>`** from `@release/ui`; no hand-written font declarations, no `composes` from the typography scale.
- **Colors are design tokens only** — `var(--*)` from `apps/ui/src/design/tokens.css`. No `#hex`, `rgb()`, or named colors.
- **Spacing uses logical properties** (`padding-inline`, `margin-block-start`) — stylelint enforces this.
- **Code comments in English.**
- **`apps/ui/src/table/Table/` is not touched**, and neither is the playground's `TableStory`. They keep serving the kit's own screen.
- Commands: `pnpm --filter @release/ui test`, `pnpm --filter @release/web test`, `pnpm -r typecheck`, `pnpm lint`.
- **The pre-commit hook runs `pnpm -r typecheck` over the whole repo.** If it fails on files this task provably does not touch, commit with `--no-verify` and say so in the task report.

## Refinements to the design, decided while planning

Three places where writing the code out changed the shape. Each is a simplification, and each is noted here rather than silently applied:

1. **`Beat.apply` is dropped.** The design had each beat fold its effect into the shadow. With one beat kind there is never an intermediate state to fold: the shadow is the projection the beat animates *away from*, and the projection it lands on is the live one. So a beat carries `base: BoardState` instead, and `shadow` is simply the running beat's `base`. This also handles the real queueing case exactly — a second sync arriving mid-flight gets its own base. An untested fold hook is the speculative machinery the issue warns against; `apply` arrives with the first beat kind that needs it.
2. **`handSlot(uid)` becomes `handSlotAt(index)`.** The registry is a DOM registry, not a mirror of state; a uid lookup would make it depend on the hand it is supposed to be independent of. The beat already holds the pre-batch hand and resolves the index itself.
3. **`useDiscardExit` is given no `onLanded`.** The heap is derived from the same events in `toBoardState` (Task 2), so the cards a beat flew are already in the projection it hands over to. A second set of books here would be a second source for one heap.
4. **`BoardAnchors` lives in `entities/game/board/`, not in `pages/`.** The design left it beside `_Board.tsx`; that would make `features/game-intro` and `features/board-beats` import from `pages/`, inverting the one-way layer rule in [apps/frontend/CLAUDE.md](../../apps/frontend/CLAUDE.md). The registry is a board fact rather than a page fact — the same argument that already puts `BoardState` in `entities/` — so it goes there and everything imports downward.

## File Structure

| File | Responsibility |
|---|---|
| `apps/ui/src/animations/useDiscardExit.tsx` (moved) | the step: cards leave the table for the discard |
| `apps/ui/src/animations/useDiscardExit.module.css` (moved) | its flyer's own styles |
| `apps/ui/src/animations/index.ts` (modify) | exports `useDiscardExit`, `type Leaving` |
| `apps/ui/src/animations/docs.test.ts` (modify) | every exported step needs a `reference.md` row |
| `apps/frontend/src/entities/game/board/toBoardState.ts` (modify) | folds `discarded` events into `decks.discardHeap` |
| `apps/frontend/src/entities/game/board/anchors.ts` (create) | `BoardAnchors` — every node a flight aims at or from |
| `apps/frontend/src/features/game-intro/useDealIntro.ts` (modify) | takes `BoardAnchors`; publishes itself as beat zero |
| `apps/frontend/src/features/board-beats/planBeats.ts` (create) | pure: a batch of events → beat plans |
| `apps/frontend/src/features/board-beats/useBeats.ts` (create) | the queue, the shadow, the reduced-motion policy |
| `apps/frontend/src/features/board-beats/index.ts` (create) | the feature's barrel |
| `apps/frontend/src/pages/board/[gameId]/_Board.tsx` (modify) | owns the anchors, mounts the queue, renders its overlays |

---

### Task 1: `useDiscardExit` moves into `@release/ui/animations`

The last forked flight step. Ten playground scenes import it from `stories/interactive/`; it is the movement the audit page says all ten discard scenes need, and the frontend is about to become the eleventh consumer.

**Files:**
- Create (via `git mv`): `apps/ui/src/animations/useDiscardExit.tsx`, `apps/ui/src/animations/useDiscardExit.module.css`
- Delete: `apps/playground/stories/interactive/useDiscardExit.tsx`, `apps/playground/stories/interactive/useDiscardExit.module.css`
- Modify: `apps/ui/src/animations/index.ts`, `apps/ui/src/animations/docs.test.ts`
- Modify (import lines only): `apps/playground/stories/interactive/CardPlayStory.tsx`, `…/Error503Story.tsx`, `…/AiCardsStory.tsx`, `…/DefenseReleaseStory.tsx`, `…/DeckAnimationsStory.tsx`, `…/DrawCardStory.tsx`, `…/GitCards/SystemUpgrade.tsx`, `…/GitCards/CherryPick.tsx`, `apps/playground/stories/HandLimitStory/HandLimitStory.tsx`, `apps/playground/stories/ComboStory/ComboStory.tsx`
- Modify: `docs/animations/reference.md`, `docs/animations/README.md`
- Test: `apps/ui/src/animations/barrel.test.ts` (create), `apps/ui/src/animations/docs.test.ts`

**Interfaces:**
- Consumes: nothing from earlier tasks.
- Produces: `useDiscardExit(boxRef: RefObject<HTMLDivElement | null>, onLanded?: (cards: HeapCard[]) => void) => { overlay: ReactNode[]; send: (items: Leaving[]) => Promise<void>; reset: () => void; FLIGHT_MS: number }` and `interface Leaving`, both exported from `@release/ui/animations`. Task 5 consumes `send`, `overlay` and `Leaving`.

- [ ] **Step 1: Write the failing test — the barrel must carry the step**

Create `apps/ui/src/animations/barrel.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import * as animations from './index'

// The animation layer is its own entry point (@release/ui/animations), and what
// it exports IS the contract two apps compile against. A step that lives in the
// folder but never reaches the barrel is a step the frontend cannot import —
// which is the exact state useDiscardExit was in while ten scenes reached past
// the barrel into a story folder for it.
describe('the animations barrel', () => {
  it('exports every flight step', () => {
    expect(Object.keys(animations)).toEqual(
      expect.arrayContaining(['useFlyer', 'useHandArrival', 'useDiscardExit']),
    )
  })
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @release/ui test -- barrel`
Expected: FAIL — the array does not contain `useDiscardExit`.

- [ ] **Step 3: Move the files**

```bash
git mv apps/playground/stories/interactive/useDiscardExit.tsx apps/ui/src/animations/useDiscardExit.tsx
git mv apps/playground/stories/interactive/useDiscardExit.module.css apps/ui/src/animations/useDiscardExit.module.css
```

- [ ] **Step 4: Repoint the step's own imports to leaf modules**

In `apps/ui/src/animations/useDiscardExit.tsx`, replace the barrel import block (lines 3–11) with leaf imports. Inside `apps/ui` a step reaches for a leaf, not for `@/animations` — the barrel carries the steps and the steps render components, so importing the barrel from inside it is a cycle. This is the shape `useFlyer.tsx` already has.

Replace:

```ts
import {
  jitter,
  nextFrames,
  play,
  type Rect,
  type Scatter,
  toDiscardParams,
  wait,
} from '@/animations'
```

with:

```ts
import { play } from './play'
import { jitter, type Rect, type Scatter, toDiscardParams } from './scatter'
import { nextFrames, wait } from './timing'
```

Leave every other import (`@/cards/types`, `@/primitives/Card`, `@/primitives/CardPair`, `@/primitives/Pile/Pile`) exactly as it is — those already resolve inside `apps/ui`.

- [ ] **Step 5: Export it from the barrel**

In `apps/ui/src/animations/index.ts`, add after the `useHandArrival` export:

```ts
// The third step, and the one the audit page lists under all ten scenes with a
// discard. It stayed in the playground on the claim that it had one consumer;
// it had ten, and the frontend's board is the eleventh.
export { type Leaving, useDiscardExit } from './useDiscardExit'
```

- [ ] **Step 6: Run the barrel test**

Run: `pnpm --filter @release/ui test -- barrel`
Expected: PASS.

- [ ] **Step 7: Repoint the ten playground consumers**

In each file, rewrite the import to the barrel. `@` resolves to `apps/ui/src` in the playground's Vite and TS config, so `@/animations` is the animations barrel.

| File | Old | New |
|---|---|---|
| `stories/interactive/CardPlayStory.tsx` | `import { useDiscardExit } from './useDiscardExit'` | delete the line; add `useDiscardExit` to the existing `from '@/animations'` import |
| `stories/interactive/DeckAnimationsStory.tsx` | `import { useDiscardExit } from './useDiscardExit'` | same |
| `stories/interactive/DrawCardStory.tsx` | `import { useDiscardExit } from './useDiscardExit'` | same |
| `stories/interactive/AiCardsStory.tsx` | `import { useDiscardExit } from './useDiscardExit'` | same |
| `stories/interactive/Error503Story.tsx` | `import { type Leaving, useDiscardExit } from './useDiscardExit'` | add `type Leaving, useDiscardExit` to the `'@/animations'` import |
| `stories/interactive/DefenseReleaseStory.tsx` | `import { type Leaving, useDiscardExit } from './useDiscardExit'` | same |
| `stories/interactive/GitCards/SystemUpgrade.tsx` | `import { useDiscardExit } from '../useDiscardExit'` | add to the `'@/animations'` import |
| `stories/interactive/GitCards/CherryPick.tsx` | `import { useDiscardExit } from '../useDiscardExit'` | same |
| `stories/HandLimitStory/HandLimitStory.tsx` | `import { useDiscardExit } from '../interactive/useDiscardExit'` | same |
| `stories/ComboStory/ComboStory.tsx` | `import { useDiscardExit } from '../interactive/useDiscardExit'` | same |

A file that has no `'@/animations'` import yet gets one; Biome sorts the named members, so run `pnpm format` at the end of this step rather than hand-ordering them.

- [ ] **Step 8: Verify nothing still reaches into the story folder**

Run: `grep -rn "useDiscardExit" apps/playground | grep -v "@/animations" | grep -v AnimationAuditStory`
Expected: no output.

- [ ] **Step 9: Extend the docs test to the steps**

The presets have had a machine signal since seven of them drifted out of the docs. The steps have not, and this task is what makes them importable everywhere — so they get the same signal. In `apps/ui/src/animations/docs.test.ts`, add a second `it` inside the existing `describe`:

```ts
  // The steps get the same signal the presets have had since seven of them
  // drifted out of the docs. A step is a bigger surface than a preset — it owns
  // a rule and a geometry — so it has more to lose from being undocumented, not
  // less. The barrel is the source of the list: what a consumer can import is
  // exactly what has to be readable.
  it('gives every exported step a row in reference.md', () => {
    const steps = Object.keys(animations).filter((name) => name.startsWith('use'))
    expect(steps.length).toBeGreaterThan(0)
    const undocumented = steps.filter((name) => !reference.includes(`\`${name}\``))
    expect(undocumented).toEqual([])
  })
```

and add the import at the top of the file, beside the existing `presetNames` one:

```ts
import * as animations from './index'
```

- [ ] **Step 10: Run the docs test**

Run: `pnpm --filter @release/ui test -- docs`
Expected: PASS — `useFlyer`, `useHandArrival` and `useDiscardExit` all already have rows in `reference.md`.

- [ ] **Step 11: Correct the two docs claims this task falsifies**

In `docs/animations/reference.md`, in "The movement steps, and the carrier under them", replace the last two sentences of the **Where they live** paragraph:

> The remaining step, `useDiscardExit`, is still local to `apps/playground/stories/interactive/`; it has one consumer, and it moves the day a second appears.

with:

> `useDiscardExit` followed them there in #96. It never had the one consumer this file claimed: ten playground scenes imported it out of the story folder, which is what "a movement found in two places is a module" describes, ten times over. All three steps now live in `apps/ui/src/animations/` and are imported from `@release/ui/animations`.

In `docs/animations/README.md`, in "Current state — library vs. playground", move the `useDiscardExit` bullet out of **Shared, but living in the playground** and into the `@release/ui` list, and replace the **Where they live** paragraph:

> **Where they live:** the steps sit in the playground, not in `@release/ui`, because the playground is their only consumer today. They move into the library when something outside it needs them — that is the later, game-screen phase, not now. Do **not** assume `import { useHandArrival } from '@release/ui'` — it isn't there.

with:

> **Where they live:** all three steps are in `apps/ui/src/animations/`, imported as `@release/ui/animations` — its own entry point, separate from the components, because a step is how a thing moves rather than a thing to render. They are **not** on the component barrel: `import { useHandArrival } from '@release/ui'` does not resolve, and that is deliberate rather than an oversight.

- [ ] **Step 12: Run the full check and commit**

Run: `pnpm --filter @release/ui test && pnpm -r typecheck && pnpm lint`
Expected: all pass.

```bash
git add apps/ui apps/playground docs/animations
git commit -m "refactor(ui): the discard exit joins its siblings in the animation layer (#96)"
```

---

### Task 2: the discard heap, derived from the feed

The projection carries only `discardTop` and `discardCount`, so `_Board.tsx` has been passing `heap={decks.discardHeap}` with nothing ever setting it. A flight into the discard needs a heap to land in, or its last frame is a card vanishing.

**Files:**
- Modify: `apps/frontend/src/entities/game/board/toBoardState.ts`
- Test: `apps/frontend/src/entities/game/board/toBoardState.test.ts`

**Interfaces:**
- Consumes: `scatterAt(key: number, width?: number) => Scatter` and `HEAP_SHOW: number` from `@release/ui/animations`; `type HeapCard = { card: CardData; rot: number; dx: number; dy: number; uid?: string }` from `@release/ui`.
- Produces: `BoardState.decks.discardHeap: HeapCard[]`, whose entry for a `discarded` event with id `N` has `uid: \`d${N}\`` and the scatter `scatterAt(N)`. Task 5's beat flies each card on that same scatter.

> **`scatterAt` takes a number, not a string.** Its signature is
> `scatterAt(key: number, width = REF_WIDTH)` and it hashes the key arithmetically
> (`apps/ui/src/animations/scatter.ts:53`; the docstring says "its heap index, or any
> stable integer"). An engine event id **is** such an integer — `Event.id` is a number
> from the engine's own monotonic sequence — so it is passed directly. Do **not** widen
> `scatterAt` to take strings: that would touch a shared function with two existing
> callers for no gain, and a naive `Number(key)` widening silently yields `NaN` for any
> non-numeric key. The `uid` on a `HeapCard` stays a string; only the scatter key is a
> number, and the two are separate fields.

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/entities/game/board/toBoardState.test.ts`. The file already has a module-level `const view: PlayerView` (line 9) and `const labels` (line 31) — there is **no** `makeView` factory, so these tests vary the decks by spreading that const. `view` starts with `decks: { piles: [30, 10], events: 8, discardCount: 2, discardTop: 'attack-ddos' }` and `self.id === 'you'`.

```ts
// The decks are the only slice these assertions vary, so they spread the shared
// projection rather than restating one — a second full PlayerView here would
// drift from the one every other test in this file reads.
const withDecks = (decks: Partial<PlayerView['decks']>): PlayerView => ({
  ...view,
  decks: { ...view.decks, ...decks },
})

const discardedEvent = (id: number, card: string, reason = 'effect'): Event =>
  ({ id, type: 'discarded', player: 'you', card, reason }) as Event

describe('the discard heap', () => {
  it('is empty when nothing has been discarded and nothing is on top', () => {
    const state = toBoardState(withDecks({ discardCount: 0, discardTop: undefined }), [], labels)
    expect(state.decks.discardHeap).toEqual([])
  })

  it('gives one entry per discarded event, keyed by the event id', () => {
    const log = [
      discardedEvent(7, 'protection-debugger'),
      discardedEvent(9, 'attack-bug', 'handLimit'),
    ]
    const heap =
      toBoardState(withDecks({ discardCount: 2, discardTop: 'attack-bug' }), log, labels).decks
        .discardHeap ?? []
    expect(heap.map((c) => c.uid)).toEqual(['d7', 'd9'])
    expect(heap.map((c) => c.card.id)).toEqual(['protection-debugger', 'attack-bug'])
  })

  // The scatter is the whole reason the heap is derived rather than invented per
  // render: the beat flies the card on scatterAt(e.id) and the heap rests
  // it on the same value, so the landing frame IS the resting frame (I7).
  it('scatters a card the same way every time', () => {
    const log = [discardedEvent(7, 'attack-bug')]
    const decks = withDecks({ discardCount: 1, discardTop: 'attack-bug' })
    const first = toBoardState(decks, log, labels).decks.discardHeap ?? []
    const second = toBoardState(decks, log, labels).decks.discardHeap ?? []
    expect(first).toEqual(second)
    expect(first[0]).toMatchObject(scatterAt(7))
  })

  it('keeps only the cards the pile actually renders', () => {
    const log = Array.from({ length: HEAP_SHOW + 4 }, (_, i) =>
      discardedEvent(i + 1, 'attack-bug'),
    )
    const heap =
      toBoardState(withDecks({ discardCount: log.length, discardTop: 'attack-bug' }), log, labels)
        .decks.discardHeap ?? []
    expect(heap).toHaveLength(HEAP_SHOW)
    expect(heap.at(-1)?.uid).toBe(`d${log.length}`)
  })

  // The engine banks a spent attack or defence straight into the discard with no
  // event at all (docs/animations/backlog.md), so the fold runs behind the count.
  // Pile ignores `topCard` once a heap is present, so without this the board
  // would show a stale card as the top of the discard.
  it('appends the projection top when the fold does not end on it', () => {
    const log = [discardedEvent(7, 'attack-bug')]
    const heap =
      toBoardState(withDecks({ discardCount: 4, discardTop: 'attack-ddos' }), log, labels).decks
        .discardHeap ?? []
    expect(heap.map((c) => c.card.id)).toEqual(['attack-bug', 'attack-ddos'])
    expect(heap.at(-1)?.uid).toBe('top4')
    // Keyed out of the event ids' range, so the stand-in can never take a real
    // card's pose (see the implementation note on negative keys).
    expect(heap.at(-1)).toMatchObject(scatterAt(-5))
  })

  it('does not append a top the fold already ends on', () => {
    const log = [discardedEvent(7, 'attack-bug')]
    const heap =
      toBoardState(withDecks({ discardCount: 1, discardTop: 'attack-bug' }), log, labels).decks
        .discardHeap ?? []
    expect(heap).toHaveLength(1)
  })
})
```

Add to the file's imports:

```ts
import { HEAP_SHOW, scatterAt } from '@release/ui/animations'
```

> `labels` in this file is a partial `HistoryLabels` covering only `drawn` / `placed` /
> `eliminated`. `discarded` is not among them, so `toHistoryEntry` will put `undefined`
> in the entry's `kind` for these events — harmless here, since none of these assertions
> reads `history`. Add `['discarded', 'Discarded']` to that `Object.fromEntries` list
> anyway: a fixture that quietly produces an undefined label is the kind of thing the
> next test to touch `history` inherits without noticing.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @release/web test -- toBoardState`
Expected: FAIL — `discardHeap` is `undefined` on every assertion.

- [ ] **Step 3: Implement the fold**

In `apps/frontend/src/entities/game/board/toBoardState.ts`, add the import and the function above `toBoardState`:

```ts
import type { HeapCard } from '@release/ui'
import { HEAP_SHOW, scatterAt } from '@release/ui/animations'

// The discard as it lies on the table. `PlayerView` carries only the top card
// and a count, so the heap is folded out of the feed: one entry per `discarded`
// event, its scatter keyed by the event id. Deterministic on purpose — every
// peer folds the same heap, and the beat that flies a card into it reads the
// SAME Scatter, so the card lands exactly where it then lies (I7).
//
// It runs BEHIND the count, knowingly: a card spent on an attack or a defence
// reaches the discard through the engine's `bankToDiscard` with no event at all
// (`attackSpent` / `defenceSpent` are declared in the DiscardReason union and
// never emitted — docs/animations/backlog.md). Two consequences are handled
// here rather than hidden: the count stays the projection's own, which is
// authoritative; and because `Pile` ignores `topCard` the moment a heap is
// present, a fold that does not end on the projection's top would leave a stale
// card showing as the top of the discard — so the real top is appended.
function toDiscardHeap(log: Event[], top: CardData | undefined, count: number): HeapCard[] {
  const heap: HeapCard[] = []
  for (const e of log) {
    if (e.type !== 'discarded') continue
    // The event id IS the stable integer `scatterAt` asks for — the engine's own
    // monotonic sequence, identical on every peer. No stringifying: `scatterAt`
    // hashes the number arithmetically.
    heap.push({ uid: `d${e.id}`, card: cardOrPlaceholder(e.card), ...scatterAt(e.id) })
  }
  if (top && heap.at(-1)?.card.id !== top.id) {
    // The stand-in for however many cards were banked in silence. Its identity is
    // the COUNT, not the heap's length: the count is what actually moved when
    // that happened, so this card keeps one pose for as long as it is really the
    // top. Its scatter key is negative to put it out of the event ids' range —
    // those are positive, so a stand-in can never inherit a real card's pose.
    heap.push({ uid: `top${count}`, card: top, ...scatterAt(-1 - count) })
  }
  return heap.slice(-HEAP_SHOW)
}
```

- [ ] **Step 4: Call it**

In `toBoardState`, `visible` is already the log filtered by `visibleTo`. Change the `decks` block to:

```ts
    decks: {
      // The kit renders one deck; split piles are #61's problem.
      main: view.decks.piles.reduce((a, b) => a + b, 0),
      events: view.decks.events,
      discard: view.decks.discardTop ? cardOrPlaceholder(view.decks.discardTop) : undefined,
      discardHeap: toDiscardHeap(
        visible,
        view.decks.discardTop ? cardOrPlaceholder(view.decks.discardTop) : undefined,
        view.decks.discardCount,
      ),
      discardCount: view.decks.discardCount,
    },
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @release/web test -- toBoardState`
Expected: PASS, all six.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/entities/game/board
git commit -m "feat(web): the discard becomes a heap, folded from the feed (#96)"
```

---

### Task 3: `BoardAnchors` — one registry for every flight

`IntroRefs` is already most of what every flight needs. It becomes board-level, gains what a discard aims from and at, and the intro becomes one consumer of it rather than its owner.

**Files:**
- Create: `apps/frontend/src/entities/game/board/anchors.ts`
- Modify: `apps/frontend/src/entities/game/board/index.ts`, `apps/frontend/src/pages/board/[gameId]/_Board.tsx`, `apps/frontend/src/features/game-intro/useDealIntro.ts`
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/boardAnchors.test.tsx` (create)

**Where it lives, and why it is not beside the board.** The registry holds refs to
nodes `_Board.tsx` renders, so `pages/` looks like the natural home — but two
`features/` modules consume it, and a `features/` → `pages/` import inverts the
one-way layer rule in [apps/frontend/CLAUDE.md](../../apps/frontend/CLAUDE.md). It
is a board fact rather than a page fact, exactly as `BoardState` is, so it sits in
`entities/game/board/` beside the types it is used with and everything imports
downward. Export it from that folder's `index.ts` alongside the existing exports.

**Interfaces:**
- Consumes: `cardBoxIn(rect: Rect, width: number) => Rect` and `CARD_W: number` from `@release/ui`; `type Rect` from `@release/ui/animations`.
- Produces:

```ts
export interface BoardAnchors {
  rail: RefObject<HTMLDivElement | null>
  bg: RefObject<HTMLDivElement | null>
  decks: RefObject<HTMLDivElement | null>
  discard: RefObject<HTMLDivElement | null>
  seats: RefObject<HTMLDivElement | null>
  dock: RefObject<HTMLDivElement | null>
  zone: RefObject<HTMLDivElement | null>
  deckBox: RefObject<HTMLDivElement | null>
  centre: RefObject<HTMLDivElement | null>
  hand: RefObject<HTMLDivElement | null>
  discardBox: RefObject<HTMLDivElement | null>
  seatOf: (player: string) => HTMLElement | null
  seatBox: (player: string) => Rect | null
  handSlotAt: (index: number) => HTMLElement | null
  releaseSlot: (player: string, slot: string) => HTMLElement | null
  bindSeat: (player: string, el: HTMLElement | null) => void
  bindReleaseSlot: (player: string, slot: string, el: HTMLElement | null) => void
}
export function useBoardAnchors(): BoardAnchors
```

Tasks 5 and 6 consume `BoardAnchors`. `useDealIntro`'s `refs` parameter changes type from `IntroRefs` to `BoardAnchors`; `IntroRefs` is deleted.

- [ ] **Step 1: Write the failing test**

> **Corrected during execution.** The board-level test below was the step's original
> RED driver and could not be one: all three assertions query DOM structure that renders
> identically whether or not the refs are wired, because a `ref` prop is invisible to
> `querySelector`. It passed on the un-refactored board. The registry's behaviour is its
> own and is tested directly, at `apps/frontend/src/entities/game/board/anchors.test.tsx`,
> pinning five claims a plausible wrong implementation would fail:
>
> 1. **`handSlotAt(index)` indexes the fan** — `handSlotAt(1)` is the second
>    `[data-hand-slot]` by identity; an out-of-range index answers `null`.
> 2. **`releaseSlot` keys by owner AND slot** — every player has a slot called
>    `frontend`, so a registry keyed on the slot name alone would return another
>    player's node and fly a card out of the wrong seat. An unbound slot answers `null`.
> 3. **`seatOf` releases a node on unbind** — React calls a ref callback with `null` on
>    unmount, so this is the real lifecycle.
> 4. **`seatBox` trims a seat to a card box (I6)** — with the seat's
>    `getBoundingClientRect` stubbed wide, the result is `CARD_W` wide and centred on the
>    seat. This is the whole reason `seatBox` exists: a seat is far wider than a card, and
>    aiming at the seat rect inflates the card to it.
> 5. **One identity across renders** — consumers capture the registry into a ref inside
>    long-running async sequences; a fresh object per render would arm those against a
>    stale registry, and nothing else would catch it.
>
> The board-level file below stays as a render-level smoke test of the board's structure,
> retitled to say so.

Create `apps/frontend/src/pages/board/[gameId]/__tests__/boardAnchors.test.tsx`:

```tsx
import { render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

// The board has no intro in these: the anchors belong to the board, not to the
// opening, and that is the whole point of the registry existing.
vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => true }))

it('gives the discard a box for a flight to aim at', () => {
  const { container } = render(<Board {...makeBoardProps()} />)
  // Pile puts boxRef on its .stack — the card box, not the labelled cell (I6).
  const discard = container.querySelector('[class*="discard"] [class*="stack"]')
  expect(discard).toBeTruthy()
})

it('marks a slot for every card in the hand', () => {
  const props = makeBoardProps()
  const { container } = render(<Board {...props} />)
  expect(container.querySelectorAll('[data-hand-slot]')).toHaveLength(props.state.you.hand.length)
})

it('binds a release slot for the player and for every opponent', () => {
  const props = makeBoardProps()
  const { container } = render(<Board {...props} />)
  // One zone of the player's own plus one per seat — the anchors need a node per
  // owner, because a destroyed card leaves the slot it stood in.
  const zones = container.querySelectorAll('[class*="zone"], [class*="releaseZone"]')
  expect(zones.length).toBeGreaterThanOrEqual(1 + props.state.opponents.length)
})
```

- [ ] **Step 2: Run it and watch it fail**

Run: `pnpm --filter @release/web test -- boardAnchors`
Expected: FAIL on the first assertion — the discard `Pile` in `_Board.tsx` is rendered without a `boxRef`, so there is no `.stack` under `[class*="discard"]` bearing one.

- [ ] **Step 3: Write the registry**

Create `apps/frontend/src/entities/game/board/anchors.ts`:

```ts
import { CARD_W, cardBoxIn } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import type { RefObject } from 'react'
import { useCallback, useMemo, useRef } from 'react'

// Every node a flight aims at or leaves from, in one place. This started as
// `IntroRefs` inside the deal — it was already most of the registry, and the
// deal was only its first consumer. A second consumer is what turns "the refs
// the intro needs" into "the anchors of the board", so it moves out here and
// the intro becomes one caller among others.
//
// It is a DOM registry and nothing else: it holds no game state and mirrors
// none. That is why a hand card is reached by INDEX rather than by uid — a uid
// lookup would make the registry depend on the very hand it is meant to be
// independent of. A caller already holds the hand it planned against, and
// resolves the index there.
export interface BoardAnchors {
  rail: RefObject<HTMLDivElement | null>
  bg: RefObject<HTMLDivElement | null>
  decks: RefObject<HTMLDivElement | null>
  discard: RefObject<HTMLDivElement | null>
  seats: RefObject<HTMLDivElement | null>
  dock: RefObject<HTMLDivElement | null>
  zone: RefObject<HTMLDivElement | null>
  deckBox: RefObject<HTMLDivElement | null>
  centre: RefObject<HTMLDivElement | null>
  hand: RefObject<HTMLDivElement | null>
  /** the discard's CARD box — what a flight into the heap aims at */
  discardBox: RefObject<HTMLDivElement | null>
  seatOf: (player: string) => HTMLElement | null
  /** a card-sized box centred on a seat: a seat is far wider than a card (I6) */
  seatBox: (player: string) => Rect | null
  handSlotAt: (index: number) => HTMLElement | null
  releaseSlot: (player: string, slot: string) => HTMLElement | null
  bindSeat: (player: string, el: HTMLElement | null) => void
  bindReleaseSlot: (player: string, slot: string, el: HTMLElement | null) => void
}

export function useBoardAnchors(): BoardAnchors {
  const rail = useRef<HTMLDivElement>(null)
  const bg = useRef<HTMLDivElement>(null)
  const decks = useRef<HTMLDivElement>(null)
  const discard = useRef<HTMLDivElement>(null)
  const seats = useRef<HTMLDivElement>(null)
  const dock = useRef<HTMLDivElement>(null)
  const zone = useRef<HTMLDivElement>(null)
  const deckBox = useRef<HTMLDivElement>(null)
  const centre = useRef<HTMLDivElement>(null)
  const hand = useRef<HTMLDivElement>(null)
  const discardBox = useRef<HTMLDivElement>(null)
  const seatEls = useRef<Record<string, HTMLElement | null>>({})
  const slotEls = useRef<Record<string, HTMLElement | null>>({})

  const seatOf = useCallback((player: string) => seatEls.current[player] ?? null, [])
  const bindSeat = useCallback((player: string, el: HTMLElement | null) => {
    seatEls.current[player] = el
  }, [])
  const bindReleaseSlot = useCallback((player: string, slot: string, el: HTMLElement | null) => {
    slotEls.current[`${player}:${slot}`] = el
  }, [])
  const releaseSlot = useCallback(
    (player: string, slot: string) => slotEls.current[`${player}:${slot}`] ?? null,
    [],
  )
  const seatBox = useCallback(
    (player: string): Rect | null => {
      const el = seatEls.current[player]
      return el ? cardBoxIn(el.getBoundingClientRect(), CARD_W) : null
    },
    [],
  )
  // The fan marks its slots itself; asking the DOM keeps this in step with
  // whatever Hand does with them, instead of holding a second list of nodes.
  const handSlotAt = useCallback(
    (index: number) =>
      hand.current?.querySelectorAll<HTMLElement>('[data-hand-slot]')[index] ?? null,
    [],
  )

  // One identity for the life of the mount: every consumer takes this through a
  // ref into a long-running sequence, and a fresh object per render would arm
  // those against a stale registry.
  return useMemo(
    () => ({
      rail, bg, decks, discard, seats, dock, zone, deckBox, centre, hand, discardBox,
      seatOf, seatBox, handSlotAt, releaseSlot, bindSeat, bindReleaseSlot,
    }),
    [seatOf, seatBox, handSlotAt, releaseSlot, bindSeat, bindReleaseSlot],
  )
}
```

- [ ] **Step 4: Wire it into the board**

In `apps/frontend/src/pages/board/[gameId]/_Board.tsx`:

1. Delete the eleven `useRef` declarations and the `introRefs` `useMemo` (lines 158–184), and the `import type { IntroRefs }` line. Replace with:

```ts
  const anchors = useBoardAnchors()
```

and add the import (through the entity's barrel, like the board's other types):

```ts
import { useBoardAnchors } from '~/entities/game/board'
```

Export it from `apps/frontend/src/entities/game/board/index.ts`:

```ts
export { type BoardAnchors, useBoardAnchors } from './anchors'
```

2. Every `railRef` / `bgRef` / `decksRef` / `discardRef` / `seatsRef` / `dockRef` / `zoneRef` / `deckBoxRef` / `centreRef` / `handRef` reference becomes `anchors.rail` etc. The seat binding becomes:

```tsx
              ref={(el) => {
                anchors.bindSeat(p.id, el)
              }}
```

3. `useDealIntro`'s `refs` argument becomes `anchors`.

4. The discard `Pile` gains the box the flights aim at:

```tsx
          <Pile
            label={copy.table.discard}
            heap={decks.discardHeap}
            heapShow={HEAP_SHOW}
            topCard={decks.discard}
            count={decks.discardCount}
            width={116}
            boxRef={anchors.discardBox}
          />
```

5. The player's own `ReleaseZone` binds its slots:

```tsx
              <ReleaseZone
                release={you.release}
                size="100px"
                player={state.selfId}
                slotRef={(key, el) => anchors.bindReleaseSlot(state.selfId, key, el)}
                onPick={(target) => gestures.onTargetPick(target)}
                targets={gestures.targets}
              />
```

6. Each `Seat` binds its own:

```tsx
              <Seat
                player={shown}
                active={turn === p.id}
                eliminated={eliminated}
                disconnected={disconnected}
                copy={copy.seat}
                slotRef={(key, el) => anchors.bindReleaseSlot(p.id, key, el)}
                onPick={(target) => gestures.onTargetPick(target)}
                targets={gestures.targets}
              />
```

7. The `arrow.aim` effect reads `handRef.current` — change to `anchors.hand.current`.

- [ ] **Step 5: Retype the intro**

In `apps/frontend/src/features/game-intro/useDealIntro.ts`, delete the `IntroRefs` interface (lines 55–67) and import the registry instead:

```ts
import type { BoardAnchors } from '~/entities/game/board'
```

Change the hook's argument type from `refs: IntroRefs` to `refs: BoardAnchors`. Nothing inside the hook changes: every member it reads (`rail`, `bg`, `decks`, `discard`, `seats`, `dock`, `zone`, `deckBox`, `centre`, `hand`, `seatOf`) is on `BoardAnchors` with the same shape. `features/` → `entities/` is the layer rule's own direction, so nothing here needs an exception.

Also delete the now-dangling `import type { IntroRefs }` line in `_Board.tsx` if Step 4 has not already removed it.

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @release/web test -- boardAnchors boardIntro board`
Expected: PASS — including the three existing board suites, unchanged. They are the proof the registry changed no behaviour.

- [ ] **Step 7: Full check and commit**

Run: `pnpm --filter @release/web test && pnpm -r typecheck && pnpm lint`
Expected: all pass.

```bash
git add "apps/frontend/src/pages/board/[gameId]" apps/frontend/src/features/game-intro
git commit -m "refactor(web): the intro's refs become the board's anchors (#96)"
```

---

### Task 4: `planBeats` — a batch of events becomes beats

Pure, and the piece worth testing hardest: it is where an event that has no choreography is told apart from one that does, and where a card whose source has gone is handled without inventing a rule for it.

**Files:**
- Create: `apps/frontend/src/features/board-beats/planBeats.ts`
- Test: `apps/frontend/src/features/board-beats/planBeats.test.ts` (create)

**Interfaces:**
- Consumes: `type BoardState` from `~/entities/game/board`; `type Event` from `@release/engine`.
- Produces:

```ts
export type DiscardSource =
  | { kind: 'hand'; index: number }
  | { kind: 'release'; player: string; slot: string }
  | { kind: 'seat'; player: string }

export interface DiscardCard {
  key: string        // `d${eventId}`
  eventId: number
  card: string       // CardId — resolved to CardData by the runner
  source: DiscardSource
}

export interface BeatPlan {
  kind: 'discard'
  key: string        // `discard:${first event id}`
  cards: DiscardCard[]
}

export function planBeats(events: Event[], before: BoardState): BeatPlan[]
```

Task 5 consumes `planBeats` and `BeatPlan`.

- [ ] **Step 1: Write the failing tests**

Create `apps/frontend/src/features/board-beats/planBeats.test.ts`:

```ts
import type { Event } from '@release/engine'
import { cardById } from '@release/ui'
import { describe, expect, it } from 'vitest'
import type { BoardState } from '~/entities/game/board'
import { planBeats } from './planBeats'

const card = (id: string) => cardById(id) ?? { id, name: id, category: 'attack', deck: 'base', art: '', tags: [], qty: 0 }

const before = (over: Partial<BoardState> = {}): BoardState =>
  ({
    you: {
      name: 'You',
      hand: [
        { uid: 'u1', card: card('attack-bug') },
        { uid: 'u2', card: card('protection-debugger') },
      ],
      release: { frontend: card('release-frontend') },
    },
    opponents: [{ id: 'p2', name: 'Two', handCount: 3, release: { backend: card('release-backend') } }],
    decks: { main: 10, events: 5, discardCount: 0 },
    selfId: 'p1',
    history: [],
    setup: {},
    playable: [],
    frozen: [],
    ...over,
  }) as BoardState

const discarded = (id: number, over: Partial<Extract<Event, { type: 'discarded' }>> = {}): Event =>
  ({ id, type: 'discarded', player: 'p1', card: 'attack-bug', reason: 'effect', ...over }) as Event

describe('planBeats', () => {
  it('yields nothing for a batch with no choreography', () => {
    const events: Event[] = [
      { id: 1, type: 'turnStarted', player: 'p1', index: 0 },
      { id: 2, type: 'passed', player: 'p1' },
    ]
    expect(planBeats(events, before())).toEqual([])
  })

  it('flies the player’s own discard from its slot in the fan', () => {
    const [beat] = planBeats([discarded(4)], before())
    expect(beat.cards).toEqual([
      { key: 'd4', eventId: 4, card: 'attack-bug', source: { kind: 'hand', index: 0 } },
    ])
  })

  // The step's own rule: cards leave one by one but ALL AT ONCE. A hand-limit
  // discard of three is one gesture, not three.
  it('puts every discard of one batch in a single beat', () => {
    const events = [
      discarded(4, { reason: 'handLimit' }),
      discarded(5, { card: 'protection-debugger', reason: 'handLimit' }),
    ]
    const beats = planBeats(events, before())
    expect(beats).toHaveLength(1)
    expect(beats[0].cards.map((c) => c.key)).toEqual(['d4', 'd5'])
    expect(beats[0].key).toBe('discard:4')
  })

  it('claims each hand slot once when two copies of a card go out together', () => {
    const state = before({
      you: {
        name: 'You',
        hand: [
          { uid: 'u1', card: card('attack-bug') },
          { uid: 'u2', card: card('attack-bug') },
        ],
        release: {},
      },
    } as Partial<BoardState>)
    const [beat] = planBeats([discarded(4), discarded(5)], state)
    expect(beat.cards.map((c) => c.source)).toEqual([
      { kind: 'hand', index: 0 },
      { kind: 'hand', index: 1 },
    ])
  })

  it('flies a destroyed card out of the release slot it stood in', () => {
    const [beat] = planBeats(
      [discarded(4, { card: 'release-frontend', reason: 'destroyed' })],
      before(),
    )
    expect(beat.cards[0].source).toEqual({ kind: 'release', player: 'p1', slot: 'frontend' })
  })

  it('flies an opponent’s destroyed release out of their own slot', () => {
    const [beat] = planBeats(
      [discarded(4, { player: 'p2', card: 'release-backend', reason: 'destroyed' })],
      before(),
    )
    expect(beat.cards[0].source).toEqual({ kind: 'release', player: 'p2', slot: 'backend' })
  })

  it('flies an opponent’s hand discard from their seat', () => {
    const [beat] = planBeats([discarded(4, { player: 'p2' })], before())
    expect(beat.cards[0].source).toEqual({ kind: 'seat', player: 'p2' })
  })

  // THE UNDECIDED CASE. The rule for a beat whose target is already gone is not
  // settled (docs/animations/backlog.md), so nothing is invented here: a card
  // with no source is simply not flown, exactly like an event with no
  // choreography at all. It still reaches the discard, because the projection
  // puts it there — the animation is what is skipped, never the outcome.
  it('drops a card whose source is not on the board, rather than guessing one', () => {
    const beats = planBeats([discarded(4, { card: 'attack-ddos' })], before())
    expect(beats).toEqual([])
  })

  it('keeps the cards it can aim when one of a batch has no source', () => {
    const [beat] = planBeats(
      [discarded(4, { card: 'attack-ddos' }), discarded(5, { card: 'attack-bug' })],
      before(),
    )
    expect(beat.cards.map((c) => c.key)).toEqual(['d5'])
  })
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @release/web test -- planBeats`
Expected: FAIL — `planBeats` does not exist.

- [ ] **Step 3: Implement it**

Create `apps/frontend/src/features/board-beats/planBeats.ts`:

```ts
import type { Event } from '@release/engine'
import type { BoardState } from '~/entities/game/board'

// A batch of engine events becomes the movements the board should play. Pure:
// it reads the projection as it stood BEFORE the batch, because that is the
// board still on screen — the hand slot a card is about to leave still exists
// there to be measured (I1).
//
// An event with no choreography yields no beat and passes straight through.
// That is the default, not a gap: the board is driven by the projection, and a
// beat only ever adds a way of GETTING to the next one.

export type DiscardSource =
  | { kind: 'hand'; index: number }
  | { kind: 'release'; player: string; slot: string }
  | { kind: 'seat'; player: string }

export interface DiscardCard {
  key: string
  eventId: number
  card: string
  source: DiscardSource
}

export interface BeatPlan {
  kind: 'discard'
  key: string
  cards: DiscardCard[]
}

// A card leaving a release slot names the slot it stood in. Reasons other than
// these two never come out of the zone, so they are not searched for there.
const FROM_RELEASE = new Set(['destroyed', 'neutralized'])

const slotHolding = (
  release: Record<string, { id: string } | undefined>,
  card: string,
): string | null => Object.keys(release).find((k) => release[k]?.id === card) ?? null

function sourceOf(
  e: Extract<Event, { type: 'discarded' }>,
  before: BoardState,
  claimed: Set<number>,
): DiscardSource | null {
  const mine = e.player === before.selfId
  if (FROM_RELEASE.has(e.reason)) {
    const release = mine
      ? before.you.release
      : before.opponents.find((o) => o.id === e.player)?.release
    const slot = release ? slotHolding(release, e.card) : null
    return slot ? { kind: 'release', player: e.player, slot } : null
  }
  if (!mine) return { kind: 'seat', player: e.player }
  // `discarded` carries a card id, not a uid, so the slot is found by matching
  // the id against the hand that is still on screen. Two copies of one card are
  // interchangeable to look at, so the first unclaimed one is right rather than
  // merely adequate — `claimed` is what stops a pair of them sharing a slot.
  const index = before.you.hand.findIndex(
    (h, i) => h.card.id === e.card && !claimed.has(i),
  )
  if (index < 0) return null
  claimed.add(index)
  return { kind: 'hand', index }
}

export function planBeats(events: Event[], before: BoardState): BeatPlan[] {
  const claimed = new Set<number>()
  const cards: DiscardCard[] = []
  for (const e of events) {
    if (e.type !== 'discarded') continue
    const source = sourceOf(e, before, claimed)
    // No source means the card is not where the board can see it — a case the
    // rules have not settled (docs/animations/backlog.md). Nothing is invented:
    // it is simply not flown, and the projection still puts it in the discard.
    if (!source) continue
    cards.push({ key: `d${e.id}`, eventId: e.id, card: e.card, source })
  }
  if (cards.length === 0) return []
  return [{ kind: 'discard', key: `discard:${cards[0].eventId}`, cards }]
}
```

- [ ] **Step 4: Run the tests**

Run: `pnpm --filter @release/web test -- planBeats`
Expected: PASS, all nine.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/board-beats
git commit -m "feat(web): a batch of engine events becomes beats (#96)"
```

---

### Task 5: `useBeats` — the queue, the shadow, the one policy

**Files:**
- Create: `apps/frontend/src/features/board-beats/useBeats.ts`, `apps/frontend/src/features/board-beats/index.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx`
- Test: `apps/frontend/src/features/board-beats/useBeats.test.tsx` (create), `apps/frontend/src/pages/board/[gameId]/__tests__/boardDiscard.test.tsx` (create)

**Interfaces:**
- Consumes: `planBeats`, `BeatPlan`, `DiscardCard` (Task 4); `BoardAnchors` (Task 3); `useDiscardExit`, `type Leaving`, `scatterAt` from `@release/ui/animations` (Task 1); `useReducedMotion` from `~/shared/lib/useReducedMotion`.
- Produces:

```ts
export interface Beats {
  shadow: BoardState | null
  overlays: ReactNode[]
  exclusive: boolean
}
export function useBeats(args: {
  live: BoardState
  events: Event[]
  anchors: BoardAnchors
  enabled: boolean
}): Beats
```

Task 6 adds an `intro?: Beat | null` argument to the same hook.

- [ ] **Step 1: Write the failing tests for the queue**

Create `apps/frontend/src/features/board-beats/useBeats.test.tsx`:

```tsx
import type { Event } from '@release/engine'
import type { CardData } from '@release/ui'
import { cardById } from '@release/ui'
import { scatterAt } from '@release/ui/animations'
import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import { useBeats } from './useBeats'

const motion = vi.hoisted(() => ({ reduced: true }))
vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => motion.reduced }))

const sent = vi.hoisted(() => ({ calls: [] as unknown[][] }))
vi.mock('@release/ui/animations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@release/ui/animations')>()),
  useDiscardExit: () => ({
    overlay: [],
    send: (items: unknown[]) => {
      sent.calls.push(items)
      return Promise.resolve()
    },
    reset: () => {},
    FLIGHT_MS: 420,
  }),
}))

const card = (id: string) => cardById(id) as CardData

// The board BEFORE the batch: the card is still in the fan. This is what the
// queue must keep on screen while the beat runs, and what a source rect is
// measured against.
const preDiscard = {
  you: { name: 'You', hand: [{ uid: 'u1', card: card('attack-bug') }], release: {} },
  opponents: [{ id: 'p2', name: 'Two', handCount: 3, release: {} }],
  decks: { main: 10, events: 5, discardCount: 0, discardHeap: [] },
  selfId: 'p1',
  history: [],
  setup: {},
  playable: [],
  frozen: [],
} as unknown as BoardState

// …and after: the card is gone from the hand and counted in the discard. The
// beat's last frame has to equal THIS.
const afterDiscard = {
  ...preDiscard,
  you: { ...preDiscard.you, hand: [] },
  decks: { ...preDiscard.decks, discardCount: 1 },
} as unknown as BoardState

const discardEvent = {
  id: 4,
  type: 'discarded',
  player: 'p1',
  card: 'attack-bug',
  reason: 'effect',
} as Event

// jsdom gives every element a zero rect, which is fine: the queue's job is to
// hand the step a rect, not to be right about layout. What matters is that a
// node exists for each anchor, because a MISSING one is the branch that drops a
// card from the flight.
const node = () => document.createElement('div')
const stub = {
  rail: { current: null }, bg: { current: null }, decks: { current: null },
  discard: { current: null }, seats: { current: null }, dock: { current: null },
  zone: { current: null }, deckBox: { current: null }, centre: { current: null },
  hand: { current: null }, discardBox: { current: node() },
  seatOf: () => node(),
  seatBox: () => ({ left: 0, top: 0, width: 150, height: 210 }),
  handSlotAt: () => node(),
  releaseSlot: () => node(),
  bindSeat: () => {},
  bindReleaseSlot: () => {},
} as unknown as BoardAnchors

function Probe({
  live,
  events,
  anchors,
}: {
  live: BoardState
  events: Event[]
  anchors: BoardAnchors
}) {
  const beats = useBeats({ live, events, anchors, enabled: true })
  return (
    <>
      <div data-testid="hand">{(beats.shadow ?? live).you.hand.length}</div>
      <div data-testid="exclusive">{beats.exclusive ? 'exclusive' : 'open'}</div>
    </>
  )
}

// The probe renders the hand the BOARD would render — shadow if one is up,
// otherwise live. So "1" means the card is still in the fan and "0" means it has
// gone: the queue's whole observable behaviour, without asserting on internals.
//
// The first render is the pre-batch state (a hand of one), and the batch arrives
// on the rerender — which is the real sequence, and the only one where `settled`
// holds a projection the card is still in.
const mount = () => {
  const utils = render(<Probe live={preDiscard} events={[]} anchors={stub} />)
  utils.rerender(<Probe live={afterDiscard} events={[discardEvent]} anchors={stub} />)
  return utils
}

it('never animates when motion is reduced', async () => {
  motion.reduced = true
  sent.calls = []
  const { getByTestId } = mount()
  await act(async () => {})
  expect(sent.calls).toEqual([])
  // Straight to the end state: the card is gone, no beat ever ran.
  expect(getByTestId('hand').textContent).toBe('0')
})

it('keeps the card in the fan while its beat runs', () => {
  motion.reduced = false
  sent.calls = []
  const { getByTestId } = mount()
  expect(getByTestId('hand').textContent).toBe('1')
})

it('hands the board back to the live projection when the queue drains', async () => {
  motion.reduced = false
  const { getByTestId } = mount()
  await act(async () => {})
  expect(getByTestId('hand').textContent).toBe('0')
})

it('flies each card on the scatter the heap will rest it on', async () => {
  motion.reduced = false
  sent.calls = []
  mount()
  await act(async () => {})
  expect(sent.calls).toHaveLength(1)
  const [items] = sent.calls as [{ key: string; scatter: unknown }[]]
  expect(items).toHaveLength(1)
  expect(items[0].key).toBe('d4')
  // The identity this whole design rests on: the flight ends on the pose the
  // adapter's heap already holds for this card (I7). Task 2 folded the heap with
  // scatterAt(e.id); this is the same call on the same id.
  expect(items[0].scatter).toEqual(scatterAt(discardEvent.id))
})

it('leaves the table open — only the opening is exclusive', () => {
  motion.reduced = false
  const { getByTestId } = mount()
  expect(getByTestId('exclusive').textContent).toBe('open')
})
```

Note the `scatterAt` import is the **real** one: the mock above spreads `importOriginal()` and replaces only `useDiscardExit`, so every helper the queue and the adapter share stays the genuine implementation. That is what makes the last assertion meaningful rather than circular.

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @release/web test -- useBeats`
Expected: FAIL — `useBeats` does not exist.

- [ ] **Step 3: Implement the queue**

Create `apps/frontend/src/features/board-beats/useBeats.ts`:

```ts
import type { Event } from '@release/engine'
import { cardById } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import { scatterAt, useDiscardExit } from '@release/ui/animations'
import type { ReactNode } from 'react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import { useReducedMotion } from '~/shared/lib/useReducedMotion'
import type { BeatPlan, DiscardCard } from './planBeats'
import { planBeats } from './planBeats'

// The board's beat queue. `useGame` accumulates engine events off the wire in
// BATCHES — a peer can receive several moves in one sync — so a board that
// animated on render would either play them on top of each other or drop all
// but the last. One beat runs at a time; the board renders a SHADOW while it
// does, and the shadow is the projection the beat is animating away from.
//
// Two properties are the whole point, and both are structural rather than
// promised:
//
//   • The last frame of a beat IS the projection it hands over to. A card flies
//     on scatterAt(eventId) and the heap rests it on scatterAt(eventId) — one
//     value, two readers (I7) — so the handover changes nothing on screen.
//   • The board can never be stranded behind the projection. The shadow's whole
//     lifetime is the queue's: when the queue drains it is dropped and live
//     wins, whatever happened inside a beat. There is no path where a thrown
//     run, a missing rect or a bad plan leaves an old state on the table.
//
// One policy, one place: prefers-reduced-motion is read HERE. `play()` in
// @release/ui drives WAAPI directly and does not check it, so every consumer
// would otherwise have to remember — which is precisely the kind of thing that
// gets remembered nine times out of ten.

interface Beat {
  key: string
  /** the projection this beat animates AWAY from — the board while it runs */
  base: BoardState
  /** it owns the table: input is dead while it runs */
  exclusive: boolean
  run: () => Promise<void>
}

export interface Beats {
  shadow: BoardState | null
  overlays: ReactNode[]
  exclusive: boolean
}

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useBeats(args: {
  live: BoardState
  events: Event[]
  anchors: BoardAnchors
  enabled: boolean
}): Beats {
  const { live, events, anchors, enabled } = args
  const reduced = useReducedMotion()
  const [running, setRunning] = useState<Beat | null>(null)
  // The same value as `running`, readable from an effect without listing it as
  // a dependency — the effect below has to ask "is a beat up?" without being
  // re-armed by the answer changing.
  const runningRef = useRef<Beat | null>(null)

  // No onLanded: the heap is derived from these same events in toBoardState, so
  // the cards this step flew are already in the projection it hands over to. A
  // second set of books here would be a second source for one heap.
  const { overlay, send } = useDiscardExit(anchors.discardBox)

  const latest = useRef({ live, anchors, send })
  latest.current = { live, anchors, send }

  // How far into the feed the queue has already looked. Event ids are the
  // engine's own monotonic sequence, so this is a watermark and not a count —
  // a batch that arrives while a beat runs is picked up on the next pass.
  const seen = useRef(0)
  const queue = useRef<Beat[]>([])
  const draining = useRef(false)

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
      // The SAME Scatter the adapter rests this card on (I7): the flight ends
      // on the pose the heap already holds for it, so nothing moves on handover.
      // Same key, same call — `scatterAt` takes the event id as a number.
      return { key: c.key, card, from, scatter: scatterAt(c.eventId) }
    },
    [whereFrom],
  )

  const beatOf = useCallback(
    (plan: BeatPlan, base: BoardState): Beat => ({
      key: plan.key,
      base,
      exclusive: false,
      run: async () => {
        // Measured now, against the shadow that is on screen — not at plan time.
        const items = plan.cards.map(toLeaving).filter((it): it is Leaving => it != null)
        if (items.length > 0) await latest.current.send(items)
      },
    }),
    [toLeaving],
  )

  const drain = useCallback(async () => {
    if (draining.current) return
    draining.current = true
    try {
      let next = queue.current.shift()
      while (next) {
        runningRef.current = next
        setRunning(next)
        // A beat that throws must not hold the board: the shadow is dropped in
        // the finally below regardless, so a failure costs the animation and
        // never the state.
        try {
          await next.run()
        } catch (err) {
          if (import.meta.env.DEV) console.error('[beats] %s failed', next.key, err)
        }
        next = queue.current.shift()
      }
    } finally {
      draining.current = false
      runningRef.current = null
      setRunning(null)
    }
  }, [])

  // The last projection the board actually SHOWED. Not `live`: by the time this
  // effect runs, `live` is already the projection the arriving batch produced —
  // the card is out of the hand and counted in the discard. The slot it has to
  // fly from is on the previous one, which is what is still on screen (I1).
  const settled = useRef(live)

  useLayoutEffect(() => {
    // A beat is up: the board is its shadow, and a batch arriving now waits its
    // turn rather than being planned against a state nobody can see. `running`
    // is a dependency so this re-arms the moment the queue drains and picks up
    // whatever accumulated meanwhile — that IS the queue.
    if (runningRef.current) return
    const before = settled.current
    settled.current = live
    if (!enabled) {
      // Nothing to animate into: keep the watermark level with the feed so a
      // board that becomes enabled later does not replay everything at once.
      seen.current = events.at(-1)?.id ?? seen.current
      return
    }
    const fresh = events.filter((e) => e.id > seen.current)
    if (fresh.length === 0) return
    seen.current = fresh.at(-1)?.id ?? seen.current
    // Reduced motion collapses every beat to its end state, and the end state is
    // the projection the board already holds — so there is nothing to do but
    // let it render. Planned nowhere, run nowhere: one branch, one place.
    if (reduced) return
    for (const plan of planBeats(fresh, before)) queue.current.push(beatOf(plan, before))
    void drain()
  }, [events, live, enabled, reduced, beatOf, drain, running])

  return {
    // The shadow is the running beat's own base, and nothing else holds it up.
    shadow: running?.base ?? null,
    overlays: overlay,
    exclusive: running?.exclusive ?? false,
  }
}
```

Create `apps/frontend/src/features/board-beats/index.ts`:

```ts
export type { BeatPlan, DiscardCard, DiscardSource } from './planBeats'
export { planBeats } from './planBeats'
export type { Beats } from './useBeats'
export { useBeats } from './useBeats'
```

- [ ] **Step 4: Run the queue tests**

Run: `pnpm --filter @release/web test -- useBeats`
Expected: PASS, all five.

- [ ] **Step 5: Mount it on the board**

In `_Board.tsx`, after the `useDealIntro` call:

```ts
  // The live queue. It is armed only once the opening is over: until then the
  // deal owns the table, and the events that produced the board's first
  // projection are the deal's own — replaying them as discards would fly cards
  // that never left a hand on screen.
  const beats = useBeats({
    live,
    events: intro?.events ?? [],
    anchors,
    enabled: introOver || intro == null,
  })
```

Change the state and gate lines to take the queue into account:

```ts
  const state = deal.shadow ?? beats.shadow ?? live
  const actions = deal.active || beats.exclusive ? INERT_ACTIONS : liveActions
```

and render the queue's overlays beside the deal's, at the end of the tree:

```tsx
      {deal.overlays}
      {beats.overlays}
```

- [ ] **Step 6: Write the board-level test**

Create `apps/frontend/src/pages/board/[gameId]/__tests__/boardDiscard.test.tsx`:

```tsx
import { fireEvent, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => true }))

// The board without an intro is the live board, and under reduced motion the
// queue never runs a beat — so what is on screen is the projection itself. That
// is the assertion worth making at THIS level: the board's output does not
// depend on whether the animation played. The queue's own behaviour is covered
// in features/board-beats/useBeats.test.tsx; this suite covers the wiring.
it('renders the projection’s own discard heap in the pile', () => {
  const props = makeBoardProps()
  const heap = [
    { uid: 'd1', card: props.state.you.hand[0].card, rot: 4, dx: 2, dy: -3 },
    { uid: 'd2', card: props.state.you.hand[1].card, rot: -6, dx: -1, dy: 5 },
  ]
  const withHeap = {
    ...props,
    state: { ...props.state, decks: { ...props.state.decks, discardHeap: heap, discardCount: 2 } },
  }
  const { container } = render(<Board {...withHeap} />)
  const discard = container.querySelector('[class*="discard"]')
  // Two heap cards render, and the count is the projection's own — the number
  // stays authoritative even when the fold is short (the bankToDiscard gap).
  expect(discard?.querySelectorAll('[class*="heapCard"]')).toHaveLength(2)
})

it('gives the discard pile a box for a flight to aim at', () => {
  const { container } = render(<Board {...makeBoardProps()} />)
  const discard = container.querySelector('[class*="discard"] [class*="stack"]')
  expect(discard).toBeTruthy()
})

// A discard is a thing that HAPPENED, not a thing being decided: freezing the
// fan for 420ms every time a card leaves reads as lag, not as safety
// (docs/animations/README.md — "Gating the hand", approach 3). Only the opening
// is exclusive, so on a board with no intro every hand card stays clickable.
it('leaves the hand live on a board with no opening', () => {
  const onPlay = vi.fn()
  const props = makeBoardProps({ actions: { onPlay } })
  const { container } = render(<Board {...props} />)
  const slot = container.querySelector<HTMLElement>('[data-hand-slot]')
  expect(slot).toBeTruthy()
  fireEvent.click(slot as HTMLElement)
  // The gesture machine received the click: the hand was never held inert.
  // (What it does with it is _useBoardInteractions' subject, not this suite's.)
  expect(slot?.closest('[inert]')).toBeNull()
})
```

- [ ] **Step 7: Run everything**

Run: `pnpm --filter @release/web test && pnpm -r typecheck && pnpm lint`
Expected: all pass, including the three existing board suites.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/board-beats "apps/frontend/src/pages/board/[gameId]"
git commit -m "feat(web): a card leaves the hand for the discard, on the board (#96)"
```

---

### Task 6: the intro becomes beat zero

One queue, one shadow, one reduced-motion check. `useDealIntro` keeps its choreography, its tuned beat timings and its tests untouched — only the arming, the cancelling and the policy move out.

**Files:**
- Modify: `apps/frontend/src/features/game-intro/useDealIntro.ts`, `apps/frontend/src/features/board-beats/useBeats.ts`, `apps/frontend/src/pages/board/[gameId]/_Board.tsx`
- Test: `apps/frontend/src/features/board-beats/useBeats.test.tsx` (extend); the existing `boardIntro.test.tsx`, `useDealIntro.test.tsx`, `useDealIntroMotion.test.tsx` are the regression net and must not be edited.

**Interfaces:**
- Consumes: everything from Task 5.
- Produces: `useBeats` gains an `intro?: IntroBeat | null` argument, where

```ts
export interface IntroBeat {
  key: string
  shadow: BoardState | null
  run: () => Promise<void>
}
```

and `useDealIntro` returns `beat: IntroBeat | null` alongside what it already returns.

- [ ] **Step 1: Write the failing tests**

First extend the existing `Probe` and `mount` from Task 5 to pass an intro through — everything else in that file stays as it is:

```tsx
import type { IntroBeat } from './useBeats'

// The opening's own shadow: a table with no hand at all, because the cards have
// not been dealt on screen yet. Distinct from preDiscard (a hand of one) and
// afterDiscard (a hand of none) so the three are told apart by the same probe.
const preDeal = {
  ...preDiscard,
  you: { ...preDiscard.you, hand: [] },
  decks: { ...preDiscard.decks, main: 40 },
} as unknown as BoardState

function Probe({ live, events, anchors, intro }: {
  live: BoardState
  events: Event[]
  anchors: BoardAnchors
  intro?: IntroBeat | null
}) {
  const beats = useBeats({ live, events, anchors, enabled: true, intro })
  return (
    <>
      <div data-testid="hand">{(beats.shadow ?? live).you.hand.length}</div>
      <div data-testid="exclusive">{beats.exclusive ? 'exclusive' : 'open'}</div>
    </>
  )
}

const mount = (intro?: IntroBeat | null) => {
  const utils = render(<Probe live={preDiscard} events={[]} anchors={stub} intro={intro} />)
  utils.rerender(<Probe live={afterDiscard} events={[discardEvent]} anchors={stub} intro={intro} />)
  return utils
}
```

Then append the new cases:

```tsx
it('runs the intro before anything the wire brings in', async () => {
  motion.reduced = false
  const order: string[] = []
  const intro = {
    key: 'intro',
    shadow: preDeal,
    run: async () => {
      order.push('intro')
    },
  }
  sent.calls = []
  mount(intro)
  await act(async () => {})
  expect(order).toEqual(['intro'])
  // …and the discard ran after it, not instead of it
  expect(sent.calls).toHaveLength(1)
})

it('holds the table while the intro runs', () => {
  motion.reduced = false
  // A run that never settles: the queue is parked on beat zero for the whole test.
  const intro = { key: 'intro', shadow: preDeal, run: () => new Promise<void>(() => {}) }
  const { getByTestId } = mount(intro)
  expect(getByTestId('exclusive').textContent).toBe('exclusive')
  // …and the board shows the intro's OWN shadow, not the beat's base — the
  // opening publishes a whole shape rather than a fold of the projection.
  expect(getByTestId('hand').textContent).toBe('0')
})

it('hands the table back once the opening is over', async () => {
  motion.reduced = false
  const intro = { key: 'intro', shadow: preDeal, run: async () => {} }
  const { getByTestId } = mount(intro)
  await act(async () => {})
  expect(getByTestId('exclusive').textContent).toBe('open')
})

it('never runs the intro when motion is reduced', async () => {
  motion.reduced = true
  const order: string[] = []
  const intro = { key: 'intro', shadow: preDeal, run: async () => { order.push('intro') } }
  mount(intro)
  await act(async () => {})
  expect(order).toEqual([])
})
```

- [ ] **Step 2: Run them and watch them fail**

Run: `pnpm --filter @release/web test -- useBeats`
Expected: FAIL — `useBeats` takes no `intro`.

- [ ] **Step 3: Teach the queue about beat zero**

In `useBeats.ts`, add to the args type:

```ts
  /**
   * The opening, when there is one. It is not planned from events — it is a
   * whole shape rather than a fold of the projection, so it publishes its own
   * shadow — but it is queued like everything else, ahead of everything else,
   * and it is the one beat that owns the table while it runs.
   */
  intro?: IntroBeat | null
```

and the type plus the arming effect:

```ts
export interface IntroBeat {
  key: string
  shadow: BoardState | null
  run: () => Promise<void>
}
```

```ts
  // Beat zero, queued once. `armed` is keyed by the intro's own key so a
  // re-render with a fresh object cannot re-arm it, and React 19 StrictMode's
  // double invoke plays it once.
  const armed = useRef<string | null>(null)
  useLayoutEffect(() => {
    if (!intro || armed.current === intro.key) return
    armed.current = intro.key
    if (reduced) return
    queue.current.unshift({
      key: intro.key,
      base: intro.shadow ?? latest.current.live,
      exclusive: true,
      run: intro.run,
    })
    void drain()
  }, [intro, reduced, drain])
```

The intro publishes its shadow as it goes, so the running beat's `base` is not
what the board renders during it — the shadow it publishes is. Change the
returned shadow to prefer the intro's live one:

```ts
    shadow: (running?.exclusive ? intro?.shadow : null) ?? running?.base ?? null,
```

- [ ] **Step 4: Hand the intro over as a beat**

In `useDealIntro.ts`:

1. Delete the `useLayoutEffect` that watches `reduced` (lines 191–193) — the queue owns that check now, and `run` is simply never called under reduced motion.
2. Delete the arming `useLayoutEffect`'s reduced-motion branch (lines 228–231) for the same reason.
3. Extract the body of the arming effect into a `run` the queue calls. Keep `runId`, `reported`, `finish`, the resize listener and every beat constant exactly as they are; only the trigger changes from an effect to a call.
4. Return the beat alongside what the hook already returns:

```ts
  const beat = useMemo<IntroBeat | null>(
    () => (gameKey == null ? null : { key: gameKey, shadow, run: runAll }),
    [gameKey, shadow, runAll],
  )
```

Keep `active`, `staged`, `overlays`, `finish`, `gapAt`, `gapSize` and `faceDown` on the return: the board still reads all of them, and the skip (`Escape`, a table click) still calls `finish` — the intro keeps its own skip because it runs for seconds and nothing competes for the keys.

- [ ] **Step 5: Rewire the board**

In `_Board.tsx`, hand the beat to the queue and drop the separate gate:

```ts
  const beats = useBeats({
    live,
    events: intro?.events ?? [],
    anchors,
    enabled: intro != null ? introOver : true,
    intro: deal.beat,
  })
```

- [ ] **Step 6: Run the regression net**

Run: `pnpm --filter @release/web test`
Expected: PASS — every existing intro suite included, unedited. If `boardIntro.test.tsx` fails, the promotion changed behaviour and the change is wrong, not the test.

- [ ] **Step 7: Full check and commit**

Run: `pnpm -r typecheck && pnpm lint`

```bash
git add apps/frontend/src
git commit -m "refactor(web): the opening becomes the queue's first beat (#96)"
```

---

### Task 7: the register, the recipe, the reference rows

The findings and the open question are the part of this issue that must not end up only in a commit message. Two places, one finding, on purpose: the audit page is where the work is looked at, the backlog is where it can be acted on.

**Files:**
- Modify: `docs/animations/backlog.md`, `docs/animations/recipes.md`, `docs/animations/reference.md`
- Modify: `apps/playground/stories/AnimationAuditStory/AnimationAuditStory.tsx`
- Delete: the stray `packages/table-adapter/` directory (untracked; `rm -rf`, nothing to commit)

**Interfaces:**
- Consumes: nothing. Produces: nothing importable. The docs test from Task 1 is what makes the `reference.md` rows non-optional.

- [ ] **Step 1: Remove the leftover package directory**

`packages/table-adapter` was deleted in `2c480e8`; only an untracked `node_modules/` remains on disk. Confirm, then remove:

```bash
git ls-files packages/table-adapter
```

Expected: no output (nothing tracked).

```bash
rm -rf packages/table-adapter
```

- [ ] **Step 2: Add the three backlog entries**

Append to `docs/animations/backlog.md`, in the file's own entry format:

```markdown
### `placed` — это не «карта сыграна в центр»

**Что не хватает.** Рецепт «Playing a card» и задача #96 называют парой `placed` → `discarded`
движение «из руки в центр и дальше в сброс». У события `placed` два производителя —
`fake/release.ts:177` и `fake/triggers.ts:298` — и оба кладут **Monitoring в зону релиза**, где
карта и остаётся. Центра стола в `PlayerView` нет вовсе: `decks` несёт `piles` / `events` /
`discardTop` / `discardCount` и ничего больше.

**Чем грозит.** Хореография, написанная под несуществующую последовательность. #96 успел поймать
это до кода — следующая задача может не успеть и получить сцену, которая никогда не проигрывается,
без единой ошибки в консоли.

**Что закроет.** Решение о том, ЧТО показывает центр стола в живой партии: сыгранная атака, пока
открыто окно защиты, — самый вероятный кандидат, но это решение, а не работа. До него рецепт
исправлен так, чтобы называть события, которые движок действительно шлёт.

**Статус.** `открыто`.

### Потраченные атака и защита уходят в сброс молча

**Что не хватает.** `fake/attacks.ts` отправляет потраченные карты в сброс через `bankToDiscard` —
прямой записью в `decks.discard`. Причины `attackSpent` и `defenceSpent` объявлены в
`DiscardReason` (`events.ts:61`) и **не отправляются никогда**. Лента событий описывает сброс
не полностью.

**Чем грозит.** Всё, что выводится из ленты, отстаёт от `discardCount`. Куча сброса на борде
собирается именно из ленты (`toBoardState`), а `Pile` перестаёт показывать `topCard`, как только
куча непуста, — без обхода игрок видел бы верхом сброса устаревшую карту.

**Что закроет.** Движок шлёт `discarded` с уже объявленными причинами при банковании. Это правка в
`packages/engine`, не в анимациях.

**Статус.** `времянка` — если верх кучи не совпал с `discardTop` проекции, настоящий верх
дописывается в кучу отдельной картой (`toBoardState.toDiscardHeap`). Счётчик при этом остаётся
проекционным, то есть число верное всегда; врёт только глубина кучи.

### Что делает такт, если цели уже нет

**Что не хватает.** Карта, которую более позднее событие того же батча убрало с доски, — правила
для неё нет. Такт не может её измерить: слота, из которого она летит, на экране уже не существует.

**Чем грозит.** Любой локальный ответ станет правилом: по нему напишут код, его закрепит тест, и
следующая сцена будет сверяться с ним как с решённым.

**Что закроет.** Решение, а не выдумка. До него `planBeats` просто не строит полёт для карты без
источника — ровно как для события, у которого хореографии нет вообще. Это самый узкий из возможных
вариантов: анимации нет, исход прежний (карта в сбросе по проекции).

**Статус.** `открыто`.
```

- [ ] **Step 3: Add the matching rows to the audit page**

In `apps/playground/stories/AnimationAuditStory/AnimationAuditStory.tsx`, add three entries to the `ISSUES` array (statuses `open`, `времянка` → use `'rework'`, `open` — the `Status` union has no `времянка`, and `rework` is "code exists but needs work", which is what a stopgap is). Each needs `what` / `problem` / `where` / `status`, bilingual, in the register's existing voice.

Also update the existing `useDiscardExit` sentence in the `ISSUES` entry at line ~630: it says the step "stays in the playground for now — it has one consumer, and it moves the day a second appears". Replace that clause in both `ru` and `en` with the fact — it had ten, and it moved in #96.

Add one `MODULES` row for the promoted step's new home, and one `SCENARIOS` row for the live board's discard.

- [ ] **Step 4: Correct the "Playing a card" recipe and add the live one**

In `docs/animations/recipes.md`, add a note directly under the "Playing a card — hand/opponent → center → discard" heading:

```markdown
> **The engine does not emit this pair.** `placed` is a Monitoring protection landing in the
> release zone (`fake/release.ts:177`), and a card spent on an attack reaches the discard with no
> event at all. This recipe stays as the description of the *movement*, which is real and shown in
> `CardPlayStory`; what it is **not** is a mapping from engine events. See
> [`backlog.md`](./backlog.md) and the live-board recipe below.
```

Then add a new recipe, "A card leaves the hand for the discard (live board)", in the file's established shape: when to call, visual result, elements/refs, sequence, params & timings, invariants, end state, building blocks, live reference. Its content is Tasks 3–5: `planBeats` folds the batch, the shadow is the pre-batch projection, the source is a hand slot / release slot / seat box, the scatter is `scatterAt(eventId)` and is shared with the heap (I7), and the whole thing collapses under reduced motion.

- [ ] **Step 5: Add the layer's rows to the reference**

In `docs/animations/reference.md`, add a section after "The movement steps, and the carrier under them":

```markdown
## The board's layer — anchors and the beat queue

These live in `apps/frontend`, not in `@release/ui`: they are how the *board* wires engine events to
the vocabulary, and the kit has no notion of an engine. Listed here because the vocabulary is
useless without knowing what calls it.

| Name | Signature | What it does |
|---|---|---|
| `BoardAnchors` | `useBoardAnchors()` → the registry | every node a flight aims at or leaves from: the HUD blocks, `deckBox`, `discardBox`, `centre`, `hand`, plus `seatBox(player)` (a card box on a seat, I6), `handSlotAt(index)` and `releaseSlot(player, slot)`. A DOM registry only — it holds no game state |
| `planBeats` | `planBeats(events, before)` → `BeatPlan[]` | a batch of engine events becomes movements, read against the projection still on screen. An event with no choreography yields nothing and passes through |
| `useBeats` | `useBeats({ live, events, anchors, enabled, intro })` → `{ shadow, overlays, exclusive }` | the queue: one beat at a time, the board renders `shadow` while one runs, and `shadow` is dropped on drain so the board can never be stranded. The single place `prefers-reduced-motion` is checked |
```

- [ ] **Step 6: Verify the docs test still holds and commit**

Run: `pnpm --filter @release/ui test -- docs && pnpm --filter @release/web test && pnpm -r typecheck && pnpm lint`
Expected: all pass.

```bash
git add docs/animations apps/playground/stories/AnimationAuditStory
git commit -m "docs(animations): the layer's rows, the live discard recipe, and three findings (#96)"
```

---

## Self-review

**Spec coverage.** §1 → Task 1. §2 → Task 3. §3 → Tasks 4, 5, 6. §4 → Tasks 4, 5. §5 → Tasks 1, 3, 4, 5. §6 → Task 2. §7 → tests inside each task. §8 → Task 7. §9 → Tasks 1 and 7. The already-done bullets → Task 7 Step 1 (`table-adapter`) and the branch's existing history (`useFlyer` / `useHandArrival`).

**Type consistency.** `BoardAnchors` is produced in Task 3 and consumed by name in Tasks 5 and 6. `BeatPlan` / `DiscardCard` / `DiscardSource` are produced in Task 4 and consumed in Task 5. `IntroBeat` is produced in Task 6 and used in the same task only. `scatterAt(eventId)` is the key in both Task 2's fold and Task 5's flight — that identity is the point, and it is asserted from both sides.

**Known soft spots, called out rather than hidden.**
- Task 5's tests mock `@release/ui/animations`' `useDiscardExit`. That is deliberate — jsdom has no WAAPI and no layout, so a real flight would assert nothing — but it means the queue's *wiring* is tested and the flight itself is verified in the playground, per the "verify live" rule in `docs/animations/README.md`.
- Task 6 is the one task that edits code shipped two commits ago. Its acceptance is the unedited #89 suites passing.
