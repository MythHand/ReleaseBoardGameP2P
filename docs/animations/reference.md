# Reference — presets, helpers & toolkit modules

The callable API of the animation system: **what you can call and how** — each entry with its
signature, params and defaults. The *values* those params take (easing tokens, ratios, tuning
constants, holds) live in [`glossary.md`](./glossary.md); the game-situation sequences that combine
these modules live in [`recipes.md`](./recipes.md).

Signatures are transcribed from code (paths per section). If a signature here disagrees with the
code, the code wins — fix this file.

---

## Presets

`PRESETS` in `apps/ui/src/animations/presets.ts`. Call by name: `play('name', el, params)`.
Durations in ms; `EASE` / `SNAP` are defined in the glossary; the param words (`from`, `to`,
`rotate`, `dx`, `dy`, `fade`, `dur`, …) are in the glossary too. **Watch the duration word:** the
travel presets take `duration`, the slot/HUD ones take `dur` — passing the wrong one is silent, the
preset simply keeps its default.

Fill: `forwards` everywhere except `shake` (none — it returns to the origin by itself) and
`rollIn` / `hudIn` (**`both`**, so a `delay` holds the element invisible until its turn instead of
letting it flash in place first).

| Preset | Duration | Easing | Fade | Params | Purpose |
|---|---|---|---|---|---|
| `flipCard` | 420 | EASE | — | `{ faceDown }` | flip face ↔ back (used by `Card` itself) |
| `flyFrom` | `duration` ?? **520** | EASE | — | `{ from, duration }` | FLIP: element already in place, animate *from* its old rect |
| `playToCenter` | 480 | EASE | — | `{ from, to, rotate?, dx?, dy? }` | play a non-release card to the table center |
| `playToReleaseZone` | 480 | **SNAP** | — | `{ from, to, … }` | play a release into its zone slot (snap) |
| `centerToDiscard` | 420 | EASE | — | `{ from, to, rotate, dx, dy }` | move a played card center → discard |
| `gatherToDeck` | `duration` ?? **520** | EASE | — | `{ from, to, duration? }` | a pile flies to a target deck and lands |
| `absorbToDeck` | `duration` ?? **520** | EASE | **yes** | `{ from, to, duration? }` | a deck flies into another and dissolves (merge) |
| `drawToCenter` | `duration` ?? **480** | EASE | — | `{ from, to, duration? }` | a card leaves the draw deck to the center |
| `dealToSeat` | `duration` ?? **460** | EASE | **yes** | `{ from, to, duration? }` | a card goes center → a player seat and dissolves |
| `returnToDeck` | `duration` ?? **480** | EASE | — | `{ from, to, duration? }` | a card returns center → deck (pair of `drawToCenter`) |
| `foldIntoPair` | `dur` ?? **620** | EASE, **SNAP** with `snap` | — | `{ from, box, pose?, dur?, snap? }` | one HALF of a pair travels into its pose inside the pair. Called once per half; the pair itself does not move |
| `rollOut` | `dur` ?? **220** | EASE | — | `{ dur? }` | a slot's content fades out — first half of a swap. No movement: the slot is fixed |
| `rollIn` | `dur` ?? **300** | EASE | — | `{ dur?, delay? }` | the new content fades in — second half. `delay` waits out the outgoing one |
| `popIn` | 260 | **SNAP** | — | — | a small element appears in a reserved slot (fade + scale), neighbours do not shift |
| `popOut` | 200 | EASE | — | — | …and the same element leaves |
| `hudIn` | `dur` ?? **340** | EASE | — | `{ dx?, dy?, dur?, delay? }` | a HUD block arrives at its place: a short shift + a fade. `dx`/`dy` is WHERE FROM (`0/0` = a plain fade) |
| `confettiFly` | `dur` ?? **2200** | per-keyframe (`ease-out` → `ease-in`) | **yes** (last frame) | `{ dx?, dy?, peak?, spin?, dur? }` | ONE popper piece: the throw, the arc over `peak`, the fall with `spin`. The count, the symbols and the spread belong to the scene |
| `shake` | `dur` ?? **380** | EASE | — | `{ amp?, dur?, shape? }` | left–right shake ("this will not do"), returns to the origin. `amp` — the swing, `shape` — the character (`SHAKE_SHAPES`) |

> A preset with no row here fails `apps/ui/src/animations/docs.test.ts` — the table is checked
> against `presetNames()`, because a preset missing from these docs does not exist for whoever
> reads them instead of the code.

---

## Travel and timing helpers

`apps/ui/src/animations/`.

| Name | File | Signature | What it does |
|---|---|---|---|
| `move` **(internal)** | `presets.ts` | `move(el, { from, to, rotate=0, dx=0, dy=0, fade=false }, duration=460, easing=EASE)` | the travel base under every "flight" preset: translate-by-centers + scale-by-width + rotate/dx/dy (+ optional fade). **Not exported** — listed so the presets are readable, not so you can call it: a flight goes through a named preset, never through the base. Its `duration=460` default is never hit — every preset passes an explicit duration. |
| `enterPose` | `presets.ts` | `enterPose(from, box)` → `string` | the transform that makes an element sitting in `box` LOOK like it sits in `from` (offset by centers + scale by width). The entry pose of a FLIP flight: paint the first frame with it before starting, or the element flashes in its final place. `foldIntoPair` uses the same call inside. |
| `durationOf` **(internal)** | `presets.ts` | `durationOf(p, fallback=520)` | reads `p.duration`, else the fallback. The `520` default is the fallback for the variable-time presets. Not exported either. |
| `SHAKE_SHAPES` | `presets.ts` | `{ settle, spring }` → `number[]` | the CHARACTER of a shake as fractions of the swing per frame — `settle` (a jolt and a calm-down) and `spring` (two full swings, then two smaller). Fractions, not px, so a character reads the same at any `amp`. `ShakeShape` is the key type. |
| `play` | `play.ts` | `play(name, el, params={})` → `Animation \| null` | registry dispatch; warns on unknown name; no-op without `el`/WAAPI |
| `presetNames` | `play.ts` | `presetNames()` → `string[]` | the registry keys |
| `wait` | `timing.ts` | `wait(ms)` → `Promise` | `setTimeout` promise — holds a beat between phases |
| `nextFrames` | `timing.ts` | `nextFrames()` → `Promise` | double `requestAnimationFrame` — let a new node paint before a flight |

`jitter` belongs to the discard-scatter model and is catalogued with it below, next to `scatterAt`
— the two are a pair of choices (one-off vs. deterministic), not two unrelated helpers.

---

## Arrow toolkit

`apps/ui/src/primitives/Arrow/`.

| Name | Signature | What it does |
|---|---|---|
| `Arrow` | `<Arrow from={Point} to={Point} color? />` | quadratic-Bézier aiming arrow in viewport coords |
| `centerOf` | `centerOf(el)` → `Point` | element center in viewport coords (`clientX/Y`) |
| `useArrow` | `useArrow()` → `{ from, to, active, aim, stop }` | holds arrow endpoints, tracks the cursor while active; `aim(origin, at?)` starts, `stop()` ends |
| `Point` | `{ x, y }` | viewport point (the arrow's coordinate shape) |

---

## Card geometry helpers

`apps/ui/src/primitives/Card/geometry.ts`. Build a card-sized target rect to aim a flight at the
card (not at a wider cell/seat) — invariant **I6**. The `CARD_RATIO` value is in the glossary.

| Name | Signature | What it does |
|---|---|---|
| `cardAreaOf` | `cardAreaOf(cell)` → `Rect` | trim a Pile cell to its **top** card box (keep left/top/width, height = width·`CARD_RATIO`) |
| `cardBoxIn` | `cardBoxIn(rect, width)` → `Rect` | a card box of `width`, **centered** in `rect` (e.g. a Seat). Pass a width measured from the real card element where possible. |

---

## The movement steps, and the carrier under them

One step per **kind of movement**, not one generic flight engine. Each owns its rule and its
geometry; under all of them sits one carrier that owns the node. A scene calls a step and passes
what it has. Tuning constants are in the glossary.

**Where they live.** `useHandArrival` and `useFlyer` are in `apps/ui/src/animations/`, imported as
`@release/ui/animations` — the animation layer is its own entry point, separate from the components,
because it is how a thing moves rather than a thing to render. They were moved there when the real
board needed them too: each had been copied, the playground's scene and the frontend each holding
one, and nothing kept the copies in step — which is the case the Animations Rule names.
`useDiscardExit` followed them there in #96. It never had the one consumer this file claimed: ten
playground scenes imported it out of the story folder, which is what "a movement found in two
places is a module" describes, ten times over. All three steps now live in
`apps/ui/src/animations/` and are imported from `@release/ui/animations`.

**Render what you take.** A step that is handed a RECT raises a flyer of its own, and that flyer
lives in the step's `overlay`. A scene that forgets to render it gets no flight, no error and a card
that simply appears at the destination. `useDiscardExit` says so in the console now; the rule is:
destructure `overlay` and render it.

### Hand-arrival — cards arrive in the hand

| Name | Signature | What it does |
|---|---|---|
| `useHandArrival` | `useHandArrival(handRef, onLanded)` → `{ overlay, gapAt, gapSize, arrive, reset, busy, FLIGHT_MS }` | `arrive(items, handLength, at?)` opens a gap for **any number** of cards and flies them all in along `insertPath`, riding over the fan and tucking under it partway. `onLanded(gap, landed)` fires on landing and hands back what arrived — the scene splices its own items at that index |
| `at?` | `number` | **which slot the gap opens at.** Without it, the MIDDLE of the fan — that is where a card ARRIVES: a draw comes off the deck with no place of its own, so the middle is the honest answer and a draw and the undo of a play read as the same event. Pass it only when the player POINTED at a place: dragging a card back off the table into the fan is a placement, not an arrival, and the middle would ignore what the hand just said |
| `Arriving` | `{ key, card, faceDown?, from? \| el?, rot?, anchor? }` | `key` — the card's identity in the scene's hand (its uid), handed back on landing. `faceDown` — which side is up on the way in: a dealt card travels closed and is turned over only once the whole hand is in (Game Deal), a drawn or returned card is already known to its owner and flies open (the default). `from` — where it stands; `rot` — the tilt it rests at (the pivot difference is compensated, so the first frame does not jump); `el` — it IS an element on screen: the step measures it and takes it off screen for the flight; `el` + `anchor: 'main' \| 'aux'` — one half of a pair |

### Discard-exit — cards leave the table for the discard

| Name | Signature | What it does |
|---|---|---|
| `useDiscardExit` | `useDiscardExit(boxRef, onLanded?)` → `{ overlay, send, reset, FLIGHT_MS }` | `send(items)` flies **any number** of cards out at once and resolves when they land; `onLanded(cards)` gets them bottom-up for the heap. Omit `onLanded` when the scene keeps its own books on the heap |
| `Leaving` | `{ key, card, from? \| node?, aux?, el?, pose?, layer?, scatter?, fade?, delay? }` | `from` — it stands in a slot, the step raises its own flyer; `node` — it IS an element already on screen, that element flies. `aux` + `el` — a pair: split into two singles, the aux measured off `[data-aux]`, its tilt unwound in flight. `layer` — its layer on the table (decides the heap order). `scatter` — bring your own (a card going back to its place). `fade` — it sinks below the visible top. `delay` — a stagger |

### The carrier — a card in the air

Not a movement: the node. It owns the five invariants that belong to a flyer (I10, I5, I2, I3, I4)
so no scene writes them again. It does not know where to fly or which preset.

| Name | Signature | What it does |
|---|---|---|
| `useFlyer` | `useFlyer()` → `{ overlay, raise, pin, glide, patch, drop, elOf }` | `raise(items)` mounts N flyers at their rects, paints them there and returns their elements; `pin(key, rect)` fixes one where it landed; `glide(key, rect, ms)` moves one with a transition; `patch(key, next)` changes what it shows without moving it; `drop(key?)` takes one or all down; `elOf(key)` is the node |
| `Raise` | `{ key, at, card?, faceDown?, content?, pose?, layer? }` | one key is one flyer — raising a live key replaces it. `card` is the common case; `content` is the scene's own element (a pair, a card mid-morph) when the node has to carry more than a card; `pose` is the tilt it rests at; `layer` rides on top of the flight rung (**I9**) |

**I4 is the one a scene may decline.** A flight whose landing pose lives in the filled WAAPI
animation must NOT be pinned — pinning cancels it and the card straightens for a frame. Drop the
node instead, once the resting card has taken over (Defense Release).

---

## The board's layer — anchors and the beat queue

These live in `apps/frontend`, not in `@release/ui`: they are how the *board* wires engine events to
the vocabulary, and the kit has no notion of an engine. Listed here because the vocabulary is
useless without knowing what calls it.

| Name | Signature | What it does |
|---|---|---|
| `BoardAnchors` | `useBoardAnchors()` → the registry | every node a flight aims at or leaves from: the HUD blocks, `deckBox`, `discardBox`, `centre`, `hand`, plus `seatBox(player)` (a card box centred on a seat, **I6**), `handSlotAt(index)` and `releaseSlot(player, slot)`. A DOM registry only — it holds no game state and mirrors none, which is why a hand card is reached by index and not by uid. One identity for the life of the mount |
| `planBeats` | `planBeats(events, before)` → `BeatPlan[]` | a batch of engine events becomes movements, read against the projection still **on screen** (**I1**). An event with no choreography yields nothing and passes through. All `discarded` of one batch go in ONE beat — the step's own rule, "one by one but all at once" |
| `useBeats` | `useBeats({ live, events, anchors, enabled, intro })` → `{ shadow, overlays, exclusive }` | the queue: one beat at a time, the board renders `shadow` while one runs, and `shadow` is dropped on drain so the board can never be stranded behind the projection. The single place `prefers-reduced-motion` is checked |
| `IntroBeat` | `{ key, shadow, run, collapse }` | the opening, handed to the queue as beat zero — the one beat that owns the table (`exclusive`) and the one that publishes its own shadow instead of animating away from a base. `collapse()` is the no-animation path: it exists because the opening must **report** to the host's start gate even when it does not play, or the match never begins |

**The shadow is the projection a beat animates AWAY from**, not the one it produces. By the time the
queue sees a batch, `live` already has the card out of the hand — so the queue keeps the last
projection it actually showed and plans against that, and a batch arriving mid-beat waits its turn
rather than being planned against a state nobody can see.

**One scatter, two readers.** A discard flies on `scatterAt(eventId)` and the heap
(`toBoardState.toDiscardHeap`) rests it on `scatterAt(eventId)` — the same call on the same id, which
is what makes the handover invisible (**I7**) across a boundary neither side can see.

---

## Discard scatter

`apps/ui/src/animations/scatter.ts` — the single source of "how a card lands in and rests in the discard heap".
The flight (`toDiscardParams`) and the rest (`restTransform`) read the **same** `Scatter`, so a card lands
exactly where it lies — no position swap on the last frame (invariant **I7**). The ± ranges are in the glossary.

| Name | Signature | What it does |
|---|---|---|
| `Scatter` | `{ rot, dx, dy }` | one card's heap pose (tilt + offset) |
| `Rect` | `{ left, top, width, height }` | the geometry travel presets take |
| `scatterAt` | `scatterAt(key, width?)` → `Scatter` | **deterministic** scatter by a card key (stable across re-renders and peers) — use for a persistent heap |
| `jitter` | `jitter(width?)` → `Scatter` | a **one-off random** scatter — use for a card just tossed in |
| `restTransform` | `restTransform(s)` → `string` | the CSS `transform` for a card at rest in the heap |
| `toDiscardParams` | `toDiscardParams(from, to, s, fade?)` → `MoveParams` | params for `play('centerToDiscard', …)` that land the card exactly on `restTransform(s)` |
| `HEAP_SHOW` | `6` | how many top cards render; the rest are hidden/faded |

---

## Hand — the interactive fan

`apps/ui/src/table/Hand/Hand.tsx`. A **self-animating** component: it owns hover (lift + neighbour spread + a
separate zoom preview), the pick-up/drag gesture (drag out → play, drag inside → reorder), the click/drag
threshold, per-card dim, and the settle-back glide. A consumer supplies data and intent callbacks; it does not
drive any of the motion. Legality is the consumer's (engine's) answer — the Hand only reflects it via `stateAt`.

| Prop | Type | What it does |
|---|---|---|
| `items` | `HandItem[]` (`{ uid, card }`) | the fan, in order |
| `faceDown?` | `boolean` | render backs (opponent fan); disables the zoom preview |
| `gapAt?` | `number \| null` | open an insert gap at this slot (paired with `useHandArrival`) — the fan lays out as `n + gapSize` and spreads **before** the card lands |
| `gapSize?` | `number` (default `1`) | how many cards the gap holds. `> 1` when several cards return at once (cancelling a combo assembly), so they land in ready room instead of on top of the neighbours |
| `onCardClick?` | `(index, el, e) => void` | a click (no drag) — coexists with drag via the threshold |
| `accentAt?` | `(index) => string \| undefined` | a glow colour for a slot (arrow target) |
| `stateAt?` | `(index) => HandCardState` | `'idle' \| 'playable' \| 'selected' \| 'disabled'` — mirrors the engine's `playable`/`frozen`; `disabled` dims via the Hand's own transitioned filter |
| `onPlay?` | `(uid, drop: HandPlayDrop) => boolean` | card dragged OUT of the hand; return `true` to accept (played), else it glides back |
| `onReorder?` | `(uid, toIndex) => void` | card dragged WITHIN the hand — local reorder, never networked |
| `carrying?` | `boolean` | **the pointer is already holding a card, outside the hand** — the scene carrying it says so. The hand then answers nothing to the cursor: no lift, no parting neighbours, no zoom preview. A hand reacting to a cursor that already holds a card reads as an offer to take a second one. Opt-in and not inferred, because AIMING is the opposite case: while the combo arrow picks a target, what the cursor is over is exactly the question being asked and the hand must keep answering. To show the carried card WHERE it would go, drive `gapAt` from the pointer — the same insert gap, so the fan parts while the card is still in the air |
| `renderFace?` | `(item, ctx: HandFaceContext) => ReactNode` | override the default flat `Card` face |
| `HandFaceContext` | `{ faceDown, tilt, width, state, accent?, tiltFrom? }` | everything the Hand computed for that slot's face. `tiltFrom` is set only for the card on the drag layer — the deflection it carried in the fan (see `useCardTilt`'s `from`); a custom `renderFace` that drops it loses the straightening and nothing else |
| `HandPlayDrop` | `{ x, y, rect? }` | where a played card was released |

Drag mode turns on when `onPlay` or `onReorder` is supplied. Tuning constants (`HOVER_LIFT`, `NEIGHBOR_PUSH`,
`SETTLE_MS`, `DRAG_THRESHOLD`, `BAND_PAD`, the zoom clamps) are in the glossary.

### Hand geometry — `apps/ui/src/table/Hand/fan.ts`

The single source of fan geometry; `Hand` and `useHandArrival` compute slots from the **same** formula.

| Name | Signature | What it does |
|---|---|---|
| `slotPlacement` | `slotPlacement(slot, total)` → `{ x, y, rotate, z }` | a slot's offset/tilt/z in a fan of `total` cards |
| `handStep` | `handStep(n)` → `number` | horizontal pitch between cards for a hand of `n` (also re-exported from `@/table/Hand`) |
| `insertPath` | `insertPath(from, to, slot, total)` → `Point[]` | the path a card takes INTO the fan: 25 positions evenly spaced along one curve, from where the card is to where the slot is. Both points are the **same reference point** of the card — `Hand` passes its top-left, `useHandArrival` passes the bottom-centre pivot it turns and scales about |
| `CARD_W` | `150` | the canonical hand-card width |

**`insertPath` is the fan's rule for being entered, not a nicety.** A card in the fan is drawn over its
left neighbour and under its right one; a card on the cursor is over all of them. Landing between two
cards therefore means one indivisible switch from "above the right neighbour" to "below" it, and made
where the card stands still it hands over the whole overlap strip (`CARD_W` minus the step — 58px at
eight cards, 96px at twenty) in a single frame. So the card comes round from the **left** and the
switch is made at the middle of that sweep, where the strip is at its smallest and the card is moving.

- **One curve, no waypoint.** A quadratic pulled toward a control point one step out to the left. A
  waypoint would put a corner in the path and the card would stop dead mid-landing; a curve travels
  half way to its control point, so one step of reach bulges half a step — the offset the switch wants.
- **Where on the arc is read off the release height** (level with the slot → up to `40°` above it), so
  releasing high and releasing level take visibly different lines in. Off the height *alone*: a rule
  that also read which side of the slot the pointer was on would swing the whole curve on one pixel
  of travel.
- **The last slot goes straight in** — nobody on its right, nothing to tuck under, reach `0`.
- The caller owns the clock (`Hand` plays the positions over `SETTLE_MS` at `--ease-soft` and switches
  the layer at `SWITCH_AT`) and owns the turn to `slotPlacement(...).rotate` along the way.

---

## Card preview — reading a card that stands on the table

`apps/ui/src/table/CardPreview`. A card at the centre while a 503 comes out of the deck, an AI card
resolves or somebody attacks you: it is on the table to be read, and it is 150px wide. This opens it
large. A **block from the start** — eight scenes hold a card at the centre and the real `Table` will
hold one too, so per scene it would have been the same thing written nine times.

| Name | Signature | What it does |
|---|---|---|
| `useCardPreview` | `useCardPreview()` → `{ slotProps, overlay }` | the whole block: a hook and one node |
| `slotProps` | `slotProps(card, faceDown?)` → props | spread on a slot that holds a **readable** card. Pass `null`/`undefined` or `faceDown` and the slot is inert: a back has nothing to read, and somebody else's closed card has no identity to read even if we wanted one |
| `overlay` | `ReactNode` | render inside the scene |

- **Bound to a SLOT, not to "the card at the centre".** Defense Release has five — the release, its
  cost, the attack, the defender's sudo, the cover — and each reads on its own.
- **One fixed place on the right, never at the cursor.** A place the player learns instead of hunting
  a popup, and one that cannot cover the centre where the game is happening.
- **It opens the instant the pointer is on a card.** Nothing to wait for: the card is already on the
  table and already being looked at. There is deliberately **no fade** — an appearance you wait out
  is an appearance you read late.
- **ONE rule closes it:** the pointer moved somewhere that is neither a readable slot nor the preview
  (a `mousemove` on the window, plus a `closest()` on the two data attributes the block marks them
  with). Two behaviours fall out of that for free, and both are wanted: a card can fly off to the
  discard while it is being read and the reading **stays** until the hand moves (deliberately the
  opposite of the hand's zoom, which must leave WITH its card so it stops covering the table); and
  the pointer may rest **on the preview itself**, without which a preview standing over the discard
  would close the moment the pointer reached it and reopen the moment it did.
- **No hold before showing, and none blocking a neighbour.** Leaving a slot waits `GAP_MS` before
  closing, because slots stand a few px apart and crossing that gap would blink the preview off and
  straight back on. That delay is on the LEAVING only, and it is per pointer position — never a
  blind period, or moving between two cards at the centre would stop answering.

*Live reference:* `Card play`, `AI cards`, `Error 503`, `Defense Release`.

---

## The card face's own motion

Not flights — what a card face does while it sits there. The engine is one, and both card shapes
consume it (see `apps/ui/CLAUDE.md` for how `Card` and `CardParallax` split).

| Name | Signature | What it does |
|---|---|---|
| `useCardTilt` | `useCardTilt({ tilt?, lift?, from? })` → `{ p, hover, transform, tiltRef, … }` | the tilt math in ONE place: pointer → deflection `p` (−0.5…0.5 per axis, which `ComposedFace` shifts each layer by), hover, and the ready `transform`. `tilt` runs the pointer parallax, `lift` the hover lift+scale — `Card` separates them, the previews tie both to `interactive` |
| `from` | `{ x, y }` | the deflection the face **arrives** with, and straightens out of on mount. For a face that continues on a NEW instance — a card torn out of the fan onto the drag layer — which is otherwise born flat, so the straightening the tilt layer transitions through on every mouseleave never happens and the card cuts to flat in one frame. Attach `tiltRef` to the element the transform goes on: the handover needs a style flush between the two values, or the browser only ever sees the flat one |
| `tiltFrom` | prop on `Card` / `CardParallax` | passes `from` through. Both ignore it when the screen-wide parallax is off — on such a screen the card this one continues was flat too |
| `CardMotionProvider` | `<CardMotionProvider value={boolean}>` | **the screen-wide parallax switch.** Wrap a card-bearing subtree; `Card` and `CardParallax` read it. Default `true` — the parallax is the designed behaviour and a card without a provider keeps it |
| `useCardMotion` | `useCardMotion()` → `boolean` | read it (only the two cards need to) |

**Why a context and not a prop.** Turning the parallax off is a decision about a whole screen, not
about one card — a player either wants faces to move or does not — and threading a flag through the
hand, the seats, the piles and the release zone would put a display preference into every one of
their APIs. It travels the way a card face's language does (`cardLang`), which is the precedent.

**It switches the pointer parallax ONLY.** The hover lift stays: that answers "the cursor is on this
card", which is feedback, not decoration. The composed face is not touched at all.

*Live reference:* the `Table` screen's settings drawer.

---

## Self-animating components

Import and use declaratively — the animation is built in.

| Component | Path | Self-animation |
|---|---|---|
| `Card` | `@/primitives/Card` | plays `flipCard` on a `faceDown` change |
| `EdgeGlow` | `@/primitives/EdgeGlow` | `<EdgeGlow visible? intensity? color? className? />` — inward edge veil, CSS opacity fade; `intensity: 'strong' \| 'weak'`. The consumer owns the bounds/layer (container + mount point). |
| `ConfirmAction` | `@/table/ConfirmAction` | `<ConfirmAction open? label disabled? onConfirm? caption? className? />` — the shared "confirm the selection" bar; slides up/down on `open`, pins to the bottom of its positioned container. Used by pick flows (Inside choice, Git cards). |
| `CardCatalog` | `@/table/CardCatalog` | `<CardCatalog cards open selected? chosen? onPick? width? stagger? />` — the set of face-up cards you name one from. Cells appear with a stagger and GROW on hover (they are there to be read, not lifted); `open` means the choice is on, `chosen` holds the named one enlarged while the rest slide away, `selected` is armed-but-not-committed. Confirmation lives outside it (usually `ConfirmAction` — naming a card is irreversible). It fills the area it is given; where that area is belongs to the screen. |
| `CardPair` | `@/primitives/CardPair` | `<CardPair main aux width? />` — the aux card tucks under the main at `PAIR_AUX_POSE`, derived from `PAIR_AUX` (`{ rot, dy }`, both exported). One declaration in two forms, because the readers differ: the component and `foldIntoPair` take the string, `useDiscardExit` takes `.rot` as a number when a pair splits and the aux flies out alone. `[data-main]` / `[data-aux]` are the anchors a fold or a split-out measures. |
| `Pile` | `@/primitives/Pile` | the discard as a tossed **heap**: `heap` (cards with their own `Scatter`), `heapShow`, `gathered` (it turned into a deck), `boxRef` — the card box a flight aims at. Its counter sits above the whole flight band, so an arriving card passes under the badge. **Do not centre a pile with a `transform`** — that traps the badge in the wrapper. |
| `TurnDock` | `@/table/TurnDock` | one fixed frame whose slots never move; the content inside them changes. `Swap` orchestrates `rollOut` → `rollIn` (a live layer in flow + the outgoing one absolutely overlaid), `Reveal` orchestrates `popIn` / `popOut` for a small element in reserved space. |
| `ReleaseZone` | `@/table/ReleaseZone` | `slotRef?(key, el)` exposes each slot's node so a consumer can measure it and fly a card into that slot (AI Release / Monitoring landing). A position hook only — no visual effect. |
| `Arrow` | `@/primitives/Arrow` | see the Arrow toolkit above (`useArrow`) |
