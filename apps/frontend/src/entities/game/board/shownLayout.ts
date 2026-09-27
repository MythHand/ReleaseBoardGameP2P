import type { CardData } from '@release/ui'

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
