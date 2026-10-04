import type { Event } from '@release/engine'
import type { CardData, HeapCard, TableActions } from '@release/ui'
import { Card, ConfirmAction, cardAreaOf, cardById, TableSurface, Typography } from '@release/ui'
import {
  exitLayer,
  nextFrames,
  play,
  scatterAt,
  useDiscardExit,
  useFlyer,
  wait,
} from '@release/ui/animations'
import type { ReactNode, RefObject } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { BoardAnchors, BoardState } from '~/entities/game/board'
import type { DiscardPickHandoff } from '~/entities/game/board/types'
import { SEAT_SHRINK } from '~/features/board-beats/seat'
import { useToHand } from '~/features/board-beats/toHand'
import { useReducedMotion } from '~/shared/lib/useReducedMotion'
import styles from './_useCherryPickStaging.module.css'
import { useResolveFeedback } from './_useResolveFeedback'

// The grid owns the local accepted pick; the event queue awaits its flight
// instead of animating a second copy from the discard. The heap is empty
// while its cards are in the grid, matching the playground scene.
const isTrigger = (id: string) => cardById(id)?.category === 'trigger'
const isRelease = (id: string) => cardById(id)?.category === 'release'

// THE TWO PICKS OUT OF THE DISCARD, ONE SURFACE. Git Cherry-pick lays the whole
// discard out; Inside lays out only the releases in it (`discardOptions`, fake/
// discard.ts). Both are one `pickFromDiscard` pending, and Inside used to have a
// row of its own that only imitated this one — no surface over the table, no
// confirm bar beneath, nothing for the other seats to watch (owner, 24.09). It
// is this surface now: the offer is narrower and the prompt is its own, and
// everything else — the deal out of the pile, the confirm, the card flown to
// the hand, the rest flown home, the same pick watched from across the table —
// is the same scene.
const PICK_SOURCES: ReadonlySet<string> = new Set(['operation-git-cherry-pick', 'ai-inside'])

// A card this seat is not entitled to know — the one going on the deck, seen
// from across the table. It carries no face, only the base deck's back, and it
// is always flown face down. `transferBeat.tsx` keeps the same stand-in for the
// same reason; `Card` reads `deck` for the back and nothing else.
const COVER: CardData = {
  id: 'unknown',
  name: '',
  category: 'protection',
  deck: 'base',
  art: '',
  tags: [],
  qty: 0,
}

// timings — the legs this surface times itself (hand-reveal, deck, the return);
// the deal out of the pile is `landInPose`'s own
const STAGGER_CAP = 40 // don't stagger past this many cards
const REVEAL_W = 220 // width the chosen card reaches in the centre
const REVEAL_DUR = 460 // fly-to-centre duration
const REVEAL_HOLD = 560 // pause in the centre before dropping into the hand
const FLIP_DUR = 420 // = the flipCard preset duration (flip before the deck flight)
const DECK_HOLD = 360 // deck card holds face-down before it merges
const RETURN_STEP = 14 // per-card stagger, returning to the pile

// THE LAYER A PINNED CELL RIDES. Pinned cells stack inside the surface and
// compare only with one another. Each one going home rides the rung of the spot
// it lands in — the exit step's own ladder (`exitLayer`, I9) — so the cards lie
// in the pile's order the moment they land, and the pile taking over draws
// nothing new. They all used to ride one layer and lay in the GRID's order,
// and the pile re-laid them as the grid closed (owner's recording, 04.10).
// What goes anywhere else rides over all of them: the deck card, and over it
// the card that is taken.
const PIN_Z = 100
const homeZ = (depth: number) => PIN_Z + exitLayer(depth)

export function useCherryPickStaging(args: {
  handoff: RefObject<DiscardPickHandoff | null>
  state: BoardState
  events?: Event[]
  anchors: BoardAnchors
  actions?: TableActions
  onHandArrival: (order: string[], uid: string, at: number) => void
  copy: {
    prompt: string
    /** Inside's own caption — the offer is the releases, not the whole discard */
    insidePrompt: string
    sudoPrompt: string
    toHand: string
    toDeck: string
    noHand: string
    confirm: string
  }
  enabled: boolean
  /** a pick another seat is offering but has not confirmed */
  pickPreview?: { player: string; card: string | null } | null
  /** this seat's own offer, on its way to the others */
  onPickPreview?: (card: string | null) => void
}): {
  grid: ReactNode | null
  overlay: ReactNode[]
  gapAt: number | null
  gapSize: number
  /** what of the discard is out in the grid while it stands — the heap's own
   *  entries the grid's cards are, and how many cards that is. The pile shows
   *  the rest */
  lifted: { uids: ReadonlySet<string>; count: number } | null
} {
  const { state, anchors, actions, copy, enabled } = args
  const reduced = useReducedMotion()
  const pending = state.pending
  const ours =
    enabled &&
    pending?.kind === 'pickFromDiscard' &&
    PICK_SOURCES.has(pending.source ?? '') &&
    pending.player === state.selfId
      ? pending
      : null

  // THE SAME PICK, SEEN FROM ACROSS THE TABLE. The discard is open (rules,
  // `docs/rules/cards.md`: «сброс открыт, но листать его просто так нельзя»),
  // and Cherry-pick is the exception that lays the whole of it out — so the
  // surface is public and everyone reads it. Only the ANSWERING is not: this
  // seat has no choice to make and no way to make one.
  //
  // Its cards come from this seat's OWN heap, not from the pending: the engine
  // redacts `options` for everyone but the actor (`fake/attacks.ts`), and it
  // does not need to send them — every peer folds the same discard out of its
  // own visible feed (`toBoardState.ts`).
  const theirs =
    enabled &&
    pending?.kind === 'pickFromDiscard' &&
    PICK_SOURCES.has(pending.source ?? '') &&
    pending.player !== state.selfId
      ? pending
      : null
  // Inside offers the releases alone, so a watching seat lays out only those —
  // the same narrowing the engine applies to the actor's own options.
  const releasesOnly = (ours ?? theirs)?.source === 'ai-inside'
  const watched = useMemo(
    () =>
      theirs
        ? (state.decks.discardHeap ?? []).flatMap((c) =>
            c.uid && (!releasesOnly || isRelease(c.card.id)) ? [{ uid: c.uid, id: c.card.id }] : [],
          )
        : [],
    [theirs, releasesOnly, state.decks.discardHeap],
  )

  const [picks, setPicks] = useState<string[]>([])
  const [confirmed, setConfirmed] = useState(false)
  // true from confirm through the last flight landing — keeps the cells (now
  // pinned/animating) mounted even once `confirmed` (or the pending itself)
  // has already gone, the same way `_useHandLimit`'s `handed` outlives its own
  // dispatch.
  const [flying, setFlying] = useState(false)
  const [dealing, setDealing] = useState(false)
  const [flipped, setFlipped] = useState<Set<string>>(new Set())

  const cellRefs = useRef<Map<string, HTMLButtonElement>>(new Map())
  // The last offer this hook actually saw — read during render (the same
  // carry-forward `_Board.tsx`'s own `lastAsk` ref uses) so the flight can
  // keep rendering the grid from ITS OWN snapshot once `ours` goes null
  // (the pending clears the instant the engine answers the RESOLVE, which can
  // easily outrun the flight it is honest about still being mid-air).
  const optionsRef = useRef<{ uid: string; id: string }[]>([])
  const sudoRef = useRef(false)
  const insideRef = useRef(false)
  if (ours) {
    optionsRef.current = ours.options
    sudoRef.current = ours.picks === 2
    insideRef.current = releasesOnly
  } else if (theirs) {
    // the same carry-forward, for the seat that only watches: the pending goes
    // the instant the engine answers, and the cards are still in the air
    optionsRef.current = watched
    sudoRef.current = theirs.picks === 2
    insideRef.current = releasesOnly
  }
  const inside = ours || theirs ? releasesOnly : insideRef.current
  const options = ours ? ours.options : theirs ? watched : optionsRef.current
  const sudo = ours ? ours.picks === 2 : theirs ? theirs.picks === 2 : sudoRef.current
  // ONE OFFER FOR BOTH SEATS — the actor's own, or the same pick seen from
  // across the table carrying the cards this seat folded for itself. Everything
  // that is true of the surface rather than of the answer (it is up, it deals
  // itself out of the pile, it lays these cards in these places) reads this;
  // only what ANSWERS reads `ours`.
  const offer = ours ?? (theirs ? { ...theirs, options: watched } : null)

  // One dealt-in per episode, not per render: the pending's own identity can
  // change across re-renders (a projection tick) without the offer itself
  // changing, and re-running the deal would fly the same cards a second time.
  const dealtKey = useRef<string | null>(null)
  // which deal is the live one — a deal that a newer one has replaced does not
  // get to end it
  const dealRun = useRef(0)
  // The offer this hook has already answered and flown. The queue keeps
  // drawing the projection its NEXT beat moves away from — the one where this
  // pending is still open — for as long as the operation card's own exit runs,
  // so without this the whole picker comes back over the centre for a second,
  // reading as "pick again", and the card underneath it looks like it jumps
  // before it leaves. Cleared when the offer itself goes (below) and when a
  // RESOLVE is refused, because then the choice really is open again.
  const answeredKey = useRef<string | null>(null)

  const [manualRetry, setManualRetry] = useState(false)
  const exit = useDiscardExit(anchors.discardBox)
  // The one carrier this surface raises itself: the card that goes on the deck
  // as WATCHED — face down, out from under the pile, belonging to nobody's cell.
  const deckFlyer = useFlyer()
  // The card into the fan, whole — the shared movement owns the uid it will be
  // known by, the middle of the fan, the committed slot and the run's own base
  // (`toHand`). This surface used to carry all four itself.
  const arrival = useToHand(anchors.hand, args.onHandArrival)

  const resolve = useResolveFeedback(args.events ?? [], state.selfId, actions, () => {
    args.handoff.current = null
    // refused: this offer is open again, whatever we flew for it
    answeredKey.current = null
    setManualRetry(true)
    if (ours?.options.length === 1) setPicks([ours.options[0].uid])
    setConfirmed(false)
    setFlying(false)
    setFlipped(new Set())
    for (const el of cellRefs.current.values()) {
      for (const animation of el.getAnimations?.() ?? []) animation.cancel()
      el.style.cssText = ''
    }
  })

  // One candidate is not a choice — #105's Decision 2, and the rule Inside
  // kept when it had a row of its own. INSIDE'S ALONE: Cherry-pick lays the
  // discard out every time, one card in it or many, and the player takes it
  // themselves (owner, 04.10). Latched on the pending rather than the mount,
  // so a second, distinct pending is free to fire again.
  const answersItself = ours?.source === 'ai-inside' && ours.picks === 1
  const answered = useRef<string | null>(null)
  useEffect(() => {
    if (!ours) {
      answered.current = null
      setManualRetry(false)
      return
    }
    if (manualRetry || !answersItself || ours.options.length !== 1) return
    const only = ours.options[0]
    const key = `${ours.player}:${ours.source}:${only.uid}`
    if (answered.current === key) return
    answered.current = key
    resolve({ kind: 'pickFromDiscard', card: only.uid })
  }, [ours, resolve, manualRetry, answersItself])

  // Nothing armed survives the pending it was armed for. `flying` is left
  // alone here on purpose — it clears itself once its own flight lands, and a
  // projection tick clearing the pending mid-flight must not cut it short.
  useEffect(() => {
    if (!ours && !confirmed && !flying) {
      setPicks([])
      setFlipped(new Set())
    }
  }, [ours, confirmed, flying])

  // DEAL THE OFFER OUT OF THE DISCARD PILE into the grid. Each cell flies out
  // of the very spot its card lay at in the pile — its place, its tilt, its
  // depth — all of them at once, and the pile lets those cards go in the same
  // commit (`lifted`), so the first frame is the pile as it was. The cell is
  // already standing in its slot; `landInPose` flies its ENTRY, the module every
  // card landing on the table goes through. It used to start every cell at the
  // middle of the pile's box, square and transparent, on a curve that covers
  // most of the way in its first fifth: by the time a card could be seen it
  // was nearly in its slot, and the deal read as cards appearing (owner, 04.10).
  // Purely cosmetic, so it never gates a click (the discard is face-up and
  // known throughout); the confirm bar waits for it.
  // biome-ignore lint/correctness/useExhaustiveDependencies: fires once per episode (guarded by `dealtKey`), not on every render `ours`/`options` produce a new identity for
  useLayoutEffect(() => {
    if (!offer) {
      dealtKey.current = null
      answeredKey.current = null
      return
    }
    const key = offerKey(offer)
    if (dealtKey.current === key) return
    dealtKey.current = key
    if (reduced) return
    const pileRect = anchors.discardBox.current?.getBoundingClientRect()
    if (!pileRect) return
    // where the pile draws a card, and where in it each of these cards lies —
    // the same pairing the pile reads to let them go
    const area = cardAreaOf(pileRect)
    const lying = claimInHeap(offer.options, state.decks.discardHeap ?? [])
    const flights = offer.options.flatMap((o, i) => {
      const el = cellRefs.current.get(o.uid)
      if (!el) return []
      const claim = lying.get(o.uid)
      const at = claim?.rest ?? { dx: 0, dy: 0, rot: 0 }
      const from = { ...area, left: area.left + at.dx, top: area.top + at.dy }
      const box = el.getBoundingClientRect()
      // on its way out it keeps the depth it lay at, so the cards leave the
      // pile stacked the way they lay in it
      el.style.zIndex = String(homeZ(claim?.depth ?? i))
      return [{ el, anim: play('landInPose', el, { from, box, rotateFrom: at.rot }) }]
    })
    if (flights.length === 0) return
    const run = ++dealRun.current
    setDealing(true)
    void Promise.allSettled(flights.map((f) => f.anim?.finished)).then(() => {
      if (run !== dealRun.current) return
      // the last frame is the cell's own place, so letting go of it moves
      // nothing — and it frees the cell's hover lift, which a held frame blocks
      for (const { el, anim } of flights) {
        anim?.cancel()
        el.style.zIndex = ''
      }
      setDealing(false)
    })
  }, [offer, reduced])

  // roles by the rules: a trigger (if chosen) is always the deck card; a
  // non-trigger always takes the hand slot; else first-chosen → hand, second → deck
  const roles = (() => {
    if (!sudo) return { hand: picks[0] ?? null, deck: null as string | null }
    const [a, b] = picks
    const idOf = (uid?: string) => options.find((o) => o.uid === uid)?.id
    if (picks.length === 1) {
      const id = idOf(a)
      return id && isTrigger(id)
        ? { hand: null as string | null, deck: a }
        : { hand: a, deck: null as string | null }
    }
    const idA = idOf(a)
    if (idA && isTrigger(idA)) return { hand: b, deck: a }
    return { hand: a, deck: b }
  })()

  // WHAT THE SURFACE MARKS, on either side of the table. The actor marks its own
  // roles; a watching seat marks the card the actor's surface says it is
  // offering — and only that one. The deck pick never travels (the rules place
  // that card unseen), so across the table there is no deck role to mark.
  const watchedHand =
    theirs && args.pickPreview?.player === theirs.player && args.pickPreview.card
      ? (watched.find((o) => o.id === args.pickPreview?.card)?.uid ?? null)
      : null
  const handUid = ours ? roles.hand : watchedHand
  const deckUid = ours ? roles.deck : null

  // …and it is told. Sent whenever the local offer changes, and cleared when
  // the surface goes: a highlight left standing on a pick nobody is making any
  // more is worse than none.
  const sentRef = useRef<string | null>(null)
  const send = args.onPickPreview
  useEffect(() => {
    if (!send) return
    const card = ours && roles.hand ? idOfOption(options, roles.hand) : null
    if (sentRef.current === card) return
    sentRef.current = card
    send(card)
  }, [send, ours, roles.hand, options])

  const max = ours?.picks ?? (sudo ? 2 : 1)

  // A trigger may only ever hold the DECK slot, and that slot exists only when
  // two cards are taken — so a set of picks is legal while it holds no more
  // triggers than it has deck slots. Stated over the resulting SET rather than
  // per candidate card, because a swap has to be judged the same way an
  // addition is: by what the player would be left holding.
  const legal = (set: string[]) =>
    set.filter((u) => isTrigger(idOfOption(options, u))).length <= (max === 2 ? 1 : 0)

  // What one click does. A picked card is released; an unpicked one joins while
  // there is room, and once there is none it takes the OLDEST pick's place
  // instead of being ignored.
  //
  // Ignoring it is what made a mis-click uncorrectable: every other card went
  // inert the moment `picks` filled, and the only way out was to guess that
  // clicking the CHOSEN card releases it. Nothing said so, so the grid read as
  // broken — which is how it was reported off the deployed playground.
  //
  // Returns `p` ITSELF when the click changes nothing, which is what lets
  // `canSelect` below be "would this click do anything?" rather than a second
  // copy of these rules that can drift out of step with them.
  const nextPicks = (p: string[], uid: string): string[] => {
    if (p.includes(uid)) return p.filter((u) => u !== uid)
    const grown = p.length < max ? [...p, uid] : [...p.slice(1), uid]
    return legal(grown) ? grown : p
  }

  const canSelect = (uid: string) => nextPicks(picks, uid) !== picks

  const ready = ours ? picks.length === ours.picks : false

  // Pin all cells together only after acceptance. The queue owns the
  // lifetime, so a refused choice never plays a success animation.
  const confirmPick = () => {
    if (!ours || confirmed || !ready) return
    const hand = roles.hand
    // re-checked against THIS render's offer, the discipline every branch of
    // the kit's own panel keeps
    if (!hand || !ours.options.some((o) => o.uid === hand)) return
    const deck = roles.deck
    const choice = {
      kind: 'pickFromDiscard' as const,
      card: hand,
      ...(deck ? { toDeck: deck } : {}),
    }

    // A game action must never wait on an animation nobody plays. Under
    // reduced motion the RESOLVE goes now
    // and the grid simply unmounts.
    if (reduced) {
      setConfirmed(true)
      resolve(choice)
      return
    }

    setConfirmed(true)
    args.handoff.current = {
      card: ours.options.find((o) => o.uid === hand)?.id ?? '',
      run: async (ctx) => {
        setFlying(true)
        const handData = cardById(ours.options.find((o) => o.uid === hand)?.id ?? '')
        const deckOpt = deck ? ours.options.find((o) => o.uid === deck) : undefined
        const deckData = deckOpt ? cardById(deckOpt.id) : undefined
        const deckRect = anchors.pileBox(0)?.getBoundingClientRect()

        // pass 1: read EVERY cell's rect first, before touching layout.
        const rects = new Map<string, DOMRect>()
        for (const o of ours.options) {
          const el = cellRefs.current.get(o.uid)
          if (el) rects.set(o.uid, el.getBoundingClientRect())
        }

        const remaining = ours.options.filter((o) => o.uid !== hand && o.uid !== deck)
        // THE PILE THE CARDS CAME OUT OF, less what was taken: the topmost copy
        // of each taken card leaves it, the copy the projection itself takes out
        // (`toDiscardHeap`). This is the heap the board draws once the grid has
        // gone, so it is the one every card that goes home lands in.
        const takenIds = [hand, deck].flatMap((uid) => {
          const id = uid ? (ours.options.find((o) => o.uid === uid)?.id ?? '') : ''
          return id ? [id] : []
        })
        const heapLeft = [...(ctx.base.decks.discardHeap ?? [])]
        let taken = 0
        for (const id of takenIds) {
          for (let i = heapLeft.length - 1; i >= 0; i--) {
            if (heapLeft[i].card.id !== id) continue
            heapLeft.splice(i, 1)
            taken++
            break
          }
        }
        // Where each unpicked card ENDS UP — ITS OWN entry in that pile: the
        // spot it was lifted from, at its own pose (I7), and its depth there is
        // the layer it travels on (I9), so it lands under what lies over it and
        // over what lies under it. It used to be claimed by card in the heap
        // AFTER the answer, which already holds the copy of an operation still
        // standing at the centre: a Cherry-pick played over a Cherry-pick sent
        // the first one home onto the second's pose and on top, and the pile then
        // turned it back to its own the moment it took over (owner's
        // recording, 04.10).
        const resting = claimInHeap(remaining, heapLeft)
        const zOf = (uid: string, i: number) =>
          uid === hand
            ? homeZ(heapLeft.length) + 1
            : uid === deck
              ? homeZ(heapLeft.length)
              : homeZ(resting.get(uid)?.depth ?? i)

        // pass 2: pin them all at their captured rects (no more reflow matters),
        // each on the layer it travels on
        ours.options.forEach((o, i) => {
          const el = cellRefs.current.get(o.uid)
          const r = rects.get(o.uid)
          if (!el || !r) return
          el.style.transition = 'none'
          el.style.transform = 'none'
          el.style.position = 'fixed'
          el.style.left = `${r.left}px`
          el.style.top = `${r.top}px`
          el.style.width = `${r.width}px`
          el.style.margin = '0'
          el.style.zIndex = String(zOf(o.uid, i))
        })

        const handFlight = (async () => {
          const el = cellRefs.current.get(hand)
          const from = rects.get(hand)
          const centre = anchors.centre.current?.getBoundingClientRect()
          if (!el || !from || !centre || !handData) return
          const to = {
            left: centre.left + (centre.width - REVEAL_W) / 2,
            top: centre.top + (centre.height - (REVEAL_W * from.height) / from.width) / 2,
            width: REVEAL_W,
            height: (REVEAL_W * from.height) / from.width,
          }
          await nextFrames()
          await play('playToCenter', el, { to, duration: REVEAL_DUR })?.finished
          await wait(REVEAL_HOLD)
          await arrival.land(ctx, { card: handData, el, fallbackKey: hand })
        })()
        const deckFlight = (async () => {
          if (!deck || !deckData || !deckRect) return
          const el = cellRefs.current.get(deck)
          const from = rects.get(deck)
          if (!el || !from) return
          setFlipped(new Set([deck]))
          await wait(FLIP_DUR)
          await play('returnToDeck', el, { to: deckRect })?.finished
          await wait(DECK_HOLD)
        })()
        const returnFlight = exit.send(
          remaining.flatMap((o, i) => {
            const card = cardById(o.id)
            if (!card) return []
            const found = resting.get(o.uid)
            return [
              {
                key: o.uid,
                card,
                node: cellRefs.current.get(o.uid),
                scatter: found?.rest ?? scatterAt(i, 116),
                // Nothing dissolves on the way: the pile draws every card it
                // holds (`_Board.tsx`'s discard has no `heapShow`), so a card
                // that faded out mid-flight would still be there at rest — it
                // would simply appear, already lying, instead of landing. Only
                // a card the pile has no place for at all sinks out of sight.
                fade: !found,
                delay: Math.min(i, STAGGER_CAP) * RETURN_STEP,
                layer: found?.depth ?? i,
              },
            ]
          }),
          // nothing stands: every card is handed over as its own grid cell
          // (`node`), so the step flies those very nodes
          null,
        )
        await Promise.all([handFlight, deckFlight, returnFlight])
        // The picked cards have LEFT the pile. The projection says so a batch
        // later; until then the queue draws the shadow — the table as it was
        // BEFORE the answer — so without this the heap comes back the moment
        // the grid goes, with the card the player just took lying in it.
        if (taken > 0) {
          ctx.base = {
            ...ctx.base,
            decks: {
              ...ctx.base.decks,
              discardHeap: heapLeft,
              discard: heapLeft.at(-1)?.card,
              discardCount: Math.max(0, ctx.base.decks.discardCount - taken),
            },
          }
          ctx.publish(ctx.base)
        }
        answeredKey.current = offerKey(ours)
        setFlying(false)
        setConfirmed(false)
      },
    }
    resolve(choice)
  }

  // THE SAME SCENE FROM THE OTHER SIDE. Armed while the pick is open, because
  // this seat has no gesture to arm it with: the beat that says which card was
  // taken is the first this seat hears of the answer, and it is handed that
  // card. Nothing is measured until then — the cells are still standing.
  //
  // What differs from the actor's own run, and why:
  //   • the chosen card ends at the ACTOR'S SEAT, not in a hand — this is the
  //     leg `aiBeat.runTaken` already plays for a card coming out of the
  //     discard; it starts at the card's own CELL instead of at the pile,
  //     because here the discard is laid out and everyone watched it be taken;
  //   • the card that goes on the DECK under sudo is never named to this seat
  //     (`fake/discard.ts` marks it `visibleTo` the actor). So it is not flown
  //     out of any cell: every remaining card returns to the discard, the deck
  //     one among them and at the very BOTTOM of the heap, turned over there
  //     where nothing singles it out — and only then does a face-down card
  //     slide out from UNDER the pile and up to the top of the deck (owner,
  //     19.09). The choreography differs from the actor's on purpose: the two
  //     seats are not entitled to the same knowledge.
  const watchRef = useRef({ theirs, watched, sudo })
  watchRef.current = { theirs, watched, sudo }
  useEffect(() => {
    if (!theirs || reduced) return
    args.handoff.current = {
      // the watcher lands nothing in OUR fan — somebody else takes the card —
      // so it has no run to grow, only its own choreography to play
      run: async (ctx, takenId) => {
        const { watched: cells, sudo: two } = watchRef.current
        setFlying(true)
        const centre = anchors.centre.current?.getBoundingClientRect()
        const seat = anchors.seatBox(watchRef.current.theirs?.player ?? '')
        // pass 1: every cell's rect, before anything is pinned (the actor's own
        // two passes, for the same reflow reason)
        const rects = new Map<string, DOMRect>()
        for (const o of cells) {
          const el = cellRefs.current.get(o.uid)
          if (el) rects.set(o.uid, el.getBoundingClientRect())
        }
        // WHICH CELL WAS TAKEN — by card id, the only thing this seat is told.
        // Copies look alike, but they do not lie alike: the TOPMOST is the one
        // the projection takes out (`toDiscardHeap`), so it is the one that
        // leaves here, or the pile would re-lay its copies once it took over.
        let takenUid: string | undefined
        for (let i = cells.length - 1; i >= 0 && !takenUid; i--)
          if (cells[i].id === takenId) takenUid = cells[i].uid
        const taken = takenUid ? cellRefs.current.get(takenUid) : undefined
        const takenFrom = takenUid ? rects.get(takenUid) : undefined
        // the pile every other cell lands back in — the cells ARE its entries
        const heapLeft = (ctx.base.decks.discardHeap ?? []).filter((c) => c.uid !== takenUid)
        // each on the layer it travels on, the actor's rule
        cells.forEach((o, i) => {
          const el = cellRefs.current.get(o.uid)
          const r = rects.get(o.uid)
          if (!el || !r) return
          const depth = heapLeft.findIndex((c) => c.uid === o.uid)
          el.style.transition = 'none'
          el.style.transform = 'none'
          el.style.position = 'fixed'
          el.style.left = `${r.left}px`
          el.style.top = `${r.top}px`
          el.style.width = `${r.width}px`
          el.style.margin = '0'
          el.style.zIndex = String(
            o.uid === takenUid ? homeZ(heapLeft.length) + 1 : homeZ(depth < 0 ? i : depth),
          )
        })

        const goes = (async () => {
          if (!taken || !takenFrom || !centre) return
          const to = {
            left: centre.left + (centre.width - REVEAL_W) / 2,
            top: centre.top + (centre.height - (REVEAL_W * takenFrom.height) / takenFrom.width) / 2,
            width: REVEAL_W,
            height: (REVEAL_W * takenFrom.height) / takenFrom.width,
          }
          await nextFrames()
          await play('playToCenter', taken, { to, duration: REVEAL_DUR })?.finished
          await wait(REVEAL_HOLD)
          if (seat) await play('dealToSeat', taken, { to: seat, scale: SEAT_SHRINK })?.finished
          taken.style.opacity = '0'
        })()

        // everything else goes home, the deck one at the bottom of the heap
        const rest = cells.filter((o) => o.uid !== takenUid)
        // …and every other card goes home to ITS OWN entry of the pile — the
        // cells are the heap's own entries — at its own pose (I7) and its own
        // depth (I9), the actor's rule. Sent to made-up poses, they landed and
        // the pile re-laid them all the moment it took over.
        const home = exit.send(
          rest.flatMap((o, i) => {
            const card = cardById(o.id)
            const depth = heapLeft.findIndex((c) => c.uid === o.uid)
            const own = heapLeft[depth]
            return card
              ? [
                  {
                    key: o.uid,
                    card,
                    node: cellRefs.current.get(o.uid),
                    scatter: own ?? scatterAt(i, 116),
                    delay: Math.min(i, STAGGER_CAP) * RETURN_STEP,
                    layer: own ? depth : i,
                  },
                ]
              : []
          }),
          // nothing stands: every card is handed over as its own cell
          null,
        )
        await Promise.all([goes, home])

        // …and only now, with the pile whole again, one card nobody can name
        // comes out from under it and onto the deck.
        const pile = anchors.pileBox(0)?.getBoundingClientRect()
        const heapBox = anchors.discardBox.current?.getBoundingClientRect()
        if (two && pile && heapBox) {
          // A BACK AND NOTHING ELSE. This seat is not entitled to the identity,
          // so nothing here may carry one: the cover is what `Card` draws for a
          // card whose face nobody at this seat has been shown.
          const [el] = await deckFlyer.raise([
            { key: 'to-deck', card: COVER, at: heapBox, faceDown: true },
          ])
          if (el) await play('returnToDeck', el, { to: pile })?.finished
          await wait(DECK_HOLD)
          deckFlyer.drop('to-deck')
        }
        setFlying(false)
      },
    }
  }, [theirs, reduced, anchors, exit.send, deckFlyer.raise, deckFlyer.drop, args.handoff])

  // WHAT THE GRID HOLDS, as the pile knows it: each card laid out claims one
  // copy of itself in the heap. Only those leave the pile while the grid
  // stands. A Cherry-pick's offer is the whole discard, so the pile is empty
  // under it; Inside's is the releases, and what is not one stays where it lay
  // instead of vanishing for the pick and coming back mid-heap as the grid
  // closed (owner's recording, 04.10).
  const liftedUids = new Set<string>()
  for (const { rest } of claimInHeap(options, state.decks.discardHeap ?? []).values())
    if (rest.uid) liftedUids.add(rest.uid)
  const lifted = { uids: liftedUids, count: options.length }

  const overlay = [...arrival.overlay, ...exit.overlay, ...deckFlyer.overlay]
  const gaps = { gapAt: arrival.gapAt, gapSize: arrival.gapSize }

  if (
    !flying &&
    ((!ours && !theirs && !confirmed) ||
      (confirmed && reduced) ||
      (ours != null && answeredKey.current === offerKey(ours)) ||
      (answersItself && (ours?.options.length ?? 0) < 2 && !manualRetry))
  ) {
    return { grid: null, overlay, ...gaps, lifted: null }
  }

  // The scene's `phase === 'choose'`: the deal has finished and nothing is
  // confirmed yet. Selection states, badges and the confirm bar live only here.
  // Only the seat that can ANSWER chooses. Across the table the same cards are
  // up in the same places and nothing else: no lighting, no role tags, no bar.
  const choosing = ours != null && !confirmed && !dealing
  // The MARKS are both seats': one shows what it is choosing, the other watches
  // that choice being made. Only the controls are the actor's alone.
  const marking = !confirmed && !dealing

  return {
    grid: (
      // Full-area, transform-free and `pointer-events: none` — see the
      // header comment on `.grid` in the module CSS for why. `.cells` (the
      // actual card row) and the confirm bar re-enable their own pointer
      // events, so clicks pass through everywhere else on this layer.
      //
      // Committed: there is no surface left to read, only cards flying home in
      // it — so it drops to the band a travelling card rides in, under the pile
      // counters. Keyed on the same flag the scrim leaves on, so the switch
      // happens before anything moves (Rebase's own `answered`, same rule).
      <TableSurface
        committed={confirmed}
        testId={inside ? 'board-inside-row' : 'board-cherry-grid'}
        blockTestId="board-cherry-scrim"
      >
        <div className={`${styles.cells} ${dealing ? styles.dealing : ''}`}>
          {options.map((o) => {
            const data = cardById(o.id)
            if (!data) return null
            const handRole = handUid === o.uid
            const deckRole = deckUid === o.uid
            const selected = handRole || deckRole
            const blocked = choosing && !selected && !canSelect(o.uid)
            return (
              <button
                key={o.uid}
                ref={(el) => {
                  if (el) cellRefs.current.set(o.uid, el)
                  else cellRefs.current.delete(o.uid)
                }}
                type="button"
                data-testid={`cherry-cell-${o.uid}`}
                className={`${styles.cell} ${selected ? styles.selected : ''} ${
                  blocked ? styles.blocked : ''
                }`}
                disabled={!ours}
                onClick={() => {
                  if (confirmed || !ours) return
                  setPicks((p) => nextPicks(p, o.uid))
                }}
              >
                <Card
                  card={data}
                  interactive={false}
                  width="100%"
                  faceDown={flipped.has(o.uid)}
                  state={marking && selected ? 'selected' : 'idle'}
                  // one out of a set — the uniform selection colour, never the
                  // per-category accent
                  accent="var(--select-accent)"
                />
                {marking && handRole && (
                  <Typography base="overline" tk="tk-10" className={styles.roleTag}>
                    {copy.toHand}
                  </Typography>
                )}
                {marking && deckRole && (
                  <Typography base="overline" tk="tk-10" className={styles.roleTag}>
                    {copy.toDeck}
                  </Typography>
                )}
                {/* a trigger never takes the hand slot — in sudo too, where it
                    can still be the deck card (the scene marks it in both) */}
                {choosing && !selected && isTrigger(o.id) && (
                  <Typography base="overline" tk="tk-10" className={styles.lockTag}>
                    {copy.noHand}
                  </Typography>
                )}
              </button>
            )
          })}
        </div>
        <ConfirmAction
          // After the deal, never with it: the cards are read first, and the
          // bar arrives once the offer is all on the table (owner, 16.09).
          // `choosing` is already false across the table, so the bar is the
          // actor's alone without a second condition saying so.
          open={choosing}
          label={copy.confirm}
          caption={inside ? copy.insidePrompt : sudo ? copy.sudoPrompt : copy.prompt}
          disabled={!ready}
          onConfirm={confirmPick}
        />
      </TableSurface>
    ),
    overlay,
    ...gaps,
    lifted,
  }
}

/**
 * ONE OFFER'S IDENTITY: who owes it, and WHICH OCCASION it is.
 *
 * It used to be who owes it and the cards in it — and a card of the same kind
 * may be played any number of times, so the same player can be offered the same
 * cards twice in one match. Keyed by its contents the second offer is byte for
 * byte the first, which this hook has already marked answered, so the second
 * Cherry-pick would never deal its grid. The same defect was found live on
 * Rebase, which carried the same key (#168).
 */
const offerKey = (pending: { player: string; raisedAt: number }) =>
  `${pending.player}:${pending.raisedAt}`

const idOfOption = (options: { uid: string; id: string }[], uid: string) =>
  options.find((o) => o.uid === uid)?.id ?? ''

/**
 * WHICH ENTRY OF THE PILE EACH CELL IS. A cell is named by the engine and an
 * entry by the projection; the one thing they share is the card. So copies pair
 * up in order — the n-th copy of a card in the offer is the n-th copy of it in
 * the pile, counted from the BOTTOM: a card filed after the offer was made (the
 * operation standing at the centre) only ever lies above the copies the offer
 * holds. One rule for every reader of the pairing — what the pile leaves out
 * while the grid stands, and where each card goes home to — so they cannot
 * disagree about which copy is which.
 */
function claimInHeap(
  cells: readonly { uid: string; id: string }[],
  heap: readonly HeapCard[],
): Map<string, { rest: HeapCard; depth: number }> {
  const claimed = new Map<string, { rest: HeapCard; depth: number }>()
  const used = new Set<number>()
  for (const cell of cells) {
    const depth = heap.findIndex((c, i) => !used.has(i) && c.card.id === cell.id)
    if (depth < 0) continue
    used.add(depth)
    claimed.set(cell.uid, { rest: heap[depth], depth })
  }
  return claimed
}
