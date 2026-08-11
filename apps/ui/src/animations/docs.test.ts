import { describe, expect, it } from 'vitest'
// the doc is pulled in as text through Vite's own ?raw — no node:fs, so the
// package keeps its browser-only type surface
import reference from '../../../../docs/animations/reference.md?raw'
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
})
