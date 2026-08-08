import { type ReactNode, useEffect, useState } from 'react'
import { CARDS } from '@/cards'
import type { Card as CardType } from '@/cards/types'
import Button from '@/primitives/Button'
import Card from '@/primitives/Card'
import Typography from '@/primitives/Typography'
import type { ConfirmActionProps } from '@/table/ConfirmAction'
import ConfirmAction from '@/table/ConfirmAction'
import type { HandItem } from '@/table/Hand/Hand'
import type { NeutralizeMethodId, TableChoice, TablePending } from '../intents'
import styles from './PendingPrompt.module.css'

// One prompt string plus one action label per TablePending kind, plus the two
// strings shared by every kind (the ConfirmAction button, and defend's
// explicit decline). Task 15 wires this into the translation catalogs; this
// component only declares the shape — its tests supply literals.
export interface PendingPromptCopy {
  confirm: string
  decline: string
  discardForRelease: { prompt: string; action: string }
  defend: { prompt: string; action: string }
  neutralize503: { prompt: string; action: string }
  crush: { prompt: string; action: string }
  requestCard: { prompt: string; action: string }
  giveCard: { prompt: string; action: string }
  handLimit: { prompt: string; action: string }
  // Git Cherry-pick's discard pick. No case in the switch below yet renders
  // it — that is a later task — but the copy contract must stay total over
  // every TablePending kind, since `copy[pending.kind]` indexes it.
  pickFromDiscard: { prompt: string; action: string }
}

export interface PendingPromptProps {
  pending: TablePending
  hand: HandItem[]
  copy: PendingPromptCopy
  onResolve: (choice: TableChoice) => void
}

// Copy for the reaction window's own affordance — the unpass button shown
// once you've already passed on it (TurnDock has no notion of "unpass").
export interface WindowCopy {
  unpass: string
}

// Hardcoded, catalogue-independent labels for the one closed enum a pending
// may offer that isn't a card — NeutralizeMethodId. Not a card property, so
// reading it is not "inspecting card tags/categories" — it mirrors
// ReleaseZone's own SLOTS labels (ReleaseZone.tsx), which are plain English
// for the same reason.
const METHOD_LABEL: Record<NeutralizeMethodId, string> = {
  debugger: 'Debugger',
  monitoring: 'Monitoring',
  sacrifice: 'Sacrifice',
}

// A selectable card, resolved against `hand` — never against the catalogue.
// A uid the hand doesn't carry (stale pending mid-transition) silently drops.
function CardOption({
  uid,
  hand,
  selected,
  onClick,
}: {
  uid: string
  hand: HandItem[]
  selected: boolean
  onClick: () => void
}) {
  const item = hand.find((h) => h.uid === uid)
  if (!item) return null
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={styles.option}
      onClick={onClick}
    >
      <Card
        card={item.card}
        interactive={false}
        width={104}
        state={selected ? 'selected' : 'idle'}
      />
    </button>
  )
}

// A selectable card TYPE from the kit's own catalogue — used only by
// `requestCard`, where the choice names a card the opponent might hold, not
// one you own. This is not a legality lookup: `requestCard`'s `Choice` is a
// bluff (Security Bug names a card type the opponent might hold —
// packages/engine/src/actions.ts:16), so there is no engine answer to defer
// to and no `pending.options` to defer against. Reading the catalogue here is
// how the UI presents the guess space, not how it decides what is legal.
function CatalogueCardOption({
  card,
  selected,
  onClick,
}: {
  card: CardType
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={styles.option}
      onClick={onClick}
    >
      <Card card={card} interactive={false} width={72} state={selected ? 'selected' : 'idle'} />
    </button>
  )
}

// A selectable plain-text option (a neutralize/crush method) — same option
// semantics as CardOption, no card face to show.
function TextOption({
  label,
  selected,
  onClick,
}: {
  label: string
  selected: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      className={`${styles.option} ${styles.textOption} ${selected ? styles.textOptionSelected : ''}`}
      onClick={onClick}
    >
      <Typography base="label-md" tk="tk-10">
        {label}
      </Typography>
    </button>
  )
}

// The engine demands a decision (a pending owed by you). One component,
// switching on `pending.kind` — every kind resolves through the same
// ConfirmAction bar; `defend` alone also offers an explicit decline (the
// contract's "I could block this and I choose not to", never a cancel).
//
// Legality is always the engine's answer: every option rendered below comes
// from `pending.options` / `pending.methods`, resolved against `hand`. The
// one exception is `requestCard`, which is a bluff rather than a legal move —
// see CatalogueCardOption above for why reading the catalogue there is not a
// legality decision.
export default function PendingPrompt({ pending, hand, copy, onResolve }: PendingPromptProps) {
  // Reset selection when the pending itself changes (a new kind/player, not a
  // referential change to the same one — TableState is rebuilt from scratch on
  // every projection update, so `pending` is rarely `===` across renders even
  // when it describes the same outstanding decision).
  const fingerprint = `${pending.kind}:${pending.player}`
  const [card, setCard] = useState<string | null>(null)
  const [cards, setCards] = useState<string[]>([])
  const [method, setMethod] = useState<NeutralizeMethodId | null>(null)
  const [requestedCard, setRequestedCard] = useState<string | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint is the re-arm trigger, not read inside
  useEffect(() => {
    setCard(null)
    setCards([])
    setMethod(null)
    setRequestedCard(null)
  }, [fingerprint])

  const kindCopy = copy[pending.kind]
  let complete = false
  let confirm: () => void = () => {}
  let options: ReactNode = null

  switch (pending.kind) {
    case 'discardForRelease': {
      // `complete` (and the confirm dispatch itself) checks membership in
      // *this render's* pending.options, not merely "is something selected".
      // A selection made against an earlier pending of the same kind/player
      // survives the fingerprint reset (same fingerprint → no reset), so
      // without this check a stale `card` the current pending never offered
      // could still confirm — membership makes that structurally impossible
      // regardless of how the stale value got into state.
      complete = card != null && pending.options.includes(card)
      confirm = () => {
        if (card && pending.options.includes(card)) onResolve({ kind: 'discardForRelease', card })
      }
      options = pending.options.map((uid) => (
        <CardOption
          key={uid}
          uid={uid}
          hand={hand}
          selected={card === uid}
          onClick={() => setCard(uid)}
        />
      ))
      break
    }
    case 'defend': {
      complete = card != null && pending.options.includes(card)
      confirm = () => {
        if (card && pending.options.includes(card)) onResolve({ kind: 'defend', card })
      }
      options = pending.options.map((uid) => (
        <CardOption
          key={uid}
          uid={uid}
          hand={hand}
          selected={card === uid}
          onClick={() => setCard(uid)}
        />
      ))
      break
    }
    case 'giveCard': {
      // The pending carries no `options` — only `requested`, the id of the
      // card type asked for. Matching hand items by id equality is not
      // "inspecting tags/categories": it is comparing the exact identifier
      // the engine already handed us. `offered` (hand uids) is what confirm
      // checks membership against — resolving with `card`, a hand uid, never
      // with `pending.requested`, the catalogue id being matched against.
      const offered = hand.filter((h) => h.card.id === pending.requested).map((h) => h.uid)
      complete = card != null && offered.includes(card)
      confirm = () => {
        if (card && offered.includes(card)) onResolve({ kind: 'giveCard', card })
      }
      options = offered.map((uid) => (
        <CardOption
          key={uid}
          uid={uid}
          hand={hand}
          selected={card === uid}
          onClick={() => setCard(uid)}
        />
      ))
      break
    }
    case 'handLimit': {
      complete =
        cards.length === pending.excess && cards.every((uid) => pending.options.includes(uid))
      confirm = () => {
        if (complete) onResolve({ kind: 'handLimit', cards })
      }
      options = pending.options.map((uid) => (
        <CardOption
          key={uid}
          uid={uid}
          hand={hand}
          selected={cards.includes(uid)}
          onClick={() =>
            setCards((cur) =>
              cur.includes(uid)
                ? cur.filter((c) => c !== uid)
                : cur.length < pending.excess
                  ? [...cur, uid]
                  : cur,
            )
          }
        />
      ))
      break
    }
    case 'neutralize503': {
      complete = method != null && pending.methods.includes(method)
      confirm = () => {
        if (method && pending.methods.includes(method)) onResolve({ kind: 'neutralize503', method })
      }
      options = pending.methods.map((m) => (
        <TextOption
          key={m}
          label={METHOD_LABEL[m]}
          selected={method === m}
          onClick={() => setMethod(m)}
        />
      ))
      break
    }
    case 'crush': {
      complete = method != null && pending.methods.includes(method)
      confirm = () => {
        if (method && pending.methods.includes(method)) onResolve({ kind: 'crush', method })
      }
      options = pending.methods.map((m) => (
        <TextOption
          key={m}
          label={METHOD_LABEL[m]}
          selected={method === m}
          onClick={() => setMethod(m)}
        />
      ))
      break
    }
    case 'requestCard': {
      // The pending names who's being asked (`target`), not what may be
      // asked for — there is no `pending.options` because this is a guess,
      // not a legal move (see the module comment on CatalogueCardOption). The
      // guess space is every distinct card type the kit's catalogue knows —
      // 37 definitions, not the ~125-card physical deck (which counts
      // per-copy quantities the catalogue collapses into one entry each).
      // The catalogue is static, so membership here can't go stale the way
      // pending.options can — checked anyway, for the same structural reason
      // as every other kind: confirm should never resolve an option that
      // isn't actually on offer.
      complete = requestedCard != null && CARDS.some((c) => c.id === requestedCard)
      confirm = () => {
        if (requestedCard && CARDS.some((c) => c.id === requestedCard)) {
          onResolve({ kind: 'requestCard', card: requestedCard })
        }
      }
      options = CARDS.map((c) => (
        <CatalogueCardOption
          key={c.id}
          card={c}
          selected={requestedCard === c.id}
          onClick={() => setRequestedCard(c.id)}
        />
      ))
      break
    }
    case 'pickFromDiscard': {
      // Renders nothing yet — this pending's own prompt UI is a later task.
      // `complete` stays false, so ConfirmAction stays disabled rather than
      // silently confirming an empty choice.
      break
    }
  }

  const confirmProps: ConfirmActionProps = {
    open: true,
    label: copy.confirm,
    disabled: !complete,
    onConfirm: confirm,
    caption: kindCopy.action,
  }

  return (
    <div className={styles.prompt}>
      <div className={styles.panel}>
        <Typography as="div" base="label-md" tk="tk-10" className={styles.heading}>
          {kindCopy.prompt}
        </Typography>
        <div
          className={`${styles.options} ${pending.kind === 'requestCard' ? styles.optionsScroll : ''}`}
        >
          {options}
        </div>
      </div>

      {pending.kind === 'defend' && (
        <Button
          variant="tech"
          className={styles.decline}
          onClick={() => onResolve({ kind: 'defend', card: null })}
        >
          {copy.decline}
        </Button>
      )}

      <ConfirmAction {...confirmProps} />
    </div>
  )
}
