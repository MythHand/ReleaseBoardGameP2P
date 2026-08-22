# Release and defence on the board — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the playground's `DefenseReleaseStory` to the real board — a release played with its cost shown in the open, the attack window, attacks from seats, defences that cover them, the defence-side Sudo pair, Security Bug's steal and Rollback's return — all driven by engine events, plus the engine fix that gives a stolen release its own attack window.

**Architecture:** Two PRs. **PR 0** is engine-only, off `main`: a successful Security Bug steal hands its window over to the thief's slot instead of settling the win on the spot (#95). **PR 1** is the scene, on `feat/101-defense-release` (already cut, stacked on `feat/100-combo-pair`): the centre grows a five-slot family, `_useBoardStaging` gains the release-cost gesture, a new `_useDefenseStaging` owns window-time gestures, `planBeats` gains two plans and widens two, a new `defenseBeat.tsx` runs the cover/steal/return, and `useCardPreview` binds to the centre slots.

**Tech Stack:** TypeScript, React 19, Vitest + Testing Library, CSS Modules + design tokens, WAAPI via `@release/ui/animations` (`play()` presets, `useFlyer` / `useHandArrival` / `useDiscardExit`), pnpm workspaces.

**Spec:** [`docs/specs/2026-08-18-defense-release-board-design.md`](./2026-08-18-defense-release-board-design.md) — read it before Task 1; every decision below argues from it.

## Global Constraints

Every task's requirements implicitly include all of these.

- **Rules are canon, guessing is forbidden.** A question the rules do not answer becomes an entry in `docs/rules/backlog.md` **and** a `> ❓ **Не из правил.**` marker at the exact spec paragraph. Never infer a rule "by the sense of it".
- **`prefers-reduced-motion` is honoured everywhere.** `play()` drives WAAPI directly and does **not** check it — JS choreography must ask, via `~/shared/lib/useReducedMotion`. Every new flight needs a reduced-motion path that lands the same end state with no animation.
- **A movement found in two scenes is a module that has not been packaged yet.** Port into the shared home (`apps/ui/src/animations/`), never copy into a second place.
- **Run into a gap — record it.** No module for a movement, a value out of reach, a rule nobody decided: it goes to the audit page's register (`apps/playground/stories/AnimationAuditStory`) **and** `docs/animations/backlog.md`. A local workaround nobody hears about is how one movement ends up written three times.
- **No string literals in `.tsx`.** All user-visible copy goes through `@release/translation`; a key must exist in **both** `packages/translation/src/locales/en/common.json` and `…/ru/common.json`.
- **All text renders through `<Typography>`** from `@release/ui`; never a raw `<p>`/`<span>`/`<h1>` and never hand-written font declarations.
- **Colors are design tokens only** — `var(--*)` from `apps/ui/src/design/tokens.css`. Never a `#hex`, `rgb()`, or named color. Missing a color → add the token first.
- **Spacing is plain px with logical properties** (`padding-inline`, `margin-block-start`) — stylelint enforces this.
- **Code comments in English.**
- **One-way imports** in `apps/frontend`: `app → pages → features → entities → shared`, plus `network` via `entities`/`features`. A feature must never import from a sibling feature — that is why `BeatRun` / `StagedHandoff` live in `entities/game/board/types.ts`.
- **Animation invariants** (`docs/animations/README.md` §I1–I10), the ones this plan leans on repeatedly: **I1** measure rects before mutating the DOM · **I2** `nextFrames()` before starting a flight · **I3** cancel leftover animations before repositioning · **I6** aim at the card box, never a rotated slot rect · **I7** precompute scatter and pass it in · **I8** pass data as arguments inside an async sequence, never read it back off state · **I9** a card's layer is a value it carries, never DOM order.
- **Verification before any completion claim.** Run the command, read the output, then state the result. `pnpm test`, `pnpm lint`, `pnpm typecheck` all pass before a task is called done.
- **Commit at the end of every task**, with the issue number in the subject: `(#95)` for PR 0 tasks, `(#101)` for PR 1 tasks.

---

# PR 0 — a stolen release opens its own attack window (#95)

**Branch:** `fix/95-stolen-release-window`, cut from `main` (NOT from the #101 stack — this lands independently).

```bash
git switch main && git pull && git switch -c fix/95-stolen-release-window
```

**The problem, precisely.** `attacks.ts`'s take-hit branch runs `takeRelease(...)` and then `closeWindow(hit, log)`. `closeWindow` (`fake/window.ts:58-63`) logs `windowClosed` **and calls `checkWin`**. So a stolen release is complete the instant it lands: it never faces the attack time `resolution.md` §1 grants every fresh release "как бы она туда ни попала", and a third stolen release wins on the spot — which `win.test.ts:162-206` currently asserts, pinning the wrong behaviour in writing.

**The fix's shape.** The old window closes and a fresh one opens for the thief's slot in the same reduction, with the win decided when *that* window closes. Because `closeWindow` is deliberately the single place the win is settled, the steal path cannot call it — it needs a sibling that closes without settling, since something is about to be opened in its place.

---

### Task 1: `handOverWindow` — close a window without settling the win

**Files:**
- Modify: `packages/engine/src/fake/window.ts` (add after `closeWindow`, ~line 63)
- Test: `packages/engine/src/fake/window.test.ts`

**Interfaces:**
- Consumes: `openWindow`, `closeWindow`, `checkWin` (already in `window.ts` / imported there from `core.ts`), `ReactionWindow` from `../state`.
- Produces: `handOverWindow(state: GameState, log: Log, target: ReactionWindow['target'], at: number): GameState` — exported from `fake/window.ts`, used by Task 2.

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/src/fake/window.test.ts`. The existing file already builds a 3-player game via its `config()` helper and calls `openWindow` directly with `createLog(s.eventSeq)` (see `window.test.ts:179-191`) — follow that idiom exactly.

```ts
describe('handOverWindow', () => {
  it('closes the standing window and opens a fresh one for the new release', () => {
    const s = engine.createGame(config())
    const log = createLog(s.eventSeq)
    const open = openWindow(s, log, { player: 'p1', slot: 'frontend', card: 'fe#0' }, 1, 1000)
    const log2 = createLog(open.eventSeq)
    const next = handOverWindow(
      open,
      log2,
      { player: 'p2', slot: 'database', card: 'db#0' },
      2000,
    )
    expect(log2.events.map((e) => e.type)).toEqual(['windowClosed', 'windowOpened'])
    expect(next.window).toMatchObject({
      target: { player: 'p2', slot: 'database', card: 'db#0' },
      round: 1,
      openedAt: 2000,
      deadline: 2000 + WINDOW_FIRST_MS,
      passed: [],
    })
  })

  it('does not settle the win on the close it performs', () => {
    // The whole point: the release that just arrived has not faced its window
    // yet, so the game must not end at this close. `closeWindow` would.
    const s = engine.createGame(config())
    const primed: GameState = {
      ...s,
      players: {
        ...s.players,
        p2: {
          ...s.players.p2,
          release: {
            frontend: { card: FE },
            backend: { card: BE },
            database: { card: DB },
          },
        },
      },
    }
    const log = createLog(primed.eventSeq)
    const open = openWindow(primed, log, { player: 'p1', slot: 'frontend', card: 'fe#9' }, 1, 1000)
    const log2 = createLog(open.eventSeq)
    const next = handOverWindow(open, log2, { player: 'p2', slot: 'database', card: DB.uid }, 2000)
    expect(next.over).toBeUndefined()
    expect(log2.events.some((e) => e.type === 'gameOver')).toBe(false)
  })

  it('settles the win immediately when nobody is left to answer the new window', () => {
    // `openWindow` declines with no living responders. Nothing would ever close
    // a window that never opened, so the win has to be decided here instead —
    // the same fallback `placeRelease` already carries.
    const s = engine.createGame(config())
    const primed: GameState = {
      ...s,
      eliminated: s.seating.filter((id) => id !== 'p1'),
      players: {
        ...s.players,
        p1: {
          ...s.players.p1,
          release: {
            frontend: { card: FE },
            backend: { card: BE },
            database: { card: DB },
          },
        },
      },
    }
    const log = createLog(primed.eventSeq)
    const next = handOverWindow(
      { ...primed, window: null },
      log,
      { player: 'p1', slot: 'database', card: DB.uid },
      2000,
    )
    expect(next.window).toBeNull()
    expect(next.over).toEqual({ winner: 'p1', condition: 'release' })
  })
})
```

Make sure the test file's imports cover `handOverWindow`, `WINDOW_FIRST_MS`, `createLog`, `GameState`, and whatever card consts (`FE`, `BE`, `DB`) the file already declares — if it does not declare them, add them in the module-level const style `attacks.test.ts` uses (`{ uid: '<id>#<n>', id: '<id>' }`).

- [ ] **Step 2: Run the test and watch it fail**

```bash
pnpm --filter @release/engine test -- window.test.ts
```

Expected: FAIL — `handOverWindow is not a function` / not exported.

- [ ] **Step 3: Implement `handOverWindow`**

In `packages/engine/src/fake/window.ts`, directly after `closeWindow`:

```ts
// Close the standing window WITHOUT settling the win, because another window is
// opening in its place for a release that has only just arrived.
//
// `closeWindow` is deliberately the one place a win is decided — a release still
// standing when its window shuts has repelled everything thrown at it. A stolen
// release has repelled nothing yet: `resolution.md` §1 gives attack time to every
// fresh release in a zone "как бы она туда ни попала", so the steal hands the
// window over rather than ending the exchange. The win is then settled by the
// close of the window opened here, exactly as it is for a played release (#67).
//
// One window exists at a time (`state.window` is a single slot), so the close and
// the open are one step rather than two overlapping ones — §1's "пока это время
// идёт, в игре не происходит ничего другого" leaves no room for two.
export function handOverWindow(
  state: GameState,
  log: Log,
  target: ReactionWindow['target'],
  at: number,
): GameState {
  const w = state.window
  if (w) log.add({ type: 'windowClosed', player: w.target.player, slot: w.target.slot })
  const opened = openWindow({ ...state, window: null }, log, target, 1, at)
  // `openWindow` declines when nobody is alive to respond. Nothing will ever
  // close a window that never opened, so the win is settled now rather than
  // leaving the game hanging — the same fallback `placeRelease` carries.
  if (!opened.window) return checkWin(opened, log)
  return opened
}
```

Confirm `ReactionWindow` is imported in `window.ts` (it already types `openWindow`'s `target` parameter) and that `checkWin` is imported from `./core` (it already is, for `closeWindow`).

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
pnpm --filter @release/engine test -- window.test.ts
```

Expected: PASS, all three new tests plus every existing one in the file.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/fake/window.ts packages/engine/src/fake/window.test.ts
git commit -m "feat(engine): a window can be handed over instead of settling the win (#95)"
```

---

### Task 2: the steal hands the window to the thief's slot

**Files:**
- Modify: `packages/engine/src/fake/attacks.ts` (the take-hit branch, ~lines 297-310)
- Test: `packages/engine/src/fake/attacks.test.ts`

**Interfaces:**
- Consumes: `handOverWindow` from Task 1.
- Produces: no new exports — the behaviour change is observable through `reduce` only.

- [ ] **Step 1: Write the failing tests**

Add to `packages/engine/src/fake/attacks.test.ts`, beside the existing steal tests (`:369-385` steals, `:387-417` occupied-slot fallback). `staged(attack, defence)` is the file's own helper (`:45-57`): p1 releases Frontend, p1 holds `defence`, p2 holds `attack`.

```ts
it('opens a fresh window on the stolen release in the thief’s zone', () => {
  const attacked = reduce(staged([SEC], []), {
    type: 'ATTACK',
    player: 'p2',
    card: SEC.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: null },
    at: 1002,
  })
  // The release moved, and it is fresh where it landed: p2 owns it now, so the
  // window belongs to p2's slot and p1 is the one who may answer.
  expect(r.state.players.p2.release.frontend?.card).toEqual(FE)
  expect(r.state.window).toMatchObject({
    target: { player: 'p2', slot: 'frontend' },
    round: 1,
    passed: [],
  })
  expect(r.events.map((e) => e.type)).toEqual([
    'tookHit',
    'discarded',
    'releaseStolen',
    'windowClosed',
    'windowOpened',
  ])
})

it('does not open a window when the steal fell through to a discard', () => {
  // The attacker's matching slot is occupied, so `takeRelease` discards the
  // release instead of stealing it. Nothing fresh arrived in anyone's zone, so
  // the exchange simply ends.
  const s = staged([SEC], [])
  const withAttackerRelease: GameState = {
    ...s,
    players: { ...s.players, p2: { ...s.players.p2, release: { frontend: { card: FE2 } } } },
  }
  const attacked = reduce(withAttackerRelease, {
    type: 'ATTACK',
    player: 'p2',
    card: SEC.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: null },
    at: 1002,
  })
  expect(r.state.window).toBeNull()
  expect(r.events.map((e) => e.type)).toEqual([
    'tookHit',
    'discarded',
    'releaseDestroyed',
    'windowClosed',
  ])
})

it('lets the robbed player attack the release that was taken from them', () => {
  // The point of the window: the victim is a responder now, because responders
  // are everyone alive except the release's OWNER, and the owner changed.
  const attacked = reduce(staged([SEC], [BUG]), {
    type: 'ATTACK',
    player: 'p2',
    card: SEC.uid,
    at: 1001,
  })
  const stolen = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: null },
    at: 1002,
  })
  const answer = reduce(stolen.state, {
    type: 'ATTACK',
    player: 'p1',
    card: BUG.uid,
    at: 1003,
  })
  expect(answer.events.some((e) => e.type === 'rejected')).toBe(false)
  expect(answer.events.some((e) => e.type === 'attacked')).toBe(true)
})

it('never opens a window for a reflected Security Bug, because it never steals', () => {
  // The reflection aims at the defender's slot of the attacked type, and that
  // slot holds the very release being defended — it never left, the attack was
  // cancelled. `takeRelease` discards on an occupied slot, so no steal, no
  // window handover; the exchange reopens the ORIGINAL window at round + 1.
  const attacked = reduce(staged([SEC], [WOMM]), {
    type: 'ATTACK',
    player: 'p2',
    card: SEC.uid,
    at: 1001,
  })
  const r = reduce(attacked.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'defend', card: WOMM.uid },
    at: 1002,
  })
  expect(r.events.some((e) => e.type === 'releaseStolen')).toBe(false)
  expect(r.state.window).toMatchObject({ target: { player: 'p1', slot: 'frontend' }, round: 2 })
})
```

`SEC`, `FE`, `FE2`, `BUG` are already module-level consts in this file. `WOMM` is `defense-works-on-my-machine` — if the file does not already declare it, add `const WOMM: CardInstance = { uid: 'defense-works-on-my-machine#0', id: 'defense-works-on-my-machine' }` beside the others.

- [ ] **Step 2: Run the tests and watch them fail**

```bash
pnpm --filter @release/engine test -- attacks.test.ts
```

Expected: the first and third new tests FAIL (no `windowOpened`; `r.state.window` is `null` after the steal, so the follow-up attack is rejected with "no reaction window is open"). The second and fourth should already PASS — they pin behaviour the fix must not change.

- [ ] **Step 3: Make the take-hit branch hand the window over**

In `packages/engine/src/fake/attacks.ts`, replace the tail of the take-the-hit branch. It currently reads:

```ts
    const hit = takeRelease(spent, log, action.player, slot, stealer)
    return { state: closeWindow(hit, log), events: log.events }
```

Replace with:

```ts
    const hit = takeRelease(spent, log, action.player, slot, stealer)
    // A steal puts a FRESH release in the thief's zone, and by the rules every
    // fresh release gets its own attack time however it got there
    // (`resolution.md` §1) — so the window is handed over rather than closed on
    // a win. `takeRelease` reports nothing, and it does not always steal: an
    // occupied slot in the thief's zone sends the release to the discard
    // instead, which is why this asks the RESULTING state who holds the slot
    // rather than trusting `stealer` to mean a steal happened.
    const taken = stealer ? hit.players[stealer].release[slot] : undefined
    if (taken) {
      return {
        state: handOverWindow(
          hit,
          log,
          { player: stealer as PlayerId, slot, card: taken.card.uid },
          action.at,
        ),
        events: log.events,
      }
    }
    return { state: closeWindow(hit, log), events: log.events }
```

Add `handOverWindow` to the existing `import { ... } from './window'` in `attacks.ts`. If `PlayerId` is not already imported there, take it from `../state`; alternatively hoist `stealer` into a narrowed local (`const thief = stealer`) before the `if` so TypeScript keeps the non-null narrowing and no cast is needed — prefer that if it type-checks cleanly.

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
pnpm --filter @release/engine test -- attacks.test.ts
```

Expected: PASS — all four new tests and every pre-existing one in the file.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/fake/attacks.ts packages/engine/src/fake/attacks.test.ts
git commit -m "fix(engine): a stolen release gets the attack time every fresh release gets (#95)"
```

---

### Task 3: correct the win test that pinned the old behaviour

**Files:**
- Modify: `packages/engine/src/fake/win.test.ts:162-206`

**Interfaces:**
- Consumes: the behaviour from Task 2. Produces nothing.

- [ ] **Step 1: Rewrite the test to the rules' timing**

`win.test.ts:162-206` (`'wins when the third release arrives by Security Bug steal'`) currently ends on `expect(resolved.state.over).toEqual({ winner: 'p1', condition: 'release' })` — the assertion #95 contradicts. Replace the test with this pair, keeping the setup verbatim from the original (it is correct; only the ending changes):

```ts
  it('does not win the moment a third release is stolen — it faces its window first', () => {
    const s = engine.createGame(config())
    const steal: CardInstance = { uid: 'attack-security-bug#0', id: 'attack-security-bug' }
    const state: GameState = {
      ...s,
      turn: { ...s.turn, player: 'p2', drawnFrom: [0] },
      players: {
        ...s.players,
        p1: {
          ...s.players.p1,
          hand: [steal],
          release: { frontend: { card: FE }, backend: { card: BE } },
        },
        p2: { ...s.players.p2, hand: [DB], release: {} },
      },
    }

    const played = reduce(state, { type: 'PLAY', player: 'p2', card: DB.uid, at: 1000 })
    expect(played.state.window).toBeTruthy()

    const thrown = reduce(played.state, {
      type: 'ATTACK',
      player: 'p1',
      card: steal.uid,
      at: 1100,
    })
    const resolved = thrown.state.pending
      ? reduce(thrown.state, {
          type: 'RESOLVE',
          player: 'p2',
          choice: { kind: 'defend', card: null },
          at: 1200,
        })
      : thrown

    // The zone is complete, but the release is not: it arrived this instant and
    // owes p2 the attack time every fresh release owes (resolution.md §1, §6).
    expect(resolved.state.players.p1.release.database).toBeTruthy()
    expect(resolved.state.over).toBeUndefined()
    expect(resolved.state.window).toMatchObject({
      target: { player: 'p1', slot: 'database' },
      round: 1,
    })
  })

  it('wins by a steal once the stolen release survives its window', () => {
    const s = engine.createGame(config())
    const steal: CardInstance = { uid: 'attack-security-bug#0', id: 'attack-security-bug' }
    const state: GameState = {
      ...s,
      turn: { ...s.turn, player: 'p2', drawnFrom: [0] },
      players: {
        ...s.players,
        p1: {
          ...s.players.p1,
          hand: [steal],
          release: { frontend: { card: FE }, backend: { card: BE } },
        },
        p2: { ...s.players.p2, hand: [DB], release: {} },
      },
    }
    const played = reduce(state, { type: 'PLAY', player: 'p2', card: DB.uid, at: 1000 })
    const thrown = reduce(played.state, {
      type: 'ATTACK',
      player: 'p1',
      card: steal.uid,
      at: 1100,
    })
    const stolen = thrown.state.pending
      ? reduce(thrown.state, {
          type: 'RESOLVE',
          player: 'p2',
          choice: { kind: 'defend', card: null },
          at: 1200,
        })
      : thrown

    // p2 has nothing to throw, so the window runs out — and THAT is the moment
    // three completed releases become a win.
    const deadline = stolen.state.window?.deadline ?? 0
    const expired = reduce(stolen.state, { type: 'WINDOW_EXPIRED', at: deadline })
    expect(expired.state.over).toEqual({ winner: 'p1', condition: 'release' })
  })
```

- [ ] **Step 2: Run the tests and confirm they pass**

```bash
pnpm --filter @release/engine test -- win.test.ts
```

Expected: PASS. If the second test's `WINDOW_EXPIRED` is rejected, check `state.pending` is null at that point — `onWindowExpired` refuses while a `defend` pending stands (`window.ts:113`).

- [ ] **Step 3: Run the whole engine suite, including conformance**

```bash
pnpm --filter @release/engine test
```

Expected: PASS. Conformance's "times the window at 15s on the first round and 10s after" property applies to the handed-over window too — it opens at `round: 1`, so it must show a 15s deadline. A failure there means `handOverWindow` passed the wrong round.

- [ ] **Step 4: Commit**

```bash
git add packages/engine/src/fake/win.test.ts
git commit -m "test(engine): a stolen third release wins when its window closes, not when it lands (#95)"
```

---

### Task 4: the rules spec records what the engine now does

**Files:**
- Modify: `docs/rules/resolution.md` (§6's table area, and §1 where the steal is worth naming)
- Modify: `docs/animations/backlog.md` — only if an entry claims the old behaviour

**Interfaces:** none — documentation only.

- [ ] **Step 1: State the steal's timing in `resolution.md` §6**

§6 already says *"Релиз может прийти в зону не своим ходом и не из своей руки — `attack-security-bug` забирает чужой, `ai-release-*` выкладывает сам; проверка привязана к завершению релиза и работает одинаково во всех случаях."* That sentence is now true of the code as well as the text. Add one sentence directly after it making the window explicit, so a reader does not have to infer it:

```markdown
Украденный релиз получает **своё** время атаки в зоне похитителя: окно прежнего релиза
закрывается, и тут же открывается новое — на украденный. Победа по нему решается на закрытии
этого нового окна, как и для выложенного релиза.
```

- [ ] **Step 2: Check nothing else in the docs still describes the old behaviour**

```bash
grep -rn "украден\|Security Bug\|releaseStolen" docs/rules/ docs/animations/ | grep -iv "backlog.md:76"
```

Read each hit. Fix any that assert a stolen release is complete on arrival. Do **not** touch the `docs/rules/backlog.md` entry at line ~76 ("Спека отстаёт от кода" — the reflected Security Bug), which belongs to the rules owner's own branch from #91.

- [ ] **Step 3: Verify the whole workspace**

```bash
pnpm test && pnpm lint && pnpm typecheck
```

Expected: all three PASS.

- [ ] **Step 4: Commit and open the PR**

```bash
git add docs/rules/resolution.md
git commit -m "docs(rules): the stolen release's own attack window, written down (#95)"
git push -u origin fix/95-stolen-release-window
gh pr create --base main --title "A stolen release opens its own attack window (#95)" --body "Closes #95.

\`resolution.md\` §1 grants attack time to every release that lands in a zone, however it got there. The engine gave none to a stolen one: \`takeRelease\` moved the release and \`closeWindow\` settled the win in the same reduction, so a stolen release was complete on arrival and a third one won on the spot — which \`win.test.ts\` asserted, pinning the wrong behaviour in writing.

The steal now hands the window over: the old one closes without settling, a fresh one opens on the thief's slot at round 1, and the win is decided when that window closes — the same correction #67 made for a played release and #73 for an AI-placed one.

Prerequisite for #101 (Wave 3 of #88), which animates \`releaseStolen\` and would otherwise show a state the engine contradicts."
```

---

# PR 1 — the scene (#101)

**Branch:** `feat/101-defense-release` — **already cut**, stacked on `feat/100-combo-pair`, and already carrying the two spec commits. Switch to it:

```bash
git switch feat/101-defense-release
```

When PR #117 (the #100 wave) merges to `main`, rebase this branch onto `main` and drop the stack. Do not merge `main` into it.

**The visual source of truth** is `apps/playground/stories/interactive/DefenseReleaseStory.tsx` + its `.module.css`, and the written pair is the recipe "Defending a release — the whole turn, play through defence" in `docs/animations/recipes.md`. Every constant below is quoted from the story; do not re-derive any of them.

**Values used throughout PR 1** (from the story, lines 82-93):

| Constant | Value | What it is |
|---|---|---|
| `SHOW_HOLD` | `1200` | a card shown open on the table before it moves on |
| `LAND_HOLD` | `700` | the attack rests at the centre before it can be answered |
| `MERGE_MS` | `620` | the defence and its Sudo fold into a pair |
| `ATTACK_POSE` | `{ rot: -4, dx: 0, dy: 0 }` | the attack's tilt at the centre |
| `COVER_POSE` | `{ rot: 6, dx: 16, dy: -12 }` | the defence covering it — offset, tilted the other way |
| `SUDO_POSE` | `{ rot: -7, dx: 0, dy: 0 }` | the defender's own Sudo, waiting in its own place |

---

### Task 5: the centre grows a slot family

**Files:**
- Modify: `apps/frontend/src/entities/game/board/anchors.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.module.css`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx` (the centre block, ~lines 483-534)
- Test: `apps/frontend/src/entities/game/board/anchors.test.tsx`, `apps/frontend/src/pages/board/[gameId]/__tests__/boardAnchors.test.tsx`

**Interfaces:**
- Produces: four new refs on `BoardAnchors` — `stage`, `cost`, `sudo`, `cover`, each `RefObject<HTMLDivElement | null>`. `centre` keeps its meaning unchanged: it **is** the attack slot (the story's `.centerSlot`), which is why nothing renames it.
- Produces: exported pose constants from a new `apps/frontend/src/entities/game/board/poses.ts` — `ATTACK_POSE`, `COVER_POSE`, `SUDO_POSE`, `SHOW_HOLD`, `LAND_HOLD`, `MERGE_MS` — consumed by Tasks 8, 11, 13, 14, 16, 17.

- [ ] **Step 1: Write the failing test**

Add to `apps/frontend/src/pages/board/[gameId]/__tests__/boardAnchors.test.tsx` (the file already renders `<Board>` with `makeBoardProps()` and asserts anchors are bound — follow its existing idiom):

```tsx
it('mounts the five centre slots, each axis-aligned and each its own box', () => {
  render(<Board {...makeBoardProps()} />)
  for (const name of ['stage', 'cost', 'attack', 'sudo', 'cover']) {
    expect(document.querySelector(`[data-centre-slot="${name}"]`)).toBeTruthy()
  }
})

it('an empty centre slot catches no pointer events', () => {
  // `.coverSlot` sits exactly on top of the attack slot and is mounted even
  // with nothing in it — without this it silently eats every press and hover
  // meant for the attack underneath (the story's own hard-won `:empty` rule).
  render(<Board {...makeBoardProps()} />)
  const cover = document.querySelector('[data-centre-slot="cover"]') as HTMLElement
  expect(cover.children).toHaveLength(0)
  expect(getComputedStyle(cover).pointerEvents).toBe('none')
})
```

`getComputedStyle` in jsdom will not resolve a CSS-module `:empty` rule from a stylesheet that is never loaded. If the second assertion cannot see the rule, assert the contract structurally instead — that the slot renders no children when its card is absent — and pin the CSS in the module file with a comment naming this test. Prefer the structural assertion over a brittle style probe; do not delete the test.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @release/web test -- boardAnchors
```

Expected: FAIL — no `[data-centre-slot]` nodes exist.

- [ ] **Step 3: Add the poses module**

Create `apps/frontend/src/entities/game/board/poses.ts`:

```ts
// The table poses and holds of the release/defence scene, quoted from the
// playground's DefenseReleaseStory — the approved visual source. They live in
// `entities` because both the page's gestures (`pages/board`) and the beat
// runners (`features/board-beats`) need them, and a feature must not import
// from a sibling feature.
import type { Pose } from '@release/ui/animations'

/** an attack lands at a tilt… */
export const ATTACK_POSE: Pose = { rot: -4, dx: 0, dy: 0 }
/** …and the defence covers it at a different one, offset, so the two read as
 *  two separate plays rather than one neat stack */
export const COVER_POSE: Pose = { rot: 6, dx: 16, dy: -12 }
/** the defender's own Sudo waits in its own place, left of the attack — it is
 *  not part of the pair until a defence is chosen for it */
export const SUDO_POSE: Pose = { rot: -7, dx: 0, dy: 0 }

/** a card shown open on the table before it moves on */
export const SHOW_HOLD = 1200
/** the defence and its Sudo fold into a pair */
export const MERGE_MS = 620
```

The story's `LAND_HOLD` (700 — "the attack rests at the centre before it can be answered") is deliberately **not** ported. In the story it is a scripted pause because the scene drives itself; on the board the attack stands until the player actually answers, which the engine's own `defend` pending already enforces without a bound. Importing the value would invent a constraint the board does not have. If a real need for it appears, it comes back here with a reason attached.

Export them from `apps/frontend/src/entities/game/board/index.ts` alongside the existing exports. If `Pose` is not exported from `@release/ui/animations`, type them as `{ rot: number; dx: number; dy: number }` inline instead — check the barrel first rather than guessing.

- [ ] **Step 4: Add the four refs to the anchors registry**

In `apps/frontend/src/entities/game/board/anchors.ts`, add to the `BoardAnchors` interface directly under `centre`:

```ts
  /** the attack slot — `centre` IS it, kept under its old name because every
   *  existing flight already aims there */
  centre: RefObject<HTMLDivElement | null>
  /** the release standing at the centre, waiting for its cost to be paid */
  stage: RefObject<HTMLDivElement | null>
  /** the card paying that cost, held open beside it */
  cost: RefObject<HTMLDivElement | null>
  /** the defender's own Sudo, waiting for the defence it will enhance */
  sudo: RefObject<HTMLDivElement | null>
  /** the defence lying over the attack */
  cover: RefObject<HTMLDivElement | null>
```

In `useBoardAnchors`, create them beside the others and add them to the returned object. They are plain `useRef<HTMLDivElement>(null)` values with no callbacks, so **do not** add them to the `useMemo` dependency array — refs are stable, and the existing array lists only the callbacks:

```ts
  const stage = useRef<HTMLDivElement>(null)
  const cost = useRef<HTMLDivElement>(null)
  const sudo = useRef<HTMLDivElement>(null)
  const cover = useRef<HTMLDivElement>(null)
```

- [ ] **Step 5: Add the slot CSS**

In `apps/frontend/src/pages/board/[gameId]/_Board.module.css`, replace the `pointer-events: none` line inside `.centre` and add the four siblings after it. The 42% is doctrinal — the same value in every scene, do not "fix" it back to 50%:

```css
/* The five slots the centre of the table is made of, all sharing one box and
   differing only by where they sit and what lies over what. Quoted from the
   playground's DefenseReleaseStory — the approved visual source.

   Each slot stays AXIS-ALIGNED and the card's tilt lives on an inner `.pose`
   element, so a slot's rect is the true card box a flight can aim at (I6). A
   rotated slot's bounding rect is the box AROUND the tilted card, and aiming
   at it makes a flight jump on its first frame. */
.stageSlot,
.costSlot,
.sudoSlot,
.coverSlot {
  position: absolute;
  inset-block-start: 42%;
  inset-inline-start: 50%;
  inline-size: 150px;
  aspect-ratio: var(--card-aspect);
}

.stageSlot {
  transform: translate(calc(-50% - 92px), -50%);
}

.costSlot {
  transform: translate(calc(-50% + 92px), -50%);
}

.sudoSlot {
  z-index: 9;
  transform: translate(calc(-50% - 180px), -50%);
}

/* over the attack: the defence covers it, so it must lie on top */
.coverSlot {
  z-index: 11;
  transform: translate(-50%, -50%);
}

/* An EMPTY slot is not a target. `.coverSlot` sits exactly on top of `.centre`
   (both translate(-50%, -50%), z 11 over z 10) and is mounted even with no card
   in it, so with nothing there it would silently eat every pointer event meant
   for the attack underneath — the hover on the attacked card would never
   arrive, and neither would a defence dropped on it. This replaces `.centre`'s
   old blanket `pointer-events: none`, which was correct only while the centre
   was never a target of anything. */
.centre:empty,
.stageSlot:empty,
.costSlot:empty,
.sudoSlot:empty,
.coverSlot:empty {
  pointer-events: none;
}

/* a card's pose on the table — its tilt/offset lives on this inner element */
.pose {
  block-size: 100%;
}
```

Give `.centre` `z-index: 10` and delete its `pointer-events: none` declaration (the `:empty` rule above now owns that). Leave every other `.centre` declaration untouched.

- [ ] **Step 6: Render the four slots in `_Board.tsx`**

In the centre block, add the four siblings around the existing `.centre` div. They must be siblings, not children — each positions itself against the same ancestor. Mark every one with `data-centre-slot` so tests and the preview can find them, and add `data-centre-slot="attack"` to the existing `.centre` div:

```tsx
      {/* the release stands here and does NOT land — by the rules it costs one
          card, and the cost is shown open beside it. Only then does it settle
          into its zone slot and the attack window opens. */}
      <div className={opening.stageSlot} data-centre-slot="stage" ref={anchors.stage} />
      <div className={opening.costSlot} data-centre-slot="cost" ref={anchors.cost} />
      {/* the defender's own Sudo waits in its OWN place until a defence is
          chosen for it — the arrow says what it is aimed at */}
      <div className={opening.sudoSlot} data-centre-slot="sudo" ref={anchors.sudo} />
      {/* the defence covering the attack — offset and tilted the other way */}
      <div className={opening.coverSlot} data-centre-slot="cover" ref={anchors.cover} />
```

They are empty in this task — Tasks 8, 13 and 17 fill them. Empty is the correct end state here: the slots exist so flights have something to aim at, and `:empty` keeps them inert until something stands in them.

- [ ] **Step 7: Run the tests and confirm they pass**

```bash
pnpm --filter @release/web test -- boardAnchors && pnpm --filter @release/web test
```

Expected: PASS, including every pre-existing board test. If `boardComponent.test.tsx` or `boardIntro.test.tsx` breaks, the likely cause is the `.centre` pointer-events change — read the failure before adjusting anything.

- [ ] **Step 8: Commit**

```bash
git add apps/frontend/src/entities/game/board apps/frontend/src/pages/board
git commit -m "feat(web): the centre of the table becomes the scene's five slots (#101)"
```

---

### Task 6: reading a card that stands at the centre

**Files:**
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx`
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/boardPreview.test.tsx` (create)

**Interfaces:**
- Consumes: `useCardPreview` from `@release/ui` (already exported from the barrel: `apps/ui/src/index.ts:96-99`), and Task 5's slots.
- Produces: nothing other tasks depend on.

The whole block already exists in the kit — a hook, `useCardPreview()`, returning `{ slotProps, overlay }`. Nothing is reimplemented here; the work is binding it.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/pages/board/[gameId]/__tests__/boardPreview.test.tsx`:

```tsx
import { cardById } from '@release/ui'
import { fireEvent, render, screen } from '@testing-library/react'
import { expect, it } from 'vitest'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

// The projection stands an attack at the centre: a defence is owed by us, so
// the pending render puts the attacked card in the attack slot.
const withAttack = () => {
  const base = makeBoardProps()
  return makeBoardProps({
    state: {
      ...base.state,
      pending: {
        kind: 'defend',
        player: base.state.selfId,
        attacker: 'p2',
        attackCard: 'attack-bug',
        sudo: false,
        options: [],
        openedAt: 0,
        deadline: 0,
        scope: 'release',
      },
    },
  })
}

it('reads the card standing at the centre when the pointer is on its slot', () => {
  render(<Board {...withAttack()} />)
  const slot = document.querySelector('[data-centre-slot="attack"]') as HTMLElement
  expect(slot.hasAttribute('data-card-preview-src')).toBe(true)
  fireEvent.mouseEnter(slot)
  const preview = document.querySelector('[data-card-preview]')
  expect(preview).toBeTruthy()
  expect(preview?.querySelector('[data-card]')?.getAttribute('data-card')).toBe('attack-bug')
})

it('reads nothing from an empty slot', () => {
  render(<Board {...makeBoardProps()} />)
  const slot = document.querySelector('[data-centre-slot="cover"]') as HTMLElement
  fireEvent.mouseEnter(slot)
  expect(document.querySelector('[data-card-preview]')).toBeNull()
})
```

If `[data-card]` is not the attribute `Card` renders its id under, check `apps/ui/src/primitives/Card/Card.tsx` and use whatever it actually sets — `comboHandoff.test.tsx:390` reads the discard heap the same way, so copy that selector rather than inventing one.

- [ ] **Step 2: Run it and watch it fail**

```bash
pnpm --filter @release/web test -- boardPreview
```

Expected: FAIL — the slot carries no `data-card-preview-src`.

- [ ] **Step 3: Bind the hook**

In `_Board.tsx`, add the hook beside the other gesture hooks:

```tsx
  // reading a card that stands at the centre — the shared block from the kit.
  // Five slots here (the release, its cost, the attack, the defender's sudo,
  // the cover), and each of them reads on its own.
  const { slotProps: previewProps, overlay: previewOverlay } = useCardPreview()
```

Spread `{...previewProps(<the card that slot holds>)}` on each of the five **slot** divs (never on the inner `.pose`, or the hover geometry would follow the tilt). For the slots Task 5 left empty, pass `null` — the hook no-ops on a null card, so the props can be spread unconditionally now and start working the moment a later task fills the slot. The attack slot passes the card the pending render already resolves:

```tsx
      <div
        className={opening.centre}
        data-board-centre
        data-centre-slot="attack"
        ref={anchors.centre}
        {...previewProps(
          state.pending?.kind === 'defend' ? cardById(state.pending.attackCard) : null,
        )}
      >
```

Render `{previewOverlay}` once, inside the board root — it is `position: fixed` and places itself, so nothing between it and the viewport may establish a containing block (no `transform` / `filter` / `contain` on an ancestor).

Import `useCardPreview` from `@release/ui`.

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
pnpm --filter @release/web test -- boardPreview
```

Expected: PASS, both tests.

- [ ] **Step 5: Register the new consumer on the audit page**

`apps/playground/stories/docs.test.ts` reads the audit page's module registry, and `AnimationAuditStory.tsx:401-402` currently lists `useCardPreview`'s consumers as `'table/CardPreview → CardPlay, AiCards, Error503, DefenseRelease'`. The board is now one. Update both the `ru` and `en` strings to end with `, Board` — a key missing from one language is the exact drift these tests exist to catch.

- [ ] **Step 6: Verify and commit**

```bash
pnpm test && pnpm lint && pnpm typecheck
git add apps/frontend/src/pages/board apps/playground/stories/AnimationAuditStory
git commit -m "feat(web): a card standing at the centre can be read (#101)"
```

---

### Task 7: the engine lets a staged release be taken back

**Files:**
- Modify: `packages/engine/src/actions.ts` (the `Choice` union)
- Modify: `packages/engine/src/fake/release.ts` (a new handler beside `onDiscardForRelease`)
- Modify: `packages/engine/src/fake/reduce.ts` (`onResolve`'s switch, ~line 268)
- Modify: `apps/ui/src/table/Table/intents.ts` (the `TableChoice` mirror)
- Test: `packages/engine/src/fake/release.test.ts`

**Interfaces:**
- Produces: `Choice` gains `{ kind: 'cancelRelease' }`; `TableChoice` gains the identical member. Consumed by Task 9.

The recipe's canon is *"a press on nothing valid takes back whatever is staged — the Release awaiting its cost"*. The engine holds a `discardForRelease` pending with no way back, so the gesture has nothing to dispatch. This adds it. It is safe to emit **nothing**: the `release` action emits no events either (`release.ts:163-174` returns `events: []`), so no other peer ever learned the play happened.

- [ ] **Step 1: Write the failing tests**

Add to `packages/engine/src/fake/release.test.ts`, following the file's existing setup idiom:

```ts
it('takes a staged release back, leaving no trace in the feed', () => {
  const s = engine.createGame(config())
  const primed: GameState = {
    ...s,
    turn: { ...s.turn, player: 'p1', drawnFrom: [0] },
    players: { ...s.players, p1: { ...s.players.p1, hand: [FE, BUG] } },
  }
  const staged = reduce(primed, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  expect(staged.state.pending).toMatchObject({ kind: 'discardForRelease', player: 'p1' })

  const back = reduce(staged.state, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'cancelRelease' },
    at: 1001,
  })
  expect(back.state.pending).toBeNull()
  // the hand is whole again and nothing was ever released
  expect(back.state.players.p1.hand.map((c) => c.uid)).toEqual([FE.uid, BUG.uid])
  // the play emitted nothing, so taking it back emits nothing either — no peer
  // ever saw it happen
  expect(back.events).toEqual([])
})

it('refuses a cancel from anyone but the player who staged it', () => {
  const s = engine.createGame(config())
  const primed: GameState = {
    ...s,
    turn: { ...s.turn, player: 'p1', drawnFrom: [0] },
    players: { ...s.players, p1: { ...s.players.p1, hand: [FE, BUG] } },
  }
  const staged = reduce(primed, { type: 'PLAY', player: 'p1', card: FE.uid, at: 1000 })
  const r = reduce(staged.state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: { kind: 'cancelRelease' },
    at: 1001,
  })
  expect(r.events.some((e) => e.type === 'rejected')).toBe(true)
  expect(r.state.pending).toMatchObject({ kind: 'discardForRelease' })
})

it('refuses a cancel when no release is staged', () => {
  const s = engine.createGame(config())
  const r = reduce(s, {
    type: 'RESOLVE',
    player: 'p1',
    choice: { kind: 'cancelRelease' },
    at: 1000,
  })
  expect(r.events.some((e) => e.type === 'rejected')).toBe(true)
})
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm --filter @release/engine test -- release.test.ts
```

Expected: FAIL — `unsupported choice: cancelRelease`.

- [ ] **Step 3: Add the choice, the handler, and the route**

`packages/engine/src/actions.ts`, in the `Choice` union:

```ts
  // Taking a staged release back before its cost is paid. The `release` action
  // emits nothing until the cost lands, so no peer ever saw the play — which is
  // why this carries no card and emits no event either. The same "I changed my
  // mind" door `UNPASS` already opens for a pass.
  | { kind: 'cancelRelease' }
```

`packages/engine/src/fake/release.ts`, beside `onDiscardForRelease`:

```ts
export function onCancelRelease(
  state: GameState,
  action: Action & { type: 'RESOLVE' },
): Reduction {
  const pending = state.pending
  if (pending?.kind !== 'discardForRelease') return reject(state, action, 'no release staged')
  if (pending.player !== action.player) return reject(state, action, 'not your decision')
  // Nothing moved when the release was staged — the card never left the hand
  // (`onPlay` only sets the pending), so there is nothing to put back and
  // nothing to announce. Clearing the pending IS the whole undo.
  return { state: { ...state, pending: null }, events: [] }
}
```

Confirm against `release.ts:155-174` that `onPlay`'s release branch really does leave the hand untouched — it filters the hand only inside `placeRelease`, which the cost path calls later. If that is not true on the branch you are working from, the handler must restore the hand as well, and the first test above will tell you.

`packages/engine/src/fake/reduce.ts`, in `onResolve`'s switch:

```ts
    case 'cancelRelease':
      return onCancelRelease(state, action)
```

and add `onCancelRelease` to the existing `import { onDiscardForRelease, onPlay } from './release'`.

`apps/ui/src/table/Table/intents.ts`, in `TableChoice` — the kit mirrors the engine's surface structurally and `contract.test-d.ts` asserts both directions, so this is not optional:

```ts
  // Taking a staged release back before its cost is paid — see the engine's
  // own Choice for why it carries nothing.
  | { kind: 'cancelRelease' }
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
pnpm --filter @release/engine test && pnpm --filter @release/web test -- contract
```

Expected: PASS. The engine's conformance suite includes a `progress` section that resolves every pending it meets — check `conformance.ts`'s `resolvePendingAction` still answers `discardForRelease` with a real cost rather than the new cancel, or the fuzzer could loop staging and cancelling forever. It resolves by pending kind, not by choice, so no change should be needed; confirm rather than assume.

- [ ] **Step 5: Commit**

```bash
git add packages/engine apps/ui/src/table/Table/intents.ts
git commit -m "feat(engine): a staged release can be taken back before its cost is paid (#101)"
```

---

### Task 8: the release stands, the fan pays its cost

**Files:**
- Modify: `apps/frontend/src/pages/board/[gameId]/_useBoardStaging.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx` (fill the stage/cost slots; suppress `PendingPrompt` for this pending)
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/boardRelease.test.tsx` (create)

**Interfaces:**
- Consumes: Task 5's `anchors.stage` / `anchors.cost`, `SHOW_HOLD` from `poses.ts`.
- Produces: `BoardStaging` gains `costOptions: string[]` (the hand uids that may pay, straight from the pending's own `options`) and `onCostPick: (uid: string) => void`. Task 9 adds the cancel.

The engine already models this exactly as the choreography needs: playing a release sets a `discardForRelease` pending and emits **nothing**, so the release standing at the centre is purely local until the cost is paid. The existing `PendingPrompt` panel currently answers this pending; the gesture replaces it.

- [ ] **Step 1: Write the failing test**

Create `apps/frontend/src/pages/board/[gameId]/__tests__/boardRelease.test.tsx`. Model the harness on `boardStaging.test.tsx` — real `<Board>`, no mocks, `actions` as `vi.fn()`s, `pullCardFromFan` copied from that file (it is the Hand's real drag contract: mousedown, a move past the 6px threshold, mouseup):

```tsx
it('stands the release at the centre and does not land it until the cost is paid', async () => {
  const onPlay = vi.fn()
  const onResolve = vi.fn()
  const { rerender } = render(releaseBoard({}, { onPlay, onResolve }))
  await pullCardFromFan('release-frontend#0')
  expect(onPlay).toHaveBeenCalledWith('release-frontend#0', undefined, undefined)

  // the engine answers with the cost pending — and the release is standing at
  // the stage slot, NOT in its zone slot
  rerender(releaseBoard({ pending: costPending(['attack-bug#0']) }, { onPlay, onResolve }))
  const stage = document.querySelector('[data-centre-slot="stage"]') as HTMLElement
  expect(stage.querySelector('[data-card]')).toBeTruthy()

  // the fan is the picker — a click on an eligible card pays
  await clickFanCard('attack-bug#0')
  expect(onResolve).toHaveBeenCalledWith({
    kind: 'discardForRelease',
    card: 'attack-bug#0',
  })
})

it('does not raise the pending panel for a cost — the table asks instead', async () => {
  render(releaseBoard({ pending: costPending(['attack-bug#0']) }, {}))
  // every other pending owed to us still raises the prompt; this one is
  // answered by the cards on the table, so a panel would be a second asker
  expect(screen.queryByTestId('pending-prompt')).toBeNull()
})
```

Write `costPending(options)` as a local factory returning `{ kind: 'discardForRelease', player: <selfId>, options }`, and `releaseBoard(stateOver, actions)` as the file's `boardWith` equivalent, with a hand that holds `release-frontend#0` and `attack-bug#0`. If `PendingPrompt` renders no `data-testid`, add one in `apps/ui` or select it by its rendered copy — do not assert on a class name.

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm --filter @release/web test -- boardRelease
```

Expected: FAIL — nothing stands in the stage slot, and the prompt renders.

- [ ] **Step 3: Add the cost gesture to `_useBoardStaging.ts`**

Add to the `BoardStaging` interface:

```ts
  /** the hand uids that may pay a staged release's cost — [] when none is owed */
  costOptions: string[]
  /** a click in the fan pays the cost and dispatches the RESOLVE */
  onCostPick: (uid: string) => void
```

In the hook, derive the options straight from the projection — legality is the engine's answer, never the UI's:

```ts
  // The engine holds a `discardForRelease` while the release stands at the
  // centre, and names in `options` exactly which cards may pay (neither the
  // release itself nor a comboed Code Review can). Read, never re-derived.
  const cost = state.pending?.kind === 'discardForRelease' && state.pending.player === state.selfId
    ? state.pending
    : null
  const costOptions = useMemo(() => cost?.options ?? [], [cost])
```

and the pick, which flies the paying card from its fan slot to the cost slot and dispatches:

```ts
  // The cost flies out of the fan and is held OPEN beside the release: by the
  // rules a release costs a card, and the cost is shown to the table rather
  // than vanishing into the discard on its way past. The beat
  // (`comboBeat.runRelease`) takes it from here once the engine answers — this
  // gesture only gets it to the slot and dispatches.
  const onCostPick = useCallback(
    (uid: string) => {
      if (!enabled || !costOptions.includes(uid)) return
      const index = state.you.hand.findIndex((c) => c.uid === uid)
      const item = state.you.hand[index]
      if (!item) return
      void (async () => {
        const to = anchors.cost.current?.getBoundingClientRect()
        const from = reduced ? undefined : slotBox(index, state.you.hand.length)
        if (!reduced && from && to) {
          const [el] = await flyer.raise([{ key: 'cost', card: item.card, at: from }])
          if (el) await play('playToCenter', el, { from, to })?.finished
        }
        // the flyer is NOT dropped here: the beat's own cost render takes over
        // when the engine's `discarded(releaseCost)` arrives, and dropping now
        // would leave a bare frame at the slot. `release()`-style handoff is
        // Task 11's job.
        actions?.onResolve?.({ kind: 'discardForRelease', card: uid })
      })()
    },
    [enabled, costOptions, state.you.hand, reduced, slotBox, anchors.cost, flyer.raise, actions],
  )
```

Return both from the hook. Add `costOptions`/`onCostPick` to the returned object beside `accentAt`.

- [ ] **Step 4: Wire the board**

In `_Board.tsx`:

1. Render the staged release in the stage slot while the cost pending stands. The projection has already taken the card out of the hand? **No** — verify: the engine's release branch leaves the hand intact until `placeRelease`. So the card is still in `state.you.hand`, and `handItems` must hide it. Extend `_useBoardStaging`'s `handItems` memo to also drop `cost.release`'s uid when a cost pending stands, and render that card in the stage slot:

```tsx
      <div className={opening.stageSlot} data-centre-slot="stage" ref={anchors.stage}
           {...previewProps(stagedRelease?.card ?? null)}>
        {stagedRelease && <Card card={stagedRelease.card} interactive={false} width="100%" />}
      </div>
```

where `stagedRelease` is resolved from the pending's `release` uid against `state.you.hand`.

**That uid is not projected today, and adding it is part of this step.** The engine's internal pending carries it (`state.ts:77`: `{ kind: 'discardForRelease'; player; release: CardUid; codeReview? }`) but `pendingView` drops it (`fake/attacks.ts:402-411`) and so does `PendingView` (`view.ts:41`) and `TablePending` (`intents.ts:33`). The board cannot render the standing release without knowing which card it is, and inferring it from "the release-category card still in hand" would be a guess.

Add it **redacted the way `options` already is** — `pendingView` gives `options` only to the pending's owner, and the release uid follows the same rule:

```ts
    case 'discardForRelease':
      return {
        kind: 'discardForRelease',
        player: p.player,
        // the owner's own staged card: they need to know which of their cards
        // is standing at the centre. Redacted for everyone else, exactly as
        // `options` is — see the open rules question below.
        ...(mine ? { release: p.release } : {}),
        options: mine
          ? state.players[p.player].hand
              .filter((c) => c.uid !== p.release && c.uid !== p.codeReview)
              .map((c) => c.uid)
          : [],
      }
```

Mirror the optional `release?: CardUid` field in `view.ts:41` and `intents.ts:33`, and add an engine test asserting the owner sees it and an opponent does not.

> **A rules question comes out of this, and it must not be answered by guessing.** Whether an opponent can see *which* release is standing at the centre while its cost is being paid is not settled anywhere in `docs/rules/`. The engine emits no events until the cost lands, so today they cannot. This plan keeps that behaviour — the remote board shows nothing until `released` arrives, and Task 11 flies the cost and the release together from the seat at that moment, so the cost is still shown in the open to everyone.
>
> Before finishing this task, write the question into `docs/rules/backlog.md` in that file's own entry format **and** put a `> ❓ **Не из правил.**` marker at the paragraph in `docs/rules/resolution.md` §1 that covers a release being played. Do not resolve it in code.

2. Suppress the panel for this one pending:

```tsx
      {state.pending?.player === state.selfId && state.pending.kind !== 'discardForRelease' && (
        <PendingPrompt … />
      )}
```

3. Pass `onCardClick` through so a fan click pays when a cost is owed. `Hand`'s `onCardClick` is already wired to `staging.onCardClick` for the combo partner pick — route by which gesture is live rather than adding a second handler: in `_useBoardStaging`'s `onCardClick`, when `costOptions.length > 0`, call `onCostPick(uid)` and return.

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
pnpm --filter @release/web test -- boardRelease
```

Expected: PASS, both tests.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src packages/engine apps/ui
git commit -m "feat(web): a release stands at the centre and the fan pays for it (#101)"
```

---

### Task 9: a press on nothing valid takes the staged release back

**Files:**
- Modify: `apps/frontend/src/pages/board/[gameId]/_useBoardStaging.ts`
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/boardRelease.test.tsx`

**Interfaces:**
- Consumes: Task 7's `{ kind: 'cancelRelease' }`, Task 8's cost staging.

- [ ] **Step 1: Write the failing test**

```tsx
it('a press on nothing valid takes the staged release back to the fan', async () => {
  const onResolve = vi.fn()
  render(releaseBoard({ pending: costPending(['attack-bug#0']) }, { onResolve }))
  // a press on the table, away from the fan and away from any lit target
  fireEvent.mouseDown(document.querySelector('[data-board-centre]')?.parentElement as HTMLElement)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 600))
  })
  expect(onResolve).toHaveBeenCalledWith({ kind: 'cancelRelease' })
})

it('a press inside the fan is not a miss', async () => {
  const onResolve = vi.fn()
  render(releaseBoard({ pending: costPending(['attack-bug#0']) }, { onResolve }))
  const slot = document.querySelectorAll<HTMLElement>('[data-hand-slot]')[0]
  fireEvent.mouseDown(slot)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 100))
  })
  expect(onResolve).not.toHaveBeenCalledWith({ kind: 'cancelRelease' })
})
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm --filter @release/web test -- boardRelease
```

Expected: FAIL — no cancel is dispatched.

- [ ] **Step 3: Extend `cancel()` to cover the staged release**

`cancel()` today refuses whenever `phase === 'dispatched'`, which is exactly the state a staged release is in. Add a branch **ahead** of that guard — the release is a dispatched play that the engine is still holding, so it is the one dispatched thing that can come back:

```ts
    // The release awaiting its cost is the one dispatched play that CAN be
    // taken back: the engine holds it as a pending and has emitted nothing, so
    // nobody else has seen it. The engine is told first and the card flies home
    // on its own — a rejection cannot strand it, because the pending either
    // clears or it does not, and the projection is what puts the card back in
    // the fan either way.
    if (cost) {
      arrowCtl.stop()
      actions?.onResolve?.({ kind: 'cancelRelease' })
      // The release is still in `you.hand` — the engine never took it out (only
      // `placeRelease` filters the hand, and that runs after the cost is paid),
      // so the card to fly home is found there by the uid the pending names.
      const held = state.you.hand.find((c) => c.uid === cost.release)
      const from = anchors.stage.current?.getBoundingClientRect()
      if (!reduced && from && held) {
        void arrival.arrive([{ key: held.uid, card: held.card, from }], handItems.length)
      }
      return
    }
```

`arrive`'s third argument is omitted deliberately: `useHandArrival` then opens the gap at the middle of the fan, which is the recipe's own wording ("into the middle of the fan"). Resolve the release's `CardData` the same way Task 8's render does.

Then arm the window listener for this state. The existing Escape/miss handling in `_Board.tsx` calls `staging.cancel()` on a press that hits nothing; confirm it fires while a cost pending stands (the guard may be keyed on `staging.staged`, which is null here) and widen its condition to `staging.staged || staging.costOptions.length > 0`.

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
pnpm --filter @release/web test -- boardRelease && pnpm --filter @release/web test
```

Expected: PASS, and no regression in `boardStaging.test.tsx` — the miss-cancel path is shared.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/pages/board
git commit -m "feat(web): the staged release comes home on a press with nothing to hit (#101)"
```

---

### Task 10: every release gets a beat, and it carries its cost

**Files:**
- Modify: `apps/frontend/src/features/board-beats/planBeats.ts`
- Test: `apps/frontend/src/features/board-beats/planBeats.test.ts`

**Interfaces:**
- Produces: `BeatPlan`'s `releasePlaced` member changes — `codeReview` becomes optional and `cost?: { eventId: number; card: string }` is added. Task 11 consumes it.

Today only a Code Review release plans a beat; a plain one falls through and lands by projection alone. Now every release flies, and the `discarded(releaseCost)` that precedes it in the batch is claimed here so `discardBeat` does not fly it a second time.

- [ ] **Step 1: Write the failing tests**

Add to `planBeats.test.ts` (the file's `released` / `discarded` / `boardBefore` factories already exist):

```ts
it('plans a beat for a plain release too, and links the cost that paid for it', () => {
  const plans = planBeats(
    [
      discarded(6, { card: 'attack-bug', reason: 'releaseCost' }),
      released({ id: 7, player: 'p1', slot: 'frontend', card: 'release-frontend' }),
    ],
    boardBefore(),
  )
  expect(plans).toEqual([
    {
      kind: 'releasePlaced',
      key: 'release:7',
      eventId: 7,
      player: 'p1',
      slot: 'frontend',
      card: 'release-frontend',
      cost: { eventId: 6, card: 'attack-bug' },
    },
  ])
})

it('does not let the discard beat fly the cost a second time', () => {
  // the cost belongs to the release beat: it is shown open at the centre and
  // leaves from there, not from the hand slot it had already left
  const plans = planBeats(
    [
      discarded(6, { card: 'attack-bug', reason: 'releaseCost' }),
      released({ id: 7, card: 'release-frontend' }),
    ],
    boardBefore(),
  )
  expect(plans.some((p) => p.kind === 'discard')).toBe(false)
})

it('plans a release with no cost in easy mode', () => {
  const plans = planBeats(
    [released({ id: 7, card: 'release-frontend' })],
    boardBefore(),
  )
  expect(plans).toEqual([
    {
      kind: 'releasePlaced',
      key: 'release:7',
      eventId: 7,
      player: 'p1',
      slot: 'frontend',
      card: 'release-frontend',
    },
  ])
})

it('keeps carrying the Code Review of a comboed release', () => {
  const plans = planBeats(
    [released({ id: 7, card: 'release-frontend', codeReview: 'support-code-review' })],
    boardBefore(),
  )
  expect(plans[0]).toMatchObject({ kind: 'releasePlaced', codeReview: 'support-code-review' })
})

it('does not claim an unrelated discard sitting before a release', () => {
  // only `releaseCost` is the cost. A hand-limit discard that happens to
  // precede a release is its own gesture and keeps its own beat.
  const plans = planBeats(
    [
      discarded(6, { card: 'attack-bug', reason: 'handLimit' }),
      released({ id: 7, card: 'release-frontend' }),
    ],
    boardBefore(),
  )
  expect(plans.map((p) => p.kind)).toEqual(['discard', 'releasePlaced'])
})
```

- [ ] **Step 2: Run and watch them fail**

```bash
pnpm --filter @release/web test -- planBeats
```

Expected: FAIL — a plain release plans nothing, and the cost is planned as a `discard`.

- [ ] **Step 3: Widen the plan and claim the cost**

In `planBeats.ts`, change the `releasePlaced` member of `BeatPlan`:

```ts
  // Every release flies into its slot. `codeReview` rides along when the play
  // was a combo; `cost` when the rules made it pay for itself — the card is
  // shown OPEN beside the release before it leaves, so the release beat owns
  // that discard rather than letting `discardBeat` fly it out of a hand slot it
  // had already left.
  | {
      kind: 'releasePlaced'
      key: string
      eventId: number
      player: string
      slot: string
      card: string
      codeReview?: string
      cost?: { eventId: number; card: string }
    }
```

Add a lookbehind helper beside `revealAfter` — positional, not a batch scan, for the same reason `revealAfter` is:

```ts
// The engine pays the cost and places the release in one reduction, emitting
// `discarded(releaseCost)` immediately before `released`
// (fake/release.ts:281,293 through `placeRelease`). Looking back by POSITION
// rather than scanning the batch is what keeps an unrelated earlier discard
// from being read as this release's cost.
function costBefore(events: Event[], i: number): { eventId: number; card: string } | null {
  const prev = events[i - 1]
  if (prev?.type !== 'discarded' || prev.reason !== 'releaseCost') return null
  return { eventId: prev.id, card: prev.card }
}
```

Replace the `e.type === 'released' && e.codeReview` branch with one that takes every release:

```ts
    if (e.type === 'released') {
      flush()
      const cost = costBefore(events, i)
      if (cost) owned.add(cost.eventId)
      plans.push({
        kind: 'releasePlaced',
        key: `release:${e.id}`,
        eventId: e.id,
        player: e.player,
        slot: e.slot,
        card: e.card,
        ...(e.codeReview ? { codeReview: e.codeReview } : {}),
        ...(cost ? { cost } : {}),
      })
      continue
    }
```

`owned` is the existing set the discard walk already checks (`if (owned.has(e.id)) continue`). One ordering trap: the `discarded` is walked **before** the `released`, so by the time `owned` gains the id the discard branch has already run and pushed it. Fix by checking the reason in the discard branch itself instead — a `releaseCost` discard is never planned as a discard beat, because the release beat always owns it:

```ts
      // the release's own cost — claimed by the `releasePlaced` beat that
      // follows it in this same batch, where it is shown open before it leaves
      if (e.reason === 'releaseCost') continue
```

placed at the top of the `discarded` branch, right after the `owned.has(e.id)` check. Then `costBefore` needs no `owned` bookkeeping at all — delete the `owned.add(cost.eventId)` line above. Prefer this: it is one rule in one place rather than a claim that depends on walk order.

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
pnpm --filter @release/web test -- planBeats
```

Expected: PASS, all five new tests and every existing one.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/board-beats
git commit -m "feat(web): every release plans a beat, and its cost rides with it (#101)"
```

---

### Task 11: the cost is shown open, then the release lands

**Files:**
- Modify: `apps/frontend/src/features/board-beats/comboBeat.tsx` (`runRelease`)
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx` (the cost slot's render)
- Test: `apps/frontend/src/features/board-beats/comboBeat.test.tsx`

**Interfaces:**
- Consumes: Task 10's `cost` field, Task 5's `anchors.cost` / `anchors.stage`, `SHOW_HOLD` from `poses.ts`.

- [ ] **Step 1: Write the failing tests**

Add to `comboBeat.test.tsx`, using the file's existing `harness()` / `drive()` / `ctx`. Extend `harness()`'s fake anchors with `stage` and `cost` nodes (`{ current: node() }`), the way it already fakes `centre`:

```tsx
it('shows the cost open, sends it to the discard, then lands the release', async () => {
  played.names = []
  exits.items = []
  const { api, Probe } = harness()
  render(<Probe />)
  const plan: Extract<BeatPlan, { kind: 'releasePlaced' }> = {
    kind: 'releasePlaced',
    key: 'release:7',
    eventId: 7,
    player: 'p2',
    slot: 'frontend',
    card: 'release-frontend',
    cost: { eventId: 6, card: 'attack-bug' },
  }
  await drive(() => api.beat?.runRelease(plan, ctx))
  // the cost left through the shared discard exit, on its own event's scatter
  expect(exits.items).toHaveLength(1)
  expect(exits.items[0]).toMatchObject({
    key: 'c6',
    card: expect.objectContaining({ id: 'attack-bug' }),
    scatter: scatterAt(6),
  })
  // and the release landed with the snap every release lands with
  expect(played.names).toContain('playToReleaseZone')
  // the cost is shown BEFORE the release moves: the discard exit is recorded
  // ahead of the zone flight
  expect(played.names.indexOf('centerToDiscard')).toBeLessThan(
    played.names.indexOf('playToReleaseZone'),
  )
})

it('lands a release with no cost without an exit', async () => {
  played.names = []
  exits.items = []
  const { api, Probe } = harness()
  render(<Probe />)
  await drive(() =>
    api.beat?.runRelease(
      {
        kind: 'releasePlaced',
        key: 'release:7',
        eventId: 7,
        player: 'p2',
        slot: 'frontend',
        card: 'release-frontend',
      },
      ctx,
    ),
  )
  expect(exits.items).toHaveLength(0)
  expect(played.names).toContain('playToReleaseZone')
})
```

- [ ] **Step 2: Run and watch them fail**

```bash
pnpm --filter @release/web test -- comboBeat
```

Expected: FAIL — no discard exit for the cost.

- [ ] **Step 3: Play the cost inside `runRelease`**

In `comboBeat.tsx`, add the cost leg at the top of `runRelease`, before the existing fold/handoff logic. The actor's own cost is already standing at the cost slot (Task 8 flew it there and left the flyer up); a remote player's has to arrive from their seat first:

```ts
      // THE COST — by the rules a release costs one card, and the cost is shown
      // to the table in the open before it goes. The actor's own is already
      // standing at the cost slot (the gesture put it there and left it); for
      // everyone else it arrives from the seat now, holds, and then leaves.
      // Either way it leaves through the shared discard exit, on its own
      // `discarded` event's scatter (I7).
      if (plan.cost) {
        const a = latest.current.anchors
        const costBox = rectOf(a.cost.current)
        const costCard = cardById(plan.cost.card)
        if (costBox && costCard) {
          if (plan.player !== ctx.base.selfId) {
            const from = a.seatBox(plan.player)
            if (from) {
              const [el] = await flyer.raise([{ key: 'cost', at: from, card: costCard }])
              if (el) await play('playToCenter', el, { from, to: costBox })?.finished
            }
          }
          await wait(SHOW_HOLD)
          await latest.current.send([
            {
              key: `c${plan.cost.eventId}`,
              card: costCard,
              from: costBox,
              node: flyer.elOf('cost'),
              scatter: scatterAt(plan.cost.eventId),
            },
          ])
          flyer.drop('cost')
        }
      }
```

`node: flyer.elOf('cost')` hands `useDiscardExit` the live element rather than making it mount a copy — that is what makes the actor's own card (already on screen since the gesture) fly rather than blink. Import `wait` and `scatterAt` from `@release/ui/animations` and `SHOW_HOLD` from `~/entities/game/board`.

Then let the release itself fly. The existing `runRelease` already flies the actor's staged node and folds a remote one in — no change is needed there beyond confirming `foldIn` handles a release with **no** `codeReview` (it does: `auxId` is optional and the lone-card path is built in).

- [ ] **Step 4: Render the cost slot's resting card**

While the beat holds the cost open, something must be on screen. The flyer carries it for a remote player; for the actor it is the gesture's own flyer. Neither needs a static render, so the cost slot stays empty in `_Board.tsx` and only carries `previewProps(null)`. **Verify this on the running app in Task 18's walkthrough** — if a frame blinks at the handover, the fix is a static render in the slot fed by the beat's published state, not a longer hold.

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
pnpm --filter @release/web test -- comboBeat && pnpm --filter @release/web test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src
git commit -m "feat(web): the release pays in the open before it lands (#101)"
```

---

### Task 12: the defence covering the attack is planned

**Files:**
- Modify: `apps/frontend/src/features/board-beats/planBeats.ts`
- Test: `apps/frontend/src/features/board-beats/planBeats.test.ts`

**Interfaces:**
- Produces: a new `BeatPlan` member `covered`. Tasks 13 and 14 consume it.

```ts
  // A defence answers the attack standing at the centre. `effect` decides what
  // happens next, and the plan carries everything the runner needs to play it
  // without going back to the projection: the exchange's own cards and, for a
  // Rollback, who gets the attack card back.
  | {
      kind: 'covered'
      key: string
      eventId: number
      defender: string
      card: string
      /** the defender's own Sudo, when they comboed one onto the defence */
      sudo?: string
      effect: 'cancel' | 'return' | 'reflect' | 'take'
      attacker: string
      attackCard: string
      /** the Sudo the ATTACK was thrown with */
      attackSudo: boolean
      /**
       * The cards banked by this resolution, each with its own discard event.
       * `reason` is carried, not dropped: `support-sudo` can appear on BOTH
       * sides of one exchange (a sudo-backed attack answered by a sudo-backed
       * defence), and the reason is the only thing that tells the two apart —
       * `attackSpent` is the attacker's, `defenceSpent` the defender's.
       */
      spent: { eventId: number; card: string; reason: 'attackSpent' | 'defenceSpent' }[]
      /** Rollback only: whose hand the attack card goes back to */
      returnTo?: string
    }
```

- [ ] **Step 1: Write the failing tests**

Add a `defended` factory beside the others in `planBeats.test.ts`:

```ts
const defended = (
  over: Partial<Extract<Event, { type: 'defended' }>> & { id: number },
): Event =>
  ({ type: 'defended', player: 'p1', card: 'defense-hotfix', effect: 'cancel', ...over }) as Event
```

and the tests:

```ts
describe('planBeats — the answer to an attack (#101)', () => {
  const pending = () =>
    boardBefore({ pending: defendPending({ scope: 'release', sudo: false }) } as Partial<BoardState>)

  it('plans one exchange for a cancelling defence and claims both spent cards', () => {
    const plans = planBeats(
      [
        defended({ id: 12, player: 'p1', card: 'defense-hotfix', effect: 'cancel' }),
        discarded(13, { player: 'p2', card: 'attack-bug', reason: 'attackSpent' }),
        discarded(14, { player: 'p1', card: 'defense-hotfix', reason: 'defenceSpent' }),
      ],
      pending(),
    )
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({
      kind: 'covered',
      key: 'covered:12',
      defender: 'p1',
      card: 'defense-hotfix',
      effect: 'cancel',
      attacker: 'p2',
      attackCard: 'attack-bug',
      spent: [
        { eventId: 13, card: 'attack-bug' },
        { eventId: 14, card: 'defense-hotfix' },
      ],
    })
  })

  it('sends a plain Rollback’s attack back to the attacker and never banks it', () => {
    const plans = planBeats(
      [
        defended({ id: 12, player: 'p1', card: 'defense-rollback', effect: 'return' }),
        discarded(14, { player: 'p1', card: 'defense-rollback', reason: 'defenceSpent' }),
      ],
      pending(),
    )
    expect(plans[0]).toMatchObject({
      kind: 'covered',
      effect: 'return',
      returnTo: 'p2',
      spent: [{ eventId: 14, card: 'defense-rollback' }],
    })
  })

  it('keeps a sudo Rollback’s attack for the defender', () => {
    // `attacks.ts:247` — recipient = sudoDefence ? the defender : the attacker.
    // The engine records the defender's sudo as a `defenceSpent` discard of
    // `support-sudo`, and that is the only signal the return changed hands.
    const plans = planBeats(
      [
        defended({ id: 12, player: 'p1', card: 'defense-rollback', effect: 'return' }),
        discarded(14, { player: 'p1', card: 'defense-rollback', reason: 'defenceSpent' }),
        discarded(15, { player: 'p1', card: 'support-sudo', reason: 'defenceSpent' }),
      ],
      pending(),
    )
    expect(plans[0]).toMatchObject({ effect: 'return', returnTo: 'p1', sudo: 'support-sudo' })
  })

  it('carries the attack’s own sudo so the exchange leaves as the pair it was', () => {
    const plans = planBeats(
      [
        defended({ id: 12, player: 'p1', card: 'defense-hotfix', effect: 'cancel' }),
        discarded(13, { player: 'p2', card: 'attack-bug', reason: 'attackSpent' }),
        discarded(14, { player: 'p2', card: 'support-sudo', reason: 'attackSpent' }),
        discarded(15, { player: 'p1', card: 'defense-hotfix', reason: 'defenceSpent' }),
      ],
      boardBefore({
        pending: defendPending({ scope: 'release', sudo: true }),
      } as Partial<BoardState>),
    )
    expect(plans[0]).toMatchObject({ kind: 'covered', attackSudo: true })
    expect((plans[0] as { spent: unknown[] }).spent).toHaveLength(3)
  })

  it('plans no movement for the events that are only a change of state', () => {
    // The window opening and closing, a pass, a hit taken, a monitoring
    // destroyed — these are things the projection SHOWS (the dock, the ring,
    // the badges), not things that fly. Planning nothing is the default and is
    // pinned here on purpose: the alternative is inventing choreography, which
    // this project sends to the backlog instead.
    const plans = planBeats(
      [
        { id: 30, type: 'windowOpened', player: 'p1', slot: 'frontend', round: 1, deadline: 0 },
        { id: 31, type: 'passed', player: 'p2' },
        { id: 32, type: 'unpassed', player: 'p2' },
        { id: 33, type: 'windowClosed', player: 'p1', slot: 'frontend' },
      ] as Event[],
      boardBefore(),
    )
    expect(plans).toEqual([])
  })

  it('leaves the take-hit resolution to the pair exit it already had', () => {
    const plans = planBeats(
      [
        tookHit({ id: 9 }),
        discarded(10, { player: 'p2', card: 'attack-bug', reason: 'attackSpent' }),
      ],
      boardBefore({ pending: defendPending({ scope: 'release' }) } as Partial<BoardState>),
    )
    expect(plans.map((p) => p.kind)).toEqual(['pairToDiscard'])
  })
})
```

- [ ] **Step 2: Run and watch them fail**

```bash
pnpm --filter @release/web test -- planBeats
```

Expected: FAIL — `defended` plans nothing today.

- [ ] **Step 3: Plan the exchange**

Add a `defended` branch to the walk. It must claim the `attackSpent`/`defenceSpent` discards that follow it, so `pairToDiscard` and `discardBeat` both leave them alone:

```ts
    if (e.type === 'defended') {
      flush()
      const p = before.pending
      if (p?.kind !== 'defend') continue // nothing on screen to answer — never stranded
      // Everything banked by THIS resolution, in the order the engine banked it.
      // The walk continues forward from here rather than scanning: a resolution's
      // discards are contiguous, and the next non-discard event ends them.
      const spent: { eventId: number; card: string; reason: 'attackSpent' | 'defenceSpent' }[] = []
      let j = i + 1
      while (j < events.length) {
        const d = events[j]
        if (d.type !== 'discarded') break
        if (d.reason !== 'attackSpent' && d.reason !== 'defenceSpent') break
        spent.push({ eventId: d.id, card: d.card, reason: d.reason })
        owned.add(d.id)
        j++
      }
      // Rollback keeps nobody's attack card: the engine puts it straight back
      // into a hand and emits NOTHING for it (attacks.ts:245-252). Whose hand is
      // derivable and only derivable: the defender's when they comboed their own
      // Sudo onto the defence, the attacker's otherwise. Recorded as a gap in
      // docs/animations/backlog.md, with `handTransfer` named as what would end
      // the inference.
      // matched on the REASON as well as the card: a sudo-backed attack answered
      // by a plain Rollback must still return the attack to the ATTACKER, and
      // matching on the card alone would read the attacker's own sudo as ours
      const ownSudo = spent.find((s) => s.card === 'support-sudo' && s.reason === 'defenceSpent')
      const sudo = ownSudo?.card
      plans.push({
        kind: 'covered',
        key: `covered:${e.id}`,
        eventId: e.id,
        defender: e.player,
        card: e.card,
        ...(sudo ? { sudo } : {}),
        effect: e.effect,
        attacker: p.attacker,
        attackCard: p.attackCard,
        attackSudo: p.sudo,
        spent,
        ...(e.effect === 'return' ? { returnTo: ownSudo ? e.player : p.attacker } : {}),
      })
      i = j - 1 // the discards this plan claimed are consumed
      continue
    }
```

The `support-sudo` lookup carries the same assumption `planBeats` already documents for `pairToDiscard`: it is the only sudo-capable support in the catalogue, and a second one would make this silently wrong. Keep that comment.

**Careful with the defender-vs-attacker sudo.** A `defenceSpent` discard of `support-sudo` is the *defender's*; an `attackSpent` one is the *attacker's*. Match on the reason as well as the card, or a sudo-backed attack answered by a plain Rollback would wrongly read as "the defender comboed a Sudo" and send the attack to the wrong hand. Write `ownSudo` as:

```ts
      const ownSudo = spent.find((s) => s.card === 'support-sudo' && reasonOf(s.eventId) === 'defenceSpent')
```

which is why `reason` rides on every `spent` entry. **Add a test for exactly this case before implementing it:**

```ts
it('returns a sudo-backed attack to the attacker when the Rollback was plain', () => {
  const plans = planBeats(
    [
      defended({ id: 12, player: 'p1', card: 'defense-rollback', effect: 'return' }),
      discarded(13, { player: 'p2', card: 'support-sudo', reason: 'attackSpent' }),
      discarded(14, { player: 'p1', card: 'defense-rollback', reason: 'defenceSpent' }),
    ],
    boardBefore({
      pending: defendPending({ scope: 'release', sudo: true }),
    } as Partial<BoardState>),
  )
  // the sudo in this exchange is the ATTACKER's, so the defender comboed
  // nothing and the attack goes home to them
  expect(plans[0]).toMatchObject({ effect: 'return', returnTo: 'p2', sudo: undefined })
})
```

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
pnpm --filter @release/web test -- planBeats
```

Expected: PASS, including the extra sudo-attack-plus-plain-Rollback case.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/board-beats
git commit -m "feat(web): the answer to an attack is planned as one exchange (#101)"
```

---

### Task 13: the cover lands and the exchange leaves as one

**Files:**
- Create: `apps/frontend/src/features/board-beats/defenseBeat.tsx`
- Create: `apps/frontend/src/features/board-beats/defenseBeat.test.tsx`
- Modify: `apps/frontend/src/features/board-beats/useBeats.ts` (five edit sites)
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx` (the cover slot's render)

**Interfaces:**
- Produces: `useDefenseBeat(anchors, staging?)` → `{ overlay, runCovered, runStolen, reset }`. `runStolen` arrives in Task 15; stub it as a no-op returning `Promise.resolve()` here so the wiring lands once.

- [ ] **Step 1: Write the failing test**

Create `defenseBeat.test.tsx`. Copy `comboBeat.test.tsx`'s **entire** `vi.hoisted` + `vi.mock('@release/ui/animations')` block verbatim — `useDiscardExit` must be stubbed whole, because the real hook imports `./play` as a sibling and a `play` mock on the barrel never sees it. Copy `harness()`, `drive()` and `ctx` too, extending the fake anchors with `cover`, `sudo`, `stage`, `cost`.

```tsx
it('lays the defence over the attack and sends the whole exchange out together', async () => {
  played.names = []
  exits.items = []
  const { api, Probe } = harness()
  render(<Probe />)
  const plan: Extract<BeatPlan, { kind: 'covered' }> = {
    kind: 'covered',
    key: 'covered:12',
    eventId: 12,
    defender: 'p2',
    card: 'defense-hotfix',
    effect: 'cancel',
    attacker: 'p1',
    attackCard: 'attack-bug',
    attackSudo: false,
    spent: [
      { eventId: 13, card: 'attack-bug' },
      { eventId: 14, card: 'defense-hotfix' },
    ],
  }
  await drive(() => api.beat?.runCovered(plan, ctx))
  // ONE send: the attack and the cover leave as one exchange, not two gestures
  expect(exits.items).toHaveLength(2)
  const [attack, cover] = exits.items
  // each carries its own layer, so the heap keeps the order they lay in (I9) —
  // the attack was under the cover on the table and lands under it in the heap
  expect(attack).toMatchObject({ layer: 0, scatter: scatterAt(13) })
  expect(cover).toMatchObject({ layer: 1, scatter: scatterAt(14) })
})

it('carries the attack’s own sudo out with it as the pair it was', async () => {
  exits.items = []
  const { api, Probe } = harness()
  render(<Probe />)
  await drive(() =>
    api.beat?.runCovered(
      {
        kind: 'covered',
        key: 'covered:12',
        eventId: 12,
        defender: 'p2',
        card: 'defense-hotfix',
        effect: 'cancel',
        attacker: 'p1',
        attackCard: 'attack-bug',
        attackSudo: true,
        spent: [
          { eventId: 13, card: 'attack-bug' },
          { eventId: 14, card: 'support-sudo' },
          { eventId: 15, card: 'defense-hotfix' },
        ],
      },
      ctx,
    ),
  )
  expect(exits.items[0]).toMatchObject({
    card: expect.objectContaining({ id: 'attack-bug' }),
    aux: expect.objectContaining({ id: 'support-sudo' }),
    auxScatter: scatterAt(14),
  })
})

it('reset() drops an exchange parked mid-air', async () => {
  const { api, Probe } = harness()
  render(<Probe />)
  hang.on = true
  const running = api.beat?.runCovered(cancelPlan(), ctx)
  await act(async () => void (await new Promise((r) => setTimeout(r, 80))))
  expect(api.beat?.overlay.length).toBeGreaterThan(0)
  act(() => {
    api.beat?.reset()
  })
  expect(api.beat?.overlay.length).toBe(0)
  hang.on = false
  hang.release?.()
  await running
})
```

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm --filter @release/web test -- defenseBeat
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the runner**

Create `apps/frontend/src/features/board-beats/defenseBeat.tsx`:

```tsx
import { CardPair, cardById } from '@release/ui'
import type { Leaving, Rect } from '@release/ui/animations'
import {
  enterPose,
  nextFrames,
  play,
  restTransform,
  scatterAt,
  useDiscardExit,
  useFlyer,
  wait,
} from '@release/ui/animations'
import type { RefObject } from 'react'
import { useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors, StagedHandoff } from '~/entities/game/board'
import { ATTACK_POSE, COVER_POSE, SHOW_HOLD } from '~/entities/game/board'
import type { BeatPlan } from './planBeats'

// The answer to an attack (#101): a defence covers what is standing at the
// centre, and the whole exchange leaves together. `_useDefenseStaging.ts` is
// the OTHER half — the gesture that stands the local player's own answer there
// before the engine has spoken; the two meet at `StagedHandoff`, exactly as
// the combo pair's two halves do.

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useDefenseBeat(anchors: BoardAnchors, staging?: RefObject<StagedHandoff | null>) {
  const { overlay: exitOverlay, send, reset: resetExit } = useDiscardExit(anchors.discardBox)
  const flyer = useFlyer()
  const latest = useRef({ anchors, staging, send })
  latest.current = { anchors, staging, send }

  const runCovered = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'covered' }>, ctx: BeatRun) => {
      // read BEFORE the first await, same race and same fix as comboBeat's own
      // handoff read: the staging hook's hand-watching effect clears `staged`
      // on this very prop update, and reading it later loses it
      const handoff = latest.current.staging?.current
      const mine = plan.defender === ctx.base.selfId
      await nextFrames() // the shadow that renders `before` has committed (I2)
      const a = latest.current.anchors
      const coverBox = rectOf(a.cover.current)
      const defence = cardById(plan.card)
      const ownSudo = plan.sudo ? cardById(plan.sudo) : null

      // THE COVER — the defence lies over the attack, offset and tilted the
      // other way, so the two read as two plays and not one tidy stack.
      if (coverBox && defence && !(mine && handoff?.el)) {
        const from = a.seatBox(plan.defender)
        if (from) {
          const [el] = await flyer.raise([
            {
              key: 'cover',
              at: from,
              content: ownSudo ? (
                <CardPair main={defence} aux={ownSudo} width="100%" />
              ) : undefined,
              card: ownSudo ? undefined : defence,
            },
          ])
          if (el) {
            await play('playToCenter', el, {
              from,
              to: coverBox,
              rotate: COVER_POSE.rot,
              dx: COVER_POSE.dx,
              dy: COVER_POSE.dy,
            })?.finished
          }
        }
      }
      // the actor's own answer is already standing where the cover goes —
      // nothing to move, hand the table back
      if (mine && handoff) handoff.release()
      await wait(SHOW_HOLD)

      // THE EXIT — one exchange, one send. Each card carries its layer, so the
      // heap keeps the order they lay in on the table (I9), and each lands on
      // its own `discarded` event's scatter (I7).
      const attackBox = rectOf(a.centre.current)
      const items: Leaving[] = []
      // by reason as well as card: `support-sudo` can be banked on both sides of
      // one exchange, and only the reason says whose it was
      const spentOf = (card: string, reason: 'attackSpent' | 'defenceSpent') =>
        plan.spent.find((s) => s.card === card && s.reason === reason)
      const attackSpent = spentOf(plan.attackCard, 'attackSpent')
      const attackAux = plan.attackSudo ? spentOf('support-sudo', 'attackSpent') : undefined
      const attackCard = cardById(plan.attackCard)
      if (attackSpent && attackBox && attackCard) {
        items.push({
          key: `x${attackSpent.eventId}`,
          card: attackCard,
          aux: plan.attackSudo ? cardById('support-sudo') : null,
          el: a.centre.current,
          from: attackBox,
          pose: ATTACK_POSE,
          layer: 0,
          scatter: scatterAt(attackSpent.eventId),
          ...(attackAux ? { auxScatter: scatterAt(attackAux.eventId) } : {}),
        })
      }
      const defenceSpent = spentOf(plan.card, 'defenceSpent')
      if (defenceSpent && coverBox && defence) {
        items.push({
          key: `x${defenceSpent.eventId}`,
          card: defence,
          aux: ownSudo,
          el: a.cover.current,
          from: coverBox,
          pose: COVER_POSE,
          layer: 1,
          scatter: scatterAt(defenceSpent.eventId),
        })
      }
      if (items.length > 0) await latest.current.send(items)
      flyer.drop('cover')
    },
    [flyer.raise, flyer.drop],
  )

  // Task 15 fills this in — the steal's zone-to-zone flight.
  const runStolen = useCallback(
    async (_plan: Extract<BeatPlan, { kind: 'stolen' }>, _ctx: BeatRun) => {},
    [],
  )

  // A new match cancels what is in the air — same reason and same idiom as
  // every other runner: both carriers belong to the runner, not the queue.
  const reset = useCallback(() => {
    flyer.drop()
    resetExit()
  }, [flyer.drop, resetExit])

  return { overlay: [...exitOverlay, ...flyer.overlay], runCovered, runStolen, reset }
}
```

The `spentOf` lookup by card id is ambiguous when a card appears twice in one exchange (a sudo on both sides). Guard it: match the attack's sudo against an `attackSpent` reason and the defence's against `defenceSpent`, carrying `reason` on the `spent` entries from Task 12. **Write the failing test for the both-sides-sudo case first**, then make it pass.

- [ ] **Step 4: Render the cover slot**

In `_Board.tsx`'s cover slot, render the defence once the projection says it is there — during the beat the flyer holds it, and the beat's last frame IS the projection. Since the exchange resolves the pending away, the cover has no resting projection state of its own: it exists only while the beat runs. Leave the slot empty and let the flyer own it, and bind `previewProps(null)`.

- [ ] **Step 5: Wire the runner into the queue**

In `useBeats.ts`, all five sites:

```tsx
import { useDefenseBeat } from './defenseBeat'
// …
  const defense = useDefenseBeat(anchors, staging)      // beside the other runners
// …
      if (plan.kind === 'covered') {
        return { key: plan.key, base, exclusive: false, run: (ctx) => defense.runCovered(plan, ctx) }
      }
      if (plan.kind === 'stolen') {
        return { key: plan.key, base, exclusive: false, run: (ctx) => defense.runStolen(plan, ctx) }
      }
```

Add `defense.runCovered` and `defense.runStolen` to `beatOf`'s dependency array. Add `defense.reset()` beside the other resets — and **do not** touch that effect's dependency array; the `biome-ignore` above it explains why the runners are deliberately excluded. Spread `...defense.overlay` into `overlays`.

- [ ] **Step 6: Run the tests and confirm they pass**

```bash
pnpm --filter @release/web test -- defenseBeat && pnpm --filter @release/web test
```

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add apps/frontend/src
git commit -m "feat(web): a defence covers the attack and the exchange leaves as one (#101)"
```

---

### Task 14: Rollback sends the attack back

**Files:**
- Modify: `apps/frontend/src/features/board-beats/defenseBeat.tsx`
- Test: `apps/frontend/src/features/board-beats/defenseBeat.test.tsx`

**Interfaces:**
- Consumes: Task 12's `returnTo`, `useHandArrival` from `@release/ui/animations`.

- [ ] **Step 1: Write the failing tests**

Follow `drawBeat.test.tsx`'s pass-through wrapper idiom for `useHandArrival` — call the real hook and record `arrive`'s arguments — and add it to this file's mock block:

```tsx
it('flies a plain Rollback’s attack back to the seat that threw it', async () => {
  played.names = []
  arrivals.handLengths = []
  const { api, Probe } = harness()
  render(<Probe />)
  await drive(() => api.beat?.runCovered(rollbackPlan({ returnTo: 'p1' }), ctx))
  // it went to a seat, not into our fan
  expect(arrivals.handLengths).toHaveLength(0)
  expect(played.names).toContain('playToCenter')
  // and it was never banked: only the defence left for the discard
  expect(exits.items.map((i) => i.card.id)).toEqual(['defense-rollback'])
})

it('brings a sudo Rollback’s attack into our own fan', async () => {
  arrivals.handLengths = []
  const { api, Probe } = harness()
  render(<Probe />)
  // base.selfId is 'p1', so returnTo: 'p1' is us
  await drive(() =>
    api.beat?.runCovered(rollbackPlan({ returnTo: 'p1', defender: 'p1', sudo: 'support-sudo' }), ctx),
  )
  expect(arrivals.handLengths).toHaveLength(1)
  // the gap opens in the MIDDLE of the fan: no index is passed
  expect(arrivals.ats[0]).toBeUndefined()
})
```

- [ ] **Step 2: Run and watch them fail**

```bash
pnpm --filter @release/web test -- defenseBeat
```

Expected: FAIL — the attack is banked with the defence instead of returning.

- [ ] **Step 3: Add the return leg**

In `runCovered`, the attack card is only added to `items` when the resolution actually banked it — which Task 12 already encodes, because a returning Rollback emits no `attackSpent` for it and so `spentOf(plan.attackCard)` is undefined. That means the exit is already correct; what is missing is the flight. Add it beside the exit so both travel together as one moment:

```ts
      // ROLLBACK — the attack is not burned, it is sent back. The engine puts
      // it into a hand by mutating state and emits NOTHING for it
      // (attacks.ts:245-252), so `returnTo` is derived rather than read; the
      // gap and what would close it are in docs/animations/backlog.md.
      const returning =
        plan.effect === 'return' && plan.returnTo && attackBox && attackCard
          ? (async () => {
              if (plan.returnTo === ctx.base.selfId) {
                // into our own fan, through the shared insert every other
                // "card settles into the hand" motion uses. No index: the gap
                // opens in the middle of the fan.
                void arrival.arrive(
                  [{ key: `back${plan.eventId}`, card: attackCard, from: attackBox }],
                  ctx.base.you.hand.length,
                )
                await wait(arrival.FLIGHT_MS)
                return
              }
              const to = a.seatBox(plan.returnTo as string)
              if (!to) return
              const [el] = await flyer.raise([
                { key: 'back', at: attackBox, card: attackCard },
              ])
              if (el) await play('playToCenter', el, { from: attackBox, to })?.finished
              flyer.drop('back')
            })()
          : undefined

      await Promise.all([items.length > 0 ? latest.current.send(items) : undefined, returning])
```

Replace the bare `await latest.current.send(items)` from Task 13 with this `Promise.all`, so the exchange and the return are one event rather than two in sequence. Add `useHandArrival(anchors.hand)` to the hook and include its overlay in the returned `overlay` array.

- [ ] **Step 4: Run the tests and confirm they pass**

```bash
pnpm --filter @release/web test -- defenseBeat
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/frontend/src/features/board-beats
git commit -m "feat(web): Rollback sends the attack back where it came from (#101)"
```

---

### Task 15: Security Bug takes the release across the table

**Files:**
- Modify: `apps/frontend/src/features/board-beats/planBeats.ts`
- Modify: `apps/frontend/src/features/board-beats/defenseBeat.tsx` (`runStolen`)
- Test: `apps/frontend/src/features/board-beats/planBeats.test.ts`, `defenseBeat.test.tsx`

**Interfaces:**
- Produces: `BeatPlan`'s `stolen` member:

```ts
  // Security Bug does not burn the release — it takes it. The card crosses from
  // the victim's zone into the thief's and morphs into its LOD reading IN
  // FLIGHT: an opponent's zone reads at a glance, not in full.
  | {
      kind: 'stolen'
      key: string
      eventId: number
      from: string
      to: string
      slot: string
      card: string
    }
```

> **Depends on PR 0.** The `windowOpened` that now follows `releaseStolen` is what makes this scene truthful. Do not start this task until PR 0 is merged and this branch has it.

- [ ] **Step 1: Write the failing tests**

In `planBeats.test.ts`:

```ts
it('plans the steal as a crossing between two zones', () => {
  const plans = planBeats(
    [
      {
        id: 20,
        type: 'releaseStolen',
        from: 'p1',
        to: 'p2',
        slot: 'frontend',
        card: 'release-frontend',
      } as Event,
    ],
    boardBefore(),
  )
  expect(plans).toEqual([
    {
      kind: 'stolen',
      key: 'stolen:20',
      eventId: 20,
      from: 'p1',
      to: 'p2',
      slot: 'frontend',
      card: 'release-frontend',
    },
  ])
})
```

In `defenseBeat.test.tsx`:

```tsx
it('flies the stolen release from the robbed zone into the thief’s', async () => {
  played.names = []
  const { api, Probe } = harness()
  render(<Probe />)
  await drive(() =>
    api.beat?.runStolen(
      {
        kind: 'stolen',
        key: 'stolen:20',
        eventId: 20,
        from: 'p1',
        to: 'p2',
        slot: 'frontend',
        card: 'release-frontend',
      },
      ctx,
    ),
  )
  expect(played.names).toContain('playToCenter')
  // it reads as LOD by the time it lands — the morph happens in flight, not on
  // arrival, so `patch` was called with the LOD face while the card travelled
  expect(patched.lod).toBe(true)
})
```

Extend the mock block's `useFlyer` stand-in to record `patch` calls into a hoisted `patched` object, or wrap the real `useFlyer` pass-through style as `drawBeat.test.tsx` wraps `useHandArrival`. Prefer the pass-through wrapper: the morph's correctness is *when* `patch` is called relative to the flight starting, and a fully faked flyer cannot show that.

- [ ] **Step 2: Run and watch them fail**

```bash
pnpm --filter @release/web test -- planBeats defenseBeat
```

Expected: FAIL on both.

- [ ] **Step 3: Plan it**

In `planBeats.ts`'s walk:

```ts
    if (e.type === 'releaseStolen') {
      flush()
      plans.push({
        kind: 'stolen',
        key: `stolen:${e.id}`,
        eventId: e.id,
        from: e.from,
        to: e.to,
        slot: e.slot,
        card: e.card,
      })
      continue
    }
```

- [ ] **Step 4: Fly it, morphing on the way**

Replace `runStolen`'s stub in `defenseBeat.tsx`:

```tsx
  // The release crosses from the robbed zone into the thief's. It is entering
  // an OPPONENT's zone, where cards are read as LOD — so it morphs on the way
  // instead of being swapped on arrival. The morph is not a preset: it is a
  // content swap on the flyer one frame after it mounts, and the face's own
  // layers ease to their LOD values over 320ms of CSS transition while the
  // 480ms flight carries it across (ComposedFace's own coupling).
  const runStolen = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'stolen' }>, ctx: BeatRun) => {
      await nextFrames()
      const a = latest.current.anchors
      // `from` is the victim's slot as it stood BEFORE this batch (I1 — the
      // beat runs against `base`, and the shadow still renders it); `to` is the
      // thief's, which the live projection has already created.
      const from = rectOf(a.releaseSlot(plan.from, plan.slot))
      const to = rectOf(a.releaseSlot(plan.to, plan.slot))
      const card = cardById(plan.card)
      if (!from || !to || !card) return // nothing measurable: the projection resolves it
      const [el] = await flyer.raise([{ key: 'steal', at: from, card }])
      if (!el) return
      // the reading flips on the same frame the travel starts, so nothing is
      // swapped on arrival
      flyer.patch('steal', { card, lod: plan.to !== ctx.base.selfId })
      await play('playToCenter', el, { from, to })?.finished
      flyer.drop('steal')
    },
    [flyer.raise, flyer.patch, flyer.drop],
  )
```

Check `useFlyer`'s `raise`/`patch` item shape before writing this: the story passes a rendered `content` node (`faceOf(card, aux, lod)`), not a `lod` flag. If the flyer takes `content`, build it here as `<Card card={card} interactive={false} width="100%" lod />` and patch that — mirror the story rather than inventing a new flyer API. A `lod` prop on the flyer item would be a new module surface and belongs in `apps/ui`, with a `reference.md` row, not invented locally.

The `plan.to !== ctx.base.selfId` guard matters: a release stolen **into our own zone** (the reflected case, and any future one) is read in full, not as LOD.

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
pnpm --filter @release/web test -- planBeats defenseBeat && pnpm --filter @release/web test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/features/board-beats
git commit -m "feat(web): a stolen release crosses the table and changes how it reads (#101)"
```

---

### Task 16: answering an attack — the plain defence

**Files:**
- Create: `apps/frontend/src/pages/board/[gameId]/_useDefenseStaging.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx`
- Create: `apps/frontend/src/pages/board/[gameId]/__tests__/boardDefense.test.tsx`

**Interfaces:**
- Produces: `useDefenseStaging({ state, anchors, actions, events, enabled })` → `{ staged, overlay, gapAt, gapSize, handItems, accentAt, defenceOptions, pairRef, onHandPlay, onCardClick, cancel, release }` — deliberately the same shape as `BoardStaging` where the two overlap, so `_Board.tsx` can pick one or the other by which is live rather than merging their outputs. There is no separate `sudoOptions`: which defences a Sudo may enhance comes from `state.comboOptions[sudoUid]`, the same projection field the combo gesture already reads.

A sibling hook, not more growth of `_useBoardStaging.ts` (562 lines already): a turn play and a window answer are different modes with different dispatches, and only one is ever active. Shared flight primitives are imported, never copied — if a third copy of the fold appears, it belongs in `apps/ui/src/animations/` instead.

- [ ] **Step 1: Write the failing test**

Create `boardDefense.test.tsx`, modelled on `boardStaging.test.tsx` (real `<Board>`, no mocks, `pullCardFromFan` copied from there):

```tsx
it('drops a defence on the attack and answers with it', async () => {
  const onResolve = vi.fn()
  render(defenceBoard({ options: ['defense-hotfix#0'] }, { onResolve }))
  await pullCardFromFan('defense-hotfix#0')
  expect(onResolve).toHaveBeenCalledWith({
    kind: 'defend',
    card: 'defense-hotfix#0',
    combo: undefined,
  })
})

it('offers nothing the projection did not offer', async () => {
  // legality is the engine's answer, never the UI's — a card the pending does
  // not list cannot be pulled to answer with
  const onResolve = vi.fn()
  render(defenceBoard({ options: [] }, { onResolve }))
  await pullCardFromFan('defense-hotfix#0')
  expect(onResolve).not.toHaveBeenCalled()
})

it('a rejected defence comes back to the fan', async () => {
  const onResolve = vi.fn()
  const { rerender } = render(defenceBoard({ options: ['defense-hotfix#0'] }, { onResolve }))
  await pullCardFromFan('defense-hotfix#0')
  rerender(
    defenceBoard(
      { options: ['defense-hotfix#0'] },
      { onResolve },
      [{ id: 9, type: 'rejected', action: { type: 'RESOLVE' }, reason: 'nope' } as Event],
    ),
  )
  await act(async () => {
    await new Promise((r) => setTimeout(r, 700))
  })
  expect(fanUids()).toContain('defense-hotfix#0')
})
```

`defenceBoard(over, actions, events)` builds a board whose `state.pending` is a `defend` owed to `selfId` with `scope: 'release'`, `attacker: 'p2'`, `attackCard: 'attack-bug'`, `sudo: false`, and `options` from `over`. The rejection test's `action` shape must match what the engine really emits for a rejected RESOLVE — read `reject()` in `packages/engine/src/fake/core.ts` and use the real shape, because `_useBoardStaging`'s rejected-watcher matches on `'card' in e.action`, and a RESOLVE action has no `card` field. **That is a real difference from the play path and this hook must match on the pending's identity instead** — write the watcher accordingly.

- [ ] **Step 2: Run and watch it fail**

```bash
pnpm --filter @release/web test -- boardDefense
```

Expected: FAIL — the module does not exist.

- [ ] **Step 3: Write the hook**

Create `_useDefenseStaging.ts`. The plain-defence path is small: the options come from the pending, the pull flies the card to the cover slot at `COVER_POSE`, and the dispatch is a `defend` choice.

```ts
// Answering an attack (#101). Active only while the engine owes US a `defend`
// decision. Its sibling `_useBoardStaging.ts` owns the TURN's plays; the two
// never run at once, because a window suspends normal play (the engine returns
// [] from `playableFor` while one is open).
//
// Legality is the projection's answer throughout: `pending.options` names the
// cards that may answer this attack, and `comboOptions` names what a Sudo may
// enhance. Nothing here re-derives either.

export function useDefenseStaging({ state, anchors, actions, events, enabled }: Options) {
  const pending =
    state.pending?.kind === 'defend' && state.pending.player === state.selfId
      ? state.pending
      : null
  const defenceOptions = useMemo(() => pending?.options ?? [], [pending])
  // …
  const onHandPlay = useCallback(
    (uid: string, drop: HandPlayDrop): boolean => {
      if (!enabled || !pending || stagedRef.current) return false
      if (!defenceOptions.includes(uid)) return false
      const index = state.you.hand.findIndex((c) => c.uid === uid)
      const item = state.you.hand[index]
      if (!item) return false
      // A support waits for a partner instead of answering on its own — that
      // is Task 17's path, and it is recognised the same way the combo gesture
      // recognises one: it has combo options and no answer of its own.
      commitStaged({ main: { uid, card: item.card, index }, support: null, phase: 'dispatched' })
      void (async () => {
        const to = anchors.cover.current?.getBoundingClientRect()
        if (!reduced && drop.rect && to) {
          const [el] = await flyer.raise([{ key: 'cover', card: item.card, at: drop.rect }])
          if (el) {
            await play('playToCenter', el, {
              from: drop.rect,
              to,
              rotate: COVER_POSE.rot,
              dx: COVER_POSE.dx,
              dy: COVER_POSE.dy,
            })?.finished
          }
        }
        // the flyer stays up: `defenseBeat.runCovered` takes the table over
        // through the handoff, exactly as the combo beat does for a play
      })()
      actions?.onResolve?.({ kind: 'defend', card: uid, combo: undefined })
      return true
    },
    [enabled, pending, defenceOptions, state.you.hand, reduced, anchors.cover, actions, flyer.raise],
  )
```

Publish a `StagedHandoff` from `_Board.tsx` for this hook the same way it already does for `_useBoardStaging` — one `handoffRef`, written in the layout effect from whichever hook is live. `defenseBeat.runCovered` already reads it (Task 13).

- [ ] **Step 4: Wire it into `_Board.tsx`**

Instantiate beside `useBoardStaging`, gated on the same `enabled` condition. Route `Hand`'s `onPlay` / `onCardClick` and the miss-cancel to whichever hook is live — a `defend` pending owed to us means the defence hook owns the fan, otherwise the turn hook does. Keep that decision in one derived constant (`const answering = state.pending?.kind === 'defend' && state.pending.player === state.selfId`) rather than repeating the condition at each call site.

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
pnpm --filter @release/web test -- boardDefense && pnpm --filter @release/web test
```

Expected: PASS, with no regression in `boardStaging.test.tsx`.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/board
git commit -m "feat(web): a defence answers the attack standing at the centre (#101)"
```

---

### Task 17: the defender's own Sudo takes its own slot, then folds

**Files:**
- Modify: `apps/frontend/src/pages/board/[gameId]/_useDefenseStaging.ts`
- Modify: `apps/frontend/src/pages/board/[gameId]/_Board.tsx` (the sudo slot's render, the pair flyer)
- Test: `apps/frontend/src/pages/board/[gameId]/__tests__/boardDefense.test.tsx`

**Interfaces:**
- Consumes: `MERGE_MS`, `SUDO_POSE` from `poses.ts`; `useArrow`, `PAIR_AUX_POSE`, `CardPair` from `@release/ui`; `enterPose`, `foldIntoPair` from `@release/ui/animations`.

- [ ] **Step 1: Write the failing tests**

```tsx
it('stands the Sudo in its own slot and aims an arrow out of it', async () => {
  render(defenceBoard({ options: ['defense-hotfix#0'], combos: { 'support-sudo#0': ['defense-hotfix#0'] } }, {}))
  await pullFromFan('support-sudo#0')
  const sudoSlot = document.querySelector('[data-centre-slot="sudo"]') as HTMLElement
  expect(sudoSlot.querySelector('[data-card]')).toBeTruthy()
  expect(document.querySelector(`.${arrowStyles.arrow}`)).toBeTruthy()
})

it('folds the picked defence together with the Sudo and answers as a pair', async () => {
  const onResolve = vi.fn()
  render(
    defenceBoard(
      { options: ['defense-hotfix#0'], combos: { 'support-sudo#0': ['defense-hotfix#0'] } },
      { onResolve },
    ),
  )
  await pullFromFan('support-sudo#0')
  await clickFanCard('defense-hotfix#0')
  expect(onResolve).toHaveBeenCalledWith({
    kind: 'defend',
    card: 'defense-hotfix#0',
    combo: 'support-sudo#0',
  })
})

it('a press on nothing valid takes the waiting Sudo home', async () => {
  render(defenceBoard({ options: ['defense-hotfix#0'], combos: { 'support-sudo#0': ['defense-hotfix#0'] } }, {}))
  await pullFromFan('support-sudo#0')
  fireEvent.mouseDown(document.querySelector('[data-board-centre]')?.parentElement as HTMLElement)
  await act(async () => {
    await new Promise((r) => setTimeout(r, 700))
  })
  expect(fanUids()).toContain('support-sudo#0')
})
```

- [ ] **Step 2: Run and watch them fail**

```bash
pnpm --filter @release/web test -- boardDefense
```

Expected: FAIL.

- [ ] **Step 3: Add the Sudo path**

Port `stageDefSudo` + `mergeIntoPair` from the story (lines 421-431 and 476-511). The two mechanics that must survive the port exactly:

1. **The Sudo goes to its OWN slot, not onto the card it will back** — flying it to the defence would read as the pair already being assembled. `play('playToCenter')` to `anchors.sudo`'s rect with `rotate: SUDO_POSE.rot`, then arm the arrow from that slot's centre:

```ts
  if (box) arrowCtl.aim({ x: box.left + box.width / 2, y: box.top + box.height / 2 }, drop)
```

2. **The standing Sudo is handed to the flyer in the SAME commit** — this is the no-duplicate rule, and it is the whole reason the fold reads as a merge rather than a teleport. `setDefSudo(null)` (or this hook's equivalent state clear) is the statement **immediately before** `raise()`, with no `await` between them, so React batches both into one commit: the static Sudo unmounts on the exact frame the flyer's aux half mounts. Never on screen twice, never absent.

```ts
      const enterMain = enterPose(fromRect, box)
      const enterAux = enterPose(sudoBox, box)
      commitStaged({ ...s, merged: true })   // clears the standing sudo render
      const [el] = await flyer.raise([
        { key: 'fold', at: box, content: <CardPair main={defence} aux={sudoCard} width="100%" />,
          pose: restTransform(COVER_POSE) },
      ])
      const mainEl = el?.querySelector<HTMLElement>('[data-main]')
      const auxEl = el?.querySelector<HTMLElement>('[data-aux]')
      if (!mainEl || !auxEl) return
      mainEl.style.transform = enterMain
      auxEl.style.transform = enterAux
      await nextFrames()   // both painted at their entry poses first (I2)
      await Promise.all([
        play('foldIntoPair', mainEl, { from: fromRect, box, dur: MERGE_MS })?.finished,
        play('foldIntoPair', auxEl, {
          from: sudoBox, box, pose: PAIR_AUX_POSE, dur: MERGE_MS, snap: true,
        })?.finished,
      ])
```

The aux lands on exactly `CardPair`'s own resting pose (`PAIR_AUX_POSE`), which is what makes the later handover to the beat invisible.

3. **The fold is irrevocable once a partner is picked** — copy `_useBoardStaging`'s `foldingRef` discipline verbatim in intent: `cancel()` and a second click both refuse while it is true, and every exit path clears it in a `finally`, not only the success path.

4. **Which cards light** comes from `state.comboOptions[sudoUid]`, intersected with the pending's own `options` — a Sudo may only enhance a defence that also answers **this** attack, and the recipe says it can enhance nothing at all under a sudo-backed attack. If `comboOptions` does not already encode that restriction, do **not** re-derive it here: record the gap and light only the intersection.

- [ ] **Step 4: Render the sudo slot and reuse the pair flyer**

Fill `_Board.tsx`'s sudo slot with the standing Sudo while it waits (wrapped in `.pose` carrying `restTransform(SUDO_POSE)`), and give this hook its own `pairRef` node exactly like `_useBoardStaging`'s — the same `.pairFlyer` CSS, a second node. Bind `previewProps` on the sudo and cover slots to the cards they now hold.

- [ ] **Step 5: Run the tests and confirm they pass**

```bash
pnpm --filter @release/web test -- boardDefense && pnpm --filter @release/web test
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/frontend/src/pages/board
git commit -m "feat(web): the defender's Sudo waits in its own place and folds into the answer (#101)"
```

---

### Task 18: the docs catch up, and the scene is walked end to end

**Files:**
- Modify: `docs/animations/recipes.md` (the Defense Release recipe)
- Modify: `docs/animations/backlog.md` (retire one entry, add any new finding)
- Modify: `apps/playground/stories/AnimationAuditStory/AnimationAuditStory.tsx` (scenario status + register)
- Modify: `packages/translation/src/locales/{en,ru}/common.json` if any new copy was added

**Interfaces:** none — documentation and verification.

- [ ] **Step 1: Retire the Rollback finding, which named this task as its closer**

`docs/animations/backlog.md` carries **"Возврат Rollback'ом судо-атаки — на борде для него нет движения"** with *«Что закроет. Обменная хореография возврата — Wave 3, #101»* and status `открыто`. Task 14 supplied exactly that. Per the file's own rule — *«a `решено` entry does not stay here as a trophy — its content moves into the docs and the entry goes»* — **delete the entry** and make sure `recipes.md` describes the return it documented.

Its one-line twin in the audit register (`AnimationAuditStory.tsx:799-800`, both `ru` and `en`) goes the same way.

What does **not** go away, and must be written in its place: the recipient is still *derived*, not read from an event. Add a new, narrower backlog entry in the file's own format:

```markdown
### Кому Rollback вернул атаку — выводится, а не читается

**Что не хватает.** `attacks.ts:245-252` кладёт атакующую карту в руку прямой записью и не шлёт
ни одного события — `handTransfer` объявлен в `events.ts:37` и здесь не используется. Такт
(`defenseBeat.runCovered`) выводит получателя: защитник, если в этой же резолюции есть
`discarded(support-sudo, defenceSpent)`, иначе атакующий.

**Чем грозит.** Движение без события за спиной ломается молча: переименование причины сброса или
второй sudo-способный support в каталоге — и возврат просто перестаёт играться, а тесты на
`planBeats` этого не увидят, потому что они пиннят тот же вывод.

**Что закроет.** Движок шлёт `handTransfer` при возврате, план читает его вместо вывода. Правка в
`packages/engine`, не в анимациях.

**Статус.** `времянка` — вывод на месте и покрыт тестами (`planBeats.test.ts`, `defenseBeat.test.tsx`).
```

Add the matching one-line finding to the audit page's register, in both `ru` and `en`.

- [ ] **Step 2: Bring the recipe to what the board actually does**

The recipe "Defending a release — the whole turn, play through defence" describes the playground scene. Update **only** where the board differs, and say which is which — the recipe describes real code, never a plan:

- the cost is picked from the fan rather than by any bar control, and for a remote player the cost flies from their seat when `released` arrives (the engine emits nothing before that);
- the cancel of a staged release goes through the engine's `cancelRelease` choice;
- `Live reference` gains the board alongside `Defense Release`.

`apps/playground/stories/docs.test.ts` requires every scene in the Cards and Interactive groups to name a live reference in backticks — do not remove the existing one.

- [ ] **Step 3: Update the audit page's scenario status**

The Defense Release scenario entry (`AnimationAuditStory.tsx:623-628`) describes the playground scene as the definition. Add that it is now on the board too, in both `ru` and `en`. Keep the two languages in step — a key present in one and missing in the other is exactly the drift the docs tests exist to catch.

- [ ] **Step 4: Walk the whole scene in the real app**

Documentation is not evidence that the thing moves. Run it:

```bash
pnpm dev
```

Open two browser windows on the same room so there is a real opponent, and walk every beat, watching for a blink at each handover (the frame where a flyer hands the table to a static render):

1. play a release → it stands at the centre, does **not** land;
2. pay its cost from the fan → the cost is held open, leaves, and only then does the release snap into its zone slot and the window open;
3. press on nothing while a release is staged → it comes home to the middle of the fan;
4. from the other window, attack that release → the card flies from the seat's card box, not from the whole seat plate, and lies at its own tilt;
5. answer with a plain defence → it covers the attack, offset and tilted the other way, and both leave together into the heap in the order they lay;
6. answer with Sudo + a defence → the Sudo takes its own slot with the arrow, the defence folds into a pair with it, **and the Sudo is never on screen twice**;
7. answer with Rollback, plain and under Sudo → the attack goes back to the thrower's seat, and into your own fan respectively;
8. let a Security Bug through → the release crosses into the thief's zone, morphing to its LOD reading **in flight**, and a fresh window opens on it (PR 0);
9. hover each of the five centre slots → the preview reads on the right, survives the pointer resting on itself, and stays put when a card flies away under a still cursor.

Then repeat the whole walk with **reduced motion on** (macOS: System Settings → Accessibility → Display → Reduce motion). Every step must reach the same end state with no animation and no stranded card. This is the one check that no unit test in this plan performs.

Anything that does not match: fix it, or — if it is a gap rather than a bug — write it into the backlog and the audit register instead of working around it locally.

- [ ] **Step 5: Full verification**

```bash
pnpm test && pnpm lint && pnpm typecheck && pnpm build
```

Expected: all four PASS. Read the output; do not claim a pass you have not seen.

- [ ] **Step 6: Commit and open the PR**

```bash
git add docs apps/playground packages/translation
git commit -m "docs(animations): the release and its answer, as the board plays them (#101)"
git push -u origin feat/101-defense-release
gh pr create --base main --title "Release and defence on the board (#101)" --body "Closes #101. Wave 3 of #88.

The playground's \`DefenseReleaseStory\` on the real board, driven by engine events: a release stands at the centre and pays its cost in the open before it lands, the window opens, attacks fly in from seats, and answers cover them — the defence-side Sudo taking its own slot with an arrow and folding into a pair, Security Bug carrying the release across the table and morphing to its LOD reading in flight, Rollback sending the attack back to a seat or into your own fan.

The centre of the table grows from one anchor into the scene's five slots; \`planBeats\` gains \`covered\` and \`stolen\` and widens \`releasePlaced\` to every release; a new \`defenseBeat.tsx\` runs the exchange; \`useCardPreview\` binds to the centre so a standing card can be read.

Retires the backlog's \"Возврат Rollback'ом судо-атаки\" entry, which named this task as its closer.

Depends on #95 (a stolen release opens its own attack window) — without it this scene would animate a state the engine contradicts."
```

---

## Notes for whoever executes this

**Two things in this plan are deliberately not decided, and must not be quietly decided during implementation.**

1. **Whether an opponent sees which release is standing while its cost is paid** (Task 8). Not settled in `docs/rules/`. The plan keeps today's behaviour and files the question. Answering it in code would be a guess written down as a rule.
2. **Whether `comboOptions` already restricts a defence-side Sudo to defences that answer *this* attack** (Task 17). Read it; if it does not, light only the intersection and record the gap — do not re-derive the rule in the UI.

**One thing is derived on purpose and is on record:** Rollback's recipient (Task 12/14). The engine emits no event for the return. The derivation is sound today, tested, and its backlog entry names the engine change that would end it.

**The order matters in two places.** Task 15 (the steal) needs PR 0 merged, or it animates a state the engine contradicts — which is the whole reason #95 is a prerequisite. Tasks 16-17 need Task 13's runner, because the gesture hands the table to it.

**If a movement turns up needed in two scenes, it is a module that has not been packaged yet** — port it into `apps/ui/src/animations/` with a `reference.md` row (`apps/ui/src/animations/docs.test.ts` fails without one), rather than writing it a second time.
