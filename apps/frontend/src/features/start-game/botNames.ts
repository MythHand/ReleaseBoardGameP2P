// Bot nicknames. They are proper names, the same in every locale, so they live
// here rather than in the translation catalog.
export const BOT_NICKNAMES = [
  'ClaudeBot',
  'OpenBot',
  'GeminBot',
  'LlamaBot',
  'GrokBot',
  'CursorBot',
  'CodexBot',
  'SonnetBot',
  'HaikuBot',
  'OpusBot',
] as const

// A bot has no identity beyond its number, so its name is derived rather than
// stored: a shuffle seeded by `seed` (the host's id). Every peer seeds with the
// same id, so the lobby rows, the dealt seats and every guest's screen agree,
// while a new room gets a new lineup. Adding a bot never renames the ones
// already seated — the shuffle does not depend on `count`.
export function botNames(seed: string, count: number): string[] {
  const names: string[] = [...BOT_NICKNAMES]
  const next = mulberry32(hash(seed))
  for (let i = names.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1))
    ;[names[i], names[j]] = [names[j], names[i]]
  }
  // The table seats at most five bots, so the list never runs out; the suffix
  // only keeps names unique should that ever change.
  return Array.from({ length: count }, (_, i) => {
    const lap = Math.floor(i / names.length)
    const name = names[i % names.length]
    return lap === 0 ? name : `${name} ${lap + 1}`
  })
}

// FNV-1a: turns the seed string into a 32-bit number.
function hash(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return h >>> 0
}

function mulberry32(seed: number): () => number {
  let a = seed
  return () => {
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
