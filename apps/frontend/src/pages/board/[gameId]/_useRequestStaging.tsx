import type { Event } from '@release/engine'
import type { HandPlayDrop, TableActions } from '@release/ui'
import {
  CARDS,
  Card,
  CardCatalog,
  CardPull,
  ConfirmAction,
  slotPlacement,
  Typography,
} from '@release/ui'
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
  const locked = useRef(false)
  const band = useRef<HTMLDivElement>(null)
  const catalogPreview = useRef<HTMLDivElement>(null)
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

  const pickBack = (index: number, drop?: HandPlayDrop) => {
    if (
      !enabled ||
      !stealing ||
      pending?.kind !== 'stealCard' ||
      locked.current ||
      index >= pending.count
    )
      return false
    const box = fan.current?.getBoundingClientRect()
    if (drop && (!insideTable(drop) || (box && drop.y < box.bottom - 32))) return false
    locked.current = true
    if (drop?.rect) setPicked({ index, rect: drop.rect })
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
                  previewRoot={catalogPreview}
                  open={enabled && !confirmed}
                  selected={named}
                  chosen={confirmed ? named : null}
                  onPick={(card) => setNamed(card.id)}
                />
              </div>
              <div className={styles.catalogPreview} ref={catalogPreview} />
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
              data-in={!confirmed}
            >
              {Array.from({ length: pending.count }, (_, index) => {
                const place = slotPlacement(index, pending.count)
                return (
                  <div
                    // biome-ignore lint/suspicious/noArrayIndexKey: anonymous positions are the stable identity of a closed offer
                    key={index}
                    data-transfer-choice={index}
                    className={styles.offerCard}
                    style={{
                      transform: `translateX(-50%) translateX(${place.x}px) translateY(${-place.y}px) rotate(${180 + place.rotate}deg)`,
                      zIndex: place.z,
                      visibility: picked?.index === index ? 'hidden' : undefined,
                    }}
                  >
                    <CardPull
                      card={BACK}
                      faceDown
                      label={`${copy.steal} ${index + 1}`}
                      disabled={!enabled || confirmed}
                      onDrop={(drop) => pickBack(index, drop)}
                      onKeyboardPick={() => pickBack(index)}
                    />
                  </div>
                )
              })}
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
