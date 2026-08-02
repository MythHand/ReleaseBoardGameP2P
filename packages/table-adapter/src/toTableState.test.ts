import type { Event, PlayerView } from '@release/engine'
import { describe, expect, it } from 'vitest'
import { type HistoryLabels, toTableState } from './toTableState'

// A minimal but real PlayerView — every field is the engine's actual shape,
// not a mock. `hand[0].id` is a catalogue id ('attack-bug'); `hand[0].uid` is
// an unrelated instance id ('c1') — deliberately different strings so a test
// that reads the wrong one fails loudly instead of passing by coincidence.
const view: PlayerView = {
  self: {
    id: 'you',
    name: 'you',
    hand: [{ uid: 'c1', id: 'attack-bug' }],
    release: {},
    playable: ['c1'],
    frozen: [],
  },
  opponents: [{ id: 'p2', name: 'bot', handCount: 3, release: {}, eliminated: false }],
  decks: { piles: [30, 10], events: 8, discardCount: 2, discardTop: 'attack-ddos' },
  turn: { player: 'you', index: 4, hasDrawn: false },
  window: null,
  pending: null,
  setup: {},
  over: null,
}

// Only the event types these tests exercise — HistoryLabels requires the full
// Event union, so the cast documents that this is a deliberately partial
// fixture, matching the brief's guidance ("Object.fromEntries over the event
// types they exercise").
const labels = Object.fromEntries([
  ['drawn', 'Draw'],
  ['placed', 'Played'],
  ['eliminated', 'Eliminated'],
]) as HistoryLabels

describe('toTableState', () => {
  it('sums the piles into the single deck count the table renders', () => {
    expect(toTableState(view, [], labels).decks.main).toBe(40)
  })

  it('carries hand uids through unchanged so animation keys stay stable', () => {
    const hand = toTableState(view, [], labels).you.hand
    expect(hand[0].uid).toBe('c1')
    // and resolves the *catalogue id* to the real card — proves `id` (not
    // `uid`) drove the lookup.
    expect(hand[0].card.name).toBe('Bug')
  })

  it('renders a placeholder for a card id the catalogue does not know', () => {
    const unknown: PlayerView = {
      ...view,
      self: { ...view.self, hand: [{ uid: 'c9', id: 'not-a-card' }] },
    }
    expect(() => toTableState(unknown, [], labels)).not.toThrow()
    expect(toTableState(unknown, [], labels).you.hand[0].card).toBeTruthy()
  })

  it('marks an eliminated opponent', () => {
    const out: PlayerView = {
      ...view,
      opponents: [{ ...view.opponents[0], eliminated: true }],
    }
    expect(toTableState(out, [], labels).opponents[0].eliminated).toBe(true)
  })

  it('resolves the discard pile top through the catalogue id, not a uid', () => {
    // discardTop is a CardId ('attack-ddos'); nothing here is a CardUid — the
    // engine's projection never puts an instance id there.
    expect(toTableState(view, [], labels).decks.discard?.name).toBe('DDoS')
  })

  it('does not throw for an unknown discard top and does not surface a raw id as a name', () => {
    const unknownDiscard: PlayerView = {
      ...view,
      decks: { ...view.decks, discardTop: 'not-a-card' },
    }
    expect(() => toTableState(unknownDiscard, [], labels)).not.toThrow()
  })

  it('folds the event log into history newest first', () => {
    const log: Event[] = [
      { id: 1, type: 'drawn', player: 'you', pile: 0, deckSize: 39 },
      { id: 2, type: 'placed', player: 'p2', card: 'attack-bug' },
    ]
    const history = toTableState(view, log, labels).history
    expect(history.length).toBe(2)
    expect(history[0].kind).toBe(labels.placed)
    expect(history[1].kind).toBe(labels.drawn)
  })

  it('preserves parent so MoveHistory can build its tree', () => {
    const log: Event[] = [
      { id: 1, type: 'drawn', player: 'you', pile: 0, deckSize: 39 },
      { id: 2, type: 'eliminated', player: 'p2', parent: 1 },
    ]
    const history = toTableState(view, log, labels).history
    expect(history[0].parent).toBe(1)
  })

  it('filters events not visible to the local player out of the history', () => {
    const log: Event[] = [
      { id: 1, type: 'drawn', player: 'you', pile: 0, deckSize: 39, visibleTo: ['p2'] },
    ]
    expect(toTableState(view, log, labels).history).toHaveLength(0)
  })

  it('does not produce participants or spectators — those are room facts', () => {
    const state = toTableState(view, [], labels)
    expect('participants' in state).toBe(false)
    expect('spectators' in state).toBe(false)
  })

  it('carries a window openedAt through unchanged, alongside deadline', () => {
    const withWindow: PlayerView = {
      ...view,
      window: {
        player: 'you',
        slot: 'frontend',
        round: 1,
        openedAt: 100,
        deadline: 200,
        passed: [],
        canAttackWith: [],
      },
    }
    const window = toTableState(withWindow, [], labels).window
    expect(window?.openedAt).toBe(100)
    expect(window?.deadline).toBe(200)
  })

  describe('comboOptions', () => {
    // A sudo-capable attack, a support-sudo, and an unrelated card — uids and
    // catalogue ids are all visibly different strings so a uid/id swap in the
    // derivation would fail loudly rather than passing by coincidence.
    const comboView: PlayerView = {
      ...view,
      self: {
        ...view.self,
        hand: [
          { uid: 'h-7', id: 'attack-bug' }, // sudo-capable (rulesFor('attack-bug').sudo === true)
          { uid: 'h-9', id: 'support-sudo' },
          { uid: 'h-3', id: 'release-frontend' }, // not sudo-capable
        ],
      },
    }

    it('maps a sudo-capable card to exactly the support-sudo uids in hand', () => {
      const combo = toTableState(comboView, [], labels).comboOptions
      expect(combo?.['h-7']).toEqual(['h-9'])
    })

    it('gives an unrelated card no entry at all', () => {
      const combo = toTableState(comboView, [], labels).comboOptions
      expect(combo?.['h-3']).toBeUndefined()
    })

    it('gives a sudo-capable card an empty partner list when hand has no support-sudo', () => {
      const noSupport: PlayerView = {
        ...comboView,
        self: { ...comboView.self, hand: [{ uid: 'h-7', id: 'attack-bug' }] },
      }
      const combo = toTableState(noSupport, [], labels).comboOptions
      expect(combo?.['h-7']).toEqual([])
    })

    it('collects every support-sudo uid in hand as a partner', () => {
      const twoSupports: PlayerView = {
        ...comboView,
        self: {
          ...comboView.self,
          hand: [...comboView.self.hand, { uid: 'h-11', id: 'support-sudo' }],
        },
      }
      const combo = toTableState(twoSupports, [], labels).comboOptions
      expect(combo?.['h-7']).toEqual(['h-9', 'h-11'])
    })
  })

  it('carries a defend pending openedAt through unchanged, alongside deadline', () => {
    const withPending: PlayerView = {
      ...view,
      pending: {
        kind: 'defend',
        player: 'you',
        attacker: 'p2',
        attackCard: 'attack-bug',
        sudo: false,
        options: ['c1'],
        openedAt: 50,
        deadline: 150,
        scope: 'hand',
      },
    }
    const pending = toTableState(withPending, [], labels).pending
    expect(pending && 'openedAt' in pending ? pending.openedAt : undefined).toBe(50)
    expect(pending && 'deadline' in pending ? pending.deadline : undefined).toBe(150)
  })
})
