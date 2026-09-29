import { type CardData, CENTRE_SLOTS, rowCells } from '@release/ui'

/** A card put out at the centre while its play is being made (resolution.md §1). */
export interface ShownCard {
  player: string
  uid: string
  card: CardData
}

/**
 * WHERE ONE PLAYER'S SHOWN CARDS STAND — the same places the actor's own
 * staging stands a play in, so that every viewer sees one layout:
 *
 *   stage  a release waiting for its cost, alone
 *   row    a support in the first place of the row, the card it goes with in
 *          the second (or the second kept empty — the question it asks); a
 *          Sudo beside a git operation stays its own card here
 *   pair   two cards lying one on the other: a Code Review riding its release
 *          (the row's first place, where the Code Review stood), or a Sudo
 *          under an attack (the middle, where a played attack stands)
 *   solo   a card aiming at something, at the middle
 *
 * How two cards stand is the staging's own rule (`_useBoardStaging.ts`, the
 * partner pick: `stacked` / `sideBySide`), read the same way here.
 *
 * One answer for the board's render and for the beat that flies a card into
 * it: a flight that aimed anywhere else would land beside the card that then
 * takes its place.
 */
export interface ShownLayout {
  stage?: ShownCard
  row?: [ShownCard, ShownCard | null]
  pair?: { main: ShownCard; aux: ShownCard; at: 'row0' | 'solo' }
  solo?: ShownCard
}

/** The layout of the cards ONE player has shown. */
export function shownLayout(cards: ShownCard[]): ShownLayout {
  const support = cards.find((s) => s.card.category === 'support')
  const main = cards.find((s) => s !== support)
  if (support && main && support.card.id === 'support-code-review')
    return { pair: { main, aux: support, at: 'row0' } }
  if (support && main && support.card.id === 'support-sudo' && main.card.category === 'attack')
    return { pair: { main, aux: support, at: 'solo' } }
  if (support) return { row: [support, main ?? null] }
  if (!main) return {}
  return main.card.category === 'release' ? { stage: main } : { solo: main }
}

/** Where in its player's layout one shown card stands. */
export type ShownPlace = 'stage' | 'row0' | 'row1' | 'solo'

export function shownPlaceOf(layout: ShownLayout, uid: string): ShownPlace | null {
  if (layout.stage?.uid === uid) return 'stage'
  if (layout.solo?.uid === uid) return 'solo'
  if (layout.pair && (layout.pair.main.uid === uid || layout.pair.aux.uid === uid))
    return layout.pair.at
  if (layout.row?.[0].uid === uid) return 'row0'
  if (layout.row?.[1]?.uid === uid) return 'row1'
  return null
}

/**
 * Each owner's occupied span, using the centre module's card/row geometry.
 * A missing local SHOW echo still reserves the gesture's two possible places.
 */
function shownSpan(cards: ShownCard[]) {
  const row = rowCells('staging', 2)
  const layout = shownLayout(cards)
  if (layout.row || cards.length === 0) {
    return {
      left:
        cards.length === 0
          ? Math.min(row[0].dx - row[0].w / 2, CENTRE_SLOTS.stage.dx - CENTRE_SLOTS.stage.w / 2)
          : row[0].dx - row[0].w / 2,
      right: row[1].dx + row[1].w / 2,
    }
  }
  const dx = layout.stage ? CENTRE_SLOTS.stage.dx : layout.pair?.at === 'row0' ? row[0].dx : 0
  const w = row[0].w
  return { left: dx - w / 2, right: dx + w / 2 }
}

/**
 * A lone play retains the reference position. Concurrent owners pack by the
 * space their cards occupy; opponents alternate around our fixed gesture.
 * On a narrow table only the spacing compresses, keeping cards on screen.
 * Rendering and flights read the same geometry and the same table width.
 */
export function shownPlayerOffset(
  cards: ShownCard[],
  selfId: string,
  player: string,
  tableWidth = Number.POSITIVE_INFINITY,
  selfHeld = false,
): number {
  const owners = [...new Set(cards.map((card) => card.player))]
  if (selfHeld && !owners.includes(selfId)) owners.push(selfId)
  if (owners.length < 2) return 0
  const spans = new Map(
    owners.map((owner) => [owner, shownSpan(cards.filter((card) => card.player === owner))]),
  )
  const row = rowCells('staging', 2)
  const gap = row[1].dx - row[0].dx - row[0].w
  const offsets = new Map<string, number>()
  const own = spans.get(selfId)
  if (own) {
    offsets.set(selfId, 0)
    let left = own.left
    let right = own.right
    owners
      .filter((owner) => owner !== selfId)
      .forEach((owner, i) => {
        const span = spans.get(owner)
        if (!span) return
        if (i % 2 === 0) {
          const dx = left - gap - span.right
          offsets.set(owner, dx)
          left = dx + span.left
        } else {
          const dx = right + gap - span.left
          offsets.set(owner, dx)
          right = dx + span.right
        }
      })
  } else {
    const width =
      [...spans.values()].reduce((total, span) => total + span.right - span.left, 0) +
      gap * (owners.length - 1)
    let left = -width / 2
    for (const owner of owners) {
      const span = spans.get(owner)
      if (!span) continue
      offsets.set(owner, left - span.left)
      left += span.right - span.left + gap
    }
  }
  const edge = Math.max(0, tableWidth / 2 - gap)
  let compression = 1
  for (const [owner, dx] of offsets) {
    const span = spans.get(owner)
    if (!span) continue
    if (dx < 0) compression = Math.min(compression, (edge + span.left) / -dx)
    if (dx > 0) compression = Math.min(compression, (edge - span.right) / dx)
  }
  return (offsets.get(player) ?? 0) * Math.max(0, compression)
}
