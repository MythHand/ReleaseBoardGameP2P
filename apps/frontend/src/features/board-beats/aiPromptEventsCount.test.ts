import { type Action, type CardInstance, type GameState, redactFor } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { describe, expect, it } from 'vitest'
import { type HistoryLabels, toBoardState } from '~/entities/game/board'
import { withCard } from './cardPlace'

const engine = createFakeEngine()
const labels = {} as HistoryLabels
const players = ['p1', 'p2', 'p3'] as const

// AN AI CARD STANDING ON ITS PROMPT IS COUNTED ONCE (#168, ditayler). The engine
// puts a card with no zone to go to back in the events deck the moment it is
// revealed; the board draws it at the centre until the prompt is answered, and
// the beat that flies it home counts it back as it lands. Driven through the
// real engine and projection, so the count the landing publishes is checked
// against the engine's own, not against a hand-written base.
const table = (eventCard: CardInstance, hand: CardInstance[], discard: CardInstance[] = []) => {
  const initial = engine.createGame({
    gameId: 'ai-prompt-events-count',
    seed: 4242,
    players: players.map((id) => ({ id, name: id })),
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  const staged: GameState = {
    ...initial,
    turn: { ...initial.turn, player: 'p1', drawnFrom: [] },
    players: { ...initial.players, p1: { ...initial.players.p1, hand } },
    decks: {
      ...initial.decks,
      main: [[{ uid: 'trigger', id: 'trigger-ai' }, ...initial.decks.main[0]]],
      events: [eventCard],
      discard,
    },
  }
  return staged
}

const seen = (reduction: ReturnType<typeof engine.reduce>, viewer: string) =>
  reduction.events
    .filter((event) => !event.visibleTo || event.visibleTo.includes(viewer))
    .map((event) => redactFor(event, viewer))

const cases: [string, GameState, Action][] = [
  [
    'AI Error 503 refused with a Debugger in hand',
    table({ uid: 'mimic', id: 'ai-error-503' }, [{ uid: 'debugger', id: 'protection-debugger' }]),
    { type: 'PASS', player: 'p1', at: 2000 },
  ],
  [
    'Inside answered',
    table(
      { uid: 'inside', id: 'ai-inside' },
      [],
      [
        { uid: 'fe', id: 'release-frontend' },
        { uid: 'be', id: 'release-backend' },
      ],
    ),
    {
      type: 'RESOLVE',
      player: 'p1',
      choice: { kind: 'pickFromDiscard', card: 'fe' },
      at: 2000,
    },
  ],
]

describe.each(cases)('%s', (_, staged, answer) => {
  it.each(['p1', 'p2'])('counts the AI card once for %s', (viewer) => {
    const drawn = engine.reduce(staged, { type: 'DRAW', player: 'p1', at: 1000 })
    expect(drawn.state.pending).not.toBeNull()
    // the engine already holds it in the deck while it stands at the centre…
    expect(drawn.state.decks.events).toHaveLength(1)
    const standing = toBoardState(engine.project(drawn.state, viewer), seen(drawn, viewer), labels)
    // …the board does not, for as long as it stands
    expect(standing.decks.events).toBe(0)

    const answered = engine.reduce(drawn.state, answer)
    expect(answered.events.some((e) => e.type === 'rejected')).toBe(false)
    const after = toBoardState(
      engine.project(answered.state, viewer),
      [...seen(drawn, viewer), ...seen(answered, viewer)],
      labels,
    )
    // the beat's landing home adds the card back onto the board it started from,
    // and lands on exactly the engine's count — never one more in between
    expect(withCard(standing, { kind: 'events' }).decks.events).toBe(
      answered.state.decks.events.length,
    )
    expect(after.decks.events).toBe(answered.state.decks.events.length)
  })
})
