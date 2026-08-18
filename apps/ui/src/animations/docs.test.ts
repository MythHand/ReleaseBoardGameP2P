import { describe, expect, it } from 'vitest'
// the doc is pulled in as text through Vite's own ?raw — no node:fs, so the
// package keeps its browser-only type surface
import reference from '../../../../docs/animations/reference.md?raw'
import * as animations from './index'
import { presetNames } from './play'

// The registry and its documentation drift APART SILENTLY, and the drift is
// invisible from either side: nothing in the code knows a doc exists, and the
// doc has no way to notice a new preset. `extending.md` asks for the reference
// row by hand — the ask had already been missed seven times when this test was
// written (four HUD-slot presets, hudIn, confettiFly, foldIntoPair).
//
// This matters more than a tidy table: `docs/animations/` is what an AI reads
// INSTEAD of presets.ts. A preset missing from it does not exist as far as the
// next task is concerned, and gets rewritten from scratch beside the real one.
describe('the animation registry and its docs', () => {
  it('gives every preset a row in reference.md', () => {
    // presets are written as inline code there — `playToCenter`, not bare prose
    const undocumented = presetNames().filter((name) => !reference.includes(`\`${name}\``))
    expect(undocumented).toEqual([])
  })

  // The steps get the same signal the presets have had since seven of them
  // drifted out of the docs. A step is a bigger surface than a preset — it owns
  // a rule and a geometry — so it has more to lose from being undocumented, not
  // less. The barrel is the source of the list: what a consumer can import is
  // exactly what has to be readable.
  it('gives every exported step a row in reference.md', () => {
    const steps = Object.keys(animations).filter((name) => name.startsWith('use'))
    expect(steps.length).toBeGreaterThan(0)
    const undocumented = steps.filter((name) => !reference.includes(`\`${name}\``))
    expect(undocumented).toEqual([])
  })
})
