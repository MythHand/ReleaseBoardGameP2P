import type { PlayerView } from '@release/engine'
import type { TableOver } from '@release/ui'

// `over` hangs off TableProps rather than TableState, so this is a second
// entry point beside toTableState rather than a field inside it. The rename
// is the whole mapping: the engine names the seat `winner`, the kit resolves
// it against its own participants by `winnerId`.
export function toTableOver(view: PlayerView): TableOver | null {
  if (!view.over) return null
  return { winnerId: view.over.winner, condition: view.over.condition }
}
