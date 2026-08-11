import type { TableActions, TableTarget } from '@release/ui'
import { useCallback, useMemo, useState } from 'react'
import type { BoardState } from '~/entities/game/board/types'

export type Phase = 'idle' | 'selected' | 'comboPending'

export interface Options {
  state: Pick<BoardState, 'selfId' | 'you' | 'playable' | 'frozen' | 'window'>
  actions?: TableActions
  // Legality of a combo pairing is the engine's answer — this hook never
  // inspects card tags, categories, or the catalogue to decide pairing.
  comboOptions?: (card: string) => string[]
}

// Structural, order-independent — a click site building a target object with
// its fields in a different literal order than legalTargets() must still
// compare equal. The switch on `kind` gets exhaustiveness checking from
// TableTarget's union: a new variant that isn't handled here is a type error.
const sameTarget = (a: TableTarget, b: TableTarget): boolean => {
  if (a.kind !== b.kind) return false
  switch (a.kind) {
    case 'player':
      return b.kind === 'player' && a.player === b.player
    case 'release':
      return b.kind === 'release' && a.player === b.player && a.slot === b.slot
    case 'monitoring':
      return b.kind === 'monitoring' && a.player === b.player
    case 'card':
      return b.kind === 'card' && a.card === b.card
  }
}

// Gesture state for the table: which card is selected, what its legal targets
// are, and how a click resolves into a completed intent. Legality is always
// the engine's answer (state.playable, actions.legalTargets) — this hook never
// inspects card tags, categories, or the catalogue.
export function useBoardInteractions({ state, actions, comboOptions }: Options) {
  const [selected, setSelected] = useState<string | null>(null)
  const [combo, setCombo] = useState<string | null>(null)
  const [awaitingCombo, setAwaitingCombo] = useState(false)

  const targets = useMemo(
    () => (selected ? (actions?.legalTargets?.(selected) ?? []) : []),
    [selected, actions],
  )

  const phase: Phase = awaitingCombo ? 'comboPending' : selected ? 'selected' : 'idle'

  // Clears all three pieces of gesture state at once — a combo mid-pick left
  // half-resolved (e.g. by Escape) must not strand `selected`/`awaitingCombo`.
  const reset = useCallback(() => {
    setSelected(null)
    setCombo(null)
    setAwaitingCombo(false)
  }, [])

  const cancel = useCallback(() => reset(), [reset])

  const onCardClick = useCallback(
    (index: number) => {
      const item = state.you.hand[index]
      if (!item) return

      // The window's attack affordance reuses the hand: while a window is
      // open and offers attackers, the card that opens it is gated by
      // `canAttackWith`, not `playable`, and dispatches onAttack instead of
      // onPlay — no combo, no target, the window itself names the release.
      const attackable = state.window?.canAttackWith ?? []
      if (attackable.length > 0) {
        if (!attackable.includes(item.uid)) return
        actions?.onAttack?.(item.uid, undefined)
        reset()
        return
      }

      if (!state.playable.includes(item.uid)) return

      if (awaitingCombo && selected) {
        const partners = comboOptions?.(selected) ?? []
        if (!partners.includes(item.uid)) return
        const legal = actions?.legalTargets?.(selected) ?? []
        if (legal.length === 0) {
          actions?.onPlay?.(selected, undefined, item.uid)
          reset()
          return
        }
        setCombo(item.uid)
        setAwaitingCombo(false)
        return
      }

      // Every branch below starts a fresh selection, not a continuation of an
      // active combo — a `combo` chosen for a previous source must never
      // survive to be attached to a different card's dispatch (invariant: a
      // combo partner may only exist while its own source is selected).
      const partners = comboOptions?.(item.uid) ?? []
      if (partners.length > 0) {
        setSelected(item.uid)
        setCombo(null)
        setAwaitingCombo(true)
        return
      }

      const legal = actions?.legalTargets?.(item.uid) ?? []
      if (legal.length === 0) {
        actions?.onPlay?.(item.uid, undefined, undefined)
        reset()
        return
      }
      setSelected(item.uid)
      setCombo(null)
    },
    [
      state.you.hand,
      state.playable,
      state.window,
      actions,
      awaitingCombo,
      selected,
      comboOptions,
      reset,
    ],
  )

  const onTargetPick = useCallback(
    (target: TableTarget) => {
      if (!selected) return
      // A target can only resolve a source that already has its combo
      // decided (or needs none) — while a partner is still outstanding,
      // `targets` may be populated from `selected` but nothing is playable.
      if (awaitingCombo) return
      if (!targets.some((t) => sameTarget(t, target))) return
      actions?.onPlay?.(selected, target, combo ?? undefined)
      reset()
    },
    [selected, targets, actions, combo, reset, awaitingCombo],
  )

  const accentAt = useCallback(
    (index: number) => (state.you.hand[index]?.uid === selected ? 'var(--turn-accent)' : undefined),
    [state.you.hand, selected],
  )

  return { phase, selected, comboWith: combo, targets, accentAt, onCardClick, onTargetPick, cancel }
}
