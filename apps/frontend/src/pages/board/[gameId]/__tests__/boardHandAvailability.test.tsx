import type { Event, GameState } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { resources } from '@release/translation'
import { cardById } from '@release/ui'
import { fireEvent, render } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { toBoardState } from '~/entities/game/board'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

const engine = createFakeEngine()
const labels = resources.en.common.historyLabels as Record<Event['type'], string>
const card = (id: string) => ({ uid: `${id}#0`, id })
const handItem = (id: string) => {
  const data = cardById(id)
  if (!data) throw new Error(id)
  return { uid: `${id}#0`, card: data }
}
const slotState = (uid: string) =>
  document.querySelector(`[data-hand-slot="${uid}"] > [data-state]`)?.getAttribute('data-state')

function rollback(attack: string, sudo = false) {
  const base = engine.createGame({
    gameId: 'availability',
    seed: 4242,
    players: [
      { id: 'p1', name: 'One' },
      { id: 'p2', name: 'Two' },
    ],
    setup: {
      handLimit: 'base',
      releases: 'base',
      releaseCond: 'easy',
      ai: 'base',
      gitBranch: 'base',
      startingDecks: 'one',
    },
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
  let state: GameState = {
    ...base,
    turn: { ...base.turn, player: 'p2', drawnFrom: [0] },
    players: {
      ...base.players,
      p1: { ...base.players.p1, hand: [card(attack), card('protection-debugger')] },
      p2: {
        ...base.players.p2,
        hand: [card('release-database'), card('defense-rollback'), card('support-sudo')],
      },
    },
  }
  state = engine.reduce(state, {
    type: 'PLAY',
    player: 'p2',
    card: 'release-database#0',
    at: 1000,
  }).state
  state = engine.reduce(state, {
    type: 'ATTACK',
    player: 'p1',
    card: `${attack}#0`,
    at: 1100,
  }).state
  if (state.pending?.kind !== 'defend') throw new Error('Attack did not open defence')
  return engine.reduce(state, {
    type: 'RESOLVE',
    player: 'p2',
    choice: {
      kind: 'defend',
      card: 'defense-rollback#0',
      ...(sudo ? { combo: 'support-sudo#0' } : {}),
    },
    at: 1200,
  }).state
}

it.each([
  'attack-bug',
  'attack-out-of-memory',
  'attack-legacy-code',
  'attack-security-bug',
])('dims %s after Rollback and restores it on the owner’s next turn', (id) => {
  const locked = rollback(id)
  const uid = `${id}#0`
  const props = makeBoardProps({ state: toBoardState(engine.project(locked, 'p1'), [], labels) })
  expect(props.state.replayLocked).toEqual([uid])
  const onPlay = vi.fn()
  const onAttack = vi.fn()
  const { rerender } = render(<Board {...props} actions={{ onPlay, onAttack }} />)
  expect(slotState(uid)).toBe('disabled')
  expect(slotState('protection-debugger#0')).toBe('disabled')
  const slot = document.querySelector<HTMLElement>(`[data-hand-slot="${uid}"]`)
  if (!slot) throw new Error('Missing returned attack')
  fireEvent.mouseDown(slot, { button: 0, clientX: 200, clientY: 600 })
  fireEvent.mouseMove(window, { clientX: 200, clientY: 300 })
  fireEvent.mouseUp(window, { clientX: 200, clientY: 300 })
  expect(onPlay).not.toHaveBeenCalled()
  expect(onAttack).not.toHaveBeenCalled()
  const closed = engine.reduce(locked, {
    type: 'WINDOW_EXPIRED',
    at: (locked.window?.deadline ?? 2000) + 1,
  }).state
  const next = engine.reduce(closed, { type: 'PUSH', player: 'p2', at: 9000 }).state
  expect(next.turn.player).toBe('p1')
  const view = engine.project(next, 'p1')
  expect(view.self.playable).toContain(uid)
  rerender(<Board {...props} state={toBoardState(view, [], labels)} />)
  expect(slotState(uid)).toBe('idle')
})

it('does not lock an attack kept by sudo Rollback', () => {
  const kept = rollback('attack-bug', true)
  expect(kept.players.p2.replayLocked).toEqual([])
  expect(kept.players.p2.hand.map((c) => c.uid)).toContain('attack-bug#0')
  const closed = engine.reduce(kept, {
    type: 'WINDOW_EXPIRED',
    at: (kept.window?.deadline ?? 2000) + 1,
  }).state
  const view = engine.project(closed, 'p2')
  expect(view.self.playable).toContain('attack-bug#0')
  render(<Board {...makeBoardProps({ state: toBoardState(view, [], labels) })} />)
  expect(slotState('attack-bug#0')).toBe('idle')
})

it('updates unavailable cards on turn and window changes, preserving combo starters', () => {
  const base = makeBoardProps()
  const state = {
    ...base.state,
    you: {
      ...base.state.you,
      hand: ['attack-bug', 'support-sudo', 'protection-debugger'].map(handItem),
    },
    playable: ['attack-bug#0'],
    comboOptions: { 'support-sudo#0': ['attack-bug#0'] },
  }
  const { rerender } = render(<Board {...base} state={state} />)
  expect(slotState('attack-bug#0')).toBe('idle')
  expect(slotState('support-sudo#0')).toBe('idle')
  expect(slotState('protection-debugger#0')).toBe('disabled')
  rerender(<Board {...base} state={{ ...state, turn: 'p2', playable: [], comboOptions: {} }} />)
  expect(slotState('attack-bug#0')).toBe('disabled')
  expect(slotState('support-sudo#0')).toBe('disabled')
  // An opponent's release opens a reaction even though normal playable is empty.
  rerender(
    <Board
      {...base}
      state={{
        ...state,
        turn: 'p2',
        playable: [],
        window: {
          player: 'p2',
          slot: 'database',
          round: 0,
          openedAt: 0,
          passed: [],
          deadline: 15000,
          canAttackWith: ['attack-bug#0'],
        },
      }}
    />,
  )
  expect(slotState('attack-bug#0')).toBe('idle')
  expect(slotState('support-sudo#0')).toBe('idle')
  rerender(
    <Board
      {...base}
      state={{ ...state, turn: 'p2', playable: [], comboOptions: {}, window: null }}
    />,
  )
  expect(slotState('attack-bug#0')).toBe('disabled')
  expect(slotState('support-sudo#0')).toBe('disabled')
})

it('dims ineligible payment cards while a frozen card offered as payment stays available', () => {
  const base = makeBoardProps()
  render(
    <Board
      {...base}
      state={{
        ...base.state,
        you: {
          ...base.state.you,
          hand: ['release-frontend', 'attack-bug', 'protection-debugger'].map(handItem),
        },
        frozen: ['attack-bug#0'],
        pending: {
          kind: 'discardForRelease',
          player: base.state.selfId,
          release: 'release-frontend#0',
          options: ['attack-bug#0'],
        },
      }}
    />,
  )
  expect(slotState('attack-bug#0')).toBe('playable')
  expect(slotState('protection-debugger#0')).toBe('disabled')
})

it('only offers eligible cards while discarding down to the hand limit', () => {
  const base = makeBoardProps()
  render(
    <Board
      {...base}
      state={{
        ...base.state,
        you: { ...base.state.you, hand: ['attack-bug', 'protection-debugger'].map(handItem) },
        pending: {
          kind: 'handLimit',
          player: base.state.selfId,
          excess: 1,
          options: ['attack-bug#0'],
        },
      }}
    />,
  )
  expect(slotState('attack-bug#0')).toBe('playable')
  expect(slotState('protection-debugger#0')).toBe('disabled')
})
