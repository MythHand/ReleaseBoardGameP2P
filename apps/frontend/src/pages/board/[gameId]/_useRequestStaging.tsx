import type { Event } from '@release/engine'
import type { TableActions } from '@release/ui'
import { CARDS, Card, CardCatalog, ConfirmAction, Hand, Typography } from '@release/ui'
import type { RefObject } from 'react'
import { useEffect, useRef, useState } from 'react'
import type { BoardState } from '~/entities/game/board'
import type { RequestPickHandoff } from '~/entities/game/board/types'
import styles from './_useRequestStaging.module.css'
import { useResolveFeedback } from './_useResolveFeedback'

// Only catalogue identities live here. A closed offer is made from anonymous
// positions, never the target's hand or the engine's private shuffled UIDs.
const HOLDABLE = CARDS.filter((c) => c.deck === 'base' && c.category !== 'trigger')
// = the `.offer` slide in the module CSS. The fan leaves the way it arrived, so
// the node has to outlive the pending it belonged to by exactly that long.
const FAN_MS = 520
const BACK = HOLDABLE[0]

export function useRequestStaging(args: {
  state: BoardState
  events?: Event[]
  actions?: TableActions
  copy: { prompt: string; action: string; confirm: string; steal: string }
  enabled: boolean
  matchKey: string | null
  /** the card another seat's surface is naming but has not confirmed */
  pickPreview?: { player: string; card: string | null } | null
  /** this seat's own naming, on its way to the others */
  onPickPreview?: (card: string | null) => void
  /** the surface's hold, for the beat that plays this request */
  handoff?: RefObject<RequestPickHandoff | null>
}) {
  const { state, actions, copy, enabled, matchKey } = args
  const pending = state.pending
  const ours = pending && 'player' in pending && pending.player === state.selfId
  const asking = ours && pending?.kind === 'requestCard'
  // THE REQUEST IS PUBLIC — the rules make it public on a hit and a miss alike,
  // and the list it is made from is the game's own catalogue, not anybody's
  // hand, so showing it to the table gives nothing away. Across the table the
  // same cards are up in the same places; what this seat cannot do is answer.
  const watching =
    enabled && pending?.kind === 'requestCard' && !ours ? (pending as typeof pending) : null
  const giving = Boolean(ours && pending?.kind === 'giveCard')
  const stealing = ours && pending?.kind === 'stealCard'
  const episode =
    pending && 'player' in pending && (asking || giving || stealing)
      ? `${matchKey}:${pending.kind}:${pending.player}:${'openedAt' in pending ? pending.openedAt : ''}:${'requested' in pending ? pending.requested : ''}`
      : null
  const [named, setNamed] = useState<string | null>(null)
  // THE CARD THE BEAT ASKED US TO HOLD. Named by the beat rather than by this
  // seat, so every board holds the same card for the same span whether it made
  // the choice or watched it being made — and the beat no longer has to raise a
  // copy of it at the centre, because the surface is already showing it.
  const [held, setHeld] = useState<string | null>(null)
  // across the table: the card the asker's own surface is naming right now
  const watchedName =
    watching && args.pickPreview?.player === watching.player ? args.pickPreview.card : null
  const [confirmed, setConfirmed] = useState(false)
  const [picked, setPicked] = useState<{ index: number; rect: DOMRect } | null>(null)
  // The fan comes down FROM ABOVE THE SCREEN, so it has to be mounted out of
  // sight first and moved in a frame later — a transform set on the mounting
  // commit has nothing to animate from. Two frames, the same arming
  // `PickOpponentCardStory` uses, and it goes back up the moment the pick is
  // confirmed.
  const [shown, setShown] = useState(false)
  const locked = useRef(false)
  const band = useRef<HTMLDivElement>(null)
  const catalogPreview = useRef<HTMLDivElement>(null)
  const fan = useRef<HTMLDivElement>(null)
  const resolve = useResolveFeedback(args.events ?? [], state.selfId, actions, () => {
    locked.current = false
    setConfirmed(false)
    setPicked(null)
  })
  // Written during RENDER, not in an effect: the beat that plays this request
  // can start inside the very commit the engine's answer arrives in, and it
  // reads this before its first await — an effect would arm it one commit late
  // and the beat would fall back to raising its own copy.
  if (args.handoff) {
    args.handoff.current = {
      hold: (card: string) => setHeld(card),
      // the catalogue goes with the card it was holding …
      release: () => setHeld(null),
      // … and the fan goes separately, at the moment the card leaves it
      close: () => setShown(false),
      // WHICH PLACE THE CARD LEAVES, answered by the fan itself — it is the only
      // party that knows whether a place was chosen in it.
      //
      // A blind pick is a choice OF A PLACE: the card comes out of the back the
      // finger landed on, or pointing at one back out of a row of identical ones
      // had no consequence anyone can see. A named request had no such choice —
      // the fan is anonymous backs and the card was named, not pointed at — so
      // it comes out of the MIDDLE, where it is seen leaving rather than
      // slipping off an edge.
      //
      // Both used to be decided by the beat, which asked for the middle first
      // and so gave it to both questions: every blind pick flew out of the
      // middle whichever back was pressed (#168). One question, one owner.
      slot: () => {
        if (picked) return picked.rect
        const el = fan.current?.querySelector<HTMLElement>('[data-request-slot]')
        return el?.getBoundingClientRect() ?? null
      },
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset exactly at a decision boundary, not when animation gating changes
  useEffect(() => {
    locked.current = false
    setNamed(null)
    setConfirmed(false)
    setPicked(null)
  }, [episode])

  // THE MATCH ENDING IS A DIFFERENT BOUNDARY, and the held card belongs to it
  // rather than to the one above. What the beat asked us to hold outlives the
  // pending on purpose — the pending clears the moment the engine answers and
  // the card goes on standing while the beat plays the outcome — so clearing it
  // whenever an episode ends would take the card off the table mid-scene.
  //
  // Only the beat's own callback releases it, which is right while a beat is
  // running and nothing at all when one is cut short: a match ending mid-hold
  // left the request's catalogue standing, and it was still standing in the
  // next match.
  // biome-ignore lint/correctness/useExhaustiveDependencies: the match is the boundary and the only dependency this may have
  useEffect(() => {
    setHeld(null)
  }, [matchKey])

  // THE DEFENDER'S OWN HAND, held out closed — for a named request as much as
  // for a blind pick. The blind pick makes you choose a position in it; a named
  // request does not, but it is the same hand and the card asked for comes OUT
  // of it, which is the whole of what the table watches (`PickSpecificCardStory`).
  const target = pending && 'target' in pending ? pending.target : null
  const fanCount =
    pending?.kind === 'stealCard'
      ? pending.count
      : (asking || watching) && target !== state.selfId
        ? (state.opponents.find((o) => o.id === target)?.handCount ?? 0)
        : 0
  const fanUp = fanCount > 0
  // IT LEAVES THE WAY IT CAME. The slide lives on the node, so the node has to
  // still be there to play it: mounted while the fan is wanted, and kept for
  // the length of the slide after it stops being wanted. Without this the
  // pending cleared, the whole thing unmounted, and a fan that had come down
  // over half a second simply stopped existing.
  const [fanMounted, setFanMounted] = useState(false)
  const fanSize = useRef(0)
  if (fanCount > 0) fanSize.current = fanCount
  useEffect(() => {
    if (fanUp) {
      setFanMounted(true)
      return
    }
    const t = window.setTimeout(() => setFanMounted(false), FAN_MS)
    return () => window.clearTimeout(t)
  }, [fanUp])

  useEffect(() => {
    if (!fanUp) {
      setShown(false)
      return
    }
    let second = 0
    const first = requestAnimationFrame(() => {
      second = requestAnimationFrame(() => setShown(true))
    })
    return () => {
      cancelAnimationFrame(first)
      cancelAnimationFrame(second)
    }
  }, [fanUp])

  // …and it is told, so the table watches the choosing and not only its result.
  // Cleared when the surface goes: a mark left standing on a card nobody is
  // naming any more is worse than none.
  const sentRef = useRef<string | null>(null)
  const sendPreview = args.onPickPreview
  useEffect(() => {
    if (!sendPreview) return
    const card = asking ? named : null
    if (sentRef.current === card) return
    sentRef.current = card
    sendPreview(card)
  }, [sendPreview, asking, named])

  // Restored legacy snapshots may still owe a giveCard. Copies are equivalent:
  // resolve the first matching card without a donor decision or gesture.
  useEffect(() => {
    if (
      !enabled ||
      !giving ||
      pending?.kind !== 'giveCard' ||
      locked.current ||
      !actions?.onResolve
    )
      return
    const card = state.you.hand.find((item) => item.card.id === pending.requested)
    if (!card) return
    locked.current = true
    resolve({ kind: 'giveCard', card: card.uid })
  }, [enabled, giving, pending, state.you.hand, actions?.onResolve, resolve])

  // A position is taken by CLICKING it, the scene's own gesture: the fan goes
  // back up and the card leaves for you on its own. `rect` is where it stood
  // when it was clicked — the flight out of the fan starts there.
  const pickBack = (index: number, rect?: DOMRect) => {
    if (
      !enabled ||
      !stealing ||
      pending?.kind !== 'stealCard' ||
      locked.current ||
      index >= pending.count
    )
      return false
    locked.current = true
    if (rect) setPicked({ index, rect })
    setConfirmed(true)
    resolve({ kind: 'stealCard', index })
    return true
  }
  return {
    band:
      asking || watching != null || stealing || held != null ? (
        <div
          className={`${styles.requestBand} ${confirmed ? styles.flight : ''}`}
          data-testid="board-request-band"
          ref={band}
        >
          {/* THE DIMMING BELONGS TO THE CHOOSING. Keyed on `confirmed` alone it
              came BACK: that flag resets the moment the pending it belonged to
              goes, and the surface is still up then — the beat is holding it
              through the outcome — so the scrim switched on again over a choice
              that had already been made. `held` is the beat's hold, and while
              it is on there is nothing left to choose. */}
          {!confirmed && held == null && (
            <div className={styles.scrim} data-testid="board-request-scrim" />
          )}
          {(Boolean(asking) || watching != null || held != null) && (
            <>
              <div className={styles.catalogPreview} ref={catalogPreview} />
              <div className={styles.catalog}>
                {/* A CARD IS NAMED BY CLICKING IT — the scene's own gesture
                    (`PickSpecificCardStory`, `OpponentTakesCardStory`, both of
                    which call this catalogue exactly like this) and what the
                    audit register describes: the pick is armed by a click and
                    committed through `ConfirmAction`. Handing it an `onDrop`
                    flipped the whole catalogue into its drag form, where a
                    click does nothing at all and `onPick` survives only for the
                    keyboard — so the choice was there and could not be made. */}
                <CardCatalog
                  cards={HOLDABLE}
                  previewRoot={catalogPreview}
                  previewSelected={watching != null}
                  open={enabled && !confirmed && held == null}
                  selected={asking ? named : watchedName}
                  chosen={held ?? (confirmed ? named : null)}
                  // only the seat that can answer may name one
                  onPick={asking ? (card) => setNamed(card.id) : undefined}
                />
              </div>
              {asking && (
                <ConfirmAction
                  open={!confirmed}
                  label={copy.confirm}
                  caption={copy.prompt}
                  disabled={!enabled || named == null}
                  onConfirm={() => {
                    if (
                      !enabled ||
                      locked.current ||
                      !named ||
                      !HOLDABLE.some((c) => c.id === named)
                    )
                      return
                    locked.current = true
                    setConfirmed(true)
                    resolve({ kind: 'requestCard', card: named })
                  }}
                />
              )}
            </>
          )}
          {fanMounted && (
            <div
              className={styles.offer}
              ref={fan}
              data-testid="board-transfer-offer"
              // the blind pick's fan leaves the moment a position is taken; a
              // named request's stays until the card has actually come out of
              // it, which is the beat's `release`
              data-in={shown && (stealing ? !confirmed : true)}
            >
              {/* THE OPPONENT'S OWN HAND, held out to you — the same `Hand`,
                  backs up, turned to face you. Not a fan re-laid by hand: the
                  arc, the lift under the cursor and the neighbours parting are
                  the hand's, and a copy of its geometry drifted from it (the
                  places used to be mirrored vertically but not horizontally,
                  which straightened the arc into a line). The slide down from
                  above the screen lives on the outer box and the 180° turn on
                  the inner one, exactly as `PickOpponentCardStory` does it.

                  A position is taken by CLICKING it, and `data-transfer-choice`
                  stays on the card box the transfer beat measures. */}
              <div className={styles.offerInner}>
                <Hand
                  items={Array.from({ length: fanSize.current }, (_, index) => ({
                    uid: String(index),
                    card: BACK,
                  }))}
                  faceDown
                  // a named request only SHOWS this hand: nothing in it is
                  // being chosen, so it does not answer the cursor
                  readOnly={!stealing}
                  onCardClick={
                    stealing && enabled && !confirmed
                      ? (index, el) => pickBack(index, el.getBoundingClientRect())
                      : undefined
                  }
                  renderFace={(item, ctx) => {
                    const index = Number(item.uid)
                    return (
                      <div
                        data-transfer-choice={index}
                        // the one the named card comes out of — the middle of
                        // the fan, so it is seen leaving rather than slipping
                        // off an edge. The fan is anonymous backs, so which
                        // place it is says nothing about which card it was.
                        {...(index === Math.floor(fanSize.current / 2)
                          ? { 'data-request-slot': '' }
                          : {})}
                        className={styles.offerCard}
                      >
                        {picked?.index === index ? null : (
                          <Card
                            card={item.card}
                            faceDown={ctx.faceDown}
                            interactive={false}
                            tilt={ctx.tilt}
                            width={ctx.width}
                          />
                        )}
                      </div>
                    )
                  }}
                />
              </div>
            </div>
          )}
          {stealing && !confirmed && (
            <Typography className={styles.hint} base="label-sm" tk="tk-16">
              {copy.steal}
            </Typography>
          )}
          {picked && (
            <div
              className={styles.picked}
              data-transfer-picked
              style={{ left: picked.rect.left, top: picked.rect.top, width: picked.rect.width }}
            >
              <Card card={BACK} faceDown width="100%" interactive={false} />
            </div>
          )}
        </div>
      ) : null,
  }
}
