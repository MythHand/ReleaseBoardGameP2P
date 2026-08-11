// The fork and the deal intro consume these from @release/ui's public surface.
// A type-level test rather than a runtime one: what is being asserted is that
// the barrel exports these names at all, which `release-tsc --noEmit` decides.
import {
  CARD_W,
  cardBoxIn,
  GearIcon,
  type HandItem,
  HEAP_SHOW,
  nextFrames,
  type Panel,
  PendingPrompt,
  type PendingPromptCopy,
  type Rect,
  type ReleaseSlots,
  restTransform,
  type Scatter,
  type SlotPlacement,
  scatterAt,
  slotPlacement,
  type TableOpponent,
  type WindowCopy,
  wait,
} from '@release/ui'

// Values: referenced so an unused-import lint cannot delete the assertion.
const values: unknown[] = [
  CARD_W,
  cardBoxIn,
  GearIcon,
  HEAP_SHOW,
  nextFrames,
  PendingPrompt,
  restTransform,
  scatterAt,
  slotPlacement,
  wait,
]
void values

// Types: each named in a position that fails to compile if the export is absent.
type Assertions = [
  HandItem,
  Panel,
  PendingPromptCopy,
  Rect,
  ReleaseSlots,
  Scatter,
  SlotPlacement,
  TableOpponent,
  WindowCopy,
]
export type _Assertions = Assertions
