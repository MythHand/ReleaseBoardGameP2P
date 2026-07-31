import { useCallback, useMemo, useState } from 'react'
import type { TableActions, TableTarget } from './intents'
import type { TableState } from './types'

export type Phase = 'idle' | 'selected' | 'comboPending'

interface Options {
  state: Pick<TableState, 'selfId' | 'you' | 'playable' | 'frozen'>
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
export function useTableInteractions({ state, actions, comboOptions }: Options) {
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
      if (!item || !state.playable.includes(item.uid)) return

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

      const partners = comboOptions?.(item.uid) ?? []
      if (partners.length > 0) {
        setSelected(item.uid)
        setAwaitingCombo(true)
        return
      }

      const legal = actions?.legalTargets?.(item.uid) ?? []
      if (legal.length === 0) {
        actions?.onPlay?.(item.uid, undefined, undefined)
        setSelected(null)
        return
      }
      setSelected(item.uid)
    },
    [state.you.hand, state.playable, actions, awaitingCombo, selected, comboOptions, reset],
  )

  const onTargetPick = useCallback(
    (target: TableTarget) => {
      if (!selected) return
      if (!targets.some((t) => sameTarget(t, target))) return
      actions?.onPlay?.(selected, target, combo ?? undefined)
      reset()
    },
    [selected, targets, actions, combo, reset],
  )

  const accentAt = useCallback(
    (index: number) => (state.you.hand[index]?.uid === selected ? 'var(--turn-accent)' : undefined),
    [state.you.hand, selected],
  )

  return { phase, selected, comboWith: combo, targets, accentAt, onCardClick, onTargetPick, cancel }
}
