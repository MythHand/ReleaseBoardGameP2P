import { SUPPORTED } from '../cards'
import type { DeckEntry, GameConfig } from '../engine'
import type { Event } from '../events'
import { shuffle } from '../rng'
import { normalizeSetup } from '../setup-contract'
import type { CardId, CardInstance, GameState, PlayerId, PlayerState } from '../state'

// Trigger cards cannot sit in an opening hand: their effect fires on the draw, so
// holding one from setup would mean an unfired trigger (rules, Setup §3).
export const OPENING_EXCLUDED: ReadonlySet<CardId> = new Set(['trigger-error-503', 'trigger-ai'])

const OPENING_HAND = 5

// Deterministic uids: `${id}#${n}`. A counter would make two runs of the same
// config produce different uids, which would break replay from seed + action log.
export function expand(entries: readonly DeckEntry[]): CardInstance[] {
  const out: CardInstance[] = []
  for (const e of entries) {
    for (let n = 0; n < e.qty; n += 1) out.push({ uid: `${e.id}#${n}`, id: e.id })
  }
  return out
}

export function createGame(config: GameConfig): GameState {
  const { seed } = config
  let cursor = 0

  // An unsupported id would be an inert card nobody can ever play, so it never
  // enters the deck — but which ones went is recorded rather than lost, so a
  // caller handing over a catalogue the engine only partly implements finds out
  // here instead of counting cards at the table.
  const supported = config.deck.filter((e) => SUPPORTED.has(e.id))
  const dropped = [
    ...config.deck.filter((e) => !SUPPORTED.has(e.id)),
    ...config.events.filter((e) => !SUPPORTED.has(e.id)),
  ].map((e) => e.id)
  const normalized = normalizeSetup(config.setup)
  const first = shuffle(expand(supported), seed, cursor)
  cursor = first.cursor

  // Reserve one Debugger per player before dealing, so the guaranteed opening
  // card cannot depend on where the shuffle happened to put them.
  // If the deck has fewer Debuggers than players (under-supplied), the players
  // without a reserved Debugger will receive 5 fully random cards instead — no
  // error is thrown. This is accepted rather than an error path, since the real
  // deck has 8 Debuggers against at most 6 players (unreachable in practice).
  const debuggers: CardInstance[] = []
  const rest: CardInstance[] = []
  for (const c of first.items) {
    if (c.id === 'protection-debugger' && debuggers.length < config.players.length) {
      debuggers.push(c)
    } else {
      rest.push(c)
    }
  }

  const players: Record<PlayerId, PlayerState> = {}
  // Cards skipped because they are trigger cards go back into the deck, which is
  // then reshuffled — the rules' "return them and take others" (Setup §3-4).
  const skipped: CardInstance[] = []
  let i = 0

  for (const [n, p] of config.players.entries()) {
    const hand: CardInstance[] = []
    const dbg = debuggers[n]
    if (dbg) hand.push(dbg)
    while (hand.length < OPENING_HAND && i < rest.length) {
      const c = rest[i]
      i += 1
      if (OPENING_EXCLUDED.has(c.id)) skipped.push(c)
      else hand.push(c)
    }
    players[p.id] = {
      id: p.id,
      name: p.name,
      hand,
      release: {},
      frozen: [],
      replayLocked: [],
      // Only the reserved Debugger is dealt openly. A seat that got none — an
      // under-supplied deck — has nothing face up, even if a surplus Debugger
      // happened to come off `rest` into this hand.
      openedAtDeal: dbg ? [dbg.uid] : [],
    }
  }

  const remaining = shuffle([...skipped, ...rest.slice(i)], seed, cursor)
  cursor = remaining.cursor

  const eventDeck = shuffle(expand(config.events.filter((e) => SUPPORTED.has(e.id))), seed, cursor)
  cursor = eventDeck.cursor

  const seating = config.players.map((p) => p.id)

  return {
    gameId: config.gameId,
    seed,
    rngCursor: cursor,
    // The deal genuinely consumes the first `seating.length` event ids — one
    // `dealt` per player, numbered 1..N by `setupEvents` below — so the
    // returned state's counter starts past them. Without this, `reduce`'s
    // first committed event (via `createLog(state.eventSeq)`) would reuse id 1
    // and collide with the deal's own id 1, which breaks once both feeds are
    // merged into one history (the `parent` field is an event id).
    eventSeq: seating.length,
    seating,
    players,
    eliminated: [],
    turn: { player: seating[0], index: 0, drawnFrom: [], releasesPlayed: 0 },
    decks: { main: [remaining.items], events: eventDeck.items, discard: [] },
    drawing: null,
    pending: null,
    window: null,
    setup: normalized.setup,
    ignored: { cards: dropped, setup: normalized.ignored },
    over: null,
  }
}

// The deal, as events. `createGame` returns a bare GameState — it is called from
// two dozen places that want only the state — so the opening feed is a separate
// pure derivation over that state rather than a second return value.
//
// Every field here is public: a count is not a secret, and `open` names only
// what the rules deal face up. The closed four are never identified.
//
// Ids 1..seating.length: `createGame` reserves exactly this many ids for the
// deal (see its `eventSeq` above) before `reduce`'s own `createLog` starts
// counting from there, so the two feeds are disjoint and mergeable.
export function setupEvents(state: GameState): Event[] {
  return state.seating.map((id, n) => {
    const { hand, openedAtDeal } = state.players[id]
    // Read from what was actually dealt openly, never inferred from the hand's
    // contents: with fewer Debuggers in the deck than players, a seat gets five
    // random cards and a surplus Debugger can land first among them. Asking "is
    // hand[0] a Debugger?" would then announce a closed card to the whole table
    // as face up — the intro would show everyone a card it must not.
    const openCards = openedAtDeal
      .map((uid) => hand.find((c) => c.uid === uid)?.id)
      .filter((cardId): cardId is CardId => cardId !== undefined)
    const open = openCards.length > 0 ? openCards : undefined
    return {
      id: n + 1,
      type: 'dealt' as const,
      player: id,
      count: hand.length,
      ...(open ? { open } : {}),
    }
  })
}
