import type { Setup } from './state'

// The mode axes and every value each one accepts, mirroring the lobby's
// GAME_MODES. Declared here because the engine is the party that acts on them:
// a value it does not recognise is a value it cannot honour, and it should say
// so rather than quietly behaving as Base.
export const SETUP_AXES = {
  handLimit: ['base', '8bit', 'memory'],
  releases: ['base', 'fast'],
  releaseCond: ['base', 'easy'],
  ai: ['base', 'less', 'no'],
  gitBranch: ['base', 'strategic'],
} as const satisfies Record<string, readonly string[]>

export type SetupAxis = keyof typeof SETUP_AXES

// Coerces a config to something every consumer can read without a fallback,
// and names what it had to change. `handLimit: 'memoryProblem'` used to fall
// through `HAND_LIMITS[...] ?? Infinity` and silently play as unlimited — the
// opposite of the stricter mode the player picked, and invisible at the table.
//
// Unknown values become 'base' rather than throwing: the config arrives from a
// lobby over a wire, and one bad axis should cost that axis, not the game.
export function normalizeSetup(setup: Setup): { setup: Setup; ignored: string[] } {
  const out: Record<string, string> = {}
  const ignored: string[] = []
  for (const [axis, allowed] of Object.entries(SETUP_AXES)) {
    const chosen = setup[axis]
    if (chosen === undefined) {
      out[axis] = 'base'
      continue
    }
    if ((allowed as readonly string[]).includes(chosen)) {
      out[axis] = chosen
      continue
    }
    ignored.push(`${axis}=${chosen}`)
    out[axis] = 'base'
  }
  // An axis the engine has no opinion on is not the engine's to drop, but it is
  // worth naming: it reached here from somewhere, and nothing will read it.
  for (const axis of Object.keys(setup)) {
    if (!(axis in SETUP_AXES)) ignored.push(`${axis}?`)
  }
  return { setup: out, ignored }
}
