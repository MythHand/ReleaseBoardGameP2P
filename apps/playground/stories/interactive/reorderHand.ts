// Local hand reorder (the canonical drag-to-reorder commit). Purely local — the
// player's card order is private (others see only the count), so it never becomes
// an intent. Move the card with `uid` to `toIndex`.
export function reorderHand<T extends { uid: string }>(
  items: T[],
  uid: string,
  toIndex: number,
): T[] {
  const from = items.findIndex((x) => x.uid === uid)
  if (from < 0) return items
  const copy = items.slice()
  const [moved] = copy.splice(from, 1)
  copy.splice(Math.max(0, Math.min(toIndex, copy.length)), 0, moved)
  return copy
}
