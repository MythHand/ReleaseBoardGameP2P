import type { Event } from '@release/engine'
import type { CardData, HandItem, TableActions } from '@release/ui'
import { Card, ConfirmAction, cardById, Typography } from '@release/ui'
import {
  nextFrames,
  play,
  scatterAt,
  useDiscardExit,
  useFlyer,
  useHandArrival,
  wait,
} from '@release/ui/animations'
import type { ReactNode, RefObject } from 'react'
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { BeatRun, BoardAnchors, BoardState } from '~/entities/game/board'
import type { DiscardPickHandoff } from '~/entities/game/board/types'
import { useReducedMotion } from '~/shared/lib/useReducedMotion'
import styles from './_useCherryPickStaging.module.css'
import { useResolveFeedback } from './_useResolveFeedback'

// The grid owns the local accepted pick; the event queue awaits its flight
// instead of animating a second copy from the discard. The heap is empty
// while its cards are in the grid, matching the playground scene.
const isTrigger = (id: string) => cardById(id)?.category === 'trigger'

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

// timings — the approved scene, the three legs that actually travel (deal,
// hand-reveal, deck)
const DEAL_DUR = 360 // dealing out of the pile into the grid
const DEAL_STEP = 16 // per-card stagger, dealing out
const STAGGER_CAP = 40 // don't stagger past this many cards
const REVEAL_W = 220 // width the chosen card reaches in the centre
const REVEAL_DUR = 460 // fly-to-centre duration
const REVEAL_HOLD = 560 // pause in the centre before dropping into the hand
const FLIP_DUR = 420 // = the flipCard preset duration (flip before the deck flight)
const DECK_HOLD = 360 // deck card holds face-down before it merges
const RETURN_STEP = 14 // per-card stagger, returning to the pile

// centre-to-centre translate + scale to move an element from one rect to
// another — the story's own `between()`, ported verbatim.
function between(from: DOMRect, to: DOMRect): string {
  const dx = to.left + to.width / 2 - (from.left + from.width / 2)
  const dy = to.top + to.height / 2 - (from.top + from.height / 2)
  return `translate(${dx}px, ${dy}px) scale(${to.width / from.width})`
}

export function useCherryPickStaging(args: {
  handoff: RefObject<DiscardPickHandoff | null>
  state: BoardState
  events?: Event[]
  anchors: BoardAnchors
  actions?: TableActions
  onHandArrival: (hand: HandItem[], uid: string, at: number) => void
  copy: {
    prompt: string
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
}): { grid: ReactNode | null; overlay: ReactNode[]; gapAt: number | null; gapSize: number } {
  const { state, anchors, actions, copy, enabled } = args
  const reduced = useReducedMotion()
  const pending = state.pending
  const ours =
    enabled &&
    pending?.kind === 'pickFromDiscard' &&
    pending.source === 'operation-git-cherry-pick' &&
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
    pending.source === 'operation-git-cherry-pick' &&
    pending.player !== state.selfId
      ? pending
      : null
  const watched = useMemo(
    () =>
      theirs
        ? (state.decks.discardHeap ?? []).flatMap((c) =>
            c.uid ? [{ uid: c.uid, id: c.card.id }] : [],
          )
        : [],
    [theirs, state.decks.discardHeap],
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
  if (ours) {
    optionsRef.current = ours.options
    sudoRef.current = ours.picks === 2
  } else if (theirs) {
    // the same carry-forward, for the seat that only watches: the pending goes
    // the instant the engine answers, and the cards are still in the air
    optionsRef.current = watched
    sudoRef.current = theirs.picks === 2
  }
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
  // The offer this hook has already answered and flown. The queue keeps
  // drawing the projection its NEXT beat moves away from — the one where this
  // pending is still open — for as long as the operation card's own exit runs,
  // so without this the whole picker comes back over the centre for a second,
  // reading as "pick again", and the card underneath it looks like it jumps
  // before it leaves. Cleared when the offer itself goes (below) and when a
  // RESOLVE is refused, because then the choice really is open again.
  const answeredKey = useRef<string | null>(null)
  const timers = useRef<number[]>([])
  const later = (fn: () => void, ms: number) => {
    timers.current.push(window.setTimeout(fn, ms))
  }
  const clearTimers = () => {
    for (const t of timers.current) window.clearTimeout(t)
    timers.current = []
  }
  // No timer survives the hook. useLayoutEffect with no deps: mount-once,
  // cleanup-on-unmount only — the same idiom the story's own version uses.
  // biome-ignore lint/correctness/useExhaustiveDependencies: mount-once by design — `clearTimers` is a plain function recreated every render, so listing it would clear timers on every render instead of only on unmount
  useLayoutEffect(() => clearTimers, [])

  const [manualRetry, setManualRetry] = useState(false)
  const exit = useDiscardExit(anchors.discardBox)
  // The one carrier this surface raises itself: the card that goes on the deck
  // as WATCHED — face down, out from under the pile, belonging to nobody's cell.
  const deckFlyer = useFlyer()
  const taking = useRef<BeatRun | null>(null)
  const arrival = useHandArrival(anchors.hand, (gap, cards) => {
    const ctx = taking.current
    if (!ctx) return
    const hand = [...ctx.base.you.hand]
    hand.splice(gap, 0, ...cards.map((card) => ({ uid: card.key, card: card.card })))
    // Commit the same physical UID and slot to both owners: the queue's
    // current fan and the private order applied to future wire projections.
    args.onHandArrival(hand, cards[0].key, gap)
    ctx.base = { ...ctx.base, you: { ...ctx.base.you, hand } }
    ctx.publish(ctx.base)
  })

  const resolve = useResolveFeedback(args.events ?? [], state.selfId, actions, () => {
    args.handoff.current = null
    // refused: this offer is open again, whatever we flew for it
    answeredKey.current = null
    setManualRetry(true)
    if (ours?.options.length === 1) setPicks([ours.options[0].uid])
    setConfirmed(false)
    setFlying(false)
    setFlipped(new Set())
    clearTimers()
    for (const el of cellRefs.current.values()) {
      for (const animation of el.getAnimations?.() ?? []) animation.cancel()
      el.style.cssText = ''
    }
  })

  // One candidate is not a choice — `_useInsideStaging`'s precedent, and
  // #105's Decision 2 before it. Latched on the pending rather than the mount,
  // so a second, distinct pending is free to fire again.
  const answered = useRef<string | null>(null)
  useEffect(() => {
    if (!ours) {
      answered.current = null
      setManualRetry(false)
      return
    }
    if (manualRetry || ours.picks !== 1 || ours.options.length !== 1) return
    const only = ours.options[0]
    const key = `${ours.player}:${ours.source}:${only.uid}`
    if (answered.current === key) return
    answered.current = key
    resolve({ kind: 'pickFromDiscard', card: only.uid })
  }, [ours, resolve, manualRetry])

  // Nothing armed survives the pending it was armed for. `flying` is left
  // alone here on purpose — it clears itself once its own flight lands, and a
  // projection tick clearing the pending mid-flight must not cut it short.
  useEffect(() => {
    if (!ours && !confirmed && !flying) {
      setPicks([])
      setFlipped(new Set())
    }
  }, [ours, confirmed, flying])

  // deal the offer OUT of the discard pile into the grid: every cell starts
  // at the pile's own rect and flies to its slot, staggered — purely cosmetic,
  // so it never gates a click (the discard is face-up and known throughout).
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
    const els = offer.options.map((o) => cellRefs.current.get(o.uid))
    if (els.every((el) => !el)) return
    for (const el of els) {
      if (!el) continue
      el.style.transition = 'none'
      el.style.transform = between(el.getBoundingClientRect(), pileRect)
      el.style.opacity = '0'
    }
    setDealing(true)
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        els.forEach((el, i) => {
          if (!el) return
          const delay = Math.min(i, STAGGER_CAP) * DEAL_STEP
          el.style.transition = `transform ${DEAL_DUR}ms var(--ease-out) ${delay}ms, opacity ${DEAL_DUR}ms ${delay}ms`
          el.style.transform = ''
          el.style.opacity = ''
        })
        const total = DEAL_DUR + Math.min(els.length, STAGGER_CAP) * DEAL_STEP + 60
        later(() => {
          for (const el of els) if (el) el.style.transition = ''
          setDealing(false)
        }, total)
      }),
    )
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

    // A game action must never wait on an animation nobody plays
    // (`_useInsideStaging`'s rule). Under reduced motion the RESOLVE goes now
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
        taking.current = ctx
        const after = ctx.after ?? ctx.base
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
        // pass 2: pin them all at their captured rects (no more reflow matters)
        for (const o of ours.options) {
          const el = cellRefs.current.get(o.uid)
          const r = rects.get(o.uid)
          if (!el || !r) continue
          el.style.transition = 'none'
          el.style.transform = 'none'
          el.style.position = 'fixed'
          el.style.left = `${r.left}px`
          el.style.top = `${r.top}px`
          el.style.width = `${r.width}px`
          el.style.margin = '0'
          el.style.zIndex = '100'
        }

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
          el.style.zIndex = '130'
          await nextFrames()
          await play('playToCenter', el, { from, to, duration: REVEAL_DUR })?.finished
          await wait(REVEAL_HOLD)
          await arrival.arrive([{ key: hand, card: handData, el }], ctx.base.you.hand.length)
        })()
        const deckFlight = (async () => {
          if (!deck || !deckData || !deckRect) return
          const el = cellRefs.current.get(deck)
          const from = rects.get(deck)
          if (!el || !from) return
          el.style.zIndex = '120'
          setFlipped(new Set([deck]))
          await wait(FLIP_DUR)
          await play('returnToDeck', el, { from, to: deckRect })?.finished
          await wait(DECK_HOLD)
        })()
        const remaining = ours.options.filter((o) => o.uid !== hand && o.uid !== deck)
        // Where each unpicked card ENDS UP in the pile — its own entry in the
        // heap the projection has after this answer. One scatter drives both
        // the flight and the rest (I7), and the place in that array is the
        // layer the card travels on (I9): its depth there is what decides
        // whether it lands in the open or sinks under the visible top, so a
        // card never lands in full view and then drops out of it the moment
        // the operation card settles above — which is the pile rearranging
        // itself after everything had already landed.
        const heap = after.decks.discardHeap ?? []
        const claimed = new Set<number>()
        const resting = new Map<string, { rest: (typeof heap)[number]; depth: number }>()
        for (const option of [...remaining].reverse()) {
          for (let i = heap.length - 1; i >= 0; i--) {
            if (claimed.has(i) || heap[i].card.id !== option.id) continue
            claimed.add(i)
            resting.set(option.uid, { rest: heap[i], depth: i })
            break
          }
        }
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
        taking.current = null
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
      run: async (ctx, takenId) => {
        const { watched: cells, sudo: two } = watchRef.current
        taking.current = ctx
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
        for (const o of cells) {
          const el = cellRefs.current.get(o.uid)
          const r = rects.get(o.uid)
          if (!el || !r) continue
          el.style.transition = 'none'
          el.style.transform = 'none'
          el.style.position = 'fixed'
          el.style.left = `${r.left}px`
          el.style.top = `${r.top}px`
          el.style.width = `${r.width}px`
          el.style.margin = '0'
          el.style.zIndex = '100'
        }
        // WHICH CELL WAS TAKEN — by card id, the only thing this seat is told.
        // Copies are interchangeable, so the first match is as right as any.
        const takenUid = cells.find((o) => o.id === takenId)?.uid
        const taken = takenUid ? cellRefs.current.get(takenUid) : undefined
        const takenFrom = takenUid ? rects.get(takenUid) : undefined

        const goes = (async () => {
          if (!taken || !takenFrom || !centre) return
          const to = {
            left: centre.left + (centre.width - REVEAL_W) / 2,
            top: centre.top + (centre.height - (REVEAL_W * takenFrom.height) / takenFrom.width) / 2,
            width: REVEAL_W,
            height: (REVEAL_W * takenFrom.height) / takenFrom.width,
          }
          taken.style.zIndex = '130'
          await nextFrames()
          await play('playToCenter', taken, { from: takenFrom, to, duration: REVEAL_DUR })?.finished
          await wait(REVEAL_HOLD)
          const at = taken.getBoundingClientRect()
          if (seat) await play('dealToSeat', taken, { from: at, to: seat, scale: 0.7 })?.finished
          taken.style.opacity = '0'
        })()

        // everything else goes home, the deck one at the bottom of the heap
        const rest = cells.filter((o) => o.uid !== takenUid)
        const home = exit.send(
          rest.flatMap((o, i) => {
            const card = cardById(o.id)
            return card
              ? [
                  {
                    key: o.uid,
                    card,
                    node: cellRefs.current.get(o.uid),
                    scatter: scatterAt(i, 116),
                    delay: Math.min(i, STAGGER_CAP) * RETURN_STEP,
                    layer: i,
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
          if (el) await play('returnToDeck', el, { from: heapBox, to: pile })?.finished
          await wait(DECK_HOLD)
          deckFlyer.drop('to-deck')
        }
        taking.current = null
        setFlying(false)
      },
    }
  }, [theirs, reduced, anchors, exit.send, deckFlyer.raise, deckFlyer.drop, args.handoff])

  const overlay = [...arrival.overlay, ...exit.overlay, ...deckFlyer.overlay]
  const gaps = { gapAt: arrival.gapAt, gapSize: arrival.gapSize }

  if (
    !flying &&
    ((!ours && !theirs && !confirmed) ||
      (confirmed && reduced) ||
      (ours != null && answeredKey.current === offerKey(ours)) ||
      (ours?.picks === 1 && ours.options.length < 2 && !manualRetry))
  ) {
    return { grid: null, overlay, ...gaps }
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
      <div
        className={`${styles.grid} ${confirmed ? styles.flight : ''}`}
        data-testid="board-cherry-grid"
      >
        {!confirmed && <div className={styles.scrim} data-testid="board-cherry-scrim" />}
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
          caption={sudo ? copy.sudoPrompt : copy.prompt}
          disabled={!ready}
          onConfirm={confirmPick}
        />
      </div>
    ),
    overlay,
    ...gaps,
  }
}

/** one offer's identity: who owes it, what raised it, and the cards in it */
const offerKey = (pending: { player: string; source?: string; options: { uid: string }[] }) =>
  `${pending.player}:${pending.source}:${pending.options.map((o) => o.uid).join(',')}`

const idOfOption = (options: { uid: string; id: string }[], uid: string) =>
  options.find((o) => o.uid === uid)?.id ?? ''
