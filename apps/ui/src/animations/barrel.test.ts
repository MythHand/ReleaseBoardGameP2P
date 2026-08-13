import { describe, expect, it } from 'vitest'
import * as animations from './index'

// The animation layer is its own entry point (@release/ui/animations), and what
// it exports IS the contract two apps compile against. A step that lives in the
// folder but never reaches the barrel is a step the frontend cannot import —
// which is the exact state useDiscardExit was in while ten scenes reached past
// the barrel into a story folder for it.
describe('the animations barrel', () => {
  it('exports every flight step', () => {
    expect(Object.keys(animations)).toEqual(
      expect.arrayContaining(['useFlyer', 'useHandArrival', 'useDiscardExit']),
    )
  })
})
