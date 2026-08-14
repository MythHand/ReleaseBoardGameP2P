import type { Choice, PendingView, Target, WindowView } from '@release/engine'
import type { TableChoice, TablePending, TableTarget, TableWindow } from '@release/ui'

// Decision 7: @release/ui mirrors the engine's action surface structurally
// rather than importing it. These assertions are what make that safe — if the
// engine gains a Target variant or a Pending kind and the kit does not, this
// file stops compiling and names the missing member.
type Exact<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never

export const targetsMatch: Exact<Target, TableTarget> = true
export const choicesMatch: Exact<Choice, TableChoice> = true
export const pendingMatch: Exact<PendingView, TablePending> = true
export const windowMatch: Exact<WindowView, TableWindow> = true
