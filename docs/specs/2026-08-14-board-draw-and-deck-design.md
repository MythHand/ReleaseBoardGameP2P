# Draw and deck animations on the board

> **Изменилось после этой волны (сверено 22.08.2026).** Документ описывает состояние на момент своей
> задачи и не переписывается задним числом — здесь только то, что с тех пор стало иначе:
> - **Пункт 3 (холд триггера) получил источник:** сцена-пример — `AI cards`, `TABLE_HOLD = 2600`
>   (у Галлюцинации вдвое дольше). `AI_HOLD = 4000` в `Draw card` — число другой сцены, её предмет
>   колоды добора; борду осталось перенести значение.
> - **Пункт 4 (рампа ширины стопки) снят:** ширина одна, `PILE_WIDTH = 150`. Рампа 150 / 120 / 100
>   не была утверждена ни одной сценой и удалена вместе со своей записью в бэклоге.

Issue: [#97](https://github.com/MythHand/ReleaseBoardGameP2P/issues/97), sub-task of
[#88](https://github.com/MythHand/ReleaseBoardGameP2P/issues/88). **Wave 1** — it stands on the
board animation layer from [#96](https://github.com/MythHand/ReleaseBoardGameP2P/issues/96) and
branches from it.

## The goal

Drawing happens on every single turn, and the deck is the object every other animation flies out of
or into. Two approved playground scenes define the movement —
[`DrawCardStory`](../../apps/playground/stories/interactive/DrawCardStory.tsx) and
[`DeckAnimationsStory`](../../apps/playground/stories/interactive/DeckAnimationsStory.tsx) — and
this task makes the board play them from engine events instead of from a demo button.

Every preset either scene needs already exists in
[`apps/ui/src/animations/presets.ts`](../../apps/ui/src/animations/presets.ts): `drawToCenter`,
`dealToSeat`, `flipCard`, `gatherToDeck`, `flyFrom`, `absorbToDeck`. This task adds **no preset**
and no exported step — what it adds is beat kinds, which is what #88 means by "at most one new
module per task".

---

## What the issue asked for, and what the code actually says

### An opponent's ordinary draw reaches this peer as nothing at all

The issue states: *"`drawn` omits `card` when the drawer is somebody else, which is exactly the
face-down branch — the projection is already the right shape for this."*

It is not. [`fake/reduce.ts:112-128`](../../packages/engine/src/fake/reduce.ts) emits two different
shapes, and neither is the one described:

| what was drawn | event |
|---|---|
| a trigger | `drawn { player, pile, deckSize }` — **public**, no `card` |
| an ordinary card | `drawn { player, card, pile, deckSize, visibleTo: [drawer] }` |

`visibleTo` is an audience, and
[`network/session/audience.ts`](../../apps/frontend/src/network/session/audience.ts) honours it by
**dropping the whole event** for everyone else. So an opponent's ordinary draw produces no event
this peer ever receives — only a projection in which their `handCount` has ticked up. The
`dealToSeat` branch has nothing to fire on.

The field conflates two facts that are not the same: the drawn card's **identity** is secret, but
the **fact of the draw** is not — at a table everyone watches a card being taken. §3 separates
them.

### A card-less `drawn` is not ambiguous, and the trigger is nameable

The corollary is better than the issue assumed. `fireTrigger`
([`triggers.ts:123,139`](../../packages/engine/src/fake/triggers.ts)) emits a public `revealed` or
`aiRevealed` immediately after the card-less `drawn`, in the same batch. So the board never has to
guess between "somebody drew" and "a trigger came up": the next event decides, and it names the
card.

### Split piles are reachable today; the board cannot show them

The issue says *"`GameState.decks.main` is already `CardInstance[][]`, so split-pile rendering needs
no state-shape change"*. True of the engine, not of the board.
[`toBoardState.ts`](../../apps/frontend/src/entities/game/board/toBoardState.ts) flattens it —
`main: view.decks.piles.reduce((a, b) => a + b, 0)`, under the comment *"The kit renders one deck;
split piles are #61's problem"*.

Meanwhile `operation-git-branch` and `operation-git-merge` are already wired in
[`release.ts:137-146`](../../packages/engine/src/fake/release.ts) and emit `pilesChanged`. A split
can happen in a real game **now**; the board renders the sum of the halves as one pile, and a player
has no second pile to aim Git Branch at. So this task carries a shape change and a layout, not only
a movement (§4).

---

## Architecture

### 1. The batch is walked in order

[`planBeats`](../../apps/frontend/src/features/board-beats/planBeats.ts) becomes an ordered walk
producing a union of plans instead of a single `discard` kind. Order is not a nicety: a refill emits
`deckReshuffled` **before** the `drawn` it enabled, and `pruneEmptyPiles` emits `pilesChanged`
**after** the sequence ends, so one draw action can arrive as
`[deckReshuffled, drawn, drawn, pilesChanged]`. Playing those in any other order shows a card drawn
from a pile that has not been refilled yet.

```ts
export type BeatPlan =
  | { kind: 'draw'; key: string; draws: PlannedDraw[] }
  | { kind: 'discard'; key: string; cards: DiscardCard[] }
  | { kind: 'reshuffle'; key: string; cards: number }
  | { kind: 'piles'; key: string; steps: PileStep[] }
```

Consecutive `discarded` events coalesce into one beat, as they do today — a hand-limit discard of
three still reads as one gesture — but a run may not swallow a discard sitting on the far side of a
draw.

`planBeats` stays pure and stays planned against `before`, the projection the board is still
showing (I1). Nothing in this task changes that.

### 2. The draw beat

One beat per batch, running the batch's draws as a series — the scene's `drawOne` loop, driven by
events. `drawToCenter` (480 / EASE) takes a face-down card from the pile the event names
(`e.pile`) to the centre, then branches:

| what the peer received | branch |
|---|---|
| `drawn` **with** `card` | mine → `flipCard`, then `useHandArrival` sits it into the fan |
| `drawn` **without** `card`, no reveal follows | someone else's → `dealToSeat` into `cardBoxIn(seatRect, ×0.7)`, no upward scale, stays face down |
| `drawn` followed by `revealed` / `aiRevealed` | a trigger → `flipCard` at the centre, revealed for everyone, held |

**The trigger's exit is in scope, and forced.** `fireTrigger` emits
`discarded { reason: 'trigger' }` in the same batch for both triggers, so a card left standing at
the centre would contradict a projection that has already filed it. Reveal, hold and exit therefore
all happen **inside the draw beat**: the flyer stays pinned at the centre (I4) through the hold,
then `useDiscardExit` takes it from where it stands. There is no cross-beat handover and no centre
state — the discard planner simply skips a `discarded` the draw beat has claimed.

What later waves add on top: #102 the 503 glow and the defence exchange, #106 the AI effect's own
draw from the events deck and its return. Neither is here.

**The series does not need its own break.** The issue describes an unresolved trigger breaking a
multi-draw. The engine already does it — `runDrawSequence` returns the moment a trigger raises a
`pending` ([`reduce.ts:132`](../../packages/engine/src/fake/reduce.ts)) and holds the rest in
`drawing`. The remaining draws arrive in a later batch, as a later beat. The board does not
re-implement the rule; it plays what it is sent.

### 3. `drawn` becomes public, and the engine owns the redaction

`reduce.ts:125` drops `visibleTo: [owed.player]` from the ordinary draw. To keep the card's identity
secret, `@release/engine` exports:

```ts
export function redactFor(event: Event, viewerId: PlayerId): Event
```

which strips `card` from a `drawn` whose `player` is not the viewer, and returns every other event
untouched. `forViewer` filters on `visibleTo` exactly as it does now, then maps the survivors
through `redactFor`.

This placement is the point. `audience.ts` says of itself that it reads `visibleTo` and *"never
re-derives the answer from an event's payload"*, and that stays literally true: the engine remains
the only party that knows which secrets exist, and the network layer applies a rule it is handed
rather than one it invents.

**Consequence, accepted deliberately:** an opponent's draw now reaches this peer's move history.
`cardTextOf` already returns `undefined` when `card` is absent, so it renders as a nameless "drew"
line where today nothing appears. It is truthful, it is what makes the seat animation possible, and
it costs no code.

### 4. Multiple piles: shape, layout, anchors

**Shape.** `decks.main: number` → `number[]`, one entry per pile.
[`contract.test-d.ts`](../../apps/frontend/src/entities/game/board/contract.test-d.ts) asserts
`BoardState` and the kit's `TableState` are mutually assignable, so the same change lands in
[`apps/ui/src/table/Table/types.ts`](../../apps/ui/src/table/Table/types.ts) and the kit's `Table`
renders the row too. Otherwise the contract test fails and the playground's Table story drifts from
the board it is the source for. `toBoardState` stops summing and passes `view.decks.piles` through —
which is what the projection always had.

**Layout.** The main piles become a horizontal row where the single deck sits now; the events pile
stays beneath it, so the left column reads `[row of draw piles] / [events]`. The board's
`.deckStack` is a vertical column today ([`_Board.module.css:37`](../../apps/frontend/src/pages/board/[gameId]/_Board.module.css)),
and Git Branch **+ Sudo** can put three main piles on the table — three 150px piles plus events
would run off a vertically-centred column. Width ramps down with the count (150 at one, ~120 at two,
~100 at three or more); the exact ramp is settled against the playground, not argued here (§8).

**Anchors.** `BoardAnchors` gains `pileBox(index)` — a draw flies out of the pile its event names,
not out of "the deck". `deckBox` stays as pile 0's box, so the deal intro's aim is unchanged.

**The centre gets mounted for the whole match.** It sits inside `{intro && …}` today because the
deal is its only user. Every draw stages there, so it moves out of that guard and stays an empty,
`pointer-events: none` box the rest of the time — nothing renders in it, because a staged card is
always a flyer.

### 5. The deck beat

**`deckReshuffled`** — gather the scattered heap into a pile, `gatherToDeck` centre-to-centre onto
the pile spot, `flipCard` face down on landing. Reachable in real games since
[#79](https://github.com/MythHand/ReleaseBoardGameP2P/issues/79) made `refillFromDiscard` fire.

**`pilesChanged`** — classified against the pile counts the shadow still holds:

| before → after | operation | movement |
|---|---|---|
| `before[i] === after[i] + after[i+1]`, length +1 | split at `i` | `flyFrom` FLIP: the new pile is already in its DOM place and animates *from* the source pile's rect |
| `after.length === 1`, sum preserved | merge | every other pile runs `absorbToDeck` in parallel into the survivor's rect, measured once |
| a pile appended at the end, discard emptied | Git Branch + Sudo's second step | the reshuffle movement, into the new pile's spot |
| `after` is `before` minus its zeros | prune | nothing plays — an empty pile ceasing to exist has nothing to move |

Git Branch + Sudo emits **two** `pilesChanged` in one batch, so a `piles` plan carries a list of
steps and each is classified against the running shadow, not against `before`.

The engine's own event names none of this (§8). The derivation above is deterministic rather than
inferred, and it is written down here and in the recipe so the next reader does not re-derive it.

### 6. A beat can publish an advancing shadow

The one addition to #96's layer. Today a `Beat` carries a fixed `base` and the board renders it for
the beat's whole life; `IntroBeat` is the exception that publishes its own `shadow`. That exception
generalizes: a runner receives a `publish(state)` callback.

Two things need it, and neither is optional:

- **I8, multi-draw.** The fan grows during a batch. Every card after the first must aim at the fan
  the previous one left behind, so the shadow's hand has to grow as each card lands.
- **A split.** `flyFrom` measures the new pile in its final DOM place, so that pile must exist in
  the rendered state before the flight is armed.

The queue's guarantees are untouched: the shadow's lifetime is still the queue's, it is still
dropped when the queue drains, and the last frame of a beat is still the projection it hands over
to.

### 7. Where the pieces sit

| file | what it owns |
|---|---|
| `features/board-beats/useBeats.ts` | queue, watermark, shadow (now publishable), reduced-motion policy, exclusivity. Stops knowing what any beat *is*. |
| `features/board-beats/planBeats.ts` | the ordered walk, the plan union, the existing `sourceOf` for discards |
| `features/board-beats/drawBeat.tsx` | `useFlyer` + `useHandArrival` + `useDiscardExit`; the three branches and the trigger's hold |
| `features/board-beats/deckBeat.tsx` | `useFlyer`; reshuffle, split, merge |
| `features/board-beats/discardBeat.tsx` | today's runner, lifted out of `useBeats` unchanged |

Each runner is a hook returning `{ overlay, run }` and owns the carriers it needs — the same way
every playground scene wires its own. `useBeats` concatenates the overlays.

The alternative was to branch inside `useBeats`. It is 271 lines of carefully-reasoned queue; four
beat kinds and three carrier hooks would roughly double it, and the file that most needs to stay
readable would become the one holding every choreography.

### 8. Reduced motion

Nothing new. The queue collapses every beat to its end state, and the end state is the projection
the board already holds. `play()` still does not check the preference, and still does not have to —
the policy lives in one place, which is why it was put there.

---

## 9. Tests

| what | where |
|---|---|
| ordering across a mixed batch; discard runs coalescing without crossing a draw; the three draw branches chosen from event shape alone; the trigger claiming its own `discarded`; split/merge/prune classification | `planBeats.test.ts` |
| the multi-draw fan (I8) against a **real DOM probe**, not a stub — #96 learned that a detached node measures the same whether or not the shadow was waited for | `useBeats.test.tsx` |
| `pileBox(index)` | `anchors.test.tsx` |
| `view.decks.piles` passed through, no longer summed | `toBoardState.test.ts` |
| N piles rendered in the row | `board.test.tsx` |
| kit and board agree on `main: number[]` | `contract.test-d.ts` (compile time) |
| `redactFor` strips `card` for a non-drawer and nothing else | `packages/engine` |
| the ordinary `drawn` is public | `fake/reduce` test |
| `forViewer` delegates rather than re-deriving | `audience` test |

---

## 10. What goes to the register, not into the code

Per #88's standing rule, each of these lands in the audit page's register **and** in
[`docs/animations/backlog.md`](../animations/backlog.md):

1. **`drawn` was private for ordinary draws**, so an opponent's draw was unanimatable — the finding
   and the resolution this task ships (§3), because the next person to read the issue's premise
   should find the correction next to it.
2. **`pilesChanged` names neither its operation nor the split index.** The positional derivation in
   §5 is written out. The event could carry the answer instead; that is an engine decision, not one
   to take inside an animation task.
3. **The trigger's hold at the centre has no approved duration.** `DrawCardStory` uses
   `AI_HOLD = 4000` for the AI branch; a plain reveal has no source at all. Recorded for
   [#84](https://github.com/MythHand/ReleaseBoardGameP2P/issues/84)'s timings pass.
4. **The pile-width ramp has no approved value above one pile.** The playground scene lays its piles
   out at a fixed 150 in a row that never has to share the table with a hand and a dock.

---

## 11. Documentation

- [`docs/animations/recipes.md`](../animations/recipes.md) — two live-board recipes in the schema
  #96 established: "A card is drawn" and "The deck is rebuilt, split, merged".
- [`docs/animations/reference.md`](../animations/reference.md) — rows for the new beat kinds beside
  the layer's own.
- [`AnimationAuditStory`](../../apps/playground/stories/AnimationAuditStory/AnimationAuditStory.tsx)
  — statuses for the two scenes, and the four findings above in the register.

No new preset and no new exported step, so
[`docs.test.ts`](../../apps/ui/src/animations/docs.test.ts) stays green on its own terms.

---

## Out of scope

- **The 503 exchange** — the red `EdgeGlow`, the defence window, the neutralize prompt's
  choreography. [#102](https://github.com/MythHand/ReleaseBoardGameP2P/issues/102).
- **The AI effect** — drawing the event card from the AI deck, the table hold, `returnToDeck`.
  [#106](https://github.com/MythHand/ReleaseBoardGameP2P/issues/106).
- **The cards that cause a split or a merge** — Git Branch and Git Merge as playable choreography,
  including aiming at a pile. [#108](https://github.com/MythHand/ReleaseBoardGameP2P/issues/108),
  gated on [#61](https://github.com/MythHand/ReleaseBoardGameP2P/issues/61). This task ports the
  movement; the card that triggers it arrives later and reuses it.
- **Timings across scenes.** [#84](https://github.com/MythHand/ReleaseBoardGameP2P/issues/84).
