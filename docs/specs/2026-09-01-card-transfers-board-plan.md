# Card transfers on the board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the three playground transfer scenes to the real board — name a card and take it, take one at random, and lose one of yours — driven by the engine's `requested` and `handTransfer` events instead of by a demo button.

**Architecture:** One shared surface seen from three sides. `planBeats` grows two plan kinds; a new `transferBeat` runner owns everything that flies, branching once on `role` (taker / victim / watcher) and once on whether the event carried a card at all. A new sibling staging hook owns the ask — the `CardCatalog` band that replaces `PendingPrompt` for `requestCard`, and the silent `giveCard` auto-resolve. The named card survives the gap between the two batches on the projection, not on a beat overlay, because `giveCard` is projected unredacted to every peer.

**Tech Stack:** TypeScript, React 19, Vite, Vitest + @testing-library/react, CSS Modules with design tokens, pnpm workspaces. Animation through `@release/ui/animations` (`play`, `useFlyer`, `useHandArrival`, `nextFrames`, `wait`).

**Spec:** [`docs/specs/2026-09-01-card-transfers-board-design.md`](./2026-09-01-card-transfers-board-design.md)

## Global Constraints

- **Branch:** `feat/105-card-transfers`, fresh from `main` at `9767a08`. The PR closes [#105](https://github.com/MythHand/ReleaseBoardGameP2P/issues/105). Two commits already on it: `cd907b9` (the design doc) and `25381ca` (the kit's `requestCard` guess-space fix, Decision 8 — already done, do **not** redo it).
- **`prefers-reduced-motion` is honoured everywhere.** `play()` drives WAAPI directly and does **not** check it — JS choreography asks through `useReducedMotion`; CSS uses a media query. `useBeats` already collapses every beat under it, so a runner needs no check of its own — but anything that is a **game action** rather than choreography must keep working when beats do not. The `giveCard` auto-resolve is exactly that case (Task 8).
- **No hardcoded colours.** Every colour comes from a token in `apps/ui/src/design/tokens.css` via `var(--*)`. Missing one → add the token first.
- **All user-visible text through `@release/translation`.** A key must exist in **both** `packages/translation/src/locales/en/common.json` and `…/ru/common.json`. No string literals in `.tsx`.
- **Code comments in English.** `presets.ts` and some kit files carry Russian comments; those are legacy. New comments are English.
- **Guessing about the rules is forbidden.** Anything not settled by `docs/rules/` goes to `docs/rules/backlog.md` **and** gets a `> ❓ **Не из правил.**` marker at the exact paragraph in the spec.
- **A movement found in two scenes is a module that has not been packaged yet.** Port into the shared home; never copy into a second place. Task 1 exists for precisely this reason.
- **Run into a gap — record it** in the audit page's register (`apps/playground/stories/AnimationAuditStory`) **and** `docs/animations/backlog.md`. Task 9 collects the ones this work already knows about; anything new found on the way joins them.
- **Commands:** `pnpm test` (all), `pnpm -C apps/frontend test <path>` / `pnpm -C apps/ui test <path>` (one package), `pnpm typecheck`, `pnpm lint`. A pre-commit hook runs `typecheck` and lints staged files; expect it on every commit.
- **`pnpm lint` does not work from this worktree.** `biome.json`'s `files.includes` carries `"!**/.claude/worktrees"`, and this worktree's own absolute path matches it, so biome ignores the whole tree and exits 1 with "No files were processed". Lint by explicit path instead: `npx release-lint check --error-on-warnings <paths>`. The pre-commit hook is unaffected (lint-staged passes explicit paths).
- **Timings are the stories', not new inventions.** `PICK_BEAT` 620 · `REQUEST_HOLD` 820 · `REVEAL_HOLD` 820 · `CENTER_HOLD` 820 · `MISS_HOLD` 1620 · shake `amp 9 / 460ms / spring` · `REVEAL_W` 220 · `SEAT_SHRINK` 0.7 · grid stagger 45ms.

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `apps/ui/src/animations/presets.ts` | `takeFromSeat` — the pair `dealToSeat` never had | 1 |
| `docs/animations/reference.md` | its row (test-enforced by `docs.test.ts`) | 1, 9 |
| `apps/frontend/src/features/board-beats/planBeats.ts` | two new plan kinds, pure | 2 |
| `apps/frontend/src/features/board-beats/transferBeat.tsx` | **new** — everything that flies for a transfer | 3–7 |
| `apps/frontend/src/features/board-beats/useBeats.ts` | queue wiring for the two kinds | 3, 6 |
| `apps/frontend/src/features/board-beats/index.ts` | barrel export | 3 |
| `apps/frontend/src/pages/board/[gameId]/_useRequestStaging.tsx` | **new** — the catalog band, the `giveCard` auto-resolve | 8 |
| `apps/frontend/src/pages/board/[gameId]/_Board.tsx` | prompt suppression, the band, the public centre card | 8 |
| `packages/translation/src/locales/{en,ru}/common.json` | the miss note, the catalog prompt | 6, 8 |
| `docs/animations/recipes.md`, `AnimationAuditStory`, `docs/animations/backlog.md` | the spec's written pair, and the findings | 9 |

Tasks 3–7 all edit `transferBeat.tsx`. That is deliberate: the file is one runner with one `run` per plan kind, and the legs are added one at a time so each carries its own test cycle and its own review gate. Do not split the file.

---

### Task 1: `takeFromSeat` — the movement out of a seat

`dealToSeat` sends a card from the centre into a player's seat, where it fades because it is dissolving into a hidden hand. Nothing in the vocabulary comes back *out*. Two legs in this plan need that (the taker's flight in Task 3, the watcher's in Task 5), and the deferred System Upgrade prototype throws cards seat → centre too — so by the project's own rule this is a module, not a movement to write twice.

Geometrically it is `drawToCenter`. It is still its own preset, because that one's name says it leaves the draw deck, and the vocabulary already names movements by meaning over geometry — `returnToDeck` is documented as "pair of `drawToCenter`" and exists separately for exactly this reason.

**Files:**
- Modify: `apps/ui/src/animations/presets.ts` (beside `dealToSeat`, ~line 175)
- Modify: `docs/animations/reference.md` (the presets table, after the `dealToSeat` row)
- Test: `apps/ui/src/animations/docs.test.ts` (existing — it enforces the row; no new test file)

**Interfaces:**
- Consumes: nothing.
- Produces: `play('takeFromSeat', el, { from: Rect, to: Rect, duration?: number })` → `Animation | null`. Default duration 460ms, `EASE`, no fade.

- [ ] **Step 1: Add the preset, and watch the docs test fail**

In `apps/ui/src/animations/presets.ts`, directly after the `dealToSeat` entry:

```ts
  // A card comes OUT of a player's seat to the centre — the pair of
  // dealToSeat, which dissolves a card into a hidden hand. No fade: this one
  // is arriving on the table rather than leaving it, and it is about to be
  // turned over. Geometrically the same travel as drawToCenter; kept separate
  // because that preset's name says it leaves the draw deck, and a card taken
  // out of a hand does not.
  takeFromSeat: (el: Element, p?: Record<string, unknown>): Animation | null =>
    move(el, p as MoveParams, durationOf(p, 460), EASE),
```

- [ ] **Step 2: Run the docs test to verify it fails**

Run: `pnpm -C apps/ui test -- docs`
Expected: FAIL — `expected [ 'takeFromSeat' ] to deeply equal []` from "gives every preset a row in reference.md". This is the registry noticing an undocumented preset, which is the point of the test.

- [ ] **Step 3: Add the reference row**

In `docs/animations/reference.md`, in the presets table immediately after the `dealToSeat` row:

```markdown
| `takeFromSeat` | `duration` ?? **460** | EASE | — | `{ from, to, duration? }` | a card comes out of a player seat to the center (pair of `dealToSeat`) |
```

- [ ] **Step 4: Run the docs test to verify it passes**

Run: `pnpm -C apps/ui test -- docs`
Expected: PASS, both tests.

- [ ] **Step 5: Commit**

```bash
git add apps/ui/src/animations/presets.ts docs/animations/reference.md
git commit -m "Add takeFromSeat, the pair dealToSeat never had (#105)"
```

---

### Task 2: `planBeats` grows `requested` and `handTransfer`

Pure, and therefore the cheapest place to pin the facts that actually matter. Three of them are derived rather than carried, and each derivation has a reason it cannot be done later:

- `role` — who this peer is to the transfer. `PlannedDraw.mine` sets the precedent.
- `named` — whether this is the Security Bug path or a random steal. The two halves of a Security Bug arrive in **different batches** (`requested{hit:true}` opens the `giveCard` pending and returns; the transfer comes from the victim's own `RESOLVE`), so nothing in the transfer's batch says so. It is read off the projection the batch animates away from: while a `giveCard` is open, `before.pending.kind === 'giveCard'`. A plain equality check against a public pending — not a rule reconstructed from card ids.
- `donorHand` — how many backs the random-steal grid deals. Off `before`, because the live projection has already taken the card out (I1).

`card` is whatever the event carried and **nothing widens it**. Absent means this peer is not entitled to the identity, and that single absence is what selects the closed flight in Task 5.

**Files:**
- Modify: `apps/frontend/src/features/board-beats/planBeats.ts` (the `BeatPlan` union ~line 66; the walk's `switch`)
- Test: `apps/frontend/src/features/board-beats/planBeats.test.ts`

**Interfaces:**
- Consumes: `BoardState` (`~/entities/game/board`), `Event` (`@release/engine`).
- Produces: two `BeatPlan` members, consumed by Tasks 3–7 and by `useBeats`:

```ts
export type TransferRole = 'taker' | 'victim' | 'watcher'

// added to BeatPlan
| { kind: 'requested'; key: string; eventId: number
    attacker: string; target: string; card: string; hit: boolean }
| { kind: 'handTransfer'; key: string; eventId: number
    from: string; to: string; card?: string
    role: TransferRole; named: boolean; donorHand: number }
```

- [ ] **Step 1: Write the failing tests**

Append to `apps/frontend/src/features/board-beats/planBeats.test.ts`. `boardBefore` and `card` already exist at the top of that file; `boardBefore`'s `selfId` is `'p1'`.

```ts
describe('card transfers', () => {
  const requested = (over: Partial<Extract<Event, { type: 'requested' }>> = {}): Event =>
    ({
      id: 1,
      type: 'requested',
      attacker: 'p1',
      target: 'p2',
      card: 'attack-bug',
      hit: true,
      ...over,
    }) as Event

  const transfer = (over: Partial<Extract<Event, { type: 'handTransfer' }>> = {}): Event =>
    ({ id: 2, type: 'handTransfer', from: 'p2', to: 'p1', card: 'attack-bug', ...over }) as Event

  it('carries a request through whole, hit or miss', () => {
    const [hit] = planBeats([requested()], boardBefore())
    expect(hit).toMatchObject({
      kind: 'requested',
      attacker: 'p1',
      target: 'p2',
      card: 'attack-bug',
      hit: true,
    })
    const [miss] = planBeats([requested({ hit: false })], boardBefore())
    expect(miss).toMatchObject({ kind: 'requested', hit: false })
  })

  it('names the role from selfId', () => {
    const taker = planBeats([transfer()], boardBefore())[0]
    expect(taker).toMatchObject({ kind: 'handTransfer', role: 'taker' })

    const victim = planBeats([transfer({ from: 'p1', to: 'p2' })], boardBefore())[0]
    expect(victim).toMatchObject({ kind: 'handTransfer', role: 'victim' })

    const watcher = planBeats([transfer({ from: 'p2', to: 'p3' })], boardBefore())[0]
    expect(watcher).toMatchObject({ kind: 'handTransfer', role: 'watcher' })
  })

  it('reads `named` off the giveCard pending, not off the batch', () => {
    // The `requested` that started a Security Bug landed in an EARLIER batch —
    // it opened the pending and returned. So the only thing in reach that says
    // this transfer was a named one is the projection the batch animates away
    // from, and it says so publicly: `giveCard` is projected unredacted.
    const named = planBeats(
      [transfer()],
      boardBefore({ pending: { kind: 'giveCard', player: 'p2', requested: 'attack-bug' } }),
    )[0]
    expect(named).toMatchObject({ kind: 'handTransfer', named: true })

    // A random steal raises no pending at all (handAttacks.ts:43 `stealRandom`).
    const random = planBeats([transfer()], boardBefore())[0]
    expect(random).toMatchObject({ kind: 'handTransfer', named: false })
  })

  it('takes the donor hand size off the pre-batch projection', () => {
    // I1: by the time the beat runs the projection has already taken the card
    // out, so a grid measured from `live` would be one back short.
    const plan = planBeats(
      [transfer()],
      boardBefore({
        opponents: [{ id: 'p2', name: 'Two', handCount: 4, release: {} }],
      }),
    )[0]
    expect(plan).toMatchObject({ kind: 'handTransfer', donorHand: 4 })
  })

  it('never widens a redacted transfer', () => {
    // THE correctness property. `handTransfer.card` is present only for the two
    // parties (handAttacks.ts sets `visibleTo: [from, to]`), and the closed
    // flight is selected by that absence — never by a rule the board re-derives
    // about who may see what. A plan that invented a card here would leak the
    // identity into the DOM for every spectator.
    const plan = planBeats([transfer({ from: 'p2', to: 'p3', card: undefined })], boardBefore())[0]
    expect(plan).toMatchObject({ kind: 'handTransfer', role: 'watcher' })
    expect((plan as Extract<BeatPlan, { kind: 'handTransfer' }>).card).toBeUndefined()
  })
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm -C apps/frontend test -- planBeats`
Expected: FAIL — every new case gets `undefined` for the first plan, because the walk yields no beat for these event types yet.

- [ ] **Step 3: Add the plan kinds**

In `apps/frontend/src/features/board-beats/planBeats.ts`, above the `BeatPlan` union:

```ts
/** who this peer is to a transfer — the same shape `PlannedDraw.mine` has, widened */
export type TransferRole = 'taker' | 'victim' | 'watcher'
```

Then two members on `BeatPlan`, after the `eliminated` entry:

```ts
  // A card is demanded by name (Security Bug). Public on a hit AND on a miss —
  // `docs/rules/cards.md:125` — so every peer plans this identically, and `hit`
  // is what tells the two outcomes apart. `attacker`/`target` come off the
  // event rather than off the turn because a `reflect` (Works on my Machine,
  // fake/attacks.ts:260-269) swaps the roles, and the event is the only thing
  // that already knows which way round they ended up.
  | {
      kind: 'requested'
      key: string
      eventId: number
      attacker: string
      target: string
      card: string
      hit: boolean
    }
  // A card changes hands. `card` is present only for the two parties
  // (`visibleTo: [from, to]` in fake/handAttacks.ts); its ABSENCE is what
  // selects the closed flight, and nothing here may widen it.
  | {
      kind: 'handTransfer'
      key: string
      eventId: number
      from: string
      to: string
      card?: string
      role: TransferRole
      named: boolean
      donorHand: number
    }
```

- [ ] **Step 4: Add the walk's two cases**

In the `switch (e.type)` inside `planBeats`, beside the other terminal cases. Both `flush()` first — a transfer is its own gesture and must not coalesce into a run of discards in front of it.

```ts
      case 'requested': {
        flush()
        plans.push({
          kind: 'requested',
          key: `requested:${e.id}`,
          eventId: e.id,
          attacker: e.attacker,
          target: e.target,
          card: e.card,
          hit: e.hit,
        })
        break
      }
      case 'handTransfer': {
        flush()
        // `named` cannot come from this batch: `requested{hit:true}` opened the
        // `giveCard` pending and returned, and the transfer arrives from the
        // victim's own RESOLVE — a separate reduction. The projection the batch
        // animates away from is what still knows, and it knows publicly.
        const named = before.pending?.kind === 'giveCard'
        const role: TransferRole =
          e.to === before.selfId ? 'taker' : e.from === before.selfId ? 'victim' : 'watcher'
        // I1 — the donor's fan as it stands ON SCREEN. `live` has already lost
        // the card, so a grid measured there would deal one back too few.
        const donorHand =
          e.from === before.selfId
            ? before.you.hand.length
            : (before.opponents.find((o) => o.id === e.from)?.handCount ?? 0)
        plans.push({
          kind: 'handTransfer',
          key: `transfer:${e.id}`,
          eventId: e.id,
          from: e.from,
          to: e.to,
          // spread rather than assigned: `card` must stay ABSENT when the event
          // had none, not become an explicit `undefined` a later reader could
          // mistake for a value it is allowed to fill in
          ...(e.card ? { card: e.card } : {}),
          role,
          named,
          donorHand,
        })
        break
      }
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm -C apps/frontend test -- planBeats`
Expected: PASS, all cases including the pre-existing ones.

- [ ] **Step 6: Export the new type from the barrel**

In `apps/frontend/src/features/board-beats/index.ts`, add `TransferRole` to the existing type export:

```ts
export type {
  BeatPlan,
  DiscardCard,
  DiscardSource,
  PileStep,
  PlannedDraw,
  TransferRole,
} from './planBeats'
```

- [ ] **Step 7: Typecheck and commit**

Run: `pnpm typecheck`
Expected: all seven packages Done.

```bash
git add apps/frontend/src/features/board-beats/planBeats.ts apps/frontend/src/features/board-beats/planBeats.test.ts apps/frontend/src/features/board-beats/index.ts
git commit -m "planBeats: requested and handTransfer become plans (#105)"
```

---

### Task 3: `transferBeat` — the file, the taker's flight, and the queue wiring

The taker's leg is the one the other two are mirrors of, so it comes first and brings the file with it. A card comes out of the donor's seat, grows to the centre, turns over, is read, and settles into the fan.

Two publishes, and both exist because the beat's last frame must equal the projection it hands over to (I7): the donor's count drops when the card leaves the seat, and the fan grows when it lands. Get either wrong and the card visibly jumps on the handover.

After this task, `runTransfer` does nothing for the victim and watcher roles. That is safe rather than broken — a beat that publishes nothing hands its own base on untouched, the queue drains, and the live projection wins. Tasks 4 and 5 fill them in.

**Files:**
- Create: `apps/frontend/src/features/board-beats/transferBeat.tsx`
- Modify: `apps/frontend/src/features/board-beats/useBeats.ts`
- Modify: `apps/frontend/src/features/board-beats/index.ts`
- Test: `apps/frontend/src/features/board-beats/transferBeat.test.tsx` (create)

**Interfaces:**
- Consumes: `BeatPlan`, `TransferRole` (Task 2); `BoardAnchors`, `BeatRun`, `BoardState` (`~/entities/game/board`); `play`, `useFlyer`, `useHandArrival`, `wait` (`@release/ui/animations`); `cardById`, `CARD_W`, `cardBoxIn` (`@release/ui`).
- Produces, consumed by `useBeats` and by Tasks 4–7:

```ts
export function useTransferBeat(anchors: BoardAnchors): {
  overlay: ReactNode[]
  gapAt: number | null
  gapSize: number
  runTransfer: (plan: Extract<BeatPlan, { kind: 'handTransfer' }>, beat: BeatRun) => Promise<void>
  reset: () => void
}
```

`runRequested` joins this return in Task 6.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/features/board-beats/transferBeat.test.tsx`. The mock and probe shape are lifted from `drawBeat.test.tsx` on purpose — same harness, same reasons, including the fake-timer loop that forces React to flush mid-run.

```tsx
import { act, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import type { BeatPlan } from './planBeats'
import { useTransferBeat } from './transferBeat'

const played = vi.hoisted(() => ({ names: [] as string[], shakes: [] as unknown[] }))
const arrivals = vi.hoisted(() => ({ handLengths: [] as number[], calls: 0 }))

vi.mock('@release/ui/animations', async (importOriginal) => {
  const real = await importOriginal<typeof import('@release/ui/animations')>()
  return {
    ...real,
    play: (name: string, _el: unknown, params?: unknown) => {
      played.names.push(name)
      if (name === 'shake') played.shakes.push(params)
      return { finished: Promise.resolve() } as unknown as Animation
    },
    useHandArrival: (...args: Parameters<typeof real.useHandArrival>) => {
      const step = real.useHandArrival(...args)
      return {
        ...step,
        arrive: (items: Parameters<typeof step.arrive>[0], handLength: number, at?: number) => {
          arrivals.calls += 1
          arrivals.handLengths.push(handLength)
          return step.arrive(items, handLength, at)
        },
      }
    },
  }
})

const base = {
  you: { name: 'You', hand: [{ uid: 'u1', card: { id: 'attack-bug' } }], release: {} },
  opponents: [{ id: 'p2', name: 'Two', handCount: 5, release: {} }],
  decks: { main: [10], events: 5, discardCount: 0 },
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
  handSlotAt: () => node(),
  releaseSlot: () => null,
  bindPile: () => {},
  bindSeat: () => {},
  bindReleaseSlot: () => {},
} as unknown as BoardAnchors

export const transferPlan = (
  over: Partial<Extract<BeatPlan, { kind: 'handTransfer' }>> = {},
): Extract<BeatPlan, { kind: 'handTransfer' }> => ({
  kind: 'handTransfer',
  key: 'transfer:2',
  eventId: 2,
  from: 'p2',
  to: 'p1',
  card: 'attack-bug',
  role: 'taker',
  named: true,
  donorHand: 5,
  ...over,
})

export function runTransfer(plan: Extract<BeatPlan, { kind: 'handTransfer' }>) {
  const published: BoardState[] = []
  let start: (() => Promise<void>) | null = null
  function Probe() {
    const beat = useTransferBeat(anchors)
    start = () => beat.runTransfer(plan, { base, publish: (s) => published.push(s) })
    return <>{beat.overlay}</>
  }
  const view = render(<Probe />)
  return {
    published,
    view,
    go: async () => {
      vi.useFakeTimers()
      try {
        let done = false
        const finished = start?.().then(() => {
          done = true
        })
        while (!done) {
          await act(async () => {
            await vi.advanceTimersByTimeAsync(20)
          })
        }
        await finished
      } finally {
        vi.useRealTimers()
      }
    },
  }
}

beforeEach(() => {
  played.names = []
  played.shakes = []
  arrivals.handLengths = []
  arrivals.calls = 0
})

it('flies a taken card out of the donor seat and into the fan', async () => {
  const r = runTransfer(transferPlan())
  await r.go()
  expect(played.names).toContain('takeFromSeat')
  expect(arrivals.calls).toBe(1)
  // it lands at the END of the fan: the engine appends what a hand gains, and
  // `toBoardState` passes that order through, so landing anywhere else makes
  // the last frame disagree with the projection it hands over to
  expect(arrivals.handLengths).toEqual([1])
})

it('drops the donor count as the card leaves the seat', async () => {
  // I7 — the beat's last frame IS the projection. The donor is one card lighter
  // on the live projection by the time this runs, so a beat that never said so
  // would pop the count on the handover.
  const r = runTransfer(transferPlan())
  await r.go()
  const counts = r.published.map((s) => s.opponents[0].handCount)
  expect(counts).toContain(4)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm -C apps/frontend test -- transferBeat`
Expected: FAIL — `Failed to resolve import "./transferBeat"`, since the module does not exist yet.

- [ ] **Step 3: Write `transferBeat.tsx`**

```tsx
import { CARD_W, cardById, cardBoxIn } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import { play, useFlyer, useHandArrival, wait } from '@release/ui/animations'
import { useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors, BoardState } from '~/entities/game/board'
import type { BeatPlan } from './planBeats'

// A card changes hands. One surface seen from three sides — you take a card,
// you lose one, or you watch one cross the table — and they are one runner
// because the flight is one flight: a seat, the centre, a destination. What
// differs is which end is a hand and which is a seat, and whether the card has
// an identity this peer is entitled to at all.
//
// THE BRANCH THAT MATTERS is not `role`, it is `plan.card`. Present means this
// peer is a party to the transfer (the engine sets `visibleTo: [from, to]`);
// absent means it is not, and the flight closes. Nothing here re-derives who
// may see what — that answer arrived with the event, and re-deriving it is how
// a hand leaks.

const REVEAL_HOLD = 820 // face-up at the centre before it drops into the fan
const SEAT_SHRINK = 0.7 // how small a card is inside a seat — `drawBeat`'s own value

// One flyer key for the whole run: there is never more than one card in the
// air here, and a key IS a flyer — raising the same key twice replaces the
// carrier instead of hanging a second node on the same name.
const KEY = 'transfer'

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useTransferBeat(anchors: BoardAnchors) {
  const { overlay: flyerOverlay, raise, pin, patch, drop, elOf } = useFlyer()

  // The run's own context, held in a ref because the whole beat is one closure
  // and the hand it lands in is the one THIS run has grown, not the one the
  // batch started with.
  const ctx = useRef<BeatRun | null>(null)

  const {
    overlay: handOverlay,
    gapAt,
    gapSize,
    arrive,
    reset: resetArrival,
  } = useHandArrival(anchors.hand, (gap, landed) => {
    const c = ctx.current
    if (!c) return
    const hand = [...c.base.you.hand]
    hand.splice(gap, 0, ...landed.map((it) => ({ uid: it.key, card: it.card })))
    const next = { ...c.base, you: { ...c.base.you, hand } }
    c.base = next
    c.publish(next)
  })

  const latest = useRef({ anchors, arrive })
  latest.current = { anchors, arrive }

  // The donor is one card lighter the moment it leaves them. Published as its
  // own step rather than folded into the landing, because the two ends of a
  // transfer are two different players and the flight is long enough to see
  // both — and because a watcher's flight has this end and no other.
  const dropFromDonor = useCallback((player: string) => {
    const c = ctx.current
    if (!c) return
    const next: BoardState = {
      ...c.base,
      opponents: c.base.opponents.map((o) =>
        o.id === player ? { ...o, handCount: Math.max(0, o.handCount - 1) } : o,
      ),
    }
    c.base = next
    c.publish(next)
  }, [])

  const runTransfer = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'handTransfer' }>, beat: BeatRun) => {
      ctx.current = beat
      try {
        if (plan.role === 'taker') {
          const a = latest.current.anchors
          const seat = a.seatBox(plan.from)
          const centre = rectOf(a.centre.current)
          const card = plan.card ? cardById(plan.card) : null
          // A taker always knows what they took — but a missing rect or an
          // unknown id ends the leg and lets the projection stand, which is the
          // contract every runner keeps.
          if (!seat || !centre || !card) return
          // out of the seat's own card box (I6), at the size a card is while it
          // is inside a hidden hand — the exact box `dealToSeat` sinks into
          const from = cardBoxIn(seat, CARD_W * SEAT_SHRINK)
          const [el] = await raise([{ key: KEY, card, at: from, faceDown: true }])
          if (el) {
            const anim = play('takeFromSeat', el, { from, to: centre })
            if (anim) await anim.finished
            pin(KEY, centre) // I4 — it IS at the centre now
          }
          dropFromDonor(plan.from)
          patch(KEY, { faceDown: false }) // Card plays its own flipCard
          await wait(REVEAL_HOLD)
          const at = rectOf(elOf(KEY))
          drop(KEY)
          // The fan as it stands RIGHT NOW, and the card lands at its END —
          // the engine appends what a hand gains and `toBoardState` passes that
          // order through untouched, so any other slot makes this beat's last
          // frame disagree with the projection it hands over to.
          const grown = ctx.current?.base.you.hand.length ?? 0
          if (at) await latest.current.arrive([{ key: `t${plan.eventId}`, card, from: at }], grown, grown)
          return
        }
        // victim — Task 4; watcher — Task 5. Until then they publish nothing
        // and hand their own base on untouched: the queue drains, the shadow is
        // dropped, and the live projection wins.
      } finally {
        ctx.current = null
      }
    },
    [raise, pin, patch, drop, elOf, dropFromDonor],
  )

  // A new match cancels what is in the air: the carrier this run may have left
  // mid-flight, and the parked arrival that would otherwise land a dead match's
  // card in the new one's fan.
  const reset = useCallback(() => {
    drop()
    resetArrival()
  }, [drop, resetArrival])

  return { overlay: [...flyerOverlay, ...handOverlay], gapAt, gapSize, runTransfer, reset }
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm -C apps/frontend test -- transferBeat`
Expected: PASS, both tests.

- [ ] **Step 5: Wire it into the queue**

In `apps/frontend/src/features/board-beats/useBeats.ts`:

Add the import beside the others:

```ts
import { useTransferBeat } from './transferBeat'
```

Instantiate it beside the other runners (after `const elimination = useEliminateBeat()`):

```ts
  const transfers = useTransferBeat(anchors)
```

Add the plan case inside `beatOf`, after the `neutralized` case:

```ts
      if (plan.kind === 'handTransfer') {
        return {
          key: plan.key,
          base,
          // Not exclusive: a card changing hands does not own the table the way
          // an elimination clip does, and nothing about it needs input dead.
          exclusive: false,
          alarm: false,
          run: (ctx) => transfers.runTransfer(plan, ctx),
        }
      }
```

Add `transfers.runTransfer` to `beatOf`'s dependency array.

Add its overlay to the `overlays` array in the return:

```ts
      ...transfers.overlay,
```

Add `transfers.reset()` beside the other runner resets in the match-boundary effect, and extend that effect's `biome-ignore` comment to mention it — the reason is identical (`useHandArrival`'s own `reset` is unmemoized, so listing the runner would fire the effect every render instead of once per match key):

```ts
    transfers.reset()
```

And the fan gap now has two possible sources:

```ts
    // The fan opens for a card on its way into it. Two beats grow it now — a
    // draw (I8) and a card taken from an opponent — and they can never both be
    // open, because one beat runs at a time. So this is a choice between them,
    // not a merge of them.
    gapAt: draws.gapAt ?? transfers.gapAt,
    gapSize: draws.gapAt != null ? draws.gapSize : transfers.gapSize,
```

- [ ] **Step 6: Export from the barrel**

In `apps/frontend/src/features/board-beats/index.ts`:

```ts
export { useTransferBeat } from './transferBeat'
```

- [ ] **Step 7: Run the whole frontend suite and typecheck**

Run: `pnpm -C apps/frontend test`
Expected: PASS. If `boardIntro.test.tsx`'s StrictMode case fails, re-run it alone (`pnpm -C apps/frontend test -- boardIntro`) — it waits nine real seconds and is load-sensitive; a pass in isolation means it is not yours.

Run: `pnpm typecheck`
Expected: all seven packages Done.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/features/board-beats/transferBeat.tsx apps/frontend/src/features/board-beats/transferBeat.test.tsx apps/frontend/src/features/board-beats/useBeats.ts apps/frontend/src/features/board-beats/index.ts
git commit -m "transferBeat: a taken card comes out of a seat and into the fan (#105)"
```

---

### Task 4: The victim's leg — the mirror

The same flight read backwards, and the one place where the mirror is genuinely a different movement rather than the same one reversed: it ends in a **seat**, not a hand, so `useHandArrival` has no part in it. The card leaves a hand; it does not settle into one.

The flip is face-**down**, at the centre. That is the whole story of the beat: at the moment it turns over it stops being yours.

**Files:**
- Modify: `apps/frontend/src/features/board-beats/transferBeat.tsx`
- Test: `apps/frontend/src/features/board-beats/transferBeat.test.tsx`

**Interfaces:**
- Consumes: everything Task 3 produced. No new exports.

- [ ] **Step 1: Write the failing tests**

Append to `transferBeat.test.tsx`:

```tsx
it('sends a lost card from the fan into the taker seat, and never into a hand', async () => {
  const r = runTransfer(transferPlan({ from: 'p1', to: 'p2', role: 'victim' }))
  await r.go()
  expect(played.names).toContain('dealToSeat')
  // THE assertion that separates the mirror from the original. `useHandArrival`
  // is the step for a card ARRIVING in the fan; a card leaving one must never
  // touch it. Pinned explicitly because it is exactly the kind of thing a later
  // refactor unifies by accident, and nothing else would notice.
  expect(arrivals.calls).toBe(0)
})

it('takes the lost card out of your own fan', async () => {
  const r = runTransfer(transferPlan({ from: 'p1', to: 'p2', role: 'victim' }))
  await r.go()
  const hands = r.published.map((s) => s.you.hand.length)
  expect(hands).toContain(0)
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm -C apps/frontend test -- transferBeat`
Expected: FAIL — `dealToSeat` never played and `published` empty, because `runTransfer` returns without doing anything for `role: 'victim'`.

- [ ] **Step 3: Add the constant and the leg**

In `transferBeat.tsx`, beside `REVEAL_HOLD`:

```ts
const CENTER_HOLD = 820 // face-down at the centre before it sinks into the seat
```

Replace the `// victim — Task 4; watcher — Task 5.` comment with:

```ts
        if (plan.role === 'victim') {
          const a = latest.current.anchors
          const centre = rectOf(a.centre.current)
          const seat = a.seatBox(plan.to)
          const card = plan.card ? cardById(plan.card) : null
          if (!centre || !seat || !card) return
          // Which slot it leaves from. The registry indexes rather than looks
          // up by uid — deliberately, so it need not know the hand — and the
          // caller already holds the hand it planned against, so the index is
          // resolved here. Matching on the card ID is what the engine itself
          // matched on (`onGiveCard` checks `card.id === pending.requested`);
          // copies are interchangeable, so the first is as right as any.
          const index = beat.base.you.hand.findIndex((h) => h.card.id === plan.card)
          const slot = index >= 0 ? rectOf(a.handSlotAt(index)) : null
          if (!slot) return
          const [el] = await raise([{ key: KEY, card, at: slot, faceDown: false }])
          // your fan closes the gap while the card is in the air
          const c0 = ctx.current
          if (c0) {
            const hand = c0.base.you.hand.filter((_, i) => i !== index)
            const next = { ...c0.base, you: { ...c0.base.you, hand } }
            c0.base = next
            c0.publish(next)
          }
          if (el) {
            const anim = play('playToCenter', el, { from: slot, to: centre })
            if (anim) await anim.finished
            pin(KEY, centre)
          }
          // It turns FACE-DOWN, and that is the beat: from here it is theirs,
          // and a hidden hand is where it is going.
          patch(KEY, { faceDown: true })
          await wait(CENTER_HOLD)
          const to = cardBoxIn(seat, CARD_W * SEAT_SHRINK)
          const held = elOf(KEY)
          if (held) {
            const anim = play('dealToSeat', held, { from: centre, to })
            if (anim) await anim.finished
          }
          drop(KEY)
          // …and the taker's counter carries it now. That counter IS their hand.
          const c1 = ctx.current
          if (c1) {
            const next: BoardState = {
              ...c1.base,
              opponents: c1.base.opponents.map((o) =>
                o.id === plan.to ? { ...o, handCount: o.handCount + 1 } : o,
              ),
            }
            c1.base = next
            c1.publish(next)
          }
          return
        }
        // watcher — Task 5. Until then it publishes nothing and hands its own
        // base on untouched: the queue drains and the live projection wins.
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm -C apps/frontend test -- transferBeat`
Expected: PASS, all four tests.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: all seven packages Done.

```bash
git add apps/frontend/src/features/board-beats/transferBeat.tsx apps/frontend/src/features/board-beats/transferBeat.test.tsx
git commit -m "transferBeat: the victim's mirror, ending in a seat and not a hand (#105)"
```

---

### Task 5: The watcher's leg — the closed flight

For everyone who is not a party, the event arrived without a `card`. There is nothing to flip and nothing to reveal, and the beat must not invent one. Seat to seat, face-down the whole way, on the same `COVER` stand-in `drawBeat` uses for a closed draw.

This is the leg the issue calls a correctness matter rather than a visual one, and the test is what makes it one.

**Files:**
- Modify: `apps/frontend/src/features/board-beats/transferBeat.tsx`
- Test: `apps/frontend/src/features/board-beats/transferBeat.test.tsx`

**Interfaces:**
- Consumes: everything Tasks 3–4 produced. No new exports.

- [ ] **Step 1: Write the failing tests**

Append to `transferBeat.test.tsx`:

```tsx
it('crosses the table closed when the event carried no card', async () => {
  const r = runTransfer(
    transferPlan({ from: 'p2', to: 'p3', role: 'watcher', card: undefined, named: false }),
  )
  await r.go()
  expect(played.names).toContain('takeFromSeat')
  expect(played.names).toContain('dealToSeat')
  // never turned over, and never handed to the fan
  expect(arrivals.calls).toBe(0)
})

it('leaks no identity into the DOM for a peer that is not a party', async () => {
  // The engine redacts `handTransfer.card` to `visibleTo: [from, to]`, and this
  // is the board keeping that promise. A `faceDown` prop is not enough on its
  // own — what matters is that no real card id is ever mounted, because a card
  // rendered face-down still carries its own art and name in the DOM.
  const r = runTransfer(
    transferPlan({ from: 'p2', to: 'p3', role: 'watcher', card: undefined, named: false }),
  )
  await r.go()
  expect(r.view.container.innerHTML).not.toContain('attack-bug')
})
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm -C apps/frontend test -- transferBeat`
Expected: FAIL on the first — neither preset played, because `runTransfer` still returns without doing anything for `role: 'watcher'`. (The second passes vacuously today; it is here to stay passing, and it will fail loudly the moment someone reaches for `plan.card ?? something`.)

- [ ] **Step 3: Add the cover card and the leg**

In `transferBeat.tsx`, add the import of `CardData` and the stand-in beside the constants — the same shape and the same reason as `drawBeat`'s:

```ts
import type { CardData } from '@release/ui'
```

```ts
// A card nobody at this seat is entitled to know. The projection never says
// what it is, so nothing here may guess: this carries no face, only the base
// deck's cover, and it is always flown faceDown. `Card` reads `deck` for the
// back and nothing else.
const COVER: CardData = {
  id: 'unknown',
  name: '',
  category: 'protection',
  deck: 'base',
  art: '',
  tags: [],
  qty: 0,
}
```

Replace the `// watcher — Task 5.` comment with:

```ts
        // A watcher. `plan.card` is absent — not "unknown to us", absent from
        // the event — so there is nothing to turn over and nothing to hold at
        // the centre to be read. It crosses closed, and the two counts are the
        // only thing that actually changes.
        const a = latest.current.anchors
        const fromSeat = a.seatBox(plan.from)
        const toSeat = a.seatBox(plan.to)
        const centre = rectOf(a.centre.current)
        if (!fromSeat || !toSeat || !centre) return
        const from = cardBoxIn(fromSeat, CARD_W * SEAT_SHRINK)
        const to = cardBoxIn(toSeat, CARD_W * SEAT_SHRINK)
        const [el] = await raise([{ key: KEY, card: COVER, at: from, faceDown: true }])
        if (el) {
          const out = play('takeFromSeat', el, { from, to: centre })
          if (out) await out.finished
          pin(KEY, centre)
          dropFromDonor(plan.from)
          const home = play('dealToSeat', el, { from: centre, to })
          if (home) await home.finished
        }
        drop(KEY)
        const c = ctx.current
        if (c) {
          const next: BoardState = {
            ...c.base,
            opponents: c.base.opponents.map((o) =>
              o.id === plan.to ? { ...o, handCount: o.handCount + 1 } : o,
            ),
          }
          c.base = next
          c.publish(next)
        }
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm -C apps/frontend test -- transferBeat`
Expected: PASS, all six tests.

- [ ] **Step 5: Typecheck and commit**

Run: `pnpm typecheck`
Expected: all seven packages Done.

```bash
git add apps/frontend/src/features/board-beats/transferBeat.tsx apps/frontend/src/features/board-beats/transferBeat.test.tsx
git commit -m "transferBeat: the closed flight, for peers the event did not name (#105)"
```
