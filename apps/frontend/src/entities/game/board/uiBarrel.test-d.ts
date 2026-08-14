// The fork and the deal intro consume these from @release/ui's public surface.
// A type-level test rather than a runtime one: what is being asserted is that
// the entry points export these names at all, which `release-tsc --noEmit`
// decides.
//
// Two entries, deliberately, and this file is where that boundary is pinned:
// `@release/ui` is things to render, `@release/ui/animations` is how a thing
// moves. If the animation layer ever leaks back into the component barrel, the
// second block below stops being a separate import and someone has to notice.
import {
  CARD_W,
  cardBoxIn,
  GearIcon,
  type HandItem,
  type Panel,
  PendingPrompt,
  type PendingPromptCopy,
  type ReleaseSlots,
  type SlotPlacement,
  slotPlacement,
  type TableOpponent,
  type WindowCopy,
} from '@release/ui'
import {
  type Arriving,
  HEAP_SHOW,
  type Landed,
  nextFrames,
  play,
  type Raise,
  type Rect,
  restTransform,
  type Scatter,
  scatterAt,
  useFlyer,
  useHandArrival,
  wait,
} from '@release/ui/animations'

// Values: referenced so an unused-import lint cannot delete the assertion.
const components: unknown[] = [CARD_W, cardBoxIn, GearIcon, PendingPrompt, slotPlacement]
const animations: unknown[] = [
  HEAP_SHOW,
  nextFrames,
  play,
  restTransform,
  scatterAt,
  useFlyer,
  useHandArrival,
  wait,
]
void components
void animations

// Types: each named in a position that fails to compile if the export is absent.
type Assertions = [
  HandItem,
  Panel,
  PendingPromptCopy,
  ReleaseSlots,
  SlotPlacement,
  TableOpponent,
  WindowCopy,
  // …and the animation layer's own.
  Arriving,
  Landed,
  Raise,
  Rect,
  Scatter,
]
export type _Assertions = Assertions
