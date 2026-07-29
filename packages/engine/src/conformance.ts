import type { Action } from './actions'
import type { DeckEntry, Engine, GameConfig } from './engine'
import type { Event } from './events'
import { randomAt } from './rng'
import type { GameState, PlayerId, Setup } from './state'

export interface ConformanceOptions {
  deck: DeckEntry[]
  events: DeckEntry[]
}

const BASE_SETUP: Setup = {
  handLimit: 'base',
  releases: 'base',
  releaseCond: 'base',
  ai: 'base',
  gitBranch: 'base',
}

// BASE_SETUP's hand limit is unbounded, so endTurn's overflow branch and
// onHandLimit's committing path are otherwise dead code for this whole suite.
// A 5-card limit collides with the 5-card opening hand on the very first draw.
const MEMORY_SETUP: Setup = { ...BASE_SETUP, handLimit: 'memory' }

const configFor = (options: ConformanceOptions, seed: number, setup = BASE_SETUP): GameConfig => ({
  gameId: 'conformance',
  seed,
  players: [
    { id: 'p1', name: 'one' },
    { id: 'p2', name: 'two' },
    { id: 'p3', name: 'three' },
  ],
  setup,
  deck: options.deck,
  events: options.events,
})

// The fuzz clock. A reaction window's deadline is `at_open + 15000` on its
// first round and `+ 10000` after (see fake/window.ts). Advancing `at` by only
// 1 per step, as a per-action counter would, makes every deadline forever in
// the future — `onWindowExpired`'s guard could never fire naturally, and the
// entire expiry path (one of only two ways a window closes) went unexercised.
// 1000ms per step makes a round-1 window expirable about 15 steps after it
// opens, which is fast enough to reach within a 400-step run, while still
// spending roughly those same 15 steps with a premature WINDOW_EXPIRED
// correctly rejecting on "the window has not expired" — both paths get
// exercised, not just the accepting one.
const atFor = (n: number): number => 1000 + n * 1000

// Builds a valid choice from the data a pending decision itself carries, so the
// fuzz stream always resolves what it opens instead of stalling on it. Left to
// the random RESOLVE branch below (which only ever proposes a 'defend'
// choice), any pending kind would perpetually reject as "wrong choice for this
// decision" — `onDraw`/`onPush` also reject outright while `pending` is set,
// so turn rotation freezes for the remainder of the stream and every property
// built on `drive()` silently stops exercising anything past that point. A
// pending kind with no case here falls through to `null`, i.e. to that same
// random RESOLVE branch — the 'resolves every pending decision' property
// below is what turns that silent stall into a failing test instead. A later
// task that adds a new Pending variant (defend, neutralize503, crush,
// requestCard, giveCard) adds a case here.
function resolvePendingAction(state: GameState, n: number): Action | null {
  const { pending } = state
  if (!pending) return null
  const at = atFor(n)
  switch (pending.kind) {
    case 'handLimit': {
      const hand = state.players[pending.player].hand
      const cards = hand.slice(0, pending.excess).map((c) => c.uid)
      return { type: 'RESOLVE', player: pending.player, choice: { kind: 'handLimit', cards }, at }
    }
    case 'discardForRelease': {
      const hand = state.players[pending.player].hand
      // Neither the release nor its comboed Code Review can pay its own cost —
      // onPlay already guaranteed a spare exists before opening this pending.
      const spare = hand.find((c) => c.uid !== pending.release && c.uid !== pending.codeReview)
      if (!spare) return null
      return {
        type: 'RESOLVE',
        player: pending.player,
        choice: { kind: 'discardForRelease', card: spare.uid },
        at,
      }
    }
    case 'defend': {
      // Defend with the first legal card if one is held, otherwise take the hit
      // (`null`) — either way the pending resolves in one step.
      const card = pending.canDefendWith[0] ?? null
      return { type: 'RESOLVE', player: pending.player, choice: { kind: 'defend', card }, at }
    }
    default:
      return null
  }
}

// A deterministic pseudo-random action stream. Deliberately includes illegal
// actions — most of these will be rejected, which is exactly what totality means.
function fuzzAction(state: GameState, seed: number, n: number): Action {
  const resolving = resolvePendingAction(state, n)
  if (resolving) return resolving

  const pick = <T>(items: readonly T[], salt: number): T =>
    items[Math.floor(randomAt(seed, n * 8 + salt) * items.length)]
  const player: PlayerId = pick(state.seating, 1)
  const hand = state.players[player].hand
  const uid = hand.length > 0 ? pick(hand, 2).uid : 'no-such-card'
  const at = atFor(n)

  const kind = Math.floor(randomAt(seed, n * 8 + 3) * 7)
  switch (kind) {
    case 0:
      return { type: 'DRAW', player, at }
    case 1:
      return { type: 'PUSH', player, at }
    case 2:
      return { type: 'PLAY', player, card: uid, at }
    case 3:
      return { type: 'ATTACK', player, card: uid, at }
    case 4:
      return { type: 'PASS', player, at }
    case 5:
      return { type: 'WINDOW_EXPIRED', at }
    default:
      return { type: 'RESOLVE', player, choice: { kind: 'defend', card: null }, at }
  }
}

function drive(engine: Engine, state: GameState, seed: number, steps: number) {
  let current = state
  const events: Event[] = []
  for (let n = 0; n < steps; n += 1) {
    const r = engine.reduce(current, fuzzAction(current, seed, n))
    current = r.state
    events.push(...r.events)
  }
  return { state: current, events }
}

export function describeEngine(
  name: string,
  make: () => Engine,
  options: ConformanceOptions,
): void {
  describe(`engine conformance: ${name}`, () => {
    describe('determinism', () => {
      it('builds an identical game from an identical config', () => {
        const a = make().createGame(configFor(options, 777))
        const b = make().createGame(configFor(options, 777))
        expect(a).toEqual(b)
      })

      it('diverges on a different seed', () => {
        const a = make().createGame(configFor(options, 777))
        const b = make().createGame(configFor(options, 778))
        // `state.seed` is copied verbatim from config.seed, so a whole-state
        // `not.toEqual` would pass trivially on that one scalar even if the
        // shuffle and deal ignored the seed entirely. Assert on seed-derived
        // output instead: the draw-pile order and the dealt hands.
        expect(a.decks.main[0].map((c) => c.uid)).not.toEqual(b.decks.main[0].map((c) => c.uid))
        const handsA = a.seating.map((id) => a.players[id].hand.map((c) => c.uid))
        const handsB = b.seating.map((id) => b.players[id].hand.map((c) => c.uid))
        expect(handsA).not.toEqual(handsB)
      })

      it('yields identical state and events for an identical action stream', () => {
        const engine = make()
        const start = engine.createGame(configFor(options, 4242))
        const a = drive(engine, start, 31, 120)
        const b = drive(make(), engine.createGame(configFor(options, 4242)), 31, 120)
        expect(a.state).toEqual(b.state)
        expect(a.events).toEqual(b.events)
      })

      it('does not mutate the state handed to reduce, at every step', () => {
        const engine = make()
        let current = engine.createGame(configFor(options, 4242))
        // `drive()` reassigns `current` to the new state after each call, so
        // comparing only the very first input against a single snapshot would
        // never catch a `reduce` that mutates its argument on a later,
        // non-initial call — the likelier bug. Snapshot and compare every step.
        for (let n = 0; n < 60; n += 1) {
          const before = structuredClone(current)
          const r = engine.reduce(current, fuzzAction(current, 5, n))
          expect(current).toEqual(before)
          current = r.state
        }
      })
    })

    describe('totality', () => {
      it('never throws across a long fuzz stream', () => {
        const engine = make()
        const start = engine.createGame(configFor(options, 99))
        expect(() => drive(engine, start, 17, 400)).not.toThrow()
      })

      it('never throws across a long fuzz stream under a constrained hand limit', () => {
        const engine = make()
        const start = engine.createGame(configFor(options, 99, MEMORY_SETUP))
        expect(() => drive(engine, start, 17, 400)).not.toThrow()
      })

      it('rejects an unrecognised action and leaves the state identical', () => {
        const engine = make()
        const start = engine.createGame(configFor(options, 99))
        const bogus = { type: 'NOT_AN_ACTION', player: 'p1', at: 1 } as unknown as Action
        const r = engine.reduce(start, bogus)
        expect(r.state).toBe(start)
        expect(r.events.map((e) => e.type)).toEqual(['rejected'])
      })

      it('keeps state structurally valid throughout the stream', () => {
        const engine = make()
        const start = engine.createGame(configFor(options, 55))
        const { state } = drive(engine, start, 23, 300)
        expect(state.seating).toHaveLength(3)
        for (const id of state.seating) expect(state.players[id]).toBeDefined()
        expect(state.decks.main.length).toBeGreaterThan(0)
        expect(state.eventSeq).toBeGreaterThanOrEqual(start.eventSeq)
      })

      it('keeps state structurally valid and actually resolves a hand-limit decision', () => {
        const engine = make()
        const start = engine.createGame(configFor(options, 55, MEMORY_SETUP))
        const { state, events } = drive(engine, start, 23, 300)
        expect(state.seating).toHaveLength(3)
        for (const id of state.seating) expect(state.players[id]).toBeDefined()
        expect(state.decks.main.length).toBeGreaterThan(0)
        expect(state.eventSeq).toBeGreaterThanOrEqual(start.eventSeq)
        // Proves onHandLimit's committing path actually ran, not merely that
        // its rejection guards were exercised.
        const discardedForHandLimit = events.some(
          (e) => e.type === 'discarded' && e.reason === 'handLimit',
        )
        expect(discardedForHandLimit).toBe(true)
      })

      it('numbers every committed event uniquely and monotonically', () => {
        const engine = make()
        const start = engine.createGame(configFor(options, 55))
        const { events } = drive(engine, start, 23, 200)
        // A rejected action returns the state referentially unchanged (see
        // "rejects an unrecognised action" above), so its event's id is
        // necessarily a repeat of whatever the next id would be from that
        // unchanged state — that is not a defect, it falls directly out of the
        // no-mutation contract. Uniqueness and monotonicity are invariants of
        // the committed history, i.e. of events other than `rejected`.
        const committed = events.filter((e) => e.type !== 'rejected')
        const ids = committed.map((e) => e.id)
        expect(new Set(ids).size).toBe(ids.length)
        expect([...ids].sort((x, y) => x - y)).toEqual(ids)
      })
    })

    describe('progress', () => {
      // The defect this guards against is silent, not loud. Two different
      // fields can each hold the stream hostage for the rest of a run, and
      // every other property in this file would keep passing while exercising
      // almost nothing past that point:
      //  - a pending decision the fuzzer cannot resolve holds `state.pending`
      //    (`onDraw`/`onPush` reject outright while it is set);
      //  - an open reaction window that never closes holds `state.window`
      //    (same rejection, different gate) — and closing is not guaranteed
      //    by unanimous PASS alone: it is probabilistic per responder per
      //    step, the fuzzer never emits UNPASS, and a window can also close
      //    by expiring once its deadline has passed.
      // This test is what turns either silent coverage loss into a red test.
      const driveProgress = (setup: Setup, seed: number) => {
        const engine = make()
        let state = engine.createGame(configFor(options, seed, setup))
        let pendingStreak = 0
        let maxPendingStreak = 0
        let windowStreak = 0
        let maxWindowStreak = 0
        for (let n = 0; n < 400; n += 1) {
          state = engine.reduce(state, fuzzAction(state, seed, n)).state
          pendingStreak = state.pending ? pendingStreak + 1 : 0
          maxPendingStreak = Math.max(maxPendingStreak, pendingStreak)
          windowStreak = state.window ? windowStreak + 1 : 0
          maxWindowStreak = Math.max(maxWindowStreak, windowStreak)
        }
        return { maxPendingStreak, maxWindowStreak, finalTurnIndex: state.turn.index }
      }

      it('resolves every pending decision instead of stalling the stream', () => {
        const { maxPendingStreak, maxWindowStreak, finalTurnIndex } = driveProgress(
          BASE_SETUP,
          2468,
        )
        // One step of slack for the single step during which a decision is
        // genuinely open before the very next fuzzed action closes it again.
        expect(maxPendingStreak).toBeLessThanOrEqual(1)
        // A window legitimately stays open for several steps while responders
        // decide, so `<= 1` is the wrong bound here, unlike for `pending`. The
        // fuzz clock (`atFor`) makes a round-1 deadline reachable ~15 steps
        // after opening; from there, the probability of *not* drawing a
        // WINDOW_EXPIRED action (1 of 7 fuzz kinds) within k more steps is
        // (6/7)^k, under 0.1% by k = 45 — so 60 is a generous but non-trivial
        // bound: comfortably above every legitimately-closing run observed in
        // this suite (max 29), while far below what an unclosable window
        // produces (330, observed by forcing one during verification).
        expect(maxWindowStreak).toBeLessThanOrEqual(60)
        // A stalled stream also never rotates the turn again. This threshold
        // is unattainable without genuinely resolving decisions and windows
        // the fuzz stream itself opens (hand-limit discards, release costs,
        // reaction windows, ...).
        expect(finalTurnIndex).toBeGreaterThan(8)
      })

      // BASE_SETUP's unbounded hand limit means a `handLimit` pending never
      // arises under it (see the totality describe above) — without this run,
      // a regression in that specific case would be invisible to this file.
      it('resolves every pending decision under a constrained hand limit', () => {
        const { maxPendingStreak, maxWindowStreak, finalTurnIndex } = driveProgress(
          MEMORY_SETUP,
          2468,
        )
        expect(maxPendingStreak).toBeLessThanOrEqual(1)
        expect(maxWindowStreak).toBeLessThanOrEqual(60)
        expect(finalTurnIndex).toBeGreaterThan(8)
      })
    })

    describe('projection privacy', () => {
      // The property that would otherwise leak silently: nothing a viewer must not
      // know may appear anywhere in their view, at any point in a game.
      it('never exposes another hand or the ordered deck', () => {
        const engine = make()
        let state = engine.createGame(configFor(options, 2024))
        for (let n = 0; n < 150; n += 1) {
          for (const viewer of state.seating) {
            const serialized = JSON.stringify(engine.project(state, viewer))
            for (const other of state.seating) {
              if (other === viewer) continue
              for (const c of state.players[other].hand) {
                expect(serialized, `${viewer} can see ${other}'s ${c.uid}`).not.toContain(c.uid)
              }
            }
            for (const pile of state.decks.main) {
              for (const c of pile) {
                expect(serialized, `${viewer} can see deck card ${c.uid}`).not.toContain(c.uid)
              }
            }
            // The event deck is equally ordered and secret — Task 11's AI
            // event reveals make this load-bearing, not merely symmetric.
            for (const c of state.decks.events) {
              expect(serialized, `${viewer} can see event deck card ${c.uid}`).not.toContain(c.uid)
            }
          }
          state = engine.reduce(state, fuzzAction(state, 2024, n)).state
        }
      })

      it('reports opponents by hand count', () => {
        const engine = make()
        const state = engine.createGame(configFor(options, 2024))
        const view = engine.project(state, 'p1')
        expect(view.opponents.map((o) => o.id)).toEqual(['p2', 'p3'])
        for (const o of view.opponents) {
          expect(o.handCount).toBe(state.players[o.id].hand.length)
        }
      })

      it('offers no playable card to a player who is not on turn', () => {
        const engine = make()
        const state = engine.createGame(configFor(options, 2024))
        const idle = state.seating.filter((id) => id !== state.turn.player)
        for (const id of idle) expect(engine.project(state, id).self.playable).toEqual([])
      })

      it('never marks an unheld card as playable', () => {
        const engine = make()
        let state = engine.createGame(configFor(options, 8080))
        for (let n = 0; n < 120; n += 1) {
          for (const viewer of state.seating) {
            const view = engine.project(state, viewer)
            const held = new Set(state.players[viewer].hand.map((c) => c.uid))
            for (const uid of view.self.playable) expect(held.has(uid)).toBe(true)
          }
          state = engine.reduce(state, fuzzAction(state, 8080, n)).state
        }
      })
    })

    describe('legalTargets', () => {
      it('returns nothing for a card the actor cannot play', () => {
        const engine = make()
        const state = engine.createGame(configFor(options, 31337))
        expect(engine.legalTargets(state, 'p1', 'no-such-card')).toEqual([])
        const idle = state.seating.find((id) => id !== state.turn.player) as PlayerId
        const someCard = state.players[idle].hand[0].uid
        expect(engine.legalTargets(state, idle, someCard)).toEqual([])
      })

      it('never names the actor as their own target', () => {
        const engine = make()
        let state = engine.createGame(configFor(options, 31337))
        for (let n = 0; n < 80; n += 1) {
          const actor = state.turn.player
          for (const c of state.players[actor].hand) {
            for (const t of engine.legalTargets(state, actor, c.uid)) {
              if ('player' in t) expect(t.player).not.toBe(actor)
            }
          }
          state = engine.reduce(state, fuzzAction(state, 31337, n)).state
        }
      })
    })

    // Task 13 adds the rules-invariant suite here.
  })
}
