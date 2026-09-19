import type { Event } from '@release/engine'
import type { HandPlayDrop, TableActions } from '@release/ui'
import { CARDS, Card, CardCatalog, ConfirmAction, Hand, Typography } from '@release/ui'
import { useEffect, useRef, useState } from 'react'
import type { BoardState } from '~/entities/game/board'
import styles from './_useRequestStaging.module.css'
import { useResolveFeedback } from './_useResolveFeedback'

// Only catalogue identities live here. A closed offer is made from anonymous
// positions, never the target's hand or the engine's private shuffled UIDs.
const HOLDABLE = CARDS.filter((c) => c.deck === 'base' && c.category !== 'trigger')
const BACK = HOLDABLE[0]

export function useRequestStaging(args: {
  state: BoardState
  events?: Event[]
  actions?: TableActions
  copy: { prompt: string; action: string; confirm: string; steal: string }
  enabled: boolean
  matchKey: string | null
}) {
  const { state, actions, copy, enabled, matchKey } = args
  const pending = state.pending
  const ours = pending && 'player' in pending && pending.player === state.selfId
  const asking = ours && pending?.kind === 'requestCard'
  const giving = Boolean(ours && pending?.kind === 'giveCard')
  const stealing = ours && pending?.kind === 'stealCard'
  const episode =
    pending && 'player' in pending && (asking || giving || stealing)
      ? `${matchKey}:${pending.kind}:${pending.player}:${'openedAt' in pending ? pending.openedAt : ''}:${'requested' in pending ? pending.requested : ''}`
      : null
  const [named, setNamed] = useState<string | null>(null)
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
  const fan = useRef<HTMLDivElement>(null)
  const resolve = useResolveFeedback(args.events ?? [], state.selfId, actions, () => {
    locked.current = false
    setConfirmed(false)
    setPicked(null)
  })
  // biome-ignore lint/correctness/useExhaustiveDependencies: reset exactly at a decision boundary, not when animation gating changes
  useEffect(() => {
    locked.current = false
    setNamed(null)
    setConfirmed(false)
    setPicked(null)
  }, [episode])

  useEffect(() => {
    if (!stealing) {
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
  }, [stealing])

  const insideTable = (drop: HandPlayDrop) => {
    const box = band.current?.parentElement?.getBoundingClientRect()
    return (
      !box ||
      (drop.x >= box.left && drop.x <= box.right && drop.y >= box.top && drop.y <= box.bottom)
    )
  }
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
      asking || stealing ? (
        <div className={styles.requestBand} data-testid="board-request-band" ref={band}>
          {asking && (
            <>
              <div className={styles.catalog}>
                <CardCatalog
                  cards={HOLDABLE}
                  open={enabled && !confirmed}
                  selected={named}
                  chosen={confirmed ? named : null}
                  onPick={(card) => setNamed(card.id)}
                  onDrop={(card, drop) => {
                    if (!enabled || confirmed || !insideTable(drop)) return false
                    setNamed(card.id)
                    return true
                  }}
                />
              </div>
              <ConfirmAction
                open={!confirmed}
                label={copy.confirm}
                caption={copy.prompt}
                disabled={!enabled || named == null}
                onConfirm={() => {
                  if (!enabled || locked.current || !named || !HOLDABLE.some((c) => c.id === named))
                    return
                  locked.current = true
                  setConfirmed(true)
                  resolve({ kind: 'requestCard', card: named })
                }}
              />
            </>
          )}
          {stealing && pending?.kind === 'stealCard' && (
            <div
              className={styles.offer}
              ref={fan}
              data-testid="board-transfer-offer"
              data-in={shown && !confirmed}
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
                  items={Array.from({ length: pending.count }, (_, index) => ({
                    uid: String(index),
                    card: BACK,
                  }))}
                  faceDown
                  onCardClick={
                    enabled && !confirmed
                      ? (index, el) => pickBack(index, el.getBoundingClientRect())
                      : undefined
                  }
                  renderFace={(item, ctx) => {
                    const index = Number(item.uid)
                    return (
                      <div data-transfer-choice={index} className={styles.offerCard}>
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
