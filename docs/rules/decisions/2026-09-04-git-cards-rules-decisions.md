# Git Rebase and System Upgrade — rules decisions

Answers from the game's owner to the three points the rules text leaves open for the two cards that
[`2026-08-01-git-operations-open-questions.md`](./2026-08-01-git-operations-open-questions.md)
deliberately did not reach. That file settled the draw, Git Branch, Git Merge and Cherry-pick, and
closed with "nothing here needs private deck knowledge or a parallel pending, so slices 1 and 2 stay
clear of the shape changes System Upgrade will force." These are those shapes.

Given on 2026-09-04, while scoping
[#108](https://github.com/MythHand/ReleaseBoardGameP2P/issues/108) and the remainder of
[#61](https://github.com/MythHand/ReleaseBoardGameP2P/issues/61). They supersede nothing — the three
questions had no previous answer, which is exactly why Rebase and System Upgrade were held back.
The file came in with [#134](https://github.com/MythHand/ReleaseBoardGameP2P/pull/134); on
2026-10-07 all three answers were checked against the game, and the game does each of them.

The card text they qualify is [`docs/rules/cards.md`](../cards.md), the Rebase and System
Upgrade entries; the answers are folded into those paragraphs, and this file is the record of who
decided and when.

## Git Rebase

**1. The player names the pile.** Base Rebase reads "the top three cards of **one** draw pile", and
after a Git Branch there are several. The player chooses which one, exactly as they choose which
pile to split (answer 3 of [the slices 1–2 record](./2026-08-01-git-operations-open-questions.md)).

So `Action.PLAY` for Rebase carries `Target { kind: 'pile'; pile: number }` — the variant Git Branch
already added, reused rather than a second one invented. Sudo is unaffected: it reaches every pile,
so it names none.

**In the game.** As answered: with several piles the piles light up and the play waits for a click on
one; with one pile it plays at once; with sudo every pile is shown and none is named.
**In the spec.** [`cards.md`, Git Rebase](../cards.md#git-rebase--operation-git-rebase--тираж-3--sudo).

**2. A short pile reorders what is there; an exhausted deck plays the card for nothing.** Two cards
can be swapped, one card is a legal play that changes nothing, and with no draw pile left at all the
effect is skipped while the card still counts as played.

This is the same shape the owner had already chosen twice: answer 4 makes Git Branch on a
single-card pile a legal play that does nothing, and answer 11 makes an impossible take from the
discard "a legal move with consequences for the player who blundered — not a rejected action." A
wasteful play is the player's own mistake, and the engine does not protect them from it.

**In the game.** As answered. Empty piles drop out of the offer; with no pile left the card is spent
and no choice opens. With one card in the pile the choice still opens, showing that one card: there
is nothing to move, and the order stays as it was.
**In the spec.** [`cards.md`, Git Rebase](../cards.md#git-rebase--operation-git-rebase--тираж-3--sudo).

## System Upgrade

**3. An opponent with an empty hand owes nothing.** They are not asked at all — the effect never
lists them, so it cannot stall waiting on a card they do not have. The other opponents still
discard. If nobody can discard, the card is played and nothing reaches the centre; sudo then takes
nothing, because there is nothing there to take.

The alternative considered and rejected was that an empty hand draws a card in order to discard it.
That would have made System Upgrade the only Operation able to advance the draw deck as a side
effect.

**In the game.** As answered: everyone but the actor, the eliminated and the empty-handed owes a
discard; when nobody does, the card is played, nothing reaches the centre and sudo has nothing to
take.
**In the spec.** [`cards.md`, System Upgrade](../cards.md#system-upgrade--operation-system-upgrade--тираж-2--sudo).
**Online.** The opponents discard at once, each on their own, face up at the centre of the table.

## What these answers change

1. **Rebase gains a target**, and reuses Git Branch's `pile` variant to carry it. No new shape in
   `Action`.
2. **Rebase has no illegal case worth rejecting.** Every deck state is a legal play; what differs is
   how much of the effect happens. The engine needs no "not enough cards" rejection, and the board
   needs no disabled state on the card.
3. **The System Upgrade roster is computed, not assumed.** Who owes a discard is decided when the
   effect opens — everyone but the actor, minus the eliminated, minus the empty-handed — and an
   empty roster is a real and ordinary outcome, not an error.
