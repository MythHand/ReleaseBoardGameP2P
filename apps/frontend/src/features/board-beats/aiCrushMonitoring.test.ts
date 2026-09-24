import { type CardInstance, type GameState, redactFor } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { describe, expect, it } from 'vitest'
import { type HistoryLabels, toBoardState } from '~/entities/game/board'
import { planBeats } from './planBeats'

const engine = createFakeEngine()
const labels = {} as HistoryLabels
const viewers = ['p1', 'p2', 'p3'] as const
const monitors: CardInstance[] = [
  { uid: 'monitoring', id: 'protection-monitoring' },
  { uid: 'ai-monitoring', id: 'protection-monitoring', event: 'ai-monitoring' },
]

// Exercise the engine -> public events -> viewer projection -> scene boundary.
// A hand-written batch would miss the erroneous crush pending that #159 raised.
describe.each([
  'frontend',
  'backend',
  'database',
] as const)('automatic Monitoring against AI Crush %s (#159)', (slot) => {
  it.each(
    monitors.flatMap((monitor) => viewers.map((viewer) => ({ monitor, viewer }))),
  )('plans one returning AI scene for $viewer with $monitor.uid', ({ monitor, viewer }) => {
    const initial = engine.createGame({
      gameId: 'ai-crush-monitoring',
      seed: 4242,
      players: viewers.map((id) => ({ id, name: id })),
      setup: {},
      deck: FAKE_DECK,
      events: FAKE_EVENTS,
    })
    const release: CardInstance = { uid: 'release', id: `release-${slot}` }
    const debuggerCard: CardInstance = { uid: 'debugger', id: 'protection-debugger' }
    const eventCard: CardInstance = { uid: 'crush', id: `ai-crush-${slot}` }
    const staged: GameState = {
      ...initial,
      turn: { ...initial.turn, player: 'p1', drawnFrom: [] },
      players: {
        ...initial.players,
        p1: {
          ...initial.players.p1,
          hand: [debuggerCard],
          release: { [slot]: { card: release }, monitoring: monitor },
        },
      },
      decks: {
        ...initial.decks,
        main: [[{ uid: 'trigger', id: 'trigger-ai' }, ...initial.decks.main[0]]],
        events: [eventCard],
      },
    }
    const reduction = engine.reduce(staged, { type: 'DRAW', player: 'p1', at: 1000 })
    const events = reduction.events
      .filter((event) => !event.visibleTo || event.visibleTo.includes(viewer))
      .map((event) => redactFor(event, viewer))
    const before = toBoardState(engine.project(staged, viewer), [], labels)
    const after = toBoardState(engine.project(reduction.state, viewer), events, labels)
    const plans = planBeats(events, before, after.pending, after.decks.discardCount)

    expect(events).toContainEqual(
      expect.objectContaining({ type: 'neutralized', player: 'p1', method: 'monitoring' }),
    )
    expect(after.pending).toBeNull()
    expect(after.aiCause).toBeUndefined()
    // `none` takes the runner's goHome path, covered by aiBeat.test.tsx's
    // "takes both away when the tail is" cases. No extra exchange owns it.
    expect(plans).toHaveLength(1)
    expect(plans[0]).toMatchObject({
      kind: 'aiEvent',
      player: 'p1',
      pile: 0,
      trigger: 'trigger-ai',
      eventCard: `ai-crush-${slot}`,
      tail: { kind: 'none' },
    })
    expect(after.decks.events).toBe(1)
    const beforeOwner =
      viewer === 'p1' ? before.you : before.opponents.find((owner) => owner.id === 'p1')
    const afterOwner =
      viewer === 'p1' ? after.you : after.opponents.find((owner) => owner.id === 'p1')
    expect(afterOwner?.release).toEqual(beforeOwner?.release)
    expect(reduction.state.players.p1.hand).toEqual([debuggerCard])
  })
})
