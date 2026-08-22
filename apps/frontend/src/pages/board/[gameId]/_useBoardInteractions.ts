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
//
// BY UID, NOT BY INDEX (#101, Fix D round 2). `Hand` gives out an index into the
// array it RENDERS, which is the staging hook's `handItems` — `you.hand` minus
// whatever is staged and minus the release a cost pending names. This hook
// indexed `you.hand` with it, and the two agree only while nothing is staged: the
// moment anything is, every index past the hidden card points one card too far
// and this dispatched a play the player never asked for (with a release standing,
// index 0 of the rendered fan is the spare, index 0 of `you.hand` is the release
// itself — so a click on the spare re-played the card already on the table).
//
// A uid cannot drift. The caller resolves it against the very array it rendered,
// and no index crosses this boundary at all — which is the same rule the cost
// pick and the partner pick already follow inside `_useBoardStaging.ts`.
export function useBoardInteractions({ state, actions }: Options) {
  const onCardClick = useCallback(
    (uid: string) => {
      const item = state.you.hand.find((c) => c.uid === uid)
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
