import { useCallback, useMemo, useState } from 'react'
import type { TableActions, TableTarget } from './intents'
import type { TableState } from './types'

export type Phase = 'idle' | 'selected' | 'comboPending'

interface Options {
  state: Pick<TableState, 'selfId' | 'you' | 'playable' | 'frozen'>
  actions?: TableActions
}

// Order-sensitive, but targets are always built by the same code path (the
// engine's legalTargets), so key order matches by construction.
const sameTarget = (a: TableTarget, b: TableTarget) =>
  a.kind === b.kind && JSON.stringify(a) === JSON.stringify(b)

// Gesture state for the table: which card is selected, what its legal targets
// are, and how a click resolves into a completed intent. Legality is always
// the engine's answer (state.playable, actions.legalTargets) — this hook never
// inspects card tags, categories, or the catalogue.
export function useTableInteractions({ state, actions }: Options) {
  const [selected, setSelected] = useState<string | null>(null)

  const targets = useMemo(
    () => (selected ? (actions?.legalTargets?.(selected) ?? []) : []),
    [selected, actions],
  )

  const phase: Phase = selected ? 'selected' : 'idle'

  const cancel = useCallback(() => setSelected(null), [])

  const onCardClick = useCallback(
    (index: number) => {
      const item = state.you.hand[index]
      if (!item || !state.playable.includes(item.uid)) return
      const legal = actions?.legalTargets?.(item.uid) ?? []
      if (legal.length === 0) {
        actions?.onPlay?.(item.uid, undefined, undefined)
        setSelected(null)
        return
      }
      setSelected(item.uid)
    },
    [state.you.hand, state.playable, actions],
  )

  const onTargetPick = useCallback(
    (target: TableTarget) => {
      if (!selected) return
      if (!targets.some((t) => sameTarget(t, target))) return
      actions?.onPlay?.(selected, target, undefined)
      setSelected(null)
    },
    [selected, targets, actions],
  )

  const accentAt = useCallback(
    (index: number) => (state.you.hand[index]?.uid === selected ? 'var(--turn-accent)' : undefined),
    [state.you.hand, selected],
  )

  return { phase, selected, comboWith: null, targets, accentAt, onCardClick, onTargetPick, cancel }
}
