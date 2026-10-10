import type { TablePending } from '@release/ui'

// WHOM THE TABLE GLOWS RED FOR (#168). An Error 503 or an AI Crush owed by this
// board's own player — the prompt only they can answer. One rule with two
// readers: the board, for the prompt standing on it (`_Board.tsx`'s
// `glowStrong`), and the plan, for the reveal that raises it (`planBeats`'s
// standing AI tail). So the glow lights as the card turns face up for exactly
// the boards that keep it lit afterwards, rather than once the reveal has been
// read and its prompt published (owner, 03.10).
export function glowsFor(pending: TablePending | null | undefined, selfId: string | null): boolean {
  return (
    (pending?.kind === 'neutralize503' || pending?.kind === 'crush') && pending.player === selfId
  )
}
