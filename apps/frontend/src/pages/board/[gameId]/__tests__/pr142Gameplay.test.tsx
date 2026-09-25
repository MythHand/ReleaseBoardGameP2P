import type { GameState } from '@release/engine'
import { createFakeEngine, FAKE_DECK, FAKE_EVENTS } from '@release/engine/fake'
import { resources } from '@release/translation'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { expect, it, vi } from 'vitest'
import { type HistoryLabels, toBoardState } from '~/entities/game/board/toBoardState'
import Board from '../_Board'
import { makeBoardProps } from './fixture'

vi.mock('~/shared/lib/useReducedMotion', () => ({ useReducedMotion: () => true }))
const engine = createFakeEngine()
function humanGame(): GameState {
  return engine.createGame({
    gameId: 'review-human-game',
    seed: 17,
    players: [
      { id: 'p1', name: 'Ann' },
      { id: 'p2', name: 'Bo' },
    ],
    setup: {},
    deck: FAKE_DECK,
    events: FAKE_EVENTS,
  })
}

it('allows a human to place the first release after drawing and paying its cost', () => {
  const base = humanGame()
  const release = { id: 'release-frontend', uid: 'review-release' }
  const payment = { id: 'attack-bug', uid: 'review-payment' }
  const state = {
    ...base,
    players: { ...base.players, p1: { ...base.players.p1, hand: [release, payment] } },
    decks: { ...base.decks, main: [[{ id: 'protection-monitoring', uid: 'review-draw' }]] },
  }
  const drawn = engine.reduce(state, { type: 'DRAW', player: 'p1', at: 1 }).state
  const view = engine.project(drawn, 'p1')
  expect(view.turn.hasDrawn).toBe(true)
  expect(view.self.playable).toContain(release.uid)
  const staged = engine.reduce(drawn, {
    type: 'PLAY',
    player: 'p1',
    card: release.uid,
    at: 2,
  }).state
  expect(staged.pending?.kind).toBe('discardForRelease')
  const paid = engine.reduce(staged, {
    type: 'RESOLVE',
    player: 'p1',
    at: 3,
    choice: { kind: 'discardForRelease', card: payment.uid },
  }).state
  expect(paid.players.p1.release.frontend?.card.uid).toBe(release.uid)
})

it('shows and resolves an Inside choice from the real human-only engine projection', () => {
  const base = humanGame()
  const state = {
    ...base,
    decks: {
      ...base.decks,
      main: [[{ id: 'trigger-ai', uid: 'review-ai' }]],
      events: [{ id: 'ai-inside', uid: 'review-inside' }],
      discard: [
        { id: 'release-frontend', uid: 'review-fe' },
        { id: 'release-backend', uid: 'review-be' },
      ],
    },
  }
  let current = engine.reduce(state, { type: 'DRAW', player: 'p1', at: 1 }).state
  const props = makeBoardProps()
  render(
    <Board
      {...props}
      state={toBoardState(
        engine.project(current, 'p1'),
        [],
        resources.en.common.historyLabels as HistoryLabels,
      )}
      actions={{
        onResolve: (choice) => {
          current = engine.reduce(current, { type: 'RESOLVE', player: 'p1', choice, at: 2 }).state
        },
      }}
    />,
  )
  const row = screen.getByTestId('board-inside-row')
  const candidate = row.querySelector('[data-card="release-frontend"]')?.closest('button')
  expect(candidate).toBeTruthy()
  fireEvent.click(candidate as HTMLButtonElement)
  // the bar is the surface's, not the row's — inside the row it covered the cards
  const surface = screen.getByTestId('board-inside-surface')
  fireEvent.click(within(surface).getByRole('button', { name: props.copy.pending.confirm }))
  expect(current.pending).toBeNull()
  expect(current.players.p1.hand).toContainEqual({ id: 'release-frontend', uid: 'review-fe' })
})
