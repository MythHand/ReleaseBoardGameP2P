# The movements a beat used to write out for itself

The inventory the module pass of 22.09 was made from, kept afterwards rather than
deleted: the sections below are what each private copy KNEW, and they are why the
modules that replaced them look the way they do. A module that swallows its
copies without keeping what they knew loses the debugging they came from, and the
loss is invisible until the scene it belonged to is opened again — so the reading
stays, beside the result.

**Read the two sections at the top for what is true today.** Everything from
"1." down is the survey the pass started from, preserved as the record of what
each copy carried.

The stand's own rule ("nothing here is its own", `apps/frontend/debug/README.md`)
is what this list serves: while these copies live, a defect fixed on one page
comes back on the next.

---

## Done — these are shared now

The pass of 22.09 took four of the five movements into modules. Each kept
everything its fullest copy knew; the copies are gone, not weakened.

| Movement | Was | Is |
|---|---|---|
| Putting what landed into the heap | four copies (Rebase, DDoS, the release cost, and the deck's inverse) | `features/board-beats/toHeap.ts` — `withLanded` / `settleInto` / `withoutLanded`, and `supportFirst` for the order a support joins in |
| A card going home to the events deck | five copies across four beats | `features/board-beats/toEventsDeck.ts` — takes the node and one action (the caller's own way to turn ITS card face down), because raising belongs to whoever owns the carrier |
| One exchange, one send | two copies | `features/board-beats/exchange.ts` — layer from position, a missing half passed as `null` |
| The flip's own duration | the number written out in four beats | `FLIP_MS`, exported from the preset that plays the flip |
| A card returning to a hand | the module was there; two calls of it did not name the slot the card left | every return names it now; an arrival with nothing to point at still lands in the middle, which is the right answer for an arrival |

## Left — and why it is not a deduplication

**How small a card is inside a seat** is now one number (`features/board-beats/seat.ts`),
but it is still spelled two ways: a `scale` handed to the travel, and a target
box shrunk before the travel sees it. They are not the same motion — one scales
the card as it lands, the other lands it in a smaller box — so bringing them
together changes what is on screen and belongs to a pass that can be WATCHED,
scene by scene, rather than to a tidy-up. Until then the factor is shared and the
geometry is not.

---

## 1. Putting what landed into the discard heap


**Why it exists at all.** The exit step (`useDiscardExit`) flies the cards and
then takes its carriers down. The heap the beat hands on is the board from
BEFORE the batch, so unless the beat writes the cards in itself, they are
nowhere for the frames between the carrier coming down and the projection
catching up — the card blinks out on landing.

| Where | What that copy knows |
|---|---|
| `operationBeat.tsx` (Rebase, Cherry-pick, Upgrade) | The earliest and most complete one. Writes the cards in **support-first**, because the support lay under the card it paid for and that is the order the projection's own fold keeps — so the handover to `live` moves nothing. Skips a card already in the heap. Also owns the OPPOSITE move: `withoutSpent` takes the operation's own cards back OUT of the heap while they stand at the centre, and `withoutPendingOperation` is that same removal for a pending read off the feed. |
| `comboBeat.tsx` — DDoS | Same shape, built from the plan: the throw first, then what it struck, with a pair's aux ahead of its main. Ordered to match the engine's own bank order. |
| `comboBeat.tsx` — the release cost | The single-card case, added last and the thinnest of the three. |
| `deckBeat.tsx` | The inverse, for the discard becoming a pile: `emptyDiscard` clears heap, top and count in one go, and writes it into the run's own base as well as publishing it — the step behind has to work against the table this one left. |

**What a module would have to carry:** the order cards join the heap in (aux
under main), the "already there" guard, the write into `ctx.base` as well as the
publish, and the removal direction as well as the addition.

**Beats that still did not file what they flew** (found 24.09 on the AI trigger
preset, where every AI card's trigger blinked in the discard):

| Where | State |
|---|---|
| `aiBeat.tsx` — the trigger leaving right after the reveal (Hallucination, Good Vibe-Coding, an AI release, AI Monitoring, a Crush with no answer) | **Files it** through `settleInto` once it lands. The other road — a trigger leaving after its prompt is answered — was already right: the engine banks the trigger at the reveal, so the heap the beat restores holds it. |
| `handLimitBeat.tsx` — the hand limit, and Bad Vibe-Coding's discard | **Files them** through `withLanded` once they land, on top of the cause it puts back. The shadow still leaves the heap alone while they fly. |
| `defenseBeat.tsx`, `discardBeat.tsx`, `drawBeat.tsx`, `upgradeBeat.tsx`, `_useCherryPickStaging.tsx` | Send to the discard without filing. Not yet checked whether each one blinks — the open "Rollback: a single defence blinks in the discard" (#184) is `defenseBeat.tsx` and the same class. |

**A card off its pile's counter as it takes off** — `features/board-beats/offThePile.ts`
(24.09). No beat touched a pile's count: every counter held the card it had
given up until the table had played out. The draw beat (every draw, Good
Vibe-Coding's included) and the AI trigger leaving its pile go through it. The
events deck does not yet: an AI card leaves it and comes back inside one beat,
and the projection counts it home at once, so its counter needs the landing
half as well — five roads home, not done.

---

## 2. A card going home to the events deck

**Why it exists at all.** An AI card never reaches the discard; it goes back to
the deck it came from. That is a travel plus a flip, and the flip belongs to the
card (`Card` plays it on a `faceDown` change), so the caller has no animation
handle and can only wait the clock.

| Where | What that copy knows |
|---|---|
| `aiBeat.tsx` (`goHome`) | The original. Flips face down, waits the flip, then `returnToDeck` into `cardAreaOf(eventsBox)`. Takes a carrier that is ALREADY up — it is a leg of a longer journey, not a flight of its own. |
| `defenseBeat.tsx` (`sacrificedHome`) | Raises its own carrier first, at the cover slot, because nothing is in the air at that point: the sacrificed release is a static render. Same flip, same wait, same travel. |
| `comboBeat.tsx` (a DDoS'd AI card) | The newest. Like `aiBeat`'s: the carrier is up already. |

**What a module would have to carry:** both entry shapes (a carrier already up, and
raise-your-own), and the flip's wait as the card's own duration rather than a
number.

---

## 3. A card going to a seat

**Why it exists at all.** A hand is hidden, so a card entering one dissolves
into the seat rather than arriving somewhere visible — `dealToSeat` is the
travel, but where it aims and what else must change differ per beat.

| Where | What that copy knows |
|---|---|
| `transferBeat.tsx` (four legs) | The most tuned. Aims at `cardBoxIn(seat, CARD_W * SEAT_SHRINK)` — the seat trimmed AND shrunk, the exact box the card sinks into; turns the card face down before it goes; bumps the recipient's own hand count. |
| `upgradeBeat.tsx` | Passes `scale: 0.7` to the travel, and bumps the opponent's `handCount` in `ctx.base` itself. |
| `drawBeat.tsx` | Relies on `seatBox` already being trimmed to a card box (I6) and aims straight at it. |
| `defenseBeat.tsx` (Rollback's return), `comboBeat.tsx` (a DDoS'd release) | The plain form: `dealToSeat` from a rect to `seatBox`, no scale, no count bump. |

**What a module would have to carry:** the target box (trimmed, shrunk, or raw),
the optional scale, the face-down turn, and who bumps the recipient's count.

---

## 4. A card returning to a hand

The module exists (`useHandArrival`) and every beat calls it. What differs is
**how much of it they call**, and the differences are not cosmetic:

- **The slot it lands at.** A cancelled play returns to the slot it left — the
  defence, sudo and pair cancels all name it. An arrival with nothing to point
  at lands in the middle. Two of the release's own returns named nothing until
  22.09 and so landed in the middle.
- **The element vs the rect.** Handed `el`, the step hides the card that is
  already on screen and carries on from that very frame (cherry-pick, the hand
  limit, System Upgrade). Handed `from`, it raises its own carrier — which means
  whatever was standing there must be let go in the SAME commit, or the card is
  drawn twice.
- **The answer.** `arrive` says whether it took the flight, and refuses when
  another is in the air or there is no fan to measure. `_useBoardStaging`'s
  `flyHome` acts on that answer and puts the gesture back by hand when nothing
  will ever land; the callers that `void` it do not.

---

## 5. Letting go of what was standing

Not a movement — the rule every one of the above needs, written out per beat: the
static render and the carrier swap in ONE React commit. It appears as `takeOff`
in the discard exit, as `clearPaidCost` / `takeStagedRelease` / `release()` in the
staging seam, and as a bare `ctx.publish` before an `await` in several beats. A
copy that gets the ORDER wrong shows as a card drawn twice or missing for a
frame, and that is the single most repeated defect on this board.

---

## What this list is for

When the pass happens: take one movement, grow the module to hold **every**
column of its row here, put all its copies on it, and check each copy's own scene
on the stand before the next movement is started. The scenes are named in
`recipes.md`; the reference behaviour is the playground's.
