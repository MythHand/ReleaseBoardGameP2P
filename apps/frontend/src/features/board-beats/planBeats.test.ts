import type { Event } from '@release/engine'
import { cardById } from '@release/ui'
import { describe, expect, it } from 'vitest'
import type { BoardState } from '~/entities/game/board'
import { classifyPiles, planBeats } from './planBeats'

const card = (id: string) =>
  cardById(id) ?? { id, name: id, category: 'attack', deck: 'base', art: '', tags: [], qty: 0 }

const boardBefore = (over: Partial<BoardState> = {}): BoardState =>
  ({
    you: {
      name: 'You',
      hand: [
        { uid: 'u1', card: card('attack-bug') },
        { uid: 'u2', card: card('protection-debugger') },
      ],
      release: { frontend: card('release-frontend') },
    },
    opponents: [
      { id: 'p2', name: 'Two', handCount: 3, release: { backend: card('release-backend') } },
    ],
    decks: { main: [10], events: 5, discardCount: 0 },
    selfId: 'p1',
    history: [],
    setup: {},
    playable: [],
    frozen: [],
    ...over,
  }) as BoardState

const discarded = (id: number, over: Partial<Extract<Event, { type: 'discarded' }>> = {}): Event =>
  ({ id, type: 'discarded', player: 'p1', card: 'attack-bug', reason: 'effect', ...over }) as Event

const attacked = (over: Partial<Extract<Event, { type: 'attacked' }>> & { id: number }): Event =>
  ({
    type: 'attacked',
    attacker: 'p1',
    card: 'attack-bug',
    sudo: false,
    target: 'p2',
    ...over,
  }) as Event

const released = (over: Partial<Extract<Event, { type: 'released' }>> & { id: number }): Event =>
  ({ type: 'released', player: 'p1', slot: 'frontend', card: 'release-frontend', ...over }) as Event

const tookHit = (over: Partial<Extract<Event, { type: 'tookHit' }>> & { id: number }): Event =>
  ({ type: 'tookHit', player: 'p1', ...over }) as Event

const defended = (over: Partial<Extract<Event, { type: 'defended' }>> & { id: number }): Event =>
  ({ type: 'defended', player: 'p1', card: 'defense-hotfix', effect: 'cancel', ...over }) as Event

// The pending a resolving `defended`/`tookHit` sees on screen: `before` still
// carries it, because the resolution hasn't happened yet as far as the board
// shown before this batch is concerned (I1).
type DefendPending = Extract<NonNullable<BoardState['pending']>, { kind: 'defend' }>
const defendPending = (over: Partial<DefendPending> = {}): DefendPending =>
  ({
    kind: 'defend',
    player: 'p1',
    attacker: 'p2',
    attackCard: 'attack-bug',
    sudo: true,
    options: [],
    openedAt: 0,
    deadline: 0,
    scope: 'hand',
    ...over,
  }) as DefendPending

describe('planBeats', () => {
  it('yields nothing for a batch with no choreography', () => {
    const events: Event[] = [
      { id: 1, type: 'turnStarted', player: 'p1', index: 0 },
      { id: 2, type: 'passed', player: 'p1' },
    ]
    expect(planBeats(events, boardBefore())).toEqual([])
  })

  it('flies the player’s own discard from its slot in the fan', () => {
    const [beat] = planBeats([discarded(4)], boardBefore())
    expect(beat.kind === 'discard' && beat.cards).toEqual([
      { key: 'd4', eventId: 4, card: 'attack-bug', source: { kind: 'hand', index: 0 } },
    ])
  })

  // The step's own rule: cards leave one by one but ALL AT ONCE. A hand-limit
  // discard of three is one gesture, not three.
  it('puts every discard of one batch in a single beat', () => {
    const events = [
      discarded(4, { reason: 'handLimit' }),
      discarded(5, { card: 'protection-debugger', reason: 'handLimit' }),
    ]
    const beats = planBeats(events, boardBefore())
    expect(beats).toHaveLength(1)
    const [beat] = beats
    expect(beat.kind === 'discard' && beat.cards.map((c) => c.key)).toEqual(['d4', 'd5'])
    expect(beat.key).toBe('discard:4')
  })

  it('claims each hand slot once when two copies of a card go out together', () => {
    const state = boardBefore({
      you: {
        name: 'You',
        hand: [
          { uid: 'u1', card: card('attack-bug') },
          { uid: 'u2', card: card('attack-bug') },
        ],
        release: {},
      },
    } as Partial<BoardState>)
    const [beat] = planBeats([discarded(4), discarded(5)], state)
    expect(beat.kind === 'discard' && beat.cards.map((c) => c.source)).toEqual([
      { kind: 'hand', index: 0 },
      { kind: 'hand', index: 1 },
    ])
  })

  it('flies a destroyed card out of the release slot it stood in', () => {
    const [beat] = planBeats(
      [discarded(4, { card: 'release-frontend', reason: 'destroyed' })],
      boardBefore(),
    )
    expect(beat.kind === 'discard' && beat.cards[0].source).toEqual({
      kind: 'release',
      player: 'p1',
      slot: 'frontend',
    })
  })

  // `neutralized` has TWO producers and they are not the same movement: a
  // sacrifice takes a release out of the zone, but a Debugger answering a 503 is
  // played from the HAND and never touches the zone — and that is the commoner of
  // the two. Treating the reason as decisive left it with no source at all, so it
  // never animated. The reason narrows where to look first; it does not decide.
  it('falls through to the hand when a neutralized card was never in the zone', () => {
    const [beat] = planBeats(
      [discarded(4, { card: 'protection-debugger', reason: 'neutralized' })],
      boardBefore(),
    )
    expect(beat.kind === 'discard' && beat.cards[0].source).toEqual({ kind: 'hand', index: 1 })
  })

  it('flies an opponent’s destroyed release out of their own slot', () => {
    const [beat] = planBeats(
      [discarded(4, { player: 'p2', card: 'release-backend', reason: 'destroyed' })],
      boardBefore(),
    )
    expect(beat.kind === 'discard' && beat.cards[0].source).toEqual({
      kind: 'release',
      player: 'p2',
      slot: 'backend',
    })
  })

  it('flies an opponent’s hand discard from their seat', () => {
    const [beat] = planBeats([discarded(4, { player: 'p2' })], boardBefore())
    expect(beat.kind === 'discard' && beat.cards[0].source).toEqual({ kind: 'seat', player: 'p2' })
  })

  // THE UNDECIDED CASE. The rule for a beat whose target is already gone is not
  // settled (docs/animations/backlog.md), so nothing is invented here: a card
  // with no source is simply not flown, exactly like an event with no
  // choreography at all. It still reaches the discard, because the projection
  // puts it there — the animation is what is skipped, never the outcome.
  it('drops a card whose source is not on the board, rather than guessing one', () => {
    const beats = planBeats([discarded(4, { card: 'attack-ddos' })], boardBefore())
    expect(beats).toEqual([])
  })

  it('keeps the cards it can aim when one of a batch has no source', () => {
    const [beat] = planBeats(
      [discarded(4, { card: 'attack-ddos' }), discarded(5, { card: 'attack-bug' })],
      boardBefore(),
    )
    expect(beat.kind === 'discard' && beat.cards.map((c) => c.key)).toEqual(['d5'])
  })
})

const drawn = (id: number, over: Partial<Extract<Event, { type: 'drawn' }>> = {}): Event =>
  ({ id, type: 'drawn', player: 'p1', card: 'attack-bug', pile: 0, deckSize: 39, ...over }) as Event

describe('planBeats — the draw', () => {
  it('reads my own draw off the card the event still carries', () => {
    const [beat] = planBeats([drawn(4)], boardBefore())
    expect(beat).toMatchObject({ kind: 'draw' })
    expect(beat.kind === 'draw' && beat.draws[0]).toMatchObject({
      eventId: 4,
      pile: 0,
      mine: true,
      card: 'attack-bug',
    })
  })

  // The redaction leaves the event and takes the card. That, and only that, is
  // what tells an onlooker's draw apart from a trigger.
  it('reads an opponent’s draw as a face-down flight to their seat', () => {
    const [beat] = planBeats([drawn(4, { player: 'p2', card: undefined })], boardBefore())
    expect(beat.kind === 'draw' && beat.draws[0]).toMatchObject({
      player: 'p2',
      mine: false,
      card: undefined,
      reveal: undefined,
    })
  })

  it('names a trigger from the reveal that follows it', () => {
    const events: Event[] = [
      drawn(4, { card: undefined }),
      { id: 5, type: 'revealed', player: 'p1', card: 'trigger-error-503' } as Event,
      discarded(6, { card: 'trigger-error-503', reason: 'trigger' }),
    ]
    const beats = planBeats(events, boardBefore())
    expect(beats).toHaveLength(1)
    expect(beats[0].kind === 'draw' && beats[0].draws[0].reveal).toEqual({
      card: 'trigger-error-503',
      discardId: 6,
    })
  })

  // The trigger's card is at the CENTRE when it is filed, not in a hand or a
  // zone. The draw beat flies it out from where it stands, so the discard
  // planner must not also claim it — that would be two flights for one card.
  it('leaves the trigger’s own discard to the draw that revealed it', () => {
    const events: Event[] = [
      drawn(4, { card: undefined }),
      { id: 5, type: 'aiRevealed', player: 'p1', aiCard: 'trigger-ai', eventCard: 'ai-x' } as Event,
      discarded(6, { card: 'trigger-ai', reason: 'trigger' }),
    ]
    const beats = planBeats(events, boardBefore())
    expect(beats.map((b) => b.kind)).toEqual(['draw'])
  })

  // Task 1 stopped banking a 503 at reveal — it is held on the pending until
  // answered — so the reveal can arrive with nothing behind it at all.
  it('plans a revealed trigger that stands, with no discard of its own', () => {
    const events: Event[] = [
      drawn(4, { card: undefined }),
      { id: 5, type: 'revealed', player: 'p1', card: 'trigger-error-503' } as Event,
    ]
    const beats = planBeats(events, boardBefore())
    expect(beats).toHaveLength(1)
    expect(beats[0].kind === 'draw' && beats[0].draws[0].reveal).toEqual({
      card: 'trigger-error-503',
    })
  })

  it('still plans a revealed trigger that files itself, with its discard id', () => {
    const events: Event[] = [
      drawn(4, { card: undefined }),
      { id: 5, type: 'revealed', player: 'p1', card: 'trigger-error-503' } as Event,
      discarded(6, { card: 'trigger-error-503', reason: 'trigger' }),
    ]
    const beats = planBeats(events, boardBefore())
    expect(beats[0].kind === 'draw' && beats[0].draws[0].reveal).toEqual({
      card: 'trigger-error-503',
      discardId: 6,
    })
    // and it is claimed, so the discard planner does not fly it a second time
    expect(beats.filter((b) => b.kind === 'discard')).toEqual([])
  })

  it('puts a multi-draw in one beat, in the order it was drawn', () => {
    const beats = planBeats([drawn(4), drawn(5, { pile: 1 })], boardBefore())
    expect(beats).toHaveLength(1)
    expect(beats[0].kind === 'draw' && beats[0].draws.map((d) => d.pile)).toEqual([0, 1])
  })
})

describe('planBeats — order', () => {
  // The refill happens INSIDE the draw sequence, before the card is taken
  // (fake/reduce.ts:88). A queue that played these the other way round would
  // show a card drawn from a pile that has not been rebuilt yet.
  it('rebuilds the deck before the draw it made possible', () => {
    const events: Event[] = [
      { id: 3, type: 'deckReshuffled', cards: 12 } as Event,
      drawn(4),
      { id: 5, type: 'pilesChanged', piles: [11] } as Event,
    ]
    const beats = planBeats(
      events,
      boardBefore({ decks: { main: [0], events: 5, discardCount: 12 } } as Partial<BoardState>),
    )
    expect(beats.map((b) => b.kind)).toEqual(['reshuffle', 'draw'])
  })

  // A run coalesces; it does not reach across something else. Two discards on
  // either side of a draw are two gestures, because that is what happened.
  it('does not let a discard run swallow one on the far side of a draw', () => {
    const events = [discarded(4), drawn(5), discarded(6, { card: 'protection-debugger' })]
    const beats = planBeats(events, boardBefore())
    expect(beats.map((b) => b.kind)).toEqual(['discard', 'draw', 'discard'])
  })

  // A batch can span more than one engine action (useBeats.ts) — a run of one
  // kind must not reach across an unrelated event that carries no choreography
  // of its own. Two draws either side of a turn boundary are two gestures, not
  // one just because nothing visible happened in between.
  it('does not let a draw run swallow one on the far side of an unrelated event', () => {
    const events: Event[] = [
      drawn(4),
      { id: 5, type: 'turnEnded', player: 'p1' } as Event,
      drawn(6),
    ]
    const beats = planBeats(events, boardBefore())
    expect(beats.map((b) => b.kind)).toEqual(['draw', 'draw'])
  })

  it('does not let a discard run swallow one on the far side of an unrelated event', () => {
    const events = [
      discarded(4),
      { id: 5, type: 'turnEnded', player: 'p1' } as Event,
      discarded(6, { card: 'protection-debugger' }),
    ]
    const beats = planBeats(events, boardBefore())
    expect(beats.map((b) => b.kind)).toEqual(['discard', 'discard'])
  })
})

describe('planBeats — the combo pair (#100)', () => {
  it('an attacked event plans an attackPlaced beat, sudo or not', () => {
    const plans = planBeats(
      [attacked({ id: 5, attacker: 'p2', card: 'attack-bug', sudo: true, target: 'p1' })],
      boardBefore(),
    )
    expect(plans).toEqual([
      {
        kind: 'attackPlaced',
        key: 'attack:5',
        eventId: 5,
        attacker: 'p2',
        card: 'attack-bug',
        sudo: true,
        // carried since #101, Fix C: the runner needs to know whether the
        // answer is ours before it may publish a shadow saying one is owed
        target: 'p1',
      },
    ])
  })

  it('a released with codeReview plans a releasePlaced beat', () => {
    const withReview = planBeats(
      [
        released({
          id: 7,
          player: 'p1',
          slot: 'frontend',
          card: 'release-frontend',
          codeReview: 'support-code-review',
        }),
      ],
      boardBefore(),
    )
    expect(withReview).toEqual([
      {
        kind: 'releasePlaced',
        key: 'release:7',
        eventId: 7,
        player: 'p1',
        slot: 'frontend',
        card: 'release-frontend',
        codeReview: 'support-code-review',
      },
    ])
  })

  it('plans a beat for a plain release too, and links the cost that paid for it', () => {
    const plans = planBeats(
      [
        discarded(6, { card: 'attack-bug', reason: 'releaseCost' }),
        released({ id: 7, player: 'p1', slot: 'frontend', card: 'release-frontend' }),
      ],
      boardBefore(),
    )
    expect(plans).toEqual([
      {
        kind: 'releasePlaced',
        key: 'release:7',
        eventId: 7,
        player: 'p1',
        slot: 'frontend',
        card: 'release-frontend',
        cost: { eventId: 6, card: 'attack-bug' },
      },
    ])
  })

  it('does not let the discard beat fly the cost a second time', () => {
    // the cost belongs to the release beat: it is shown open at the centre and
    // leaves from there, not from the hand slot it had already left
    const plans = planBeats(
      [
        discarded(6, { card: 'attack-bug', reason: 'releaseCost' }),
        released({ id: 7, card: 'release-frontend' }),
      ],
      boardBefore(),
    )
    expect(plans.some((p) => p.kind === 'discard')).toBe(false)
  })

  it('plans a release with no cost in easy mode', () => {
    const plans = planBeats([released({ id: 7, card: 'release-frontend' })], boardBefore())
    expect(plans).toEqual([
      {
        kind: 'releasePlaced',
        key: 'release:7',
        eventId: 7,
        player: 'p1',
        slot: 'frontend',
        card: 'release-frontend',
      },
    ])
  })

  it('keeps carrying the Code Review of a comboed release', () => {
    const plans = planBeats(
      [released({ id: 7, card: 'release-frontend', codeReview: 'support-code-review' })],
      boardBefore(),
    )
    expect(plans[0]).toMatchObject({ kind: 'releasePlaced', codeReview: 'support-code-review' })
  })

  it('does not claim an unrelated discard sitting before a release', () => {
    // only `releaseCost` is the cost. A hand-limit discard that happens to
    // precede a release is its own gesture and keeps its own beat.
    const plans = planBeats(
      [
        discarded(6, { card: 'attack-bug', reason: 'handLimit' }),
        released({ id: 7, card: 'release-frontend' }),
      ],
      boardBefore(),
    )
    expect(plans.map((p) => p.kind)).toEqual(['discard', 'releasePlaced'])
  })

  it('resolution discards of the pending pair take the pair exit, others keep the discard beat', () => {
    const withPending = boardBefore({ pending: defendPending() } as Partial<BoardState>)
    const events = [
      tookHit({ id: 9 }),
      discarded(10, { player: 'p2', card: 'attack-bug', reason: 'attackSpent' }),
      discarded(11, { player: 'p2', card: 'support-sudo', reason: 'attackSpent' }),
    ]
    const plans = planBeats(events, withPending)
    expect(plans).toEqual([
      {
        kind: 'pairToDiscard',
        key: 'pairOut:10',
        main: { eventId: 10, card: 'attack-bug' },
        aux: { eventId: 11, card: 'support-sudo' },
      },
    ])
  })

  // sudo:false → pending carries no sudo half at all, so there is only ONE
  // discard to route — and it still goes through pairToDiscard, not the
  // ordinary discard beat: the centre card is what flies, and sourceOf could
  // never find it (it is in no hand and no zone).
  it('a plain attack resolution routes its one discard through pairToDiscard too', () => {
    const withPending = boardBefore({
      pending: defendPending({ sudo: false }),
    } as Partial<BoardState>)
    const events = [
      tookHit({ id: 9 }),
      discarded(10, { player: 'p2', card: 'attack-bug', reason: 'attackSpent' }),
    ]
    const plans = planBeats(events, withPending)
    expect(plans).toEqual([
      { kind: 'pairToDiscard', key: 'pairOut:10', main: { eventId: 10, card: 'attack-bug' } },
    ])
  })

  // Rollback gives the attack card back to the attacker's hand instead of
  // discarding it (fake/attacks.ts's `effect === 'return'` branch), so only
  // the sudo half is banked — the pending still names `attackCard`, but no
  // `discarded` for it ever arrives. The sudo match must not require a
  // `pairToDiscard` to already exist, or this half would have nothing to join.
  it('rollback return: only the sudo half flies out', () => {
    const withPending = boardBefore({ pending: defendPending() } as Partial<BoardState>)
    const events = [discarded(10, { player: 'p2', card: 'support-sudo', reason: 'attackSpent' })]
    const plans = planBeats(events, withPending)
    expect(plans).toEqual([
      { kind: 'pairToDiscard', key: 'pairOut:10', aux: { eventId: 10, card: 'support-sudo' } },
    ])
  })

  // Rollback is itself sudo-capable: a DEFENDER can combo their OWN
  // `support-sudo` onto a Rollback defence. The engine banks that group
  // (`defenceSpent`) BEFORE the attacker's group (`attackSpent`) — the
  // reverse of every other resolution — so the batch carries TWO
  // `support-sudo` discards with different reasons and players. Only the
  // `attackSpent` one (the attacker's own combo, the pending's real other
  // half) may ride the pair exit; the defender's `defenceSpent` one is an
  // ordinary discard, same as their Rollback card.
  it('a defender’s own sudo combo on a Rollback does not steal the pending pair’s aux slot', () => {
    // The LOCAL player (p1) is the attacker here — its sudo card left its own
    // hand back when the attack was thrown, so `sourceOf` finds nothing for
    // it if this ever falls through to the ordinary discard path (the
    // silent-vanish failure mode this test pins).
    const withPending = boardBefore({
      pending: defendPending({ player: 'p2', attacker: 'p1' }),
    } as Partial<BoardState>)
    const events = [
      discarded(9, { player: 'p2', card: 'defense-rollback', reason: 'defenceSpent' }),
      discarded(10, { player: 'p2', card: 'support-sudo', reason: 'defenceSpent' }),
      discarded(11, { player: 'p1', card: 'support-sudo', reason: 'attackSpent' }),
    ]
    const plans = planBeats(events, withPending)
    expect(plans).toEqual([
      {
        kind: 'discard',
        key: 'discard:9',
        cards: [
          {
            key: 'd9',
            eventId: 9,
            card: 'defense-rollback',
            source: { kind: 'seat', player: 'p2' },
          },
          { key: 'd10', eventId: 10, card: 'support-sudo', source: { kind: 'seat', player: 'p2' } },
        ],
      },
      { kind: 'pairToDiscard', key: 'pairOut:11', aux: { eventId: 11, card: 'support-sudo' } },
    ])
  })
})

describe('planBeats — the answer to an attack (#101)', () => {
  const pending = () =>
    boardBefore({
      pending: defendPending({ scope: 'release', sudo: false }),
    } as Partial<BoardState>)

  it('plans one exchange for a cancelling defence and claims both spent cards', () => {
    const plans = planBeats(
      [
        defended({ id: 12, player: 'p1', card: 'defense-hotfix', effect: 'cancel' }),
        discarded(13, { player: 'p2', card: 'attack-bug', reason: 'attackSpent' }),
        discarded(14, { player: 'p1', card: 'defense-hotfix', reason: 'defenceSpent' }),
      ],
      pending(),
    )
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({
      kind: 'covered',
      key: 'covered:12',
      defender: 'p1',
      card: 'defense-hotfix',
      effect: 'cancel',
      attacker: 'p2',
      attackCard: 'attack-bug',
      spent: [
        { eventId: 13, card: 'attack-bug' },
        { eventId: 14, card: 'defense-hotfix' },
      ],
    })
  })

  // ===== MISSING FIXTURE 3 (#101, Fix C, finding 4) — ONE SYNC FLUSH =====
  //
  // Nothing in the suite ever planned a batch in which the attack and its
  // answer arrive together, so nothing noticed that `before.pending` — the
  // board as it stood BEFORE the batch — is the only thing this planner asks
  // about what is standing at the centre. In a star topology that batch is
  // the NORM rather than an edge case: every peer that is neither attacker
  // nor defender gets both events in one relayed sync, so the defence
  // animation this branch exists to build was missing for spectators, which
  // is most of the table in a 3+ player game. The spent cards simply appeared
  // in the heap with no cover ever shown.
  //
  // The planner already tracks a table fact through a batch this way: `piles`
  // starts at `before.decks.main` and every `pilesChanged` moves it on. The
  // attack standing at the centre is the same kind of fact.
  it('plans the exchange when the attack and its answer arrive in one batch', () => {
    const plans = planBeats(
      [
        attacked({ id: 11, attacker: 'p2', card: 'attack-bug', sudo: false, target: 'p1' }),
        defended({ id: 12, player: 'p1', card: 'defense-hotfix', effect: 'cancel' }),
        discarded(13, { player: 'p2', card: 'attack-bug', reason: 'attackSpent' }),
        discarded(14, { player: 'p1', card: 'defense-hotfix', reason: 'defenceSpent' }),
      ],
      // no pending on screen yet — this peer is seeing the attack for the
      // first time in the same flush that resolves it
      boardBefore(),
    )
    expect(plans.map((p) => p.kind)).toEqual(['attackPlaced', 'covered'])
    expect(plans[1]).toMatchObject({
      kind: 'covered',
      key: 'covered:12',
      defender: 'p1',
      attacker: 'p2',
      attackCard: 'attack-bug',
      attackSudo: false,
      spent: [
        { eventId: 13, card: 'attack-bug' },
        { eventId: 14, card: 'defense-hotfix' },
      ],
    })
  })

  // The same flush, the other resolution: nobody defends. The attack card and
  // the sudo that backed it leave the CENTRE as a pair — `sourceOf` could
  // never find them (no hand, no zone), so `pairToDiscard` is the only thing
  // that flies them, and it too was keyed off `before.pending`.
  it('splits the pending pair when the attack and the hit arrive in one batch', () => {
    const plans = planBeats(
      [
        attacked({ id: 11, attacker: 'p2', card: 'attack-bug', sudo: true, target: 'p1' }),
        tookHit({ id: 12, player: 'p1' }),
        discarded(13, { player: 'p2', card: 'attack-bug', reason: 'attackSpent' }),
        discarded(14, { player: 'p2', card: 'support-sudo', reason: 'attackSpent' }),
      ],
      boardBefore(),
    )
    expect(plans.map((p) => p.kind)).toEqual(['attackPlaced', 'pairToDiscard'])
    expect(plans[1]).toMatchObject({
      kind: 'pairToDiscard',
      main: { eventId: 13, card: 'attack-bug' },
      aux: { eventId: 14, card: 'support-sudo' },
    })
  })

  it('sends a plain Rollback’s attack back to the attacker and never banks it', () => {
    const plans = planBeats(
      [
        defended({ id: 12, player: 'p1', card: 'defense-rollback', effect: 'return' }),
        discarded(14, { player: 'p1', card: 'defense-rollback', reason: 'defenceSpent' }),
      ],
      pending(),
    )
    expect(plans[0]).toMatchObject({
      kind: 'covered',
      effect: 'return',
      returnTo: 'p2',
      spent: [{ eventId: 14, card: 'defense-rollback' }],
    })
  })

  it('keeps a sudo Rollback’s attack for the defender', () => {
    // `attacks.ts:247` — recipient = sudoDefence ? the defender : the attacker.
    // The engine records the defender's sudo as a `defenceSpent` discard of
    // `support-sudo`, and that is the only signal the return changed hands.
    const plans = planBeats(
      [
        defended({ id: 12, player: 'p1', card: 'defense-rollback', effect: 'return' }),
        discarded(14, { player: 'p1', card: 'defense-rollback', reason: 'defenceSpent' }),
        discarded(15, { player: 'p1', card: 'support-sudo', reason: 'defenceSpent' }),
      ],
      pending(),
    )
    expect(plans[0]).toMatchObject({ effect: 'return', returnTo: 'p1', sudo: 'support-sudo' })
  })

  it('returns a sudo-backed attack to the attacker when the Rollback was plain', () => {
    const plans = planBeats(
      [
        defended({ id: 12, player: 'p1', card: 'defense-rollback', effect: 'return' }),
        discarded(13, { player: 'p2', card: 'support-sudo', reason: 'attackSpent' }),
        discarded(14, { player: 'p1', card: 'defense-rollback', reason: 'defenceSpent' }),
      ],
      boardBefore({
        pending: defendPending({ scope: 'release', sudo: true }),
      } as Partial<BoardState>),
    )
    // the sudo in this exchange is the ATTACKER's, so the defender comboed
    // nothing and the attack goes home to them
    expect(plans[0]).toMatchObject({ effect: 'return', returnTo: 'p2', sudo: undefined })
  })

  it('carries the attack’s own sudo so the exchange leaves as the pair it was', () => {
    const plans = planBeats(
      [
        defended({ id: 12, player: 'p1', card: 'defense-hotfix', effect: 'cancel' }),
        discarded(13, { player: 'p2', card: 'attack-bug', reason: 'attackSpent' }),
        discarded(14, { player: 'p2', card: 'support-sudo', reason: 'attackSpent' }),
        discarded(15, { player: 'p1', card: 'defense-hotfix', reason: 'defenceSpent' }),
      ],
      boardBefore({
        pending: defendPending({ scope: 'release', sudo: true }),
      } as Partial<BoardState>),
    )
    expect(plans[0]).toMatchObject({ kind: 'covered', attackSudo: true })
    expect((plans[0] as { spent: unknown[] }).spent).toHaveLength(3)
  })

  it('plans no movement for the events that are only a change of state', () => {
    // The window opening and closing, a pass, a hit taken, a monitoring
    // destroyed — these are things the projection SHOWS (the dock, the ring,
    // the badges), not things that fly. Planning nothing is the default and is
    // pinned here on purpose: the alternative is inventing choreography, which
    // this project sends to the backlog instead.
    const plans = planBeats(
      [
        { id: 30, type: 'windowOpened', player: 'p1', slot: 'frontend', round: 1, deadline: 0 },
        { id: 31, type: 'passed', player: 'p2' },
        { id: 32, type: 'unpassed', player: 'p2' },
        { id: 33, type: 'windowClosed', player: 'p1', slot: 'frontend' },
      ] as Event[],
      boardBefore(),
    )
    expect(plans).toEqual([])
  })

  it('leaves the take-hit resolution to the pair exit it already had', () => {
    const plans = planBeats(
      [
        tookHit({ id: 9 }),
        discarded(10, { player: 'p2', card: 'attack-bug', reason: 'attackSpent' }),
      ],
      boardBefore({ pending: defendPending({ scope: 'release' }) } as Partial<BoardState>),
    )
    expect(plans.map((p) => p.kind)).toEqual(['pairToDiscard'])
  })

  // Security Bug: the release beaten by the attack is not destroyed — it is
  // TAKEN, into the attacker's own zone. `attacks.test.ts`'s own
  // "opens a fresh window on the stolen release" pins the real event order —
  // `tookHit`, `discarded(attackSpent)`, `releaseStolen`, `windowClosed`,
  // `windowOpened` — so this reaches through the whole batch, not just the
  // one event, to pin that the pair's own exit still gets its beat AND the
  // crossing gets its own, one event apiece.
  it('plans the steal as a crossing between two zones', () => {
    const plans = planBeats(
      [
        tookHit({ id: 9 }),
        discarded(10, { player: 'p2', card: 'attack-bug', reason: 'attackSpent' }),
        {
          id: 20,
          type: 'releaseStolen',
          from: 'p1',
          to: 'p2',
          slot: 'frontend',
          card: 'release-frontend',
        } as Event,
        { id: 21, type: 'windowClosed', player: 'p2', slot: 'frontend' } as Event,
        {
          id: 22,
          type: 'windowOpened',
          player: 'p2',
          slot: 'frontend',
          round: 1,
          deadline: 0,
        } as Event,
      ],
      boardBefore({ pending: defendPending({ scope: 'release' }) } as Partial<BoardState>),
    )
    expect(plans).toEqual([
      { kind: 'pairToDiscard', key: 'pairOut:10', main: { eventId: 10, card: 'attack-bug' } },
      {
        kind: 'stolen',
        key: 'stolen:20',
        eventId: 20,
        from: 'p1',
        to: 'p2',
        slot: 'frontend',
        card: 'release-frontend',
      },
    ])
  })
})

describe('planBeats — the answer to an Error 503 (#102)', () => {
  const neutralized = (
    over: Partial<Extract<Event, { type: 'neutralized' }>> & { id: number },
  ): Event => ({ type: 'neutralized', player: 'p1', method: 'debugger', ...over }) as Event

  const alarmPending = () =>
    ({
      kind: 'neutralize503',
      player: 'p1',
      card: 'trigger-error-503',
      methods: ['debugger'],
    }) as NonNullable<BoardState['pending']>

  it('plans a Debugger answer as one exchange', () => {
    const plans = planBeats(
      [
        neutralized({ id: 10 }),
        discarded(11, { card: 'trigger-error-503', reason: 'trigger' }),
        discarded(12, { card: 'protection-debugger', reason: 'neutralized' }),
      ],
      boardBefore({ pending: alarmPending() }),
    )
    expect(plans).toEqual([
      {
        kind: 'neutralized',
        key: 'neutralized:10',
        eventId: 10,
        player: 'p1',
        method: 'debugger',
        alarm: { eventId: 11, card: 'trigger-error-503' },
        spent: [{ eventId: 12, card: 'protection-debugger' }],
      },
    ])
  })

  it('plans a Monitoring answer with nothing spent', () => {
    const plans = planBeats(
      [
        neutralized({ id: 10, method: 'monitoring' }),
        discarded(11, { card: 'trigger-error-503', reason: 'trigger' }),
      ],
      boardBefore({ pending: alarmPending() }),
    )
    expect(plans).toEqual([
      {
        kind: 'neutralized',
        key: 'neutralized:10',
        eventId: 10,
        player: 'p1',
        method: 'monitoring',
        alarm: { eventId: 11, card: 'trigger-error-503' },
        spent: [],
      },
    ])
  })

  it('names the slot a sacrificed release flies out of, and takes its Code Review with it', () => {
    const before = boardBefore({
      pending: alarmPending(),
      you: {
        name: 'You',
        hand: [],
        release: { frontend: card('release-frontend') },
        support: { frontend: card('support-code-review') },
      },
    } as Partial<BoardState>)
    const plans = planBeats(
      [
        neutralized({ id: 10, method: 'sacrifice' }),
        discarded(11, { card: 'trigger-error-503', reason: 'trigger' }),
        {
          id: 12,
          type: 'releaseDestroyed',
          player: 'p1',
          slot: 'frontend',
          card: 'release-frontend',
        } as Event,
        discarded(13, { card: 'release-frontend', reason: 'neutralized' }),
        discarded(14, { card: 'support-code-review', reason: 'neutralized' }),
      ],
      before,
    )
    expect(plans).toEqual([
      {
        kind: 'neutralized',
        key: 'neutralized:10',
        eventId: 10,
        player: 'p1',
        method: 'sacrifice',
        slot: 'frontend',
        alarm: { eventId: 11, card: 'trigger-error-503' },
        spent: [
          { eventId: 13, card: 'release-frontend' },
          { eventId: 14, card: 'support-code-review' },
        ],
      },
    ])
  })

  it('leaves nothing for the discard planner to fly twice', () => {
    const plans = planBeats(
      [
        neutralized({ id: 10 }),
        discarded(11, { card: 'trigger-error-503', reason: 'trigger' }),
        discarded(12, { card: 'protection-debugger', reason: 'neutralized' }),
      ],
      boardBefore({ pending: alarmPending() }),
    )
    expect(plans.filter((p) => p.kind === 'discard')).toEqual([])
  })
})

describe('classifyPiles', () => {
  // The event carries counts and nothing else — not the operation, not the
  // index. Recovering it positionally is a derivation, not a guess: a split
  // leaves the halves where the pile was, so one index accounts for two.
  it('reads a split from the pile that became two', () => {
    expect(classifyPiles([24], [12, 12])).toEqual({ kind: 'split', at: 0, piles: [12, 12] })
    expect(classifyPiles([10, 20, 30], [10, 10, 10, 30])).toEqual({
      kind: 'split',
      at: 1,
      piles: [10, 10, 10, 30],
    })
  })

  it('reads a merge, and whether the discard came with it', () => {
    expect(classifyPiles([4, 6], [10])).toEqual({ kind: 'merge', withDiscard: false, piles: [10] })
    // Sudo gathers the discard in too, so the survivor holds more than the
    // piles did — which is the only signal that the discard flew.
    expect(classifyPiles([4, 6], [15])).toEqual({ kind: 'merge', withDiscard: true, piles: [15] })
  })

  it('reads Git Branch + Sudo’s second step as the discard becoming a pile', () => {
    expect(classifyPiles([12, 12], [12, 12, 6])).toEqual({
      kind: 'fromDiscard',
      at: 2,
      piles: [12, 12, 6],
    })
  })

  // A pile that runs out ceases to exist. Nothing moves — the cards were face
  // down before and there are none after — so there is no beat to play.
  it('plays nothing for a pruned empty pile', () => {
    expect(classifyPiles([0, 10], [10])).toBeNull()
  })

  it('plays nothing when the counts say nothing happened', () => {
    expect(classifyPiles([10], [10])).toBeNull()
    expect(classifyPiles([0, 0], [0])).toBeNull()
  })
})
