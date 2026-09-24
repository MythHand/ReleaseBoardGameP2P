import type { BoardState } from '~/entities/game/board'

// A CARD IS OFF ITS PILE THE MOMENT IT TAKES OFF. A pile's counter says how many
// cards are IN it, and a card already in the air is not (owner, 24.09). The
// beats hold the table from BEFORE the batch, so without this every counter
// kept the card it had just given up until the whole table had played out —
// on a Good Vibe-Coding, two cards late.
//
// One draw pile, one card. A beat calls it in the commit its carrier takes off,
// and — since what comes next in the same beat builds on `ctx.base` — the base
// moves with the publish (`toHeap.ts`'s `settleInto` keeps the same rule).
export function offThePile(
  ctx: { base: BoardState; publish: (state: BoardState) => void },
  pile: number,
): void {
  const main = ctx.base.decks.main
  if ((main[pile] ?? 0) <= 0) return
  const next: BoardState = {
    ...ctx.base,
    decks: { ...ctx.base.decks, main: main.map((n, i) => (i === pile ? n - 1 : n)) },
  }
  ctx.base = next
  ctx.publish(next)
}
