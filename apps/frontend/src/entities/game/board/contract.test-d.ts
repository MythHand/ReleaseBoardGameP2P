// The fork still feeds @release/ui's leaf blocks (Hand, Seat, PendingPrompt,
// deriveDock), which are typed against TableState. Structural typing makes that
// work only while the two shapes agree — so assert both directions. A prop that
// changes in @release/ui becomes a compile error here rather than a misrender
// on the board.
//
// Mirrors the idiom at apps/ui/src/table/Table/intents.ts:1.
import type { TableOver, TableState } from '@release/ui'
import type { BoardOver, BoardState } from './types'

// BoardState adds `introPhase`, which TableState has no member for, so the
// assignability that matters is: everything TableState requires, BoardState
// supplies — and vice versa for the fields the kit reads.
//
// The reach of this guard, stated plainly: it catches a required field that is
// added, removed or retyped on either side. It does NOT catch a future OPTIONAL
// field added to one and not the other, because `Omit` names only `introPhase`
// and an absent optional satisfies both directions. Widening it would mean
// naming every intentional difference, which is the same maintenance by another
// route — so the limit is documented rather than closed.
const toKit = (b: BoardState): TableState => b
const fromKit = (t: TableState): Omit<BoardState, 'introPhase'> => t
const overToKit = (b: BoardOver): TableOver => b
const overFromKit = (t: TableOver): BoardOver => t

void toKit
void fromKit
void overToKit
void overFromKit
