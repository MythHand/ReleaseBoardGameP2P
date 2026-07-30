// Discard-heap scatter — the single source of "how a card lands in, and rests
// in, the discard heap". The return flight (centerToDiscard) and the card's
// resting transform in the heap both read ONE Scatter, so a card lands exactly
// where it then rests — no re-layout / position swap on the last frame. This is
// the discard counterpart to slotPlacement() for the hand fan: one formula, no
// per-story copies that drift apart.

export interface Scatter {
  rot: number
  dx: number
  dy: number
}

export interface Rect {
  left: number
  top: number
  width: number
  height: number
}

// Offsets are FRACTIONS of the card width, not absolute px, so a heap looks
// equally "tossed" at any card size (an absolute offset reads strong on a small
// card and weak on a large one). Rotation is absolute — a tilt does not scale
// with size. The fractions reproduce the previous ±10/±8 px feel at REF_WIDTH.
const ROT = 14 // max tilt, degrees
const DX_FRAC = 0.083 // max X offset, fraction of card width (≈ ±10px @120)
const DY_FRAC = 0.067 // max Y offset, fraction of card width (≈ ±8px @120)
const REF_WIDTH = 120 // fallback width when the card size is not supplied

// Top cards of the heap kept visible at rest; those beneath fade out (merge into
// the pile) instead of vanishing. Shared default for "heap" piles (a tossed
// stack, not a neat column).
export const HEAP_SHOW = 6

// [-1, 1) from an integer key + a salt — a deterministic fract-sin hash. The same
// key always yields the same scatter, so a heap is stable across re-renders (and,
// in a real synced game, across peers), unlike Math.random().
const hash = (key: number, salt: number): number => {
  const x = Math.sin(key * 127.1 + salt * 311.7) * 43758.5453
  return (x - Math.floor(x)) * 2 - 1
}

const scatterFrom = (r: number, dxN: number, dyN: number, width: number): Scatter => ({
  rot: r * ROT,
  dx: dxN * width * DX_FRAC,
  dy: dyN * width * DY_FRAC,
})

/**
 * Stable scatter keyed to a card's identity (its heap index, or any stable
 * integer). Deterministic: same key + width → same tilt/offset every time.
 */
export const scatterAt = (key: number, width = REF_WIDTH): Scatter =>
  scatterFrom(hash(key, 1), hash(key, 2), hash(key, 3), width)

/**
 * Random one-off scatter, for a card placed once that never needs to agree with
 * a later re-render or another peer. Prefer scatterAt for a persistent heap.
 */
export const jitter = (width = REF_WIDTH): Scatter =>
  scatterFrom(Math.random() * 2 - 1, Math.random() * 2 - 1, Math.random() * 2 - 1, width)

/** The resting CSS transform of a card in the heap — the single source of this string. */
export const restTransform = (s: Scatter): string =>
  `translate(${s.dx}px, ${s.dy}px) rotate(${s.rot}deg)`

/**
 * Flight params for play('centerToDiscard', el, …) built from the SAME Scatter,
 * so the card settles exactly onto restTransform(s) — the fly↔rest coupling is
 * structural, not hand-threaded. `fade` dissolves the card on the way in (a card
 * sinking beneath the visible top of the heap).
 */
export const toDiscardParams = (from: Rect, to: Rect, s: Scatter, fade = false) => ({
  from,
  to,
  rotate: s.rot,
  dx: s.dx,
  dy: s.dy,
  fade,
})
