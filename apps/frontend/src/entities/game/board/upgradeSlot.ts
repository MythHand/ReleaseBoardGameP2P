import type { BoardAnchors } from './anchors'

// Both flights and the resting row measure the same slot, including seats
// still owing a card. Existing answers never shift when another seat answers.
export function upgradeSlot(anchors: BoardAnchors, player: string): HTMLElement | null {
  const root = anchors.centre.current?.parentElement
  return (
    Array.from(root?.querySelectorAll<HTMLElement>('[data-upgrade-slot]') ?? []).find(
      (slot) => slot.dataset.upgradeSlot === player,
    ) ?? null
  )
}

// The CARD standing in that place — its own node inside it. A flight takes this
// one over: the place positions itself with a transform, and a flight's first
// frame writes a transform of its own, so flying the place would throw away the
// positioning that put it there.
export function upgradeCard(anchors: BoardAnchors, player: string): HTMLElement | null {
  return upgradeSlot(anchors, player)?.querySelector<HTMLElement>('[data-upgrade-card]') ?? null
}
