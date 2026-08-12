import { shuffle } from '../rng'
import type { CardInstance, GameState, PlayerId } from '../state'
import type { Log } from './core'

// Git Branch and Git Merge — the two cards that change how many draw piles are
// on the table. Slice A made the draw run over every pile; these are what make
// there be more than one.

// Rules decisions answer 4: exactly in half, and an odd pile leaves the first
// side one card larger. The halves stay where the pile was, so the indices of
// piles ahead of it do not move — which matters because a draw in progress
// holds pile indices.
//
// A pile of one card does not split: "фактически ничего не произойдёт, карта
// гит бренч просто уходит в сброс". A legal play with no effect, not a
// rejection — the same shape as Cherry-pick against an empty discard.
export function splitPile(state: GameState, log: Log, index: number, sudo: boolean): GameState {
  const piles = state.decks.main
  const target = piles[index]
  let main = piles

  if (target && target.length > 1) {
    const half = Math.ceil(target.length / 2)
    main = [
      ...piles.slice(0, index),
      target.slice(0, half),
      target.slice(half),
      ...piles.slice(index + 1),
    ]
    log.add({ type: 'pilesChanged', piles: main.map((p) => p.length) })
  }

  // Answer 5: the flip is independent of the split, not a variation of it —
  // one pile plus a discard becomes three piles and an empty discard. Appended
  // unshuffled, because the card says so ("не перемешивайте карты").
  if (sudo && state.decks.discard.length > 0) {
    main = [...main, [...state.decks.discard]]
    log.add({ type: 'pilesChanged', piles: main.map((p) => p.length) })
    return { ...state, decks: { ...state.decks, main, discard: [] }, eventSeq: log.seq }
  }
  return { ...state, decks: { ...state.decks, main }, eventSeq: log.seq }
}

// "Объедините все колоды добора в одну и перетасуйте их." Sudo adds the discard
// before shuffling. Deterministic through (seed, cursor) with the advanced
// cursor written back, like every other shuffle here, so each peer recomputes
// the same pile rather than agreeing over the wire.
export function mergePiles(state: GameState, log: Log, sudo: boolean): GameState {
  const gathered: CardInstance[] = [
    ...state.decks.main.flat(),
    ...(sudo ? state.decks.discard : []),
  ]
  const { items, cursor } = shuffle(gathered, state.seed, state.rngCursor)
  log.add({ type: 'pilesChanged', piles: [items.length] })
  return {
    ...state,
    decks: {
      ...state.decks,
      main: [items],
      discard: sudo ? [] : state.decks.discard,
    },
    rngCursor: cursor,
    eventSeq: log.seq,
  }
}

// Answer 7's second case: a pile of several that runs out ceases to exist.
//
// Called only when a draw sequence finishes, never during one — `drawing.piles`
// holds indices, and removing a pile mid-sequence would shift every index
// behind it. Nothing can be played mid-draw, so no player can observe the
// difference between "gone now" and "gone when the draw ends".
//
// The last pile stays even when empty: with nothing anywhere, answer 7's first
// case recycles the discard into it instead of leaving no pile at all.
export function pruneEmptyPiles(state: GameState, log: Log): GameState {
  if (state.decks.main.length <= 1) return state
  const kept = state.decks.main.filter((pile) => pile.length > 0)
  if (kept.length === state.decks.main.length) return state
  const main = kept.length > 0 ? kept : [[]]
  log.add({ type: 'pilesChanged', piles: main.map((p) => p.length) })
  return { ...state, decks: { ...state.decks, main }, eventSeq: log.seq }
}

// Which piles Git Branch may be aimed at. One entry per pile, so a consumer can
// offer the choice without knowing that a single pile needs no choosing.
export function pileTargets(state: GameState, _actor: PlayerId): number[] {
  return state.decks.main.map((_, i) => i)
}
