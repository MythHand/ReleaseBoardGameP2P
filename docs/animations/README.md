# Animations — how to wire game logic to the visuals

AI-facing guide to the card/table animation system. The **playground is the showcase**
(the live, canonical look of every animation — `apps/playground/stories/...`); **these
docs are the how-to** — how to call the same functions from real game logic and get the
exact, debugged result, without re-inventing or losing the tuned nuances.

Read in this order:

1. **This file** — the mental model + the global invariants every recipe relies on.
2. **[`recipes.md`](./recipes.md)** — by game situation ("a card was played", "a card was
   drawn"…): the ordered sequence + params + gotchas to reproduce it. **Start here for a task.**
3. **[`reference.md`](./reference.md)** — the callable API: presets, helpers and toolkit modules
   (signatures, params, defaults). Look up *how to call* something.
4. **[`glossary.md`](./glossary.md)** — the properties & values you pass and tune: `play(...)`
   parameters, easing tokens, geometry/timing constants, holds. Look up *what a word or number means*.
5. **[`extending.md`](./extending.md)** — add a new preset/module when nothing fits.
6. **[`backlog.md`](./backlog.md)** — what is **missing, disputed or temporarily patched**. The other
   files describe what exists and is verified; this is the only one allowed to describe what does
   not. **Run into a gap — write it there and raise it, do not invent a local way around it.**

The live status map of what exists is the playground **`Interaction audit`** page
(`apps/playground/stories/AnimationAuditStory`); the live, runnable catalogue of the vocabulary is
the **`Animations`** page, where each preset is shown in the form it actually is (a travel, a slot
swap, a badge, an arriving block, a volley, a fold) and a preset with no form says so instead of
faking one. Keep both and these docs in sync on changes.

That sync is enforced rather than promised, in three places, each of them added after the drift it
now prevents had already happened:

- **every preset has a row in [`reference.md`](./reference.md)** — `apps/ui/src/animations/docs.test.ts`
  against `presetNames()`. Seven presets had fallen out of the docs before it existed;
- **every module on the audit page is mentioned in [`reference.md`](./reference.md)** —
  `apps/playground/stories/docs.test.ts`. `useCardPreview` sat on that page as finished while the
  reference did not know it existed: a whole block, in the public index, used by four scenes;
- **every scene in the Cards / Interactive groups is named as a live reference in
  [`recipes.md`](./recipes.md)** — the same file, reading the playground navigation. Two scenes are
  exempt there by name, with the reason written next to each.

What none of them can catch is a module written down in NEITHER place — the tests compare two places
with each other, so something absent from both is invisible to all three. That limit is in
[`backlog.md`](./backlog.md), and what closes it is a rule rather than a check: a module counts as
done once it is on the audit page.

---

## Current state — library vs. playground (read before you wire anything)

Not everything these docs describe is a shared library module. As of now:

**In `@release/ui` — import and use directly:**
- The animation vocabulary: `play`, the presets (`PRESETS`), and `enterPose` / `wait` /
  `nextFrames` (`apps/ui/src/animations/`) — `move` is the travel base **inside** the presets, not
  a call site's tool: a flight goes through a named preset; the discard-scatter model
  `scatterAt` / `jitter` /
  `restTransform` / `toDiscardParams` / `HEAP_SHOW` (same folder); the shake characters
  `SHAKE_SHAPES`; the card geometry helpers `cardAreaOf` / `cardBoxIn` (`@/primitives/Card`); the
  fan geometry `slotPlacement` / `handStep` (`@/table/Hand/fan`); the pair's resting pose
  `PAIR_AUX_POSE` (`@/primitives/CardPair`), which the fold lands on.
- Primitives / components that **animate themselves** — used declaratively, the animation is built in:
  `Card` (plays `flipCard` on a `faceDown` change), `Hand` (the interactive fan: hover lift + zoom
  preview, drag-to-play/reorder, click/drag threshold, settle-back — all internal), `EdgeGlow` (CSS
  opacity fade), `ConfirmAction` (slide-up confirm bar), `CardCatalog` (the set of face-up cards you
  name one from: staggered entrance, hover growth, the named one holds while the rest leave),
  `TurnDock` (its `Swap` and `Reveal` orchestrate the slot presets), `Input` (shake), `Arrow` (via
  `useArrow`), `useCardPreview` (reading a card that stands on the table — a hook and one node, bound
  to a slot rather than to "the card at the centre").
  The card face's own motion is one engine, `useCardTilt` (pointer parallax + hover lift, and the
  `from` handover for a face that continues on a new instance), with `CardMotionProvider` as the
  screen-wide switch that turns the parallax off for a whole subtree.
  `ReleaseZone` reflects what the consumer decided and hands the gesture back — the same model as
  `Hand`: `slotRef(key, el)` to fly a card into a specific slot, `support` for a release with the
  card laid WITH it (Code Review / Monitoring, shown as a `CardPair`), `accentAt` / `liftedAt` /
  `onSlotDown` for "this one can be taken now", "this one is currently lifted" and the grab itself.
  `Pile` renders the discard as a **heap** (`heap`, `heapShow`, `gathered`) and exposes `boxRef`
  for flights to aim at.

  A card in flight sits on its own rung of the layer ladder — `--z-flight`, above the hand and a
  lifted card, below the arrow and the overlays. Every flyer reads it; a step that carries several
  cards at once adds the card's own table layer on top (`calc(var(--z-flight) + n)`), so the order
  they had on the table is the order they land in. A card held by the cursor goes one step higher
  again (`+10`) — what you are holding is above what is flying on its own.

  The pile's counter sits above the whole flight BAND (`+40`, still under the arrow) — above the
  base is not enough, since the per-card offsets land right on top of it — so a card arriving passes under
  the badge instead of covering it and then jumping beneath. That only works while the consumer's
  placement is not a stacking context: **do not centre a pile with a `transform`** — a transform
  would trap the badge inside the wrapper. The scenes and the `Table` screen centre `.discard` with
  a full-height flex column (`inset-block: 0; align-items: center`), pointer-transparent so the
  column does not shadow the hand behind it.
- Two **named steps** — one per kind of movement, not one generic flight engine — and the **carrier**
  underneath them. A step owns its rule and its geometry; the carrier owns the node:
- **`useHandArrival`** — *cards arrive in the hand.* Any number, from any kind of source: a rect, a
  card resting at a tilt, an element already on screen, one half of a pair. The fan opens a gap for
  all of them in the MIDDLE and they tuck under it as they land. A draw and the undo of a play are
  the same movement — that is why this is one step and not two. The shape of the landing is not its
  own: it comes into the fan along `insertPath`, the same rule `Hand` lands a dragged card by, since
  going in between two cards is one situation whatever carried the card there.
- **`useDiscardExit`** — *cards leave the table for the discard.* Any number: one by one but all
  at once. A pair splits into its two singles; one scatter drives both a card's flight and its
  rest; the table tilt unwinds in flight; the layer a card had decides the order it joins the heap.
- **`useFlyer`** — *the carrier.* Not a movement: the fixed node a card rides in, and the five
  invariants that belong to it (I10, I5, I2, I3, I4). Scenes and steps raise cards through it; it
  does not know where they fly.

**Render what you take.** A step handed a RECT raises a flyer of its own, and that flyer lives in
the step's `overlay`. Forget to render it and there is no flight, no error, and a card that simply
appears at the destination.

**Still per-scene, and that is fine:** the orchestration — `playSequence`, `drawOne`, `resolveAi`,
`flyToCenter`, the combo merge. A scene's own sequence of beats is the scene's subject; only the
recurring *movements* are shared.

**What this means for these docs:** the atoms, the self-animating primitives and the three steps
you **import**. Only a scene's own orchestration is **reproduced** from its recipe. Where a
movement has a step, the recipe says *which step and what to pass it* — the frame-by-frame
mechanics live inside the step, in one place, and are not restated per scene.

**Where they live:** all three steps are in `apps/ui/src/animations/`, imported as
`@release/ui/animations` — its own entry point, separate from the components, because a step is
how a thing moves rather than a thing to render. They are **not** on the component barrel:
`import { useHandArrival } from '@release/ui'` does not resolve, and that is deliberate rather
than an oversight.

> **Решено (было открытым вопросом).** Как готовить переиспользуемую машинерию анимаций.
> Рассматривались два кандидата — перенести шаг вставки в руку в `@/ui` и спроектировать общий
> `useFlight` / `<Flyer>`. Взят **третий путь: именованные шаги по смыслу движения**, а не один
> универсальный полётный примитив. Причина: у каждого движения своё правило (куда целиться, какой
> разброс, в каком порядке ложиться, что делать с парой), и универсальный флаер это правило не
> удержит — он удержит только транспорт. Мульти-флаер при этом покрыт: шаг сам поднимает столько
> карт, сколько ему дали, и умеет лететь уже существующим элементом.
>
> Практика показала, зачем это нужно: пока правило ухода в сброс лежало копиями в трёх сценах,
> копии разъехались — вторая карта пары получала случайный разброс в момент коммита и телепортом
> прыгала из точки приземления.

---

## No reinterpretation — reproduce exactly (hard rule)

The playground animations are already debugged and verified on screen. When you use or document
a module: **reproduce it exactly as implemented — no interpretation, no "functionally
equivalent" substitution, no per-place analog.** Use the real preset/module, with its real
params and its real order.

- Docs **transcribe what the code actually does** — numbers, order, names — verbatim, not a
  cleaner-looking alternative.
- "Functionally the same" is an assumption, not a verified fact; a plausible-equivalent can
  silently break timing or rendering.
- Any change to an animation must be **verified live in the playground** and judged by the
  on-screen result before it is considered correct. Never swap blindly.

---

## Mental model (30 seconds)

- A **game event** (card played, drawn, combo resolved) triggers an **animation** by calling
  one function: `play('presetName', el, params)`.
- `play` looks the name up in a **registry** (`PRESETS`, in `apps/ui/src/animations/presets.ts`)
  and runs it. The executor today is the native **Web Animations API (WAAPI)** — it is a
  swappable implementation detail; call sites use names, not the engine.
- Presets are **atoms**. Real moments are **scenarios/recipes** — short ordered sequences of
  atoms plus DOM measurement and timing glue.
- `play(...)` returns an `Animation | null`. Sequence steps with `await anim.finished`.

Minimal shape of any "fly A → B" step:

```ts
const from = sourceEl.getBoundingClientRect()      // measure BEFORE mutating the DOM
const to = targetEl.getBoundingClientRect()
setFlyer(card)                                     // mount the moving element
await nextFrames()                                 // let it paint (two rAFs)
flyerEl.style.left = `${from.left}px`              // position the flyer at the source
flyerEl.style.top = `${from.top}px`
flyerEl.style.width = `${from.width}px`
const anim = play('playToCenter', flyerEl, { from, to })
if (anim) await anim.finished                      // wait for the flight
```

### Vocabulary

- **preset** — a named animation in the registry, called via `play('name', el, params)`.
- **flyer / staging element** — a single `position: fixed/absolute` node that carries the
  moving card during a flight; it is positioned by inline `left/top/width` and animated.
- **rect** — a `DOMRect` from `getBoundingClientRect()`; the geometry the travel presets use.
- **atom** — a preset/helper/toolkit module (one responsibility).
- **scenario / recipe** — a game moment assembled from atoms (see `recipes.md`).

---

## Global invariants

These hold across **every** recipe. Recipes reference them by number (I1…I10) instead of
repeating them. Break one and the animation "works on paper" but jumps, double-flips, or
teleports on screen. I1–I10 are mechanical; **I11** is the one rule of meaning among them —
what the tilt of a card on the table says about who put it there.

- **I1 — Measure rects before mutating the DOM.** Capture `getBoundingClientRect()` for
  `from`/`to` before you mount or move anything. When many elements fly to one target,
  measure the **target once**; only the sources differ.
- **I2 — `nextFrames()` before starting a flight.** Wait two `requestAnimationFrame`s so a
  just-mounted node has painted; starting on the same frame makes it jump from the origin.
- **I3 — Cancel leftover animations before repositioning.** WAAPI `fill: 'forwards'` keeps
  the final transform on the element. Before you set new inline styles / start a new flight,
  cancel the old ones (`for (const a of el.getAnimations()) a.cancel()`; use
  `{ subtree: true }` for a container with nested cards) — or the residual transform
  overwrites yours → chaos.
- **I4 — Pin the flyer after landing (identity).** After a flight, set the flyer's inline
  `left/top/width` to the landing rect and clear its transform, so the **next** flight starts
  from where it visually is, not from the old origin.
- **I5 — `key={seq}` on the flyer.** Bump a per-flight counter and key the flyer node by it,
  so React does not reuse the same `Card` element across flights. Reuse + a `faceDown` change
  spins a spurious flip mid-flight.
- **I6 — Aim at the card area, not the cell center.** A `Pile` renders a label under the card,
  so the cell rect is taller than the card. Target the upper card box:
  `{ left, top, width, height: width * CARD_RATIO }` (`CARD_RATIO = 1.4`, the card's height/width).
  Otherwise the landing drifts down and the card teleports when the real pile appears. Use the
  shared helpers `cardAreaOf` / `cardBoxIn` (reference); `CARD_RATIO` is in the glossary.
- **I7 — Precompute variance and pass it in.** For scatter/rotation (`jitter()`), compute it
  **once** and pass `rotate/dx/dy` into the preset, so the card lands in its final pose with
  no post-animation jump. Store the same values with the resulting entry.
- **I8 — Pass data as arguments, not from state, inside an async sequence.** A long sequence
  reads stale state after `await`; pass the cards/rects it needs as function args (avoids the
  stale-closure bug on click).
- **I9 — A card's layer is a value it carries, never DOM order.** Whenever more than one card
  overlaps — resting in a stack, travelling, or landing — its stacking position must be an
  explicit `zIndex` derived from its place in that stack, and the **same order** must drive the
  array it is appended to at the destination. Two flyers left on the same `z` fall back to
  document order, which is the order of the array you happened to build — so the card that lay
  underneath paints on top and the stack silently turns over mid-flight. The existing pieces all
  follow this: the discard heap layers by its own index (`zIndex: i`), and a card entering the fan
  takes the target slot's `z` **during** the flight, so it tucks in at the right depth instead of
  riding over it. When a stack lands in the heap, append **bottom-up**: the lowest card has to
  arrive first, or the heap inverts it.

  *When* it takes that `z` is its own decision, and it is not "as early as possible". The switch is
  indivisible — a card is above another card or it is not — so it hands over the whole strip where
  the two overlap in one frame. Made on a card that is standing still, that strip (`CARD_W` minus
  the fan's step: 58px at eight cards, 96px at twenty) simply changes owner, and the eye reads a
  jump. Both places therefore switch **while the card moves and where the strip is smallest**:
  `useHandArrival` holds the travel layer for `START_HIGH_MS` of its flight, and `Hand.settleInto`
  waits for the apex of the sweep `insertPath` takes it round on (`SWITCH_AT`).
- **I10 — A flyer carries the coordinates it mounts at.** A `position: fixed` node with no
  `left`/`top` paints at its **flow** position — the bottom of the page — for every frame that
  passes before the code gives it one. Setting them imperatively after `nextFrames()` *is* that
  gap, and it reads as a flash in a corner of the screen. Put the source rect into the flyer's
  state and render it inline (`style={{ left, top, inlineSize }}`); `nextFrames()` then only does
  its own job (**I2** — paint at the source before moving). The flash is timing-dependent, so it
  looks intermittent: usually the browser swallows those frames, sometimes it does not. Four
  flyers in the playground carried this bug, each found by eye rather than by the code.
  What the invariant forbids is a **passive** effect, not imperative placement as such: the hand's
  drag flyer follows the cursor and has no rect to render until the pointer moves, so it is placed
  in a **layout** effect instead — before the frame it mounted in is painted. Either way the rule
  is the same one: nothing may paint the node before it has coordinates.

> **I11 — Who put the card there decides whether it lies straight.** The table is a table, and a
> card on it reads as one somebody has just laid down. So: what the **system** deals into the
> centre — a draw, a revealed trigger, an AI card off the events deck — lands **square**, exactly
> as a dealer's card would; what came out of a **player's hand** — an attack thrown at a release,
> the defence covering it, a sudo laid beside it — lands **tilted**, at its own angle. The tilt is
> not decoration and not per-scene taste: it is the one thing that says a hand was involved.
>
> **The tilt marks a card that has been PLAYED — thrown into the moment.** Not every card that came
> out of a hand: a Release standing at the centre while its price is being paid has not been played
> yet, it is waiting, and it stands square. It stays square when it lands in its zone, because a
> release in a zone is the table's state rather than a move being made — the Code Review tucked
> under it is the one that sits at an angle (`PAIR_AUX`). So the pairs are: an attack, the defence
> covering it, a sudo waiting beside them — tilted; a release standing unpaid, a release in its
> zone, anything the system dealt — square.
>
> A pose is carried BY the flight (`landInPose`, or `rotate` on a travel preset), never applied
> after it lands. A card that stops square and tilts a frame later reads as a click, and that is a
> different event on screen from the one that happened. Rules owner's call, written down here
> because it is a rule about every scene rather than about one movement.

---

## Gating the hand while something plays out

Three approaches are in use, and that is deliberate — they are **not** variants of one thing to
be unified. Each blocks a different amount, so pick by what the scene actually needs to protect.

### 1. Drop the intent props — the hand stays readable

```tsx
onPlay={busy ? undefined : handPlay}
onReorder={busy ? undefined : reorder}
```

`Hand` turns drag mode on only when `onPlay ?? onReorder` is supplied, so dropping both switches
the whole gesture off. **Hover, the card lift and the zoom preview keep working** — the player can
still read their hand, they just cannot pull a card out of it.

Use when the scene is playing out one action and a second one would collide with it, but the hand
must remain legible. No visual change is added on purpose: the gate lasts about as long as a
flight, and a state that appears and disappears in half a second reads as flicker.

*Live reference:* `Error503Story` (`busy`).

### 2. Kill pointer events on the wrapper — the hand goes inert

```tsx
<div className={styles.handWrap} style={{ pointerEvents: busy ? 'none' : undefined }}>
```

Everything stops: hover, lift, zoom preview, grab. The fan becomes a picture.

Use when something is **open above the fan** — a selection row, a reveal — and the hand's own
zoom preview (which rises out of the top of the fan) would fight it for the same space. Note that
this is really a property of the overlay, not of the hand: the trigger to reach for it is
"an overlay owns this area now", not "an animation is running".

*Live reference:* `AiCardsStory` (the Inside pick row; `busy && !handPickMode`).

### 3. No gate at all — the hand is never blocked

Nothing is dropped and nothing is disabled; several flights run in parallel and the next card can
be pulled out while the previous one is still travelling.

Use when discarding/playing **is** the interaction and the player's tempo is not linear — they
think, then dump several cards quickly. Any gate here reads as lag, not as safety.

*Live reference:* `HandLimitStory` (discarding down to the hand limit).

### What none of them do, and what is a different thing entirely

- **None of the three aborts a drag already in progress.** The drag lifecycle lives in a `useEffect`
  keyed on the drag state and its handlers are captured in that closure, so a card already picked up
  finishes its release normally. All three mean "do not start a new action", never "cancel the
  current one". A real interrupt does not exist anywhere yet.
- **`disabled` is not a gate.** `stateAt` → `'disabled'` means *this card cannot be played by the
  rules* (Error 503: only the Debugger answers, the rest grey out). It is a durable, meaningful
  state the player must read. Do not use it to mark "an animation is running".

---

## Notes for reproduction

- Numbers (durations, holds, offsets) and preset choices in the recipes are **verbatim from
  the tuned code** — do not round or "simplify" them.
- Each recipe ends with a **Live reference** (a playground story). That story is the visual
  source of truth: if a reproduction looks different, the recipe is being read wrong, not the
  showcase.
- Recipes are written as **independent actions** with an explicit trigger, guard, and cleanup,
  so they can be called at the right game moment and replay stably on repeat.
