# Board animation layer + the first card play

Issue: [#96](https://github.com/MythHand/ReleaseBoardGameP2P/issues/96), sub-task of
[#88](https://github.com/MythHand/ReleaseBoardGameP2P/issues/88). **Wave 0 — it blocks every other
animation sub-task.**

## The goal

The board animates nothing today except the deal intro. Before any further scene can be ported, the
machinery every scene stands on has to have one home — and it has to be proven by a real consumer,
not shipped speculatively. So this lands the layer **plus one live choreography**: a card leaving a
hand for the discard.

---

## What the issue asked for, and what the code actually says

Two of the issue's premises do not survive contact with the engine. Neither is worked around
quietly; both become entries in the register (§8).

### `placed` is not "a card played to the centre"

The issue names `placed` → `discarded` as the first consumer. It has exactly two producers —
[`fake/release.ts:177`](../../packages/engine/src/fake/release.ts) and
[`fake/triggers.ts:298`](../../packages/engine/src/fake/triggers.ts) — and both put a
**Monitoring protection into the release zone**, where it stays. There is no table centre in
`PlayerView` at all: `decks` carries `piles` / `events` / `discardTop` / `discardCount` and nothing
else. The sequence the issue describes never occurs.

### Attack and defence cards reach the discard with no event

[`fake/attacks.ts`](../../packages/engine/src/fake/attacks.ts) banks spent cards through
`bankToDiscard`, which appends to `decks.discard` directly. `attackSpent` and `defenceSpent` are
declared in `DiscardReason` ([`events.ts:61`](../../packages/engine/src/events.ts)) and **never
emitted**. So the event feed under-describes the discard, and anything derived from it runs behind
`discardCount`. This is why §6 carries a stopgap rather than a clean derivation.

### What is already done

Two of the issue's bullets are closed by verification, not by work, and the spec says so rather
than pretending otherwise:

- `useFlyer` and `useHandArrival` were promoted to `apps/ui/src/animations/` in `a07548d`. The
  frontend's forked pair is already gone; `useDealIntro` already imports the shared ones.
- `packages/table-adapter` was deleted in `2c480e8`. Only an untracked `node_modules/` remains on
  disk — `rm -rf`, nothing to commit, nothing in `pnpm-lock.yaml`.

The one step that really is still forked is `useDiscardExit`, and the "it has one consumer" line in
[`reference.md:108`](../animations/reference.md) is stale: **ten** playground scenes import it.

---

## Architecture

### 1. `useDiscardExit` moves into `@release/ui/animations`

`apps/playground/stories/interactive/useDiscardExit.tsx` and its `.module.css` move to
`apps/ui/src/animations/`. Inside `apps/ui` the step reaches for leaf modules (`./scatter`,
`./timing`, `./play`) rather than the `@/animations` barrel — the same shape `useFlyer` already has,
which keeps the barrel free to carry the steps while the steps render components.
`useDiscardExit` and `type Leaving` are exported from `apps/ui/src/animations/index.ts`.

All ten playground consumers repoint to `@/animations`, and the playground copy is deleted. The
scenes stop being the definition and become consumers like everything else:

`CardPlayStory` · `HandLimitStory` · `ComboStory` · `Error503Story` · `AiCardsStory` ·
`DefenseReleaseStory` · `DeckAnimationsStory` · `DrawCardStory` · `GitCards/SystemUpgrade` ·
`GitCards/CherryPick`

The rule the step holds — cards leave one by one but all at once, a pair splits into two singles,
one scatter drives both a card's flight and its rest (I7), the tilt unwinds in flight, the table
layer decides heap order (I9) — travels with the code rather than with the story files.

### 2. `BoardAnchors` — one anchor registry for the board

`IntroRefs` in `useDealIntro.ts` is already most of the registry every flight needs. It is
generalized into `BoardAnchors`, owned by `_Board.tsx` through a new
`_useBoardAnchors.ts`, and the intro becomes one consumer of it.

It keeps what it has (`rail`, `bg`, `decks`, `discard`, `seats`, `dock`, `zone`, `deckBox`,
`centre`, `hand`, `seatOf`) and gains what a discard aims from:

| Anchor | Resolves to | Why it is load-bearing now |
|---|---|---|
| `handSlot(uid)` | the `[data-hand-slot]` element for a hand card | the local player's discard leaves from its own slot |
| `seatBox(player)` | `cardBoxIn(seatRect, CARD_W)` | an opponent's discard leaves from a card-sized box on the seat, not from the whole seat (**I6**) |
| `releaseSlot(player, slot)` | the release-zone slot node | a `destroyed` / `neutralized` card leaves a release slot, the player's own or an opponent's |
| `discardBox` | the discard `Pile`'s box | the destination every exit aims at |

Nothing new has to be built in `@release/ui` for these: `Pile` already takes `boxRef`,
`ReleaseZone` already exposes `slotRef`, and `Seat` already forwards `slotRef` into the release zone
it renders. The board just has to wire them.

**No AI deck cell.** The issue lists it, but nothing in this task aims at it. A speculative anchor
is a claim of coverage nobody has tested; it arrives with the first beat that draws an event card.

### 3. The sequencer — `features/board-beats/`

`useGame.ts` accumulates engine events off the wire in batches, and a peer can receive several moves
in one sync. #89 solved ordering for the intro alone. Live play needs a queue.

```ts
interface Beat {
  key: string
  exclusive?: boolean                      // input is dead while it runs
  apply: (s: BoardState) => BoardState     // fold this beat's effect into the shadow
  run: (ctx: BeatCtx) => Promise<void>     // the movement
  shadow?: BoardState | null               // a beat that publishes its own (the intro)
}
```

| File | Responsibility |
|---|---|
| `planBeats.ts` | pure: `(events, view) => Beat[]`. An event with no choreography yields nothing and passes through instantly |
| `useBeats.ts` | the queue, the shadow, the policy, the input gate |
| `beats/discard.ts` | the `discarded` beat — its plan, its fold, its run |

`useBeats` is mounted in `_Board.tsx`, beside `useDealIntro` and for the same reason: it aims at
`BoardAnchors`, which only the board owns. The route (`_layout.tsx`) keeps handing the board a
projection and an event feed and learns nothing about beats.

**Only the intro is `exclusive`.** It owns the table — nobody is on turn, the dock stands in its
waiting state, and `INERT_ACTIONS` holds every gesture off, exactly as today. A discard beat is not:
a card flying to the heap is a thing that happened, not a thing being decided, and freezing the hand
for 420 ms every time one leaves would read as lag rather than as safety (`README.md`, "Gating the
hand while something plays out" — approach 3).

**The shadow base is the projection as it stood before the batch.** That is what makes a source
rect measurable: a hand slot or a release slot still exists on screen when the beat measures it
(**I1**). Each beat's `apply` advances the shadow one step as it lands; when the queue drains the
shadow is dropped and the board renders live again.

**Never stranded.** Live wins unconditionally on drain — a beat that threw, a fold that was wrong,
or a target that vanished cannot leave the board behind the projection, because the shadow's
lifetime is the queue's and nothing else. The pinning test generalizes `59da3b8`: once the queue
drains, the fields the beats touched equal the live projection's own.

**One policy, one place.** `useReducedMotion` is read here and nowhere else in the animation path.
When it is true `run` is never called: every `apply` fires and the queue drains in a single commit.
`play()` in `@release/ui` drives WAAPI directly and does not check the preference, which is exactly
why the check lives in one place instead of in every consumer.

**No skip for live beats.** `Escape` and a table click both already cancel an in-flight target
selection ([`_Board.tsx:290`](../../apps/frontend/src/pages/board/[gameId]/_Board.tsx),
[`:315`](../../apps/frontend/src/pages/board/[gameId]/_Board.tsx)). A discard flight is 420 ms plus
its hold; an affordance to cut that short would have to win a fight against a gesture the player
actually started. Reduced motion stays the one way to collapse. The intro keeps its own skip — it
runs for seconds and nothing competes for the keys while it does.

**The intro is beat zero.** Its shadow is not a fold of the projection but a whole shape, so a beat
may publish its own and `useDealIntro` does. Its choreography, its beat timings
(`RAIL_MS`…`REVEAL_HOLD`) and its tests are untouched; only the run / cancel / skip /
reduced-motion plumbing moves out to the queue. `boardIntro.test.tsx`, `useDealIntro.test.tsx` and
`useDealIntroMotion.test.tsx` are the regression net for the move, unchanged.

### 4. The discard beat — the first consumer

Every `discarded` in one batch goes out in a single `send()`. That is the step's own rule, and it is
also what makes a `handLimit` discard of three cards read as one gesture rather than three.

| The event says | The card flies from |
|---|---|
| `player === selfId`, reason `releaseCost` / `handLimit` / `effect` / `trigger` | `handSlot(uid)` |
| reason `destroyed` / `neutralized` | `releaseSlot(player, slot)` |
| any other player | `seatBox(player)` |

Each card's scatter is `scatterAt(String(e.id))` — deterministic, so the flight and the rest read
the same value (**I7**) and every peer's heap agrees. The destination is the discard box; the step
trims it to the card area itself (`cardAreaOf`, **I6**).

`discarded` carries `card: CardId`, not a uid, so the local player's source slot is resolved by
matching the card id against the pre-batch hand. Two copies of one card id in hand are
interchangeable on screen, so the first match is correct, not merely adequate.

### 5. Where the pieces sit

```
apps/ui/src/animations/
  useDiscardExit.tsx  .module.css      moved in, exported from the barrel

apps/frontend/src/pages/board/[gameId]/
  _useBoardAnchors.ts                  BoardAnchors, owned by _Board.tsx

apps/frontend/src/features/board-beats/
  planBeats.ts   useBeats.ts   beats/discard.ts

apps/frontend/src/features/game-intro/
  useDealIntro.ts                      takes BoardAnchors; hands itself over as beat zero
```

---

## 6. The heap, and the hole under it

`toBoardState` grows `discardHeap` by folding the visible `discarded` events in order into
`{ card, ...scatterAt(String(e.id)) }`, capped at `HEAP_SHOW`. Deterministic by event id, so it is
stable across re-renders and identical on every peer — and the same value the beat flies on, which
is what makes the landing frame the resting frame.

Then the hole. Because attack and defence spend emits no event, the derived heap runs behind
`discardCount`, and `Pile` ignores `topCard` once a heap is present (`const cards = heap ?? []`) —
so the true top card would stop showing.

**Stopgap:** when the heap's top card id is not `view.decks.discardTop`, `discardTop` is appended as
one further entry, so the visible top is always the true top and the silent bankings read as one
card rather than as none. The counter stays `discardCount`, which is authoritative, so the number is
right even when the heap is short. This is a display reconciliation for a gap in the event model,
not a rule, and it is written down as `времянка` in the backlog with exactly that cost — it goes the
day the engine emits what it already declares.

---

## 7. Tests

| What | Where | Pins |
|---|---|---|
| every exported step has a `reference.md` row | `apps/ui/src/animations/docs.test.ts` (extended) | the steps stop being looser than the presets |
| the batch → beats fold | `features/board-beats/planBeats.test.ts` | an unchoreographed event yields no beat |
| shadow equals live on drain | `features/board-beats/useBeats.test.tsx` | the board is never stranded behind the projection |
| reduced motion collapses the queue | same | `run` is never called; one commit |
| heap derivation + the `discardTop` stopgap | `entities/game/board/toBoardState.test.ts` | the visible top is the true top |
| a `discarded` batch animates, then hands over | `pages/board/[gameId]/__tests__/` | the live consumer end to end |
| the intro still plays as it did | existing #89 tests, unchanged | the promotion changed no behaviour |

---

## 8. What goes to the register, not into the code

Three findings and one open question. Each is entered **twice on purpose**: one line with a status
on the playground `Interaction audit` page, where the work is looked at, and the full form in
[`docs/animations/backlog.md`](../animations/backlog.md), where it can be acted on.

| Finding | Status |
|---|---|
| `placed` is a Monitoring landing in the release zone, not a card played to the centre. The recipe in `recipes.md` describes a movement the engine does not emit as that pair | `открыто` |
| Attack and defence spend reaches the discard with no `discarded` event; `attackSpent` / `defenceSpent` are declared and never emitted, so the feed under-describes the discard | `времянка` — the `discardTop` reconciliation in §6 |
| A beat whose target no longer exists — a card discarded by a later event in the same batch. **The issue states this is undecided, and it stays undecided**: it needs a ruling, not an invention | `открыто` |
| `useDiscardExit` had ten consumers while the docs claimed one, and it stayed in the playground on that claim | `ok` once §1 lands |

---

## 9. Documentation

- **`reference.md`** — `useDiscardExit` moves into the `@release/ui` section, its "one consumer"
  line is corrected, and the layer gains rows: `BoardAnchors` and the sequencer. The docs test is
  extended so an exported step without a row fails, the same signal presets already have.
- **`recipes.md`** — a new recipe for the live board's discard, and a correction on
  "Playing a card" naming the events the engine really emits.
- **`README.md`** — the "Shared, but living in the playground" section loses `useDiscardExit`; the
  paragraph promising it "moves the day a second consumer appears" is settled.
- **The audit page** — module row for the promoted step, a scenario row for the live discard, and
  the finding rows from §8.

---

## Out of scope

- Any beat other than `discarded`. A centre-resting play (`attacked`), a release into its slot
  (`released`), a draw, a combo — each is its own sub-task of #88 and each now has a queue to
  arrive into.
- Fixing the engine's missing discard events. It is a finding here, not a change: it belongs to the
  engine's own sweep, and inventing the events locally would put a guess in the projection.
- The AI deck anchor (§2).
- `apps/ui/src/table/Table/` and the playground's `TableStory`, which keep serving the kit's own
  screen.
