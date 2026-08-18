import { describe, expect, it } from 'vitest'
// everything is pulled in as text through Vite's own ?raw: the audit page and the
// navigation are source files, not registries, so there is nothing to import from
// them but what they are written as
import recipes from '../../../docs/animations/recipes.md?raw'
import reference from '../../../docs/animations/reference.md?raw'
import nav from '../Playground/Playground.tsx?raw'
import audit from './AnimationAuditStory/AnimationAuditStory.tsx?raw'

// `docs/animations/` is what an AI reads INSTEAD of the source, and it drifts from
// the source SILENTLY — nothing in the code knows a doc exists, and the doc has no
// way to notice a new module or a new scene. Three things are supposed to land
// there, and each has now cost something by not landing:
//   • presets → `apps/ui/src/animations/docs.test.ts` (the vocabulary had fallen
//     seven presets behind before a sweep caught it);
//   • modules → below (`useCardPreview` sat on the audit page as finished while the
//     reference did not know it existed — a whole block, in the public index, used
//     by four scenes);
//   • scenes → below (this was the last one left on discipline).
// What none of them can catch is a module written down in NEITHER place; that limit
// is stated in backlog.md rather than pretended away.

// ===== modules =====

const MODULE_NAMES = /^\s{4}mod: '(.+)',$/gm

// the board side of a scenario: a path relative to apps/frontend/src
const BOARD_PATHS = /^\s{4}board: '(.+)',$/gm

// every module the frontend actually has, keyed by the same relative path the
// audit page writes — the glob is lazy, so nothing here loads the frontend
const FRONTEND_FILES = import.meta.glob('../../frontend/src/**/*.{ts,tsx}')

// A name is a heading, not code: `move()`, `wait(ms)`, `Hand (canonical)`,
// `useCardTilt() + CardMotionProvider`. Reduce it to the identifiers the docs
// would actually write; an entry naming several things owes all of them.
const identifiers = (mod: string): string[] =>
  mod
    .split(/[/+]/)
    .map((part) => part.trim().replace(/\(.*$/, '').trim())
    .filter((part) => part.length > 0 && !part.includes(' '))

// ===== scenes =====

// The story registry, sliced to the groups whose scenes are MOVEMENTS. The other
// groups (screens, foundations, the UI kit, the blocks) are not game moments and
// owe nothing to a file about choreography.
const ANIMATED_GROUPS = ['Карты', 'Интерактив']
const SCENES = /id: '([^']+)',\s*title: '([^']+)'/g

// Two scenes in those groups owe no recipe, and it is not an oversight:
const EXEMPT: Record<string, string> = {
  'interaction-audit': 'the state map itself — it describes the modules, it is not one',
  animations: 'the vocabulary catalogue — a preset per form, not a game moment',
  card: 'the flat-PNG card showcase — the one page where the composed face is off',
}

const animatedScenes = (): { id: string; title: string }[] => {
  const groups = nav.split(/title: \{ ru: '/).slice(1)
  return groups.flatMap((chunk) => {
    const heading = chunk.slice(0, chunk.indexOf("'"))
    if (!ANIMATED_GROUPS.includes(heading)) return []
    return [...chunk.matchAll(SCENES)].map((m) => ({ id: m[1], title: m[2] }))
  })
}

describe('the animation docs and what they describe', () => {
  it('gives every module on the audit page a mention in reference.md', () => {
    const mods = [...audit.matchAll(MODULE_NAMES)].map((m) => m[1])
    expect(mods.length).toBeGreaterThan(10) // the page was parsed, not just matched
    const undocumented = mods.filter((mod) => {
      const names = identifiers(mod)
      return names.length > 0 && !names.every((name) => reference.includes(name))
    })
    expect(undocumented).toEqual([])
  })

  it('gives every animated scene a live reference in recipes.md', () => {
    const scenes = animatedScenes()
    expect(scenes.length).toBeGreaterThan(10) // the navigation was parsed
    // a recipe names its story in backticks ("Live reference: `Card play`"), which
    // is the docs' own convention and a far better signal than the bare words —
    // "Card" and "Table" occur in every other sentence
    const uncovered = scenes
      .filter((s) => !(s.id in EXEMPT))
      .filter((s) => !recipes.includes(`\`${s.title}\``))
      .map((s) => s.title)
    expect(uncovered).toEqual([])
  })

  // The board side of a scenario is a PATH into another app, written by hand.
  // Nothing in the playground imports `apps/frontend`, so the only thing that can
  // keep this column honest is checking the file is still there: the first rename
  // on the frontend side would otherwise leave the page asserting a module that
  // no longer exists, and it would assert it silently, which is the exact failure
  // mode the presets/reference test was written for.
  it('points every board path at a module that exists', () => {
    const paths = [...audit.matchAll(BOARD_PATHS)].map((m) => m[1])
    expect(paths.length).toBeGreaterThan(5) // the page was parsed, not just matched
    // Vite's own glob rather than node:fs: this package keeps a browser-only
    // type surface (no @types/node), and the glob is resolved at build time
    // against the real tree, which is exactly the fact being asserted.
    const onDisk = new Set(Object.keys(FRONTEND_FILES))
    const missing = paths.filter((rel) => !onDisk.has(`../../frontend/src/${rel}`))
    expect(missing).toEqual([])
  })
})
