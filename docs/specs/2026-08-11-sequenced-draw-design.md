# Slice A — the sequenced multi-pile draw — Design

Slice A of [#61](https://github.com/MythHand/ReleaseBoardGameP2P/issues/61): the turn's draw stops being one card and becomes an obligation over every pile, and the `gitBranch` mode axis starts being read.

Rules answers this implements: [`2026-08-02-git-operations-rules-decisions.md`](./2026-08-02-git-operations-rules-decisions.md), answers 1, 2, 6 and 7.

## What the answers ask for

**Answer 1.** Base draws one top card from *every* draw pile; Strategic draws one card from a pile the player chooses. Separate piles are separate sources.

**Answers 2 and 6.** A draw is one triggered action carrying a sequence: the player presses one control and the engine draws from each pile in turn. A drawn Error 503 pauses the sequence until it is answered, then it resumes. Playing from hand is impossible while a draw is in progress.

**Answer 7, second case.** A pile that empties while others remain ceases to exist.

## What already exists

The sequence itself. [#72](https://github.com/MythHand/ReleaseBoardGameP2P/issues/72) needed exactly the machinery answer 2 describes — Good Vibe-Coding draws two cards and a trigger between them must pause rather than overwrite the pending — so `GameState.drawing` already holds the remaining pile indices, one entry per card owed, and `reduce` already resumes it the moment nothing is owed ahead of it.

Good Vibe-Coding declares `[0, 0]`, two cards off pile 0. This slice declares `[0, 1, …]`, one card off each pile. Nothing about the runner changes.

Answer 7's first case — the discard recycled when no cards are left anywhere — landed with [#79](https://github.com/MythHand/ReleaseBoardGameP2P/issues/79).

## The obligation

`turn.hasDrawn` is a boolean, which cannot express "two of three piles are done". It becomes `turn.drawnFrom: number[]` — the pile indices this turn has drawn from.

Whether the obligation is met is then a question about the mode, not a stored flag:

- **Base** — every non-empty pile has been drawn from.
- **Strategic** — at least one pile has.

`PUSH` legality, `onDraw`'s "already drew this turn" rejection, and the dock's draw-or-push state all derive from that one predicate.

**`PlayerView.turn.hasDrawn` stays a boolean**, carrying the predicate's answer rather than the raw list. The kit asks one question — is a draw still owed — and the answer is still yes or no. Keeping the projection's shape means the adapter, `TableState`, `deriveDock`, `bots.ts` and the referee's absent-seat fallback are all untouched by this slice; only the engine's own state changes.

## Reading the mode

`setup.gitBranch` is read for the first time. It is one of the two axes [#75](https://github.com/MythHand/ReleaseBoardGameP2P/issues/75) reports as dead — a player selecting Strategic today gets Base with no indication. This slice makes the axis mean something, which retires half of #75.1 without deciding the other half (`setup.ai` is still read nowhere).

`DRAW` already carries `pile?`, honoured today as `action.pile ?? 0`. Under Strategic that becomes the player's choice of source. Under Base it is ignored: the sequence covers every pile, so there is nothing to choose.

## Removing an exhausted pile

Answer 7's second case has a hazard the answer does not mention: `drawing.piles` holds *indices*, and removing a pile from `decks.main` shifts every index after it. A sequence part-way through `[0, 1, 2]` would find its remaining entries pointing at the wrong piles.

So pruning happens when the sequence finishes, never during it. Within a single draw the pile list is stable; an emptied pile survives as an empty array until the last card of that draw is taken, and is gone before the next one starts. No player-visible behaviour depends on the difference, because nothing can be played mid-draw.

**Not this slice.** With `decks.main` always holding exactly one pile, a second pile is unreachable until Git Branch creates one, and the one-pile case is answer 7's *first* case, already handled. Pruning lands with slice B, which is what makes it testable.

## Scope

This slice is the obligation and the mode. It does not add Git Branch or Git Merge (slice B), and it does not add a pile target to `Action.PLAY` — that is Git Branch's need, not the draw's.

With one pile on the table the behaviour is exactly what it is today: one card, drawn once, and the turn can end. Everything this slice adds is reachable only through a state that constructs several piles directly, which is how it is tested until slice B makes it reachable in play.

## Definition of done

A Base draw over three piles takes one card from each, in order, and pauses on a drawn Error 503 with the remaining piles still owed — resuming when it is answered. A Strategic draw over the same three takes one card from the pile named in the action and satisfies the obligation. `PUSH` is refused until it is satisfied and accepted after. A single-pile game plays exactly as before.
