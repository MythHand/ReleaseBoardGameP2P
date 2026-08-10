# The Discard Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Git Cherry-pick is playable from hand, plain and sudo, and the AI event Inside resolves — each taking a card out of the discard through one shared prompt.

**Architecture:** One new pending kind, `pickFromDiscard`, carrying its own options so the discard never becomes globally browsable. Two card effects differ only in how they filter those options. The engine computes how many picks are owed, which absorbs every empty/short-discard edge into one expression. The change crosses six layers — engine types, reduction, conformance, kit mirror, prompt, catalogs — in that order, each task ending green.

**Tech Stack:** TypeScript, React 19, CSS Modules, Vitest + @testing-library/react, pnpm workspaces, Vite source aliases.

**Spec:** [`2026-08-02-discard-picker-design.md`](./2026-08-02-discard-picker-design.md)
**Rules answers:** [`2026-08-02-git-operations-rules-decisions.md`](./2026-08-02-git-operations-rules-decisions.md)

## Global Constraints

- **`@release/ui` imports nothing from `@release/engine`.** The action types are mirrored structurally and held to it by the `Exact<>` assertions in `packages/table-adapter/src/contract.test-d.ts`. A kit mirror that drifts from the engine's shape fails typecheck there, not at runtime.
- **`@release/ui` never calls `Date.now()` or `Math.random()`,** and never starts a timer.
- **No string literals in `.tsx`.** Text goes through `t()` in `@release/web`, or arrives as a `copy` prop in `@release/ui`.
- **Translation keys must exist in both `en` and `ru`** (`packages/translation/src/locales/*/common.json`).
- **All text through `<Typography>`**; colors from `var(--*)` tokens only; spacing uses logical properties.
- **Code comments in English.** Existing Russian comments are legacy; do not add new ones.
- **Page tests live in `__tests__/`** — generouted eagerly imports every non-`_` module under `pages/`.
- **Every new test is verified by mutation.** Break the code the test names, confirm red, restore. Nine tests during the engine's original implementation shipped green while asserting nothing, and every one was found this way — none by reading.
- **`conformance.ts`'s `resolvePendingAction` must gain a case for every reachable pending kind.** A `progress` property asserts the fuzz stream never holds a pending for more than three consecutive steps; omit the case and it goes red by design.

**Verification** (from the repo root):

```bash
pnpm typecheck && pnpm lint && pnpm test
```

**Branch:** `game-logic-draw-and-piles`, cut from `game-logic-git-operations` ([#77](https://github.com/MythHand/ReleaseBoardGameP2P/pull/77)). Merge train — do not rebase onto main.

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `packages/engine/src/state.ts` | `pickFromDiscard` on `Pending` | 1 |
| `packages/engine/src/actions.ts` | `pickFromDiscard` on `Choice` | 1 |
| `packages/engine/src/view.ts` | `pickFromDiscard` on `PendingView` | 1 |
| `packages/engine/src/events.ts` | `takenFromDiscard` event | 1 |
| `packages/engine/src/cards.ts` | `'operation'` kind, Cherry-pick rules | 1 |
| `packages/engine/src/fake/release.ts` | combo guard admits sudo on an operation | 1 |
| `packages/engine/src/fake/discard.ts` | the effect: open the pending, resolve it | 1 |
| `packages/engine/src/fake/reduce.ts` | dispatch PLAY and RESOLVE to it | 1 |
| `packages/engine/src/fake/project.ts` | `playableFor` handles `'operation'` | 1 |
| `packages/engine/src/fake/index.ts` | Cherry-pick in `FAKE_DECK`, Inside in `FAKE_EVENTS` | 1, 2 |
| `packages/engine/src/fake/triggers.ts` | the `ai-inside` effect case | 2 |
| `packages/engine/src/conformance.ts` | `resolvePendingAction` case | 2 |
| `apps/ui/src/table/Table/intents.ts` | kit mirror of pending + choice | 3 |
| `apps/ui/src/table/Table/PendingPrompt/PendingPrompt.tsx` | the prompt case and its option renderer | 3 |
| `packages/translation/src/locales/{en,ru}/common.json` | prompt copy + history label | 4 |

---

### Task 1: Git Cherry-pick reaches the discard

**Files:**
- Modify: `packages/engine/src/state.ts`, `actions.ts`, `view.ts`, `events.ts`, `cards.ts`
- Modify: `packages/engine/src/fake/release.ts:97`, `reduce.ts`, `project.ts:41`, `index.ts`
- Create: `packages/engine/src/fake/discard.ts`
- Test: `packages/engine/src/fake/discard.test.ts`

**Interfaces:**
- Produces: `openPickFromDiscard(state, log, player, source, options, sudo)` and `onPickFromDiscard(state, action)` from `fake/discard.ts`. Task 2 calls the first for `ai-inside`; Task 3 mirrors the types this task adds.

- [ ] **Step 1: Write the failing tests**

Create `packages/engine/src/fake/discard.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from './index'
import type { GameState } from '../state'

const engine = createFakeEngine()

function gameWith(discard: string[], hand: string[]): GameState {
  const base = engine.createGame({
    gameId: 'g',
    seed: 3,
    players: [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  return {
    ...base,
    turn: { ...base.turn, player: 'p1', hasDrawn: true },
    decks: { ...base.decks, discard: discard.map((id, i) => ({ uid: `${id}#d${i}`, id })) },
    players: {
      ...base.players,
      p1: { ...base.players.p1, hand: hand.map((id, i) => ({ uid: `${id}#h${i}`, id })) },
    },
  }
}

const CHERRY = 'operation-git-cherry-pick'

describe('Git Cherry-pick', () => {
  it('opens a pending offering the whole discard, one pick', () => {
    const state = gameWith(['attack-bug', 'release-frontend'], [CHERRY])
    const { state: next } = engine.reduce(state, {
      type: 'PLAY',
      player: 'p1',
      card: `${CHERRY}#h0`,
      at: 1,
    })
    expect(next.pending).toMatchObject({ kind: 'pickFromDiscard', player: 'p1', picks: 1 })
    const pending = next.pending as { options: { id: string }[] }
    expect(pending.options.map((o) => o.id)).toEqual(['attack-bug', 'release-frontend'])
  })

  it('moves the chosen card from the discard into hand', () => {
    const state = gameWith(['attack-bug'], [CHERRY])
    const played = engine.reduce(state, {
      type: 'PLAY',
      player: 'p1',
      card: `${CHERRY}#h0`,
      at: 1,
    }).state
    const { state: next } = engine.reduce(played, {
      type: 'RESOLVE',
      player: 'p1',
      choice: { kind: 'pickFromDiscard', card: 'attack-bug#d0' },
      at: 2,
    })
    expect(next.players.p1.hand.map((c) => c.id)).toContain('attack-bug')
    expect(next.decks.discard.some((c) => c.uid === 'attack-bug#d0')).toBe(false)
    expect(next.pending).toBeNull()
  })

  it('is spent without a pending when the discard is empty', () => {
    const state = gameWith([], [CHERRY])
    const { state: next, events } = engine.reduce(state, {
      type: 'PLAY',
      player: 'p1',
      card: `${CHERRY}#h0`,
      at: 1,
    })
    // Answer 11: a legal move with consequences, never a rejection.
    expect(events.some((e) => e.type === 'rejected')).toBe(false)
    expect(next.pending).toBeNull()
    expect(next.decks.discard.map((c) => c.id)).toContain(CHERRY)
    expect(next.players.p1.hand.some((c) => c.id === CHERRY)).toBe(false)
  })

  it('owes two picks with sudo, and puts the second on top of pile 0', () => {
    const state = gameWith(['attack-bug', 'release-frontend'], [CHERRY, 'support-sudo'])
    const played = engine.reduce(state, {
      type: 'PLAY',
      player: 'p1',
      card: `${CHERRY}#h0`,
      combo: 'support-sudo#h1',
      at: 1,
    }).state
    expect(played.pending).toMatchObject({ picks: 2 })
    const { state: next } = engine.reduce(played, {
      type: 'RESOLVE',
      player: 'p1',
      choice: {
        kind: 'pickFromDiscard',
        card: 'attack-bug#d0',
        toDeck: 'release-frontend#d1',
      },
      at: 2,
    })
    expect(next.players.p1.hand.map((c) => c.id)).toContain('attack-bug')
    expect(next.decks.main[0][0].uid).toBe('release-frontend#d1')
    // Both offered cards left the pile, and the spent Cherry-pick and Sudo
    // joined it. Cards never leave the game: answer 7 refills an exhausted
    // deck by shuffling the discard, so a card that vanished would shrink the
    // game's card pool permanently.
    expect(next.decks.discard.map((c) => c.id).sort()).toEqual(
      [CHERRY, 'support-sudo'].sort(),
    )
  })

  it('owes only one pick with sudo when the discard holds a single card', () => {
    const state = gameWith(['attack-bug'], [CHERRY, 'support-sudo'])
    const played = engine.reduce(state, {
      type: 'PLAY',
      player: 'p1',
      card: `${CHERRY}#h0`,
      combo: 'support-sudo#h1',
      at: 1,
    }).state
    expect(played.pending).toMatchObject({ picks: 1 })
  })

  it('keeps the deck-bound card private to the player who placed it', () => {
    const state = gameWith(['attack-bug', 'release-frontend'], [CHERRY, 'support-sudo'])
    const played = engine.reduce(state, {
      type: 'PLAY',
      player: 'p1',
      card: `${CHERRY}#h0`,
      combo: 'support-sudo#h1',
      at: 1,
    }).state
    const { events } = engine.reduce(played, {
      type: 'RESOLVE',
      player: 'p1',
      choice: {
        kind: 'pickFromDiscard',
        card: 'attack-bug#d0',
        toDeck: 'release-frontend#d1',
      },
      at: 2,
    })
    const toDeck = events.find((e) => e.type === 'takenFromDiscard' && e.to === 'deck')
    expect(toDeck?.visibleTo).toEqual(['p1'])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @release/engine test -- discard`
Expected: FAIL — `operation-git-cherry-pick` is not in `CARD_RULES`, so the play is rejected as not playable.

- [ ] **Step 3: Add the types**

`packages/engine/src/state.ts` — add to the `Pending` union, after `handLimit`:

```ts
  // The options travel on the pending rather than opening the discard globally:
  // the pile is public but not browsable at will, so an effect that reaches
  // into it brings its own view. `picks` is min(sudo ? 2 : 1, options.length),
  // which folds "the discard is empty or short" into one expression instead of
  // a guard at every step.
  | {
      kind: 'pickFromDiscard'
      player: PlayerId
      options: CardInstance[]
      picks: 1 | 2
      source: CardId
    }
```

`packages/engine/src/actions.ts` — add to `Choice`:

```ts
  // `toDeck` is the sudo second pick, placed on top of pile 0 unseen.
  | { kind: 'pickFromDiscard'; card: CardUid; toDeck?: CardUid }
```

`packages/engine/src/view.ts` — add to `PendingView`:

```ts
  | {
      kind: 'pickFromDiscard'
      player: PlayerId
      options: CardInstance[]
      picks: 1 | 2
      source: CardId
    }
```

`packages/engine/src/events.ts` — add to the `Event` union:

```ts
    | { type: 'takenFromDiscard'; player: PlayerId; card: CardId; to: 'hand' | 'deck' }
```

`packages/engine/src/cards.ts` — add `'operation'` to `CardKind`, and the rules entry beside the support cards:

```ts
  'operation-git-cherry-pick': { kind: 'operation', sudo: true },
```

- [ ] **Step 4: Write the effect**

Create `packages/engine/src/fake/discard.ts`:

```ts
import type { Action } from '../actions'
import { rulesFor } from '../cards'
import type { Reduction } from '../engine'
import type { CardId, CardInstance, GameState, PlayerId } from '../state'
import type { Log } from './core'
import { reject } from './core'

// Cherry-pick offers the whole pile; Inside offers only Releases. Everything
// else about the two effects is identical, which is why they share a pending.
export function discardOptions(state: GameState, releasesOnly: boolean): CardInstance[] {
  if (!releasesOnly) return state.decks.discard
  return state.decks.discard.filter((c) => rulesFor(c.id)?.kind === 'release')
}

// Opens the pending, or returns the state untouched when nothing is eligible.
// An empty result is not an error: playing into a discard that cannot satisfy
// the card is a legal move with consequences for the player who blundered.
export function openPickFromDiscard(
  state: GameState,
  player: PlayerId,
  source: CardId,
  options: CardInstance[],
  sudo: boolean,
): GameState {
  if (options.length === 0) return state
  const picks = (Math.min(sudo ? 2 : 1, options.length) as 1 | 2)
  return { ...state, pending: { kind: 'pickFromDiscard', player, options, picks, source } }
}

export function onPickFromDiscard(
  state: GameState,
  action: Action & { type: 'RESOLVE' },
  log: Log,
): Reduction {
  const pending = state.pending
  if (!pending || pending.kind !== 'pickFromDiscard') {
    return reject(state, action, 'no discard pick is pending')
  }
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  const choice = action.choice
  if (choice.kind !== 'pickFromDiscard') return reject(state, action, 'wrong choice for pending')

  const offered = (uid: string) => pending.options.find((c) => c.uid === uid)
  const toHand = offered(choice.card)
  // Membership in *this* pending's options, not merely "some card": a stale
  // selection the current pending never offered must not resolve.
  if (!toHand) return reject(state, action, 'that card is not on offer')

  const toDeck = pending.picks === 2 && choice.toDeck ? offered(choice.toDeck) : undefined
  if (pending.picks === 2 && choice.toDeck && !toDeck) {
    return reject(state, action, 'that card is not on offer')
  }
  if (toDeck && toDeck.uid === toHand.uid) {
    return reject(state, action, 'one card cannot go to both places')
  }

  const taken = new Set([toHand.uid, ...(toDeck ? [toDeck.uid] : [])])
  const discard = state.decks.discard.filter((c) => !taken.has(c.uid))
  const player = state.players[action.player]

  log.add({ type: 'takenFromDiscard', player: action.player, card: toHand.id, to: 'hand' })
  // The rules place this one unseen, so its identity is private to the placer —
  // the same treatment `drawn` gives a card whose face only the drawer saw.
  if (toDeck) {
    log.add({
      type: 'takenFromDiscard',
      player: action.player,
      card: toDeck.id,
      to: 'deck',
      visibleTo: [action.player],
    })
  }

  const main = toDeck
    ? state.decks.main.map((p, i) => (i === 0 ? [toDeck, ...p] : p))
    : state.decks.main

  return {
    state: {
      ...state,
      players: { ...state.players, [action.player]: { ...player, hand: [...player.hand, toHand] } },
      decks: { ...state.decks, discard, main },
      pending: null,
      eventSeq: log.seq,
    },
    events: log.events,
  }
}
```

Read `packages/engine/src/fake/core.ts` before writing this and match its actual `Log` and `reject` signatures — the names above are what the other effect files import, but confirm the exact shapes rather than trusting this snippet.

- [ ] **Step 5: Dispatch to the effect**

`packages/engine/src/fake/project.ts` — add to `playableFor`'s switch, beside `'protection'`:

```ts
        case 'operation':
          // Playable even when the discard cannot satisfy it: answer 11 makes
          // that a legal move with consequences, not a rejection.
          return true
```

`packages/engine/src/fake/release.ts` — the combo guard at line 97 currently rejects every combo on a non-release. Widen it so a `support-sudo` combo is accepted on a sudo-capable card:

```ts
    if (partner.id === 'support-sudo') {
      if (rules.sudo !== true) return reject(state, action, 'that card has no sudo variant')
    } else if (partner.id !== 'support-code-review') {
      return reject(state, action, 'that card cannot be comboed here')
    } else if (rules.kind !== 'release') {
      return reject(state, action, 'Code Review only pairs with a release')
    }
```

Then, in the same function's kind dispatch, handle the operation before the release branch:

```ts
  if (rules.kind === 'operation') {
    const sudo = action.combo !== undefined
    const spent = discardCard(state, log, action.player, action.card)
    return {
      state: openPickFromDiscard(spent, action.player, card.id, discardOptions(spent, false), sudo),
      events: log.events,
    }
  }
```

The Cherry-pick card itself reaches the discard **before** the options are read, so it cannot pick itself — verify that ordering against how the other effects spend a card, and reuse the existing discard helper rather than writing a new one.

`packages/engine/src/fake/reduce.ts` — add to `onResolve`'s switch:

```ts
    case 'pickFromDiscard':
      return onPickFromDiscard(state, action, createLog(state.eventSeq))
```

`packages/engine/src/fake/index.ts` — add to `FAKE_DECK`:

```ts
  { id: 'operation-git-cherry-pick', qty: 3 },
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `pnpm --filter @release/engine test -- discard`
Expected: PASS, 6 tests.

- [ ] **Step 7: Verify by mutation**

Three checks, each restored after:
1. In `openPickFromDiscard`, drop the `options.length === 0` early return — the empty-discard test must go red.
2. Change `Math.min(sudo ? 2 : 1, options.length)` to a bare `sudo ? 2 : 1` — the single-card sudo test must go red.
3. Remove `visibleTo` from the deck event — the privacy test must go red.

If any stays green, that test asserts nothing and must be rewritten before continuing.

- [ ] **Step 8: Verify and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS. `CardKind` gained a member and `playableFor`'s switch is exhaustive, so any consumer that fails to compile here is the guard working — handle it rather than widening a default.

```bash
git add packages/engine
git commit -m "feat(engine): Git Cherry-pick reaches into the discard"
```

---

### Task 2: Inside, and the fuzz stream can resolve the new pending

**Files:**
- Modify: `packages/engine/src/cards.ts`, `packages/engine/src/fake/triggers.ts`, `packages/engine/src/fake/index.ts`
- Modify: `packages/engine/src/conformance.ts:63`
- Test: `packages/engine/src/fake/discard.test.ts`

**Interfaces:**
- Consumes: `openPickFromDiscard` and `discardOptions` from Task 1's `fake/discard.ts`.

- [ ] **Step 1: Write the failing tests**

Append to `packages/engine/src/fake/discard.test.ts`:

```ts
describe('Inside', () => {
  it('offers only Release cards from the discard', () => {
    const state = gameWith(['attack-bug', 'release-frontend', 'release-backend'], [])
    const next = applyAiInside(state, 'p1')
    const pending = next.pending as { options: { id: string }[]; picks: number }
    expect(pending.options.map((o) => o.id)).toEqual(['release-frontend', 'release-backend'])
    expect(pending.picks).toBe(1)
  })

  it('resolves to nothing when the discard holds no Release', () => {
    const state = gameWith(['attack-bug', 'attack-ddos'], [])
    expect(applyAiInside(state, 'p1').pending).toBeNull()
  })
})
```

`applyAiInside` is a test-local helper. Write it to drive the AI effect the same way `packages/engine/src/fake/triggers.test.ts` already drives other AI events — read that file first and copy its approach rather than inventing a second one.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @release/engine test -- discard`
Expected: FAIL — `ai-inside` has no case, so no pending opens.

- [ ] **Step 3: Implement the effect**

`packages/engine/src/cards.ts` — add beside the other AI entries:

```ts
  'ai-inside': { kind: 'ai' },
```

`packages/engine/src/fake/triggers.ts` — add a case to the AI-effect switch:

```ts
    case 'ai-inside': {
      // Only a Release may be taken back. An empty result opens no pending and
      // the event simply resolves to nothing.
      return openPickFromDiscard(state, player, 'ai-inside', discardOptions(state, true), false)
    }
```

Match the surrounding cases' exact return shape — some return a state, some a state plus logging. Read two neighbouring cases before writing this one.

`packages/engine/src/fake/index.ts` — add to `FAKE_EVENTS`:

```ts
  { id: 'ai-inside', qty: 2 },
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @release/engine test -- discard`
Expected: PASS, 8 tests total in the file.

- [ ] **Step 5: Teach the fuzz stream to resolve the pending**

`packages/engine/src/conformance.ts` — add a case to `resolvePendingAction`'s switch:

```ts
    case 'pickFromDiscard': {
      // Take the first option, and a second distinct one when two are owed —
      // either way the pending resolves in one step.
      const [first, second] = pending.options
      return {
        type: 'RESOLVE',
        player: pending.player,
        choice: {
          kind: 'pickFromDiscard',
          card: first.uid,
          toDeck: pending.picks === 2 ? second?.uid : undefined,
        },
        at,
      }
    }
```

- [ ] **Step 6: Run the conformance suite**

Run: `pnpm --filter @release/engine test`
Expected: PASS, 157 existing tests plus the new ones. The `progress` property is the one to watch — it goes red if the pending can survive three consecutive fuzz steps.

- [ ] **Step 7: Verify by mutation**

Comment out the `pickFromDiscard` case in `resolvePendingAction` and re-run the engine suite. The `progress` property must go red. Restore it. If it stays green, the fuzz stream is not reaching the new pending, and the deck entries from Step 3 are the first thing to check.

- [ ] **Step 8: Verify and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add packages/engine
git commit -m "feat(engine): Inside takes a Release back out of the discard"
```

---

### Task 3: The prompt can offer a card that was never in hand

**Files:**
- Modify: `apps/ui/src/table/Table/intents.ts:16-42`
- Modify: `apps/ui/src/table/Table/PendingPrompt/PendingPrompt.tsx`
- Test: `apps/ui/src/table/Table/PendingPrompt/PendingPrompt.test.tsx`

**Interfaces:**
- Consumes: nothing from Tasks 1-2 at runtime — the kit imports no engine code. The mirror must match Task 1's engine shapes exactly; `packages/table-adapter/src/contract.test-d.ts` fails typecheck if it drifts.
- Produces: a `pickFromDiscard` case in `PendingPrompt`, and `PendingPromptCopy.pickFromDiscard`.

- [ ] **Step 1: Mirror the types**

`apps/ui/src/table/Table/intents.ts` — add to `TableChoice`:

```ts
  | { kind: 'pickFromDiscard'; card: string; toDeck?: string }
```

and to `TablePending`:

```ts
  | {
      kind: 'pickFromDiscard'
      player: string
      options: { uid: string; id: string }[]
      picks: 1 | 2
      source: string
    }
```

The engine's `CardInstance` is `{ uid: CardUid; id: CardId }`, both `string`, so `{ uid: string; id: string }` is the exact structural mirror. Anything else — renaming `id` to `card`, widening `picks` to `number` — fails the adapter's assertions.

- [ ] **Step 2: Write the failing prompt tests**

Append to `apps/ui/src/table/Table/PendingPrompt/PendingPrompt.test.tsx`, following the fixtures and copy literals the existing tests in that file already use:

```tsx
it('offers every discard option and resolves the single pick', () => {
  const onResolve = vi.fn()
  render(
    <PendingPrompt
      pending={{
        kind: 'pickFromDiscard',
        player: 'you',
        options: [
          { uid: 'a#1', id: 'attack-bug' },
          { uid: 'b#1', id: 'release-frontend' },
        ],
        picks: 1,
        source: 'operation-git-cherry-pick',
      }}
      hand={[]}
      copy={copy}
      onResolve={onResolve}
    />,
  )
  // The cards were never in hand, so an option renderer resolving uids against
  // `hand` would render nothing at all here.
  const options = screen.getAllByRole('option')
  expect(options).toHaveLength(2)
})

it('asks for the deck card only after the hand card, and resolves once with both', () => {
  const onResolve = vi.fn()
  render(
    <PendingPrompt
      pending={{
        kind: 'pickFromDiscard',
        player: 'you',
        options: [
          { uid: 'a#1', id: 'attack-bug' },
          { uid: 'b#1', id: 'release-frontend' },
        ],
        picks: 2,
        source: 'operation-git-cherry-pick',
      }}
      hand={[]}
      copy={copy}
      onResolve={onResolve}
    />,
  )
  fireEvent.click(screen.getAllByRole('option')[0])
  // One pending, one resolution: the second selection must not emit its own.
  expect(onResolve).not.toHaveBeenCalled()
  fireEvent.click(screen.getAllByRole('option')[0])
  expect(onResolve).toHaveBeenCalledWith({
    kind: 'pickFromDiscard',
    card: 'a#1',
    toDeck: 'b#1',
  })
})
```

Read the existing tests in the file first: they build `copy` from a local literal, and the confirm affordance goes through `ConfirmAction`. Match how they drive confirmation rather than assuming a click resolves — adapt the assertions above to the file's actual pattern if it differs.

- [ ] **Step 3: Run to verify they fail**

Run: `pnpm --filter @release/ui test -- PendingPrompt`
Expected: FAIL — no `pickFromDiscard` case, so no options render.

- [ ] **Step 4: Add the option renderer and the case**

In `PendingPrompt.tsx`, add a third renderer beside `CardOption` and `CatalogueCardOption`. `CardOption` resolves a uid against `hand`; `CatalogueCardOption` renders a `CardData` with no uid. This one needs both — uid-keyed selection over a catalogue-drawn face:

```tsx
// A discard card: selected by uid like a hand card, drawn from the catalogue
// like a named card. Neither existing renderer covers it, because nothing
// before this offered a card the player never held.
function DiscardCardOption({
  option,
  selected,
  onClick,
}: {
  option: { uid: string; id: string }
  selected: boolean
  onClick: () => void
}) {
  const card = CARDS.find((c) => c.id === option.id)
  if (!card) return null
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={styles.option}
      onClick={onClick}
    >
      <Card card={card} interactive={false} width={72} state={selected ? 'selected' : 'idle'} />
    </button>
  )
}
```

Then the case in the kind switch. The two picks are local state: the first selection fills the hand slot, the second the deck slot, and `complete` is reached only when every owed pick is filled.

```tsx
    case 'pickFromDiscard': {
      const owed = pending.picks
      const chosen = discardPicks // local state: string[], see below
      complete = chosen.length === owed
      confirm = () => {
        if (chosen.length !== owed) return
        onResolve({
          kind: 'pickFromDiscard',
          card: chosen[0],
          toDeck: owed === 2 ? chosen[1] : undefined,
        })
      }
      options = pending.options
        .filter((o) => !chosen.includes(o.uid))
        .map((o) => (
          <DiscardCardOption
            key={o.uid}
            option={o}
            selected={false}
            onClick={() => setDiscardPicks([...chosen, o.uid])}
          />
        ))
      break
    }
```

Declare `const [discardPicks, setDiscardPicks] = useState<string[]>([])` beside the component's other selection state, and reset it in the same place the component already resets a selection when the pending's fingerprint changes — find that reset and extend it; a stale pick surviving into a new pending is the exact bug the existing membership checks were written against.

`kindCopy` is looked up by `pending.kind`, so add `pickFromDiscard: { prompt: string; action: string }` to `PendingPromptCopy` and supply a literal in the test fixture.

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --filter @release/ui test -- PendingPrompt`
Expected: PASS.

- [ ] **Step 6: Verify by mutation**

Change `complete` to `chosen.length > 0` and confirm the two-pick test goes red. Restore. Then remove the `.filter((o) => !chosen.includes(o.uid))` and confirm a test catches the same card being picked twice — if none does, add one.

- [ ] **Step 7: Verify and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`
Expected: PASS. `contract.test-d.ts` is the one to watch — it fails if Step 1's mirror drifted from Task 1's engine shapes.

```bash
git add apps/ui packages/table-adapter
git commit -m "feat(ui): the prompt offers a card from the discard"
```

---

### Task 4: The copy exists, and a real game shows the prompt

**Files:**
- Modify: `packages/translation/src/locales/en/common.json`, `packages/translation/src/locales/ru/common.json`
- Modify: `apps/ui/src/table/Table/testFixture.ts`
- Modify: `apps/playground/stories/TableStory/TableStory.tsx`
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/board.test.tsx`

**Interfaces:**
- Consumes: `PendingPromptCopy.pickFromDiscard` from Task 3; the `takenFromDiscard` event type from Task 1.

- [ ] **Step 1: Write the failing page test**

Append to `board.test.tsx`, following the pattern the file's existing pending test uses — build a real projection with the engine, then set the pending on the view:

```tsx
it('renders the discard picker from the real catalog', async () => {
  const engine = createFakeEngine()
  const state = engine.createGame({
    gameId: 'g1',
    seed: 7,
    players: [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const projected = engine.project(state, 'p1')
  const view = {
    ...projected,
    pending: {
      kind: 'pickFromDiscard' as const,
      player: 'p1',
      options: [{ uid: 'attack-bug#d0', id: 'attack-bug' }],
      picks: 1 as const,
      source: 'operation-git-cherry-pick',
    },
  }
  sessionValue = { ...session(), gameSync: { view, events: [] } } as unknown as UseLobby

  renderBoard()

  const heading = await screen.findByText(
    /^(take a card from the discard|возьмите карту из сброса)$/i,
  )
  expect(heading).toBeTruthy()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @release/web test -- board.test`
Expected: FAIL — `pending.pickFromDiscard` is absent from the catalogs, so `kindCopy` is undefined.

- [ ] **Step 3: Add the copy to both catalogs**

`packages/translation/src/locales/en/common.json` — inside the existing `pending` block:

```json
    "pickFromDiscard": { "prompt": "take a card from the discard", "action": "take" },
```

and inside `historyLabels`:

```json
    "takenFromDiscard": "took from the discard",
```

`packages/translation/src/locales/ru/common.json` — inside `pending`:

```json
    "pickFromDiscard": { "prompt": "возьмите карту из сброса", "action": "взять" },
```

and inside `historyLabels`:

```json
    "takenFromDiscard": "взял из сброса",
```

`HistoryLabels` is `Record<Event['type'], string>`, so omitting either `takenFromDiscard` entry is a typecheck failure, not a blank row.

- [ ] **Step 4: Supply the new copy at the kit's other call sites**

`apps/ui/src/table/Table/testFixture.ts` already sources `pending` from `enCommon`, so it picks the new key up with no change — confirm that by reading it rather than assuming. `apps/playground/stories/TableStory/TableStory.tsx` likewise pulls whole blocks with `pick(lang, …)`. If either supplies `pending` as a hand-written literal instead, add the key there.

- [ ] **Step 5: Run to verify it passes**

Run: `pnpm --filter @release/web test -- board.test`
Expected: PASS.

- [ ] **Step 6: Verify by mutation**

Remove the `pickFromDiscard` entry from the EN catalog, re-run, confirm the page test goes red, restore. This is the same defect class as the missing `pending` block that deadlocked the game before [#77](https://github.com/MythHand/ReleaseBoardGameP2P/pull/77) — the test exists to make it impossible to repeat.

- [ ] **Step 7: Verify and commit**

Run: `pnpm typecheck && pnpm lint && pnpm test`

```bash
git add packages/translation apps/ui apps/playground "apps/frontend/src/pages/board/[gameId]"
git commit -m "feat(web): the discard picker speaks both languages"
```

---

### Task 5: Play it

The acceptance gate. Manual, and the one thing no test above covers.

- [ ] **Step 1: Start the app**

Run: `pnpm dev`, host in one browser profile and join in another.

- [ ] **Step 2: Play Cherry-pick plain**

Get a Cherry-pick into hand and some cards into the discard (playing a Release discards one). Expected: the prompt opens showing the discard's cards; picking one puts it in hand and the pile shrinks by one.

- [ ] **Step 3: Play Cherry-pick with Sudo**

Expected: the prompt asks twice — once for the hand card, once for the deck card — and resolves on the second. The opponent's move history shows a card taken to hand and says nothing about which card went to the deck.

- [ ] **Step 4: Play Cherry-pick into an empty discard**

Expected: the card is spent, no prompt, no error, play continues. Not a rejection.

- [ ] **Step 5: Record the result**

Note it on the PR. If a step fails, the gap is in Tasks 1-4 and belongs there.

---

## Not in this plan

Slice A (the sequenced multi-pile draw), slice B (Git Branch and Git Merge), and the two later cards — Git Rebase, which needs private deck knowledge, and System Upgrade, which needs a pending owed to several players at once.

Nothing here depends on [#78](https://github.com/MythHand/ReleaseBoardGameP2P/pull/78). Its `Pile` heap is a visual upgrade to the same data when it lands.
