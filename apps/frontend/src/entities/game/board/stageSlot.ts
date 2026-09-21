import type { BoardAnchors } from './anchors'

// The places of the centre ROW a play is assembled in (`rowPlaceStyle`, the
// `staging` row). Found by attribute rather than held in `BoardAnchors` for the
// same reason `upgradeSlot` is: the registry holds the nodes a flight aims at
// for the whole life of the board, and these two exist only while a play is
// being put together. Both the flight out of the fan and the static render
// measure the SAME node, so the card cannot land anywhere but where it rests.
export function stageSlot(anchors: BoardAnchors, index: number): HTMLElement | null {
  const root = anchors.centre.current?.parentElement
  return root?.querySelector<HTMLElement>(`[data-stage-slot="${index}"]`) ?? null
}
