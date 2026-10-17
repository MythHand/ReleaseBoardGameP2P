# Git operations, slices 1–2 — questions and answers

**Answered.** The rules owner answered all twelve on 2026-08-02, in
[his comment on PR #77](https://github.com/MythHand/ReleaseBoardGameP2P/pull/77#issuecomment-5155258706).
Every question below is followed by his answer, how the game does it today (checked against the code
on 2026-10-07), where the rules spec states it, and — where the online game departs from the table —
how. The questions are kept as they were asked on 2026-08-01: their references to engine lines
describe the code of that day, and their references to the rules text point to its sections, so
they hold as the text is edited.

Scope of these two slices: **Git Cherry-pick**, **`ai-inside`**, **Git Branch**, **Git Merge**. Git Rebase and System Upgrade are later slices — their answers are [`2026-09-04-git-cards-rules-decisions.md`](./2026-09-04-git-cards-rules-decisions.md).

Each question carries a recommendation. Answering "recommendation" is a valid answer.

## Draw and piles

- [x] **1. What does the Base mode's draw obligation mean once the deck is split?**

  [Rules, «Добор карты»](../rules-board-game.md#добор-карты) — "Игрок обязан взять одну карту сверху основной колоды… При разделенной колоде добора карта берется из всех колод." [Rules, «Последствия Git Branch»](../rules-board-game.md#последствия-git-branch) defines Base as "Добор из всех колод" and Strategic as "Добор только из одной колоды". Today [`reduce.ts:40`](../../../packages/engine/src/fake/reduce.ts) does `action.pile ?? 0` and ignores the mode entirely.

  1. One card off the top of *each* pile — Base draws N cards for N piles; Strategic draws one, drawer picks the pile.
  2. Piles are one source — Base lets the drawer pick freely, Strategic pins them to one pile. Draw arity never changes.

  **Recommendation: 1.** The mode table only carries meaning if Base draws from all — otherwise Strategic restates Base, and Git Branch does nothing in the mode the rules call canonical.

  **With the sequencing caveat below**, which is not optional if 1 is chosen.

  **Answer.** Base draws one top card from every draw pile; Strategic chooses which pile the card
  comes from. Separate piles are separate draw sources. The owner added that the recommendation
  reached this through a wrong reading of Git Branch — the card is not a tempo accelerator — so the
  mechanical answer stands and the reasoning behind it does not.
  **In the game.** As answered: Base draws a card off every pile, Strategic one card off the pile the
  player picks.
  **In the spec.** [`modes.md`, «Последствия Git Branch»](../modes.md#последствия-git-branch--modegit);
  [`general.md` §4](../general.md#4-ход-игрока).

- [x] **2. If Base draws from every pile, is that one atomic `DRAW` or a per-pile obligation?**

  A drawn trigger fires immediately ([`reduce.ts:49`](../../../packages/engine/src/fake/reduce.ts)) and can open `pending` — Error 503 opens `neutralize503`. `GameState.pending` is a single slot. An atomic multi-pile `DRAW` whose first card is a trigger would have to draw the second card behind an open pending, which needs a pending *queue* — the same shape change System Upgrade needs, pulled three slices early.

  1. Keep `DRAW` as one card from one pile. Move the change into the obligation: `turn.hasDrawn` stops being a boolean and records which piles have been drawn from this turn. Base is satisfied when every non-empty pile has been drawn from; Strategic when any one has. `PUSH` legality, the dock's "you still owe a draw" state, and `onDraw`'s `already drew this turn` rejection all derive from that.
  2. Atomic multi-card `DRAW`, and build the pending queue now.

  **Recommendation: 1.** Single pending stays intact, the `drawn` event already carries `pile` and needs no change, and a trigger mid-sequence just opens its pending normally. The cost is that `hasDrawn` is a visible shape change through `GameState` → `PlayerView.turn` → `TableState` → the adapter assertions — a contained, known ripple.

  **Answer (together with 6).** Neither. A draw is one triggered action that runs over every existing
  pile in turn. A drawn Error 503 pauses the sequence until it is answered, then the sequence
  resumes. Playing cards from hand is impossible while a draw is in progress, as in any other phase.
  **In the game.** As answered: one press draws from every pile in turn, Error 503 stops the series
  until it is answered, and a play during the draw is refused (`a draw is in progress`).
  **In the spec.** [`general.md` §4](../general.md#4-ход-игрока);
  [`resolution.md` §8](../resolution.md#8-добор-и-триггеры).
  **Online.** At a table the player takes a card off each pile by hand; here one press runs the whole
  series. Not being able to play between two piles follows from the draw being one action.

- [x] **3. Does Git Branch split an already-split deck?**

  [Rules, «Git Branch»](../rules-board-game.md#git-branch) — "Разделите одну колоду добора (зелёную) на две." Played twice: 2 piles → 3? Unbounded? Capped?

  **Recommendation:** unbounded, N → N+1. It falls out of the rules text and `decks.main` is already an array.

  **Answer.** The player chooses which pile to split. One pile on the table splits without a
  question; with two, the player picks one and it becomes two — three in total. No limit beyond what
  the game's own mechanics impose.
  **In the game.** As answered: with one pile the card plays at once; with several the piles light up
  and the play waits for a click on one of them.
  **In the spec.** [`cards.md`, Git Branch](../cards.md#git-branch--operation-git-branch--тираж-3--sudo).

- [x] **4. Where does the split fall?**

  At a table a player cuts wherever they like. The engine has no input surface for a cut point and its randomness is seeded ([`rng.ts`](../../../packages/engine/src/rng.ts)).

  1. Even halves, deterministic.
  2. Seeded random cut point.
  3. The player picks, which needs a new pending kind and a UI surface.

  **Recommendation: 1.** Deterministic, no new surface, and the strategic content of the card is the split itself rather than where it lands.

  **Answer.** Exactly in half; an odd pile leaves one side one card larger. A pile of a single card
  does not split: nothing happens and the Git Branch card goes to the discard.
  **In the game.** As answered.
  **In the spec.** [`cards.md`, Git Branch](../cards.md#git-branch--operation-git-branch--тираж-3--sudo).
  **Online.** At a table the pile is cut wherever the hand falls; here it is always cut in half.

- [x] **5. What does sudo Git Branch do?**

  [Rules, «Git Branch»](../rules-board-game.md#git-branch) — "sudo Git Branch: **и** переверните сброс — он будет использоваться как новая колода добора, не перемешивайте карты." The "и" reads as *in addition to* the split, giving N → N+2 (one from the cut, one from the flipped discard, order preserved and reversed, unshuffled). Confirm that against *instead of* the split.

  **Answer.** It does both, independently: the split happens exactly as above, and the flipped
  discard is added as a further pile, unshuffled. One pile plus a discard becomes three piles and an
  empty discard.
  **In the game.** As answered.
  **In the spec.** [`cards.md`, Git Branch, sudo](../cards.md#git-branch--operation-git-branch--тираж-3--sudo).

- [x] **6. Does Git Merge mid-turn reset a partly-satisfied draw obligation?**

  Only live if Q1 = 1 and Q2 = 1. A player draws from pile 0, then plays Git Merge; the piles collapse to one that they have already drawn from. Do they still owe a draw?

  **Recommendation:** no — the obligation is satisfied per pile drawn from, and the surviving merged pile inherits that. Needs stating either way, because it is exactly the kind of edge the conformance fuzz stream will find.

  **Answer.** Not a case — see answer 2. No card can be played while a draw runs, so the piles cannot
  change under it.
  **In the game.** As answered: a play during a draw is refused.
  **In the spec.** [`general.md` §4](../general.md#4-ход-игрока).

- [x] **7. What happens when a pile is empty?**

  `onDraw` currently rejects with `that pile is empty` ([`reduce.ts:42`](../../../packages/engine/src/fake/reduce.ts)). Under a per-pile obligation an empty pile must be skipped rather than block the turn. Separately: what happens when *every* pile is empty — is there a reshuffle-the-discard rule, and is Git Merge the only way back?

  **Answer.** Two cases. No draw cards left anywhere: the discard is taken, shuffled, and becomes a
  single new draw pile. One of several piles runs out: that pile ceases to exist — three piles with
  the second exhausted leave two.
  **In the game.** As answered.
  **In the spec.** [`general.md` §4](../general.md#4-ход-игрока), «Колоды добора не кончаются
  насовсем»; [`resolution.md` §8](../resolution.md#колода-кончилась-во-время-добора);
  [`cards.md`, Git Merge](../cards.md#git-merge--operation-git-merge--тираж-2--sudo). The rules text
  says nothing about running out; this answer is the whole rule.

## Discard and information

- [x] **8. Is the discard pile fully public?**

  `PlayerView.decks` projects `discardTop?: CardId` and `discardCount` ([`view.ts:76`](../../../packages/engine/src/view.ts)) — the contents are not projected to anyone. Cherry-pick ([Rules, «Git Cherry-pick»](../rules-board-game.md#git-cherry-pick), "выберите одну карту из всего сброса") and `ai-inside` ([Rules, «Карты AI-эффектов»](../rules-board-game.md#карты-ai-эффектов), "возьмите одну карту Release из сброса в руку") both need the whole pile visible to the picker.

  1. Project the full discard to everyone, always. It is face-up on a real table, so this is the physical truth.
  2. Project it only to the player holding the pending.

  **Recommendation: 1.** It matches the table, and option 2 hides information the rules never hid.

  **Answer.** Open, but not browsable at will. The cards lie face up, and a player cannot page
  through the pile during ordinary play; card effects that reach into the discard bring their own
  viewing surface. [PR #78](https://github.com/MythHand/ReleaseBoardGameP2P/pull/78) carries the
  playground visualisations of those cards.
  **In the game.** As answered: the discard pile opens neither on a click nor on hover; the whole
  discard is shown only by Cherry-pick and Inside.
  **In the spec.** [`cards.md`, Git Cherry-pick](../cards.md#git-cherry-pick--operation-git-cherry-pick--тираж-3--sudo).
  **Online.** At a table the discard can be picked up and looked through; here it cannot.

- [x] **9. Does the engine model what a player knows about the deck?**

  Sudo Cherry-pick puts the second card on top of the draw deck "не показывая другим игрокам" ([Rules, «Git Cherry-pick»](../rules-board-game.md#git-cherry-pick)) — so that player knows the next card and nobody else does. Projection currently tells nobody anything about deck order. Git Rebase (a later slice) has the same problem, larger.

  1. Model it — per-player deck knowledge in the state, projected so the UI can show "you know what's on top".
  2. Don't. The card lands on top and the placer is trusted to remember, exactly as at a table.

  **Recommendation: 2 for this slice**, but the answer should be chosen with Git Rebase in mind, since Rebase makes the same demand and choosing 2 twice means the game never surfaces private deck knowledge at all.

  **Answer.** Agreed with the recommendation — this is intended, not a simplification. A card placed
  on top of the deck is known to the player who placed it and remembered by them, as at a table.
  **In the game.** As answered: nothing in the game state records who knows the top of a pile.
  **In the spec.** [`cards.md`, Git Rebase, «Знание о колоде»](../cards.md#git-rebase--operation-git-rebase--тираж-3--sudo).

- [x] **10. Which pile does sudo Cherry-pick's second card go on top of?**

  Live only when Branch has split the deck. Pile 0, or the player's choice — the latter needs the choice carried on the resolution.

  **Answer.** On top of the first pile when there are several.
  **In the game.** As answered.
  **In the spec.** [`cards.md`, Git Cherry-pick, sudo](../cards.md#git-cherry-pick--operation-git-cherry-pick--тираж-3--sudo).

- [x] **11. Cherry-pick or `ai-inside` with nothing eligible in the discard?**

  An empty discard, or — for `ai-inside`, which is restricted to Release cards — a discard holding no Release. Inert (the card is spent, nothing happens), or rejected as an illegal play?

  **Answer.** The take is skipped and the card is still playable — a legal move with consequences
  for the player who blundered, not a rejected action.
  **In the game.** As answered. Cherry-pick against a discard with nothing to take: the card is
  spent and no choice opens. Inside with no Release in the discard: nothing happens. Inside with
  exactly one Release card: it is taken without a question. Otherwise Inside lays out only the
  Release cards of the discard and the player takes one — the card itself carries its type.
  **In the spec.** [`cards.md`, Git Cherry-pick, «Невозможный выбор»](../cards.md#git-cherry-pick--operation-git-cherry-pick--тираж-3--sudo);
  [`cards.md`, Inside](../cards.md#inside--ai-inside--тираж-2).

## Reachability

- [x] **12. Do these cards enter the deck in this slice, and at what quantity?**

  [`catalogue.ts:187-229`](../../../apps/ui/src/cards/catalogue.ts) carries quantities: System Upgrade 2, Git Merge 2, Git Branch 3, Git Rebase 3, Git Cherry-pick 3. `FAKE_DECK` ([`fake/index.ts`](../../../packages/engine/src/fake/index.ts)) omits all five, and `createGame` filters anything absent from `CARD_RULES`, so adding rules without adding deck entries leaves them unreachable. Cherry-pick, Branch and Merge land in this slice; Rebase and System Upgrade do not — do the two later cards stay out of the deck until their slice, or go in inert?

  Note `conformance.ts`'s `resolvePendingAction` must gain a case for every newly reachable pending kind — a `progress` property asserts the fuzz stream never holds a pending for more than three consecutive steps, so a missing case goes red by design.

  **Answer.** The quantities exist and were not in question; the catalogue carries them.
  **In the game.** All five are in the deck: System Upgrade 2, Git Merge 2, Git Branch 3, Git
  Rebase 3, Git Cherry-pick 3.
  **In the spec.** [`cards.md`](../cards.md), in the heading of each card.

## What these answers changed in the engine

Written on 2026-08-02, before the slices were built. All five are in the engine today.

1. **The draw is no longer a single-card action.** `DRAW` becomes a triggered sequence over every pile, resumable across a pending. `turn.hasDrawn` cannot stay a boolean, and the engine gains draw-in-progress state. This is a change to the game's core loop, not to the Git operations alone, and it lands in the same slice as Git Branch because Git Branch is what makes multiple piles reachable.
2. **Playing from hand is blocked during a draw** — a legality rule that did not exist before.
3. **Git Branch needs a pile target**, so `Action.PLAY`'s `Target` union gains a pile variant.
4. **The single-card pile is a real branch** — Git Branch on it is a legal play that discards the card and changes nothing.
5. **Nothing here needs private deck knowledge or a parallel pending**, so slices 1 and 2 stay clear of the shape changes System Upgrade will force.
