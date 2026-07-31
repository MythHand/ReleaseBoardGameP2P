// Counter-based PRNG. Deliberately NOT a stateful generator: a pure reducer must
// be able to compute the same value from a serialized GameState on any peer, so
// randomness is addressed by (seed, cursor) rather than advanced in a closure.
// Integer hash in the lowbias32 family — cheap and well distributed over a counter.
export function randomAt(seed: number, cursor: number): number {
  let t = (seed + cursor * 0x9e3779b9) >>> 0
  t = Math.imul(t ^ (t >>> 16), 0x21f0aaad) >>> 0
  t = Math.imul(t ^ (t >>> 15), 0x735a2d97) >>> 0
  t = (t ^ (t >>> 15)) >>> 0
  return t / 0x100000000
}

// Fisher-Yates over a copy. Returns the advanced cursor so the caller can write
// it back into state — the cursor is the only record of how much randomness has
// been consumed.
export function shuffle<T>(
  items: readonly T[],
  seed: number,
  cursor: number,
): { items: T[]; cursor: number } {
  const out = items.slice()
  let c = cursor
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(randomAt(seed, c) * (i + 1))
    c += 1
    const swap = out[i] as T
    out[i] = out[j] as T
    out[j] = swap
  }
  return { items: out, cursor: c }
}
