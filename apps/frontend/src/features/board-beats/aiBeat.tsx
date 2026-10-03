import { cardAreaOf, cardBoxIn, cardById } from '@release/ui'
import type { Rect } from '@release/ui/animations'
import { play, scatterAt, useDiscardExit, wait } from '@release/ui/animations'
import { useCallback, useRef } from 'react'
import type { BeatRun, BoardAnchors } from '~/entities/game/board'
import { aiCauseExit, withoutAiCause } from './aiCauseExit'
import { liftOff, type Place, setDown } from './cardPlace'
import { offThePile } from './offThePile'
import type { AiTail, BeatPlan } from './planBeats'
import { SEAT_SHRINK } from './seat'
import { HALLUCINATION_HOLD, TABLE_HOLD, useToCentre } from './toCentre'
import { toEventsDeck } from './toEventsDeck'
import { useToHand } from './toHand'
import { settleInto } from './toHeap'
import { readsAtGlance } from './zoneReading'

// AN AI CARD, from the pile to whatever it turns out to mean.
//
// One scene with six endings, and it is one runner because the opening is one
// opening: a trigger comes off a draw pile and stands at the left as the CAUSE,
// the events deck gives up the card that explains it, and both are held long
// enough to be read. Only then do the endings differ.
//
// What must not be re-derived here is the ending. The plan read it off the
// events the engine actually emitted; a runner that looked at `eventCard` and
// decided for itself what an `ai-crush-frontend` does would be a second opinion
// about the rules, free to drift from the first.

const BEFORE_FLIP = 220 // the card rests where it landed before it turns over
const AFTER_FLIP = 560 // the flip, plus a pause to read it by
// `AiCardsStory`'s own `insideGrab` — how long a card taken from the discard
// stands open at the centre before it leaves. Exported for its own test.
export const SHOW_HOLD = 1500

// One key is one flyer: raising a key that is still up replaces the carrier
// rather than hanging a second node on the same name.
const TRIG = 'trig'
const EFF = 'eff'
const CRUSHED = 'crushed' // the release a crush destroys — its own carrier, its own road
// …and the Code Review tucked under it. `destroySlot`'s spoils are both cards
// (fake/triggers.ts:87), and their roads fork — the release may be an
// events-deck card and go home, the Code Review never is — so each gets its
// own carrier rather than travelling as one pair.
const CRUSHED_AUX = 'crushedAux'

type CrushTail = Extract<AiTail, { kind: 'crush' }>
type ZoneSlot = Extract<Place, { kind: 'zone' }>['slot']

const rectOf = (el: Element | null): Rect | null => {
  if (!el) return null
  const r = el.getBoundingClientRect()
  return { left: r.left, top: r.top, width: r.width, height: r.height }
}

export function useAiBeat(
  anchors: BoardAnchors,
  onHandArrival?: (order: string[], uid: string, at: number) => void,
) {
  const { overlay: flyerOverlay, patch, drop, elOf, raise, toSlot } = useToCentre()
  const exit = useDiscardExit(anchors.discardBox)
  const ctx = useRef<BeatRun | null>(null)

  // The card into the fan, whole — see `toHand`.
  const {
    overlay: handOverlay,
    gapAt,
    gapSize,
    land,
    reset: resetArrival,
  } = useToHand(anchors.hand, onHandArrival)

  const latest = useRef({ anchors, exit, land })
  latest.current = { anchors, exit, land }

  // A card leaves the table for the events deck. It turns face down first — the
  // way every card entering play turns face up first — and then shrinks back
  // into the pile it came from.
  const goHome = useCallback(
    (key: string, from: Rect | null) =>
      toEventsDeck({
        node: elOf(key),
        from,
        deck: latest.current.anchors.eventsBox.current,
        turnFaceDown: () => patch(key, { faceDown: true }),
      }),
    [patch, elOf],
  )

  // WHAT A CRUSH DESTROYED, SHARED BY ITS TWO ENDINGS: a crush that met no
  // answer at the reveal (`run`), and one its owner refused to answer in a
  // later batch (`runRefused`, owner 24.09). The release becomes a flyer
  // exactly where it stands, and the zone lets go of it in the same commit — a
  // card cannot be in a slot and in the air at once (`liftOff`).
  const raiseCrushed = useCallback(
    async (beat: BeatRun, player: string, tail: CrushTail): Promise<Rect | null> => {
      const a = latest.current.anchors
      const card = cardById(tail.card)
      const aux = tail.codeReview ? cardById(tail.codeReview) : null
      const slotEl = a.releaseSlot(player, tail.slot)
      const crushedFrom = rectOf(slotEl)
      // The Code Review is tucked under the release, so the zone renders the
      // slot as a `CardPair` and the aux half has its own tilted node. I6 —
      // a tilted node's bounding rect is the box AROUND it, so trim it back
      // to a card box, exactly as `defenseBeat`'s sacrifice leg measures the
      // same pair.
      const auxEl = aux ? (slotEl?.querySelector<HTMLElement>('[data-aux]') ?? null) : null
      const auxFrom =
        auxEl && crushedFrom ? cardBoxIn(auxEl.getBoundingClientRect(), crushedFrom.width) : null
      const going = [
        ...(card && crushedFrom ? [{ key: CRUSHED, card, at: crushedFrom }] : []),
        ...(aux && (auxFrom ?? crushedFrom)
          ? [{ key: CRUSHED_AUX, card: aux, at: (auxFrom ?? crushedFrom) as Rect }]
          : []),
      ]
      // the carriers go up and the zone lets go before anything is awaited —
      // one commit; the Code Review under it leaves with it
      const raised = going.length > 0 ? raise(going) : null
      liftOff(beat, [{ kind: 'zone', player, slot: tail.slot as ZoneSlot }])
      if (raised) await raised
      return crushedFrom
    },
    [raise],
  )

  // …and the destroyed release takes the road the plan already worked out,
  // with the Code Review that was tucked under it going its own way.
  //
  // NEITHER CARD HAS A `discarded` EVENT TO FLY ON. `destroySlot` called
  // without a reason (fake/triggers.ts — the automatic destruction, and the
  // refusal) emits `releaseDestroyed` and nothing else, so `toDiscardHeap`,
  // which folds one heap card per `discarded`, holds no entry keyed to either.
  //
  // The heap does still rest ONE of them: its `top<count>` stand-in for
  // the discard's top. `tail.rest` is that pose, read at plan time
  // through the shared `standInScatter` off the projection that will
  // render the heap — so the flight and the rest are one value (I7) and
  // the card does not jump on its last frame. It is present only when this
  // release really is what the top will be; a release buried under its own
  // Code Review has nothing, and neither has the Code Review itself. Those
  // two are recorded in `docs/animations/backlog.md` rather than papered
  // over with an invented pose — an omitted scatter takes a fresh
  // `jitter()`, which is at least honestly arbitrary.
  //
  // WHERE IT LANDS HAS IT IN THE COMMIT ITS CARRIER COMES DOWN (`setDown`): the
  // events deck counts it back, or the heap rests it as the stand-in for its
  // top. Dropped with nothing filed, it was nowhere until the live board caught
  // up — or, while the zone still drew it, back in its slot.
  const sendCrushed = useCallback(
    async (beat: BeatRun, tail: CrushTail, crushedFrom: Rect) => {
      const card = cardById(tail.card)
      const aux = tail.codeReview ? cardById(tail.codeReview) : null
      // The Code Review is never an events-deck card, so it always takes the
      // ordinary road even when the release it protected does not — the same
      // split, for the same reason, `defenseBeat`'s sacrifice leg makes.
      const auxOut = aux
        ? latest.current.exit
            // nothing stands: handed over as its own `node`
            .send([{ key: CRUSHED_AUX, card: aux, node: elOf(CRUSHED_AUX) }], null)
            .then(() => drop(CRUSHED_AUX))
        : Promise.resolve()
      const mainOut = (async () => {
        if (!card) return
        // Its road is the plan's answer, not one worked out here: the fact
        // lives on the pre-batch projection (`releaseEvent`), which the
        // runner cannot see and the plan already read (#71 — the class of
        // bug this closes).
        if (tail.destination === 'events') {
          await goHome(CRUSHED, crushedFrom)
          setDown(beat, [{ kind: 'events' }], () => drop(CRUSHED))
          return
        }
        await latest.current.exit.send(
          [
            {
              key: CRUSHED,
              card,
              node: elOf(CRUSHED),
              ...(tail.rest ? { scatter: tail.rest } : {}),
            },
          ],
          // nothing stands: handed over as its own `node`
          null,
        )
        // only the heap's top has a place there; a release buried under its
        // own Code Review has none (docs/animations/backlog.md)
        setDown(
          beat,
          tail.rest && tail.restCount !== undefined
            ? [{ kind: 'heapTop', card: tail.card, count: tail.restCount }]
            : [],
          () => drop(CRUSHED),
        )
      })()
      await Promise.all([mainOut, auxOut])
    },
    [elOf, drop, goHome],
  )

  // THE AI CARD STANDING BEHIND AN ANSWERED PROMPT LEAVES, with the trigger it
  // was drawn by. It has been standing on the projection's own render
  // (`_Board.tsx`'s `aiStanding`, off `pending.source`) since the batch that
  // revealed it — that beat could not fly it home, because it still had to
  // stand and explain the prompt. Shared by every answer this runner plays:
  // Inside's pick (`runTaken`) and a refused Crush (`runRefused`).
  //
  // Written out here rather than shared with `handLimitBeat.tsx`'s or
  // `defenseBeat.tsx`'s own `sendHomeward`: each runner owns its own
  // carrier, and a carrier passed between hooks is how this codebase has
  // already grown two latch bugs of that family (`useBeats.ts`'s own
  // comments).
  const leaveTheStanding = useCallback(
    async (plan: { homeward?: string; causeward?: { card: string; eventId: number } }) => {
      if (!plan.homeward && !plan.causeward) return
      const a = latest.current.anchors
      const causeItems = aiCauseExit(plan.causeward, a)
      // The pending goes first, in its own publish — `defenseBeat`'s own
      // ordering (`runNeutralized`), and the same reason: the shadow still
      // carries the prompt, so `_Board.tsx`'s `aiStanding` is still
      // rendering this very card at `effect` while the carrier below is
      // about to fly away from that same rect.
      const c = ctx.current
      // what the table was drawing goes in the commit the carriers go up —
      // the step's own `takeOff`; with nothing to fly it has to happen anyway
      const letGoOfTheCause = () => {
        if (!c) return
        const next = withoutAiCause(c.base, causeItems.length > 0 ? plan.causeward : undefined)
        c.base = next
        c.publish(next)
      }
      if (causeItems.length === 0) letGoOfTheCause()
      const causeOut =
        causeItems.length > 0
          ? latest.current.exit.send(causeItems, letGoOfTheCause).then(() => {
              // …and it is in the heap as it lands, filed like every other card
              // (`toHeap`) — not the decks as they stood before the flight,
              // which took back whatever else had landed meanwhile: the release
              // a refused crush destroys was gone again the moment it was filed
              // (owner's recording, 03.10)
              if (!c || !plan.causeward || ctx.current !== c) return
              settleInto(c, [plan.causeward])
            })
          : undefined
      const ai = plan.homeward ? cardById(plan.homeward) : null
      const home = rectOf(a.effect.current)
      const deck = rectOf(a.eventsBox.current)
      if (ai && home && deck) {
        // a no-travel raise at the card's own standing spot — the honest
        // answer to "it is here already"
        const [el] = await raise([{ key: 'homeward', at: home, card: ai }])
        if (el) {
          await toEventsDeck({
            node: el,
            from: home,
            deck: a.eventsBox.current,
            turnFaceDown: () => patch('homeward', { faceDown: true }),
          })
          drop('homeward')
        }
      }
      await causeOut
    },
    [raise, patch, drop],
  )

  const run = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'aiEvent' }>, beat: BeatRun) => {
      ctx.current = beat
      const a = latest.current.anchors
      const trigger = cardById(plan.trigger)
      const event = cardById(plan.eventCard)
      const pile = rectOf(a.pileBox(plan.pile))
      const cause = rectOf(a.cause.current)
      const effect = rectOf(a.effect.current)
      const events = rectOf(a.eventsBox.current)
      if (!trigger || !event || !pile || !cause || !effect || !events) return

      // 1. the trigger comes off the pile and stands as the cause — off the
      //    pile's counter as it takes off
      offThePile(beat, plan.pile)
      await toSlot({ key: TRIG, card: trigger, from: cardAreaOf(pile), to: cause })
      await wait(BEFORE_FLIP)
      patch(TRIG, { faceDown: false })
      await wait(AFTER_FLIP)

      // 2. the events deck gives up the card that explains it
      await toSlot({ key: EFF, card: event, from: cardAreaOf(events), to: effect })
      await wait(BEFORE_FLIP)
      patch(EFF, { faceDown: false })
      // an alarm from the moment it is seen, and not before — the 503 mimic, or
      // a prompt that glows on this board (`AiTail.standing.alarm`, `glowsFor`)
      if (plan.tail.kind === 'alarm' || (plan.tail.kind === 'standing' && plan.tail.alarm))
        beat.raiseAlarm?.()
      await wait(AFTER_FLIP)

      // A PROMPT IS LIVE THE MOMENT ITS CARD IS SEEN. The cause and the effect
      // stay on the table until the prompt is answered, so there is nothing for
      // a reading hold to wait on: the table takes both over now, with the
      // prompt they raise, and the answer is open from the frame the card has
      // turned (owner, 03.10 — every AI card that asks, not only Crush). Held
      // first, the hand stood locked and dimmed for the whole hold with the
      // table already glowing. The carriers come down in the same commit the
      // table draws them (`setDown`'s rule): waiting two frames between showed
      // both cards twice.
      // Their exits belong to the batch that answers the prompt, even though
      // the engine banked the trigger when it revealed the effect.
      if (plan.tail.kind === 'standing') {
        const next = {
          ...beat.base,
          pending: beat.after?.pending ?? beat.base.pending,
          aiCause: { card: plan.trigger, eventId: plan.triggerDiscardId },
        }
        beat.base = next
        beat.publish(next)
        drop(TRIG)
        drop(EFF)
        return
      }

      // 3. the table reads them. Hallucination lingers twice as long — the
      //    scene's own doubling, not a judgement made here. This is the ONE
      //    place this runner reads the card's id, and it is not the exception
      //    to "don't re-derive the ending" — it never decides what the effect
      //    DOES, only how long the READING lasts, and `plan.tail` still
      //    exclusively governs the former. `AiCardsStory` (the approved scene)
      //    reads `eventCard` twice for two different questions — once for this
      //    hold, once for its own turn-interrupt flag — because presentation
      //    and mechanic are separate questions there too. If a second AI card
      //    ever needs its own hold, the right fix is a `hold` field on the
      //    plan, not a second id check here.
      await wait(plan.eventCard === 'ai-hallucination' ? HALLUCINATION_HOLD : TABLE_HOLD)

      // The destroyed release becomes a flyer exactly where it stands, and the
      // zone lets go of it in the same commit — `raiseCrushed`.
      const crushedFrom =
        plan.tail.kind === 'crush' ? await raiseCrushed(beat, plan.player, plan.tail) : null

      // 4. the trigger goes to the heap, on the scatter its own event id
      //    produces — one value, two readers (I7), so the heap rests it exactly
      //    where the flight put it.
      const triggerOut =
        plan.triggerDiscardId >= 0
          ? latest.current.exit
              .send(
                [
                  {
                    key: `d${plan.triggerDiscardId}`,
                    card: trigger,
                    node: elOf(TRIG),
                    scatter: scatterAt(plan.triggerDiscardId),
                  },
                ],
                // nothing stands: the trigger is handed over as its own `node`,
                // and the carrier holding it comes down once it has landed
                null,
              )
              .then(() => {
                // …into the heap this beat puts it in itself. The base is the
                // table from BEFORE the reveal, so without this the trigger is
                // nowhere between its carrier coming down and the projection
                // catching up, and blinks out as it lands (toHeap.ts).
                settleInto(beat, [{ eventId: plan.triggerDiscardId, card: plan.trigger }])
                drop(TRIG)
              })
          : Promise.resolve()

      // 5. …and the AI card takes the road its ending gives it.
      const effectOut = (async () => {
        if (plan.tail.kind === 'zone') {
          const zoneSlot = a.releaseSlot(plan.player, plan.tail.slot)
          const target = rectOf(zoneSlot)
          const el = elOf(EFF)
          if (el && target) {
            // …reading the way the zone it is entering reads, from the frame the
            // travel starts — asked of the slot (`zoneReading.ts`), the same
            // answer a played release arriving in a zone gets
            // (`comboBeat.runRelease`).
            if (readsAtGlance(zoneSlot)) patch(EFF, { lod: true })
            const anim = play('playToReleaseZone', el, { to: target })
            if (anim) await anim.finished
          }
          // The slot has the card in the commit its carrier comes down — the
          // module's own landing (`setDown`), AI marks and all — never two frames
          // later, which drew it in the slot and on the carrier at once. The
          // trigger can still be flying, and later beats keep rendering this
          // shadow. Only this placement is published: the batch target may
          // include effects whose own animations have not run yet.
          const slot = plan.tail.slot as ZoneSlot
          const mine = plan.player === beat.base.selfId
          const uid =
            mine && beat.after?.you.releaseEvent?.[slot] === plan.eventCard
              ? beat.after.you.releaseUid?.[slot]
              : undefined
          setDown(
            beat,
            [
              {
                kind: 'zone',
                player: plan.player,
                slot,
                card: plan.eventCard,
                ai: { id: plan.tail.card, event: plan.eventCard },
                ...(uid ? { uid } : {}),
              },
            ],
            () => drop(EFF),
          )
          return
        }
        await goHome(EFF, effect)
        drop(EFF)
      })()

      // …and the destroyed release takes the road the plan already worked out,
      // with the Code Review that was tucked under it going its own way.
      //
      // NEITHER CARD HAS A `discarded` EVENT TO FLY ON. `destroySlot` called
      // without a reason (fake/triggers.ts:88-92 — the automatic destruction)
      // emits `releaseDestroyed` and nothing else, so `toDiscardHeap`, which
      // folds one heap card per `discarded`, holds no entry keyed to either.
      //
      // The heap does still rest ONE of them: its `top<count>` stand-in for
      // the discard's top. `plan.tail.rest` is that pose, read at plan time
      // through the shared `standInScatter` off the projection that will
      // render the heap — so the flight and the rest are one value (I7) and
      // the card does not jump on its last frame. It is present only when this
      // release really is what the top will be; a release buried under its own
      // Code Review has nothing, and neither has the Code Review itself. Those
      // two are recorded in `docs/animations/backlog.md` rather than papered
      // over with an invented pose — an omitted scatter takes a fresh
      // `jitter()`, which is at least honestly arbitrary. What is gone for
      // good is the previous `scatterAt(plan.eventId)`: a place keyed to the
      // DRAW's own event id, under which nothing rests at all.
      const crushedOut =
        plan.tail.kind === 'crush' && crushedFrom
          ? sendCrushed(beat, plan.tail, crushedFrom)
          : Promise.resolve()

      await Promise.all([triggerOut, effectOut, crushedOut])
    },
    [toSlot, patch, drop, elOf, goHome, raiseCrushed, sendCrushed],
  )

  // A RELEASE COMES BACK OUT OF THE DISCARD — `ai-inside`'s own answer,
  // resolved. One path, two audiences: it is shown open at the centre for
  // the whole table (`takenFromDiscard` carries no `visibleTo` — it is
  // public), and only THEN does it split by who it belongs to.
  const runTaken = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'takenFromDiscard' }>, beat: BeatRun) => {
      ctx.current = beat
      const a = latest.current.anchors
      const card = cardById(plan.card)
      const heap = rectOf(a.discardBox.current)
      // `anchors.centre`, NOT `effect`: the `effect` place belongs to the AI
      // card that demanded this pick, and while `pickFromDiscard` is still
      // open that card is standing in it (`_Board.tsx`'s `aiStanding`) — two
      // cards in one rect for the whole of `SHOW_HOLD`. `centre.ts` names the
      // `centre` place for exactly this: what is happening NOW — something the
      // system has put at the centre for the table to read, which is what a
      // release coming back out of the discard is.
      const centre = rectOf(a.centre.current)
      if (!card || !heap || !centre) return
      // out of the heap and up to the centre, face up — `AiCardsStory`'s own
      // `insideGrab`, held for the same `SHOW_HOLD`
      await toSlot({ key: EFF, card, from: cardAreaOf(heap), to: centre, faceDown: false })
      await wait(SHOW_HOLD)
      const from = rectOf(elOf(EFF))
      if (plan.mine && from) {
        drop(EFF)
        await latest.current.land(beat, { card, from, fallbackKey: `ins${plan.eventId}` })
      } else {
        const seat = a.seatBox(plan.player)
        const el = elOf(EFF)
        if (el && seat) {
          const anim = play('dealToSeat', el, { to: seat, scale: SEAT_SHRINK })
          if (anim) await anim.finished
        }
        drop(EFF)
        // The recipient is one card heavier the moment the flight lands on
        // them — `transferBeat.tsx`'s own `bumpRecipient`, the same fact for
        // the same reason: the engine's own snapshot already counts it, and
        // without this the handover to `live` pops their fan by one the
        // instant the queue drains.
        const c = ctx.current
        if (c) {
          const next = {
            ...c.base,
            opponents: c.base.opponents.map((o) =>
              o.id === plan.player ? { ...o, handCount: o.handCount + 1 } : o,
            ),
          }
          c.base = next
          c.publish(next)
        }
      }
      // Inside's own card goes home now that its prompt is answered — its
      // own road, not this exchange's (#106) — see `leaveTheStanding`.
      await leaveTheStanding(plan)
    },
    [toSlot, elOf, drop, leaveTheStanding],
  )

  // A CRUSH ITS OWNER WOULD NOT ANSWER (owner, 24.09): Pass on the prompt, and
  // the release it aimed at is destroyed — the same ending a crush with no
  // answer at all has at its reveal, played in the batch that refuses it. The
  // release rises out of its slot and takes its road; the Crush goes home and
  // its trigger to the heap, as after any answered prompt.
  const runRefused = useCallback(
    async (plan: Extract<BeatPlan, { kind: 'crushRefused' }>, beat: BeatRun) => {
      ctx.current = beat
      const from = await raiseCrushed(beat, plan.player, plan.tail)
      await Promise.all([
        from ? sendCrushed(beat, plan.tail, from) : Promise.resolve(),
        leaveTheStanding(plan),
      ])
    },
    [raiseCrushed, sendCrushed, leaveTheStanding],
  )

  const reset = useCallback(() => {
    drop()
    resetArrival()
    ctx.current = null
  }, [drop, resetArrival])

  return {
    overlay: [...flyerOverlay, ...handOverlay, ...exit.overlay],
    gapAt,
    gapSize,
    run,
    runTaken,
    runRefused,
    reset,
  }
}
