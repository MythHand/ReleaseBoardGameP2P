# The discard picker — Git Cherry-pick and Inside — Design

Slice C of [#61](https://github.com/MythHand/ReleaseBoardGameP2P/issues/61): the two card effects that reach into the discard, plus the surface they need.

**Goal:** Git Cherry-pick is playable from hand, plain and sudo, and the AI event Inside resolves — each taking a card out of the discard through one shared prompt.

Rules answers this implements: [`2026-08-02-git-operations-rules-decisions.md`](./2026-08-02-git-operations-rules-decisions.md), questions 8–12. The rules file itself is stale (see that document's warning); these two cards rest on the owner's answers, not on it.

## Why this slice first

The three slices of #61's first half are C (this one), A (the sequenced multi-pile draw) and B (Git Branch and Merge). B needs A, and A rewrites the turn's draw obligation — core-loop surgery that collides with the `hasDrawn` boolean [#77](https://github.com/MythHand/ReleaseBoardGameP2P/pull/77) just built a dock around.

C needs neither. It is a complete card effect, end to end, and it establishes the pattern every later pending kind follows. It is the cheapest way to prove the six-layer path before spending it on the risky one.

## The cards

**Git Cherry-pick** (`operation-git-cherry-pick`, qty 3) enters `CARD_RULES` under a new `CardKind: 'operation'` with `sudo: true`. Plain: take one card from the discard into hand. Sudo: take two — one to hand, one to the top of the draw pile, unseen by anyone else.

**Inside** (`ai-inside`, qty 2) enters `CARD_RULES` as kind `ai` and joins `FAKE_EVENTS`. It resolves through the AI-effect switch in `fake/triggers.ts` and is never playable from hand. It takes one **Release** card from the discard into hand.

## The pending

The discard does not become browsable. Answer 8 is precise: the pile is face up, a player cannot page through it during ordinary play, and effects that reach into it bring their own view. So the pending carries its own options and nothing global changes.

```
Pending  | { kind: 'pickFromDiscard'; player; options: CardInstance[]; picks: 1 | 2; source: CardId }
Choice   | { kind: 'pickFromDiscard'; card: CardUid; toDeck?: CardUid }
```

`options` is `CardInstance[]` rather than the `CardUid[]` every existing pending uses. The prompt must draw a card face for something that was never in the player's hand, so it needs the id beside the uid. Projecting discard contents leaks nothing — the pile is public by answer 8.

`picks` is `min(sudo ? 2 : 1, options.length)`, computed by the engine. That single expression absorbs answer 11's edge cases instead of scattering guards: sudo Cherry-pick against a one-card discard takes it to hand and skips the deck placement, with no special case anywhere.

**The two cards differ only in `options`.** Cherry-pick offers the whole discard; Inside filters to `rulesFor(c.id)?.kind === 'release'`. If the eligible set is empty, **no pending opens at all** — the card is spent and play continues. Answer 11 makes that a legal move with consequences, never a rejection.

The `toDeck` card goes to the top of pile 0 (answer 10).

## Sudo's two picks resolve once

The prompt asks for the hand card, re-renders asking for the deck card, and emits a single `RESOLVE` carrying both. Local state in the component; one pending, one resolution.

**Rejected:** two sequential pendings. That would put a pending behind a pending — the queue shape that System Upgrade will eventually force and that this slice is deliberately staying clear of.

## What the effect emits

A new `Event` member:

```
| { type: 'takenFromDiscard'; player: PlayerId; card: CardId; to: 'hand' | 'deck' }
```

The hand placement is public — every seat watched the card leave a face-up pile. The deck placement is emitted with `visibleTo: [player]`, following the precedent `drawn` already sets for a private identity, because the rules place that card unseen. Answer 9 confirms the engine models no further deck knowledge: the player who placed it remembers it, as at a table.

`HistoryLabels` is `Record<Event['type'], string>`, so a missing label for the new member is a typecheck failure rather than a blank row.

## The combo guard has to widen

`onPlay` in `fake/release.ts` currently rejects any combo on a card that is not a release — the message says Code Review only pairs with a release. Sudo Cherry-pick is a `support-sudo` combo on an `operation`, so that guard must admit it. This is the one place where an existing rule, written when releases were the only combo, is wrong rather than merely incomplete.

`comboOptions` in the adapter derives partners from `rulesFor(id)?.sudo === true`, so Cherry-pick gains its sudo pairing in the UI with no adapter change.

## Layers this crosses

1. **Engine** — `Pending`, `Choice`, `PendingView`, `Event`, `CardKind`, `CARD_RULES`, `FAKE_DECK`, `FAKE_EVENTS`, the reduction, the AI-effect case, and `playableFor`'s exhaustive switch.
2. **`conformance.ts`** — `resolvePendingAction` gains a `pickFromDiscard` case. Its `progress` property asserts no pending survives three consecutive fuzz steps, so omitting the case goes red by design.
3. **Kit** — `TablePending` and `TableChoice` mirror the variant; the adapter's `Exact<>` assertions hold them to it. `PendingPrompt` gains a case and a third option renderer: uid-keyed selection over a catalogue-drawn face. `CardOption` resolves uids against the hand and `CatalogueCardOption` renders by id with no uid — neither fits alone.
4. **Copy** — `pending.pickFromDiscard` and the new history label, in both catalogs.

`CardKind: 'operation'` is a public type change in `@release/engine`. `playableFor`'s switch is exhaustive, so every consumer of `CardKind` fails to compile until it handles the case. That is intended — the same guard that made the missing-copy defect impossible to repeat.

## Not here

1. No general discard browser — answer 8 rules it out, and it is the larger surface.
2. Nothing from [#78](https://github.com/MythHand/ReleaseBoardGameP2P/pull/78). Its `Pile` heap is a visual upgrade to the same data once it lands; building on an open PR would make this slice depend on a third unmerged branch.
3. Slices A and B — the sequenced draw, Git Branch, Git Merge — and Git Rebase and System Upgrade, which need private deck knowledge and a multi-player pending respectively.

## Definition of done

A solo or two-peer game in which Cherry-pick is drawn, played plainly and taken from the discard into hand; played with Sudo and resolved to both destinations; and played against an empty discard without rejecting. Inside resolves off the AI event deck and takes only a Release.

`pnpm typecheck && pnpm lint && pnpm test` green, every new test verified by mutation.
