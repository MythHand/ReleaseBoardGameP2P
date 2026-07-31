import { type ReactNode, useEffect, useState } from 'react'
import Button from '@/primitives/Button'
import Card from '@/primitives/Card'
import Typography from '@/primitives/Typography'
import type { ConfirmActionProps } from '@/table/ConfirmAction'
import ConfirmAction from '@/table/ConfirmAction'
import type { HandItem } from '@/table/Hand/Hand'
import type { NeutralizeMethodId, ReleaseSlotId, TableChoice, TablePending } from '../intents'
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

// Hardcoded, catalogue-independent labels for the two closed enums a pending
// may offer — NeutralizeMethodId and ReleaseSlotId. Neither is a card
// property, so reading them is not "inspecting card tags/categories" — it
// mirrors ReleaseZone's own SLOTS labels (ReleaseZone.tsx), which are plain
// English for the same reason.
const METHOD_LABEL: Record<NeutralizeMethodId, string> = {
  debugger: 'Debugger',
  monitoring: 'Monitoring',
  sacrifice: 'Sacrifice',
}

const SLOT_LABEL: Record<ReleaseSlotId, string> = {
  frontend: 'Frontend',
  backend: 'Backend',
  database: 'Database',
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

// A selectable plain-text option (a neutralize/crush method, a release-slot
// card type) — same option semantics as CardOption, no card face to show.
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
// from `pending.options` / `pending.methods`, resolved against `hand` — this
// component never inspects card tags, categories, or the catalogue.
export default function PendingPrompt({ pending, hand, copy, onResolve }: PendingPromptProps) {
  // Reset selection when the pending itself changes (a new kind/player, not a
  // referential change to the same one — TableState is rebuilt from scratch on
  // every projection update, so `pending` is rarely `===` across renders even
  // when it describes the same outstanding decision).
  const fingerprint = `${pending.kind}:${pending.player}`
  const [card, setCard] = useState<string | null>(null)
  const [cards, setCards] = useState<string[]>([])
  const [method, setMethod] = useState<NeutralizeMethodId | null>(null)
  const [slot, setSlot] = useState<ReleaseSlotId | null>(null)
  // biome-ignore lint/correctness/useExhaustiveDependencies: fingerprint is the re-arm trigger, not read inside
  useEffect(() => {
    setCard(null)
    setCards([])
    setMethod(null)
    setSlot(null)
  }, [fingerprint])

  const kindCopy = copy[pending.kind]
  let complete = false
  let confirm: () => void = () => {}
  let options: ReactNode = null

  switch (pending.kind) {
    case 'discardForRelease': {
      complete = card != null
      confirm = () => card && onResolve({ kind: 'discardForRelease', card })
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
      complete = card != null
      confirm = () => card && onResolve({ kind: 'defend', card })
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
      complete = card != null
      confirm = () => card && onResolve({ kind: 'giveCard', card })
      // The pending carries no `options` — only `requested`, the id of the
      // card type asked for. Matching hand items by id equality is not
      // "inspecting tags/categories": it is comparing the exact identifier
      // the engine already handed us.
      const offered = hand.filter((h) => h.card.id === pending.requested).map((h) => h.uid)
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
      complete = cards.length === pending.excess
      confirm = () => onResolve({ kind: 'handLimit', cards })
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
      complete = method != null
      confirm = () => method && onResolve({ kind: 'neutralize503', method })
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
      complete = method != null
      confirm = () => method && onResolve({ kind: 'crush', method })
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
      complete = slot != null
      confirm = () => slot && onResolve({ kind: 'requestCard', card: slot })
      options = (Object.keys(SLOT_LABEL) as ReleaseSlotId[]).map((s) => (
        <TextOption
          key={s}
          label={SLOT_LABEL[s]}
          selected={slot === s}
          onClick={() => setSlot(s)}
        />
      ))
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
        <div className={styles.options}>{options}</div>
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
