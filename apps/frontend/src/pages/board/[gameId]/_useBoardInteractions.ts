import type { TableActions } from '@release/ui'
import { useCallback } from 'react'
import type { BoardState } from '~/entities/game/board/types'

export interface Options {
  state: Pick<BoardState, 'selfId' | 'you' | 'playable' | 'frozen' | 'window' | 'targets'>
  actions?: TableActions
}

// Click gestures for the table: only the plays a click can COMPLETE. A window
// attack (the window names the release) and a no-target play dispatch at once.
// A card that needs a target is played by pulling it out of the fan — the
// staging gesture (_useBoardStaging) owns that, and combo pairing moves there
// with #100.
export function useBoardInteractions({ state, actions }: Options) {
  const onCardClick = useCallback(
    (index: number) => {
      const item = state.you.hand[index]
      if (!item) return

      // The window's attack affordance reuses the hand: gated by
      // `canAttackWith`, not `playable`; no combo, no target.
      const attackable = state.window?.canAttackWith ?? []
      if (attackable.length > 0) {
        if (!attackable.includes(item.uid)) return
        actions?.onAttack?.(item.uid, undefined)
        return
      }

      if (!state.playable.includes(item.uid)) return
      // A card with targets is pulled, not clicked (the staging gesture).
      if ((state.targets?.[item.uid] ?? []).length > 0) return
      actions?.onPlay?.(item.uid, undefined, undefined)
    },
    [state.you.hand, state.playable, state.window, state.targets, actions],
  )

  return { onCardClick }
}
