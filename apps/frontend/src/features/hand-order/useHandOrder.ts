import type { HandItem } from '@release/ui'
import { useCallback, useMemo, useRef, useState } from 'react'
import type { BoardState } from '~/entities/game/board'

// The player's own arrangement of their fan. The engine has no notion of hand
// ORDER — `view.self.hand` appends what arrives and drops what leaves — and it
// must not grow one: the order is private to the seat (others see a count), so
// sending it over the wire would sync a secret nobody may read. It lives here
// instead, as an overlay applied to every projection on its way into the board.
//
// The bug this closes: the kit's reorder gesture settles the card into its new
// slot and then hands the consumer a commit — and the board passed no
// `onReorder`, so the commit was a no-op and the very next projection render
// snapped the card back. The overlay is that commit's missing home.

export interface HandOrder {
  /**
   * The projection, with the player's hand in the player's own order. Identity
   * when nothing is sorted or nothing changes — everything downstream keys
   * effects on `live`, and a fresh object per render would re-arm them all.
   */
  arrange: (live: BoardState) => BoardState
  /**
   * The reorder gesture's commit. `visible` is the fan as the kit rendered it
   * (the staging gesture may have filtered a card out), and `to` indexes THAT
   * list, under the canonical remove-then-insert rule (`reorderHand`). `full`
   * is the whole displayed hand, so a card standing off the fan keeps its slot.
   */
  commit: (full: HandItem[], visible: HandItem[], uid: string, to: number) => void
}

export function useHandOrder(gameKey: string | null): HandOrder {
  // State, not a ref: the commit fires when the settle animation has already
  // finished, so the re-render it causes redraws the fan in exactly the order
  // the card just visibly landed in — the last frame of the gesture IS the next
  // state, the same handover rule every beat lives by.
  const [order, setOrder] = useState<string[]>([])

  // A new match must forget the old sort: uids are seeded per game (`id#n`),
  // so a rematch REUSES them and a surviving order would silently pre-sort the
  // new deal. Reset during render, ref-guarded — the same `armedFor` idiom the
  // intro and the queue use for their own per-match latches.
  const playing = useRef<string | null>(null)
  if (gameKey != null && playing.current !== gameKey) {
    playing.current = gameKey
    if (order.length > 0) setOrder([])
  }

  const arrange = useCallback(
    (live: BoardState): BoardState => {
      if (order.length === 0) return live
      const hand = live.you.hand
      const at = new Map(order.map((uid, i) => [uid, i]))
      // Sorted cards take their stored places; cards the order has never seen
      // (fresh draws) fall after them, keeping the projection's own relative
      // order — the same end of the fan the draw beat lands on. Departed uids
      // simply match nothing and cost nothing.
      const sorted = [...hand].sort((a, b) => {
        const ai = at.get(a.uid)
        const bi = at.get(b.uid)
        if (ai == null && bi == null) return 0
        if (ai == null) return 1
        if (bi == null) return -1
        return ai - bi
      })
      if (sorted.every((c, i) => c === hand[i])) return live
      return { ...live, you: { ...live.you, hand: sorted } }
    },
    [order],
  )

  const commit = useCallback((full: HandItem[], visible: HandItem[], uid: string, to: number) => {
    const vis = visible.map((c) => c.uid)
    const from = vis.indexOf(uid)
    if (from < 0) return
    // The move itself, by the canonical rule: remove first, insert second.
    vis.splice(from, 1)
    vis.splice(Math.max(0, Math.min(to, vis.length)), 0, uid)
    // Weave the moved fan back through the full hand: visible cards take the
    // new order, while a card standing off the fan (staged at the centre) keeps
    // the very slot it left — it was not part of the gesture.
    const visSet = new Set(vis)
    let i = 0
    setOrder(full.map((c) => (visSet.has(c.uid) ? vis[i++] : c.uid)))
  }, [])

  return useMemo(() => ({ arrange, commit }), [arrange, commit])
}
